import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ChatRequest, ChatResponse, FeedbackReport, SummaryReport, QuizData, WritingReviewData, SeniorityLevel, QuestionCategory, QuestionType, SessionData, SessionMode, JobDescriptionContext } from '../../lib/types';
import { invokeTextModelWithTimeout } from '../shared/bedrockInvoke';
import { buildJdAnalysisPrompt, parseJdAnalysisResponse, normalizeJdContext, JdAnalysisError } from './jdAnalysis';
import { stripJdFromError, logJdEvent } from './jdPrivacy';
import { incrementJdRateLimit, decrementJdRateLimit } from './jdRateLimit';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
};

const VALID_ACTIONS: ChatRequest['action'][] = [
  'start_session',
  'analyze_answer',
  'next_question',
  'end_session',
  'resume_session',
  'abandon_session',
  'grammar_quiz',
  'grammar_explain',
  'writing_prompt',
  'writing_review',
  'analyze_job_description',
];

const REQUIRED_FIELDS: Record<ChatRequest['action'], (keyof ChatRequest)[]> = {
  start_session: ['jobPosition'],
  analyze_answer: ['sessionId', 'transcription'],
  next_question: ['sessionId'],
  end_session: ['sessionId'],
  resume_session: [],
  abandon_session: ['sessionId'],
  grammar_quiz: ['grammarTopic'],
  grammar_explain: ['sessionId', 'selectedAnswer'],
  writing_prompt: ['writingType'],
  writing_review: ['sessionId', 'writingContent'],
  analyze_job_description: ['jdRawText'],
};

const BEDROCK_MODEL_ID = process.env.BEDROCK_TEXT_MODEL_ID ?? 'amazon.nova-pro-v1:0';

const SESSION_EXPIRY_HOURS = 24;

const VALID_SENIORITY_LEVELS: SeniorityLevel[] = ['junior', 'mid', 'senior', 'lead'];
const VALID_QUESTION_CATEGORIES: QuestionCategory[] = ['general', 'technical'];

// JD targeting constants
const JD_MIN_LENGTH = 100;
const JD_MAX_LENGTH = 10000;
const JD_RATE_LIMIT = parseInt(process.env.JD_RATE_LIMIT ?? '5', 10);
const JD_RETENTION_DAYS = parseInt(process.env.JD_RETENTION_DAYS ?? '30', 10);
const VALID_MODES: SessionMode[] = ['quick', 'targeted'];

/**
 * Determines the effective session mode from a session record or request.
 * Returns `'targeted'` iff `record.mode === 'targeted'`; every other value
 * (including `undefined`, `null`, `'quick'`, or any invalid string) maps to `'quick'`.
 * This preserves backward compatibility with session records that predate the JD feature.
 */
function determineSessionMode(record: { mode?: string }): SessionMode {
  return record.mode === 'targeted' ? 'targeted' : 'quick';
}

const INTRODUCTION_QUESTIONS: Record<SeniorityLevel, string> = {
  junior: 'Please introduce yourself and tell me about your educational background and any relevant experience or projects that prepared you for this role.',
  mid: 'Please introduce yourself and walk me through your professional experience, highlighting key achievements relevant to this role.',
  senior: 'Please introduce yourself and describe your career journey, focusing on leadership experiences and significant technical contributions.',
  lead: 'Please introduce yourself and share your experience leading teams, driving technical strategy, and delivering large-scale projects.',
};


// --- Custom error for authorization failures ---

class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

/**
 * Error thrown when a user exceeds the daily JD analysis rate limit.
 * Mapped by the handler to HTTP 429 with error code `JD_RATE_LIMIT_EXCEEDED`.
 */
class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitError';
  }
}

// --- Helper functions ---

function successResponse(statusCode: number, body: ChatResponse): APIGatewayProxyResult {
  return { statusCode, headers: CORS_HEADERS, body: JSON.stringify(body) };
}

function errorResponse(statusCode: number, error: string, message: string): APIGatewayProxyResult {
  return { statusCode, headers: CORS_HEADERS, body: JSON.stringify({ error, message }) };
}

function extractUserId(event: APIGatewayProxyEvent): string | null {
  return event.requestContext.authorizer?.claims?.sub ?? null;
}

function validateRequest(body: Record<string, unknown>): { valid: false; code: string; message: string } | { valid: true; request: ChatRequest } {
  const { action } = body;

  if (!action || typeof action !== 'string') {
    return { valid: false, code: 'Bad Request', message: 'Missing required field: action' };
  }

  if (!VALID_ACTIONS.includes(action as ChatRequest['action'])) {
    return { valid: false, code: 'Bad Request', message: `Invalid action: ${action}. Valid actions: ${VALID_ACTIONS.join(', ')}` };
  }

  const typedAction = action as ChatRequest['action'];

  // --- JD-specific validation for analyze_job_description ---
  // Done before the generic REQUIRED_FIELDS check so we can return precise
  // error codes (INVALID_MODE / JD_TOO_SHORT / JD_TOO_LONG) instead of the
  // generic "Missing required field" message.
  if (typedAction === 'analyze_job_description') {
    // mode MUST be explicit and one of VALID_MODES (Requirement 10.5)
    const mode = body.mode;
    if (typeof mode !== 'string' || !VALID_MODES.includes(mode as SessionMode)) {
      return {
        valid: false,
        code: 'INVALID_MODE',
        message: `Invalid or missing mode for analyze_job_description. Must be one of: ${VALID_MODES.join(', ')}`,
      };
    }

    // jdRawText length validation (Requirements 2.3, 2.4, 3.3, 3.4)
    const jdRawText = body.jdRawText;
    if (typeof jdRawText !== 'string' || jdRawText.length < JD_MIN_LENGTH) {
      return {
        valid: false,
        code: 'JD_TOO_SHORT',
        message: `Job description must be at least ${JD_MIN_LENGTH} characters`,
      };
    }
    if (jdRawText.length > JD_MAX_LENGTH) {
      return {
        valid: false,
        code: 'JD_TOO_LONG',
        message: `Job description must not exceed ${JD_MAX_LENGTH} characters`,
      };
    }

    // analyze_job_description passed JD-specific validation — skip generic
    // REQUIRED_FIELDS check (jdRawText is already verified above).
    return { valid: true, request: body as unknown as ChatRequest };
  }

  const requiredFields = REQUIRED_FIELDS[typedAction];

  for (const field of requiredFields) {
    const value = body[field];
    if (value === undefined || value === null || value === '') {
      return { valid: false, code: 'Bad Request', message: `Missing required field for action '${typedAction}': ${field}` };
    }
  }

  if (typedAction === 'writing_prompt') {
    const writingType = body.writingType;
    if (writingType !== 'essay' && writingType !== 'email') {
      return { valid: false, code: 'Bad Request', message: "Invalid writingType. Must be 'essay' or 'email'" };
    }
  }

  if (typedAction === 'start_session') {
    const seniorityLevel = body.seniorityLevel;
    if (seniorityLevel !== undefined && !VALID_SENIORITY_LEVELS.includes(seniorityLevel as SeniorityLevel)) {
      return { valid: false, code: 'Bad Request', message: `Invalid seniorityLevel: '${seniorityLevel}'. Must be one of: ${VALID_SENIORITY_LEVELS.join(', ')}` };
    }
    const questionCategory = body.questionCategory;
    if (questionCategory !== undefined && !VALID_QUESTION_CATEGORIES.includes(questionCategory as QuestionCategory)) {
      return { valid: false, code: 'Bad Request', message: `Invalid questionCategory: '${questionCategory}'. Must be one of: ${VALID_QUESTION_CATEGORIES.join(', ')}` };
    }

    // Targeted-mode session start requires a valid jdContext with a non-empty role.
    // Any non-'targeted' mode value (including missing, invalid, or 'quick') is
    // treated as Quick Mode and does not require jdContext (Requirements 6.5, 10.2, 10.3, 10.4).
    if (body.mode === 'targeted') {
      const jdContext = body.jdContext;
      const isValidJdContext =
        jdContext !== null &&
        typeof jdContext === 'object' &&
        typeof (jdContext as { role?: unknown }).role === 'string' &&
        ((jdContext as { role: string }).role).trim() !== '';

      if (!isValidJdContext) {
        return {
          valid: false,
          code: 'INVALID_TARGETED_REQUEST',
          message: 'Targeted session requires a jdContext with a non-empty role',
        };
      }
    }
  }

  return { valid: true, request: body as unknown as ChatRequest };
}

// --- Question type selection ---

function determineQuestionType(
  questions: Array<{ questionType?: QuestionType; transcription?: string }>
): 'contextual' {
  return 'contextual';
}


// --- Contextual prompt builder ---

function buildContextualPrompt(
  jobPosition: string,
  seniorityLevel: SeniorityLevel,
  questionCategory: QuestionCategory,
  questions: Array<{ questionText: string; transcription?: string }>,
  previousQuestionTexts: string[]
): string {
  // Extract Q&A pairs with non-empty transcription
  const answeredPairs = questions.filter(
    (q) => q.transcription !== undefined && q.transcription !== ''
  );

  const categoryInstruction = questionCategory === 'general'
    ? 'Focus on behavioral, soft skills, or motivation questions appropriate for this seniority level.'
    : 'Focus on role-specific technical questions appropriate for this job position and seniority level.';

  const previousList = previousQuestionTexts
    .map((q, i) => `${i + 1}. ${q}`)
    .join('\n');

  // Fallback: No transcriptions at all → general position prompt
  if (answeredPairs.length === 0) {
    return `You are an experienced job interviewer conducting a ${seniorityLevel}-level interview for a ${jobPosition} position.

${categoryInstruction}

Generate a relevant interview question for this position and seniority level. The question should be professional and suitable for an English language assessment. Return ONLY the question text, nothing else.

Do NOT repeat or rephrase any of these previously asked questions:
${previousList}`;
  }

  // Has transcriptions → take up to 3 most recent Q&A pairs
  const recentPairs = answeredPairs.slice(-3);

  // Format Q&A pairs with labeled prefixes
  const conversationLines = recentPairs
    .map((pair, index) => {
      const num = index + 1;
      return `Q${num}: ${pair.questionText}\nA${num}: ${pair.transcription}`;
    })
    .join('\n\n');

  return `You are an experienced job interviewer conducting a ${seniorityLevel}-level interview for a ${jobPosition} position.

${categoryInstruction}

Here is the recent conversation from this interview:

${conversationLines}

Based on the candidate's most recent answer, generate a follow-up question that:
- Probes deeper into a specific detail or claim from their answer
- OR asks for clarification on something they mentioned
- OR explores a related aspect of the topic they discussed

Reference specific details from their most recent answer. The question should be professional and suitable for an English language assessment. Return ONLY the question text, nothing else.

Do NOT repeat or rephrase any of these previously asked questions:
${previousList}`;
}


// --- Action handlers (stubs for tasks 5.2-5.4, 6.1-6.2) ---

async function handleStartSession(userId: string, request: ChatRequest): Promise<ChatResponse> {
  // Auto-abandon existing active speaking sessions (best-effort)
  try {
    const existingResult = await docClient.send(
      new QueryCommand({
        TableName: process.env.SESSIONS_TABLE_NAME,
        KeyConditionExpression: 'userId = :uid',
        FilterExpression: '#status = :active AND #type = :speaking',
        ExpressionAttributeNames: { '#status': 'status', '#type': 'type' },
        ExpressionAttributeValues: { ':uid': userId, ':active': 'active', ':speaking': 'speaking' },
      })
    );

    const activeSessions = existingResult.Items ?? [];

    for (const session of activeSessions) {
      try {
        await docClient.send(
          new UpdateCommand({
            TableName: process.env.SESSIONS_TABLE_NAME,
            Key: { userId, sessionId: session.sessionId as string },
            UpdateExpression: 'SET #status = :abandoned, updatedAt = :now',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: { ':abandoned': 'abandoned', ':now': new Date().toISOString() },
          })
        );
      } catch (abandonError) {
        console.error(`Failed to abandon session ${session.sessionId}:`, abandonError);
      }
    }
  } catch (queryError) {
    console.error('Failed to query existing active sessions:', queryError);
  }

  const sessionId = crypto.randomUUID();
  const now = new Date().toISOString();

  // Determine effective mode: only the literal 'targeted' activates targeted mode;
  // missing, 'quick', or any invalid value is treated as Quick (Requirements 6.7, 10.2, 10.3, 10.4).
  const effectiveMode = determineSessionMode(request);
  const isTargeted = effectiveMode === 'targeted';

  // In targeted mode, validateRequest has already ensured request.jdContext exists
  // with a non-empty role. Fall back seniorityLevel/questionCategory to suggested values
  // from jdContext when not explicitly supplied (Requirement 6.8).
  const seniorityLevel: SeniorityLevel = request.seniorityLevel
    ?? (isTargeted ? request.jdContext!.suggestedSeniority : undefined)
    ?? 'mid';
  const questionCategory: QuestionCategory = request.questionCategory
    ?? (isTargeted ? request.jdContext!.suggestedCategory : undefined)
    ?? 'general';

  // Hardcoded self-introduction question — no Bedrock call
  const questionText = INTRODUCTION_QUESTIONS[seniorityLevel];
  const questionId = crypto.randomUUID();

  // Base record — shared between quick and targeted modes.
  // Per Requirement 10.7, records without a mode field must stay that way;
  // we therefore only add `mode` and `jdContext` keys when the session is targeted.
  const item: Record<string, unknown> = {
    userId,
    sessionId,
    type: 'speaking',
    status: 'active',
    jobPosition: request.jobPosition,
    seniorityLevel,
    questionCategory,
    questions: [{ questionId, questionText, questionType: 'introduction' as const }],
    createdAt: now,
    updatedAt: now,
  };

  if (isTargeted) {
    // Persist mode and jdContext verbatim so array ordering in technologies,
    // responsibilities, requirements, and softSkills is preserved on the write
    // path (Requirements 6.6, 14.1, 14.2, 14.3).
    item.mode = 'targeted';
    item.jdContext = request.jdContext!;
  }

  await docClient.send(
    new PutCommand({
      TableName: process.env.SESSIONS_TABLE_NAME,
      Item: item,
    })
  );

  return {
    sessionId,
    type: 'question',
    content: questionText,
    questionType: 'introduction' as const,
  };
}


async function handleResumeSession(userId: string, _request: ChatRequest): Promise<ChatResponse> {
  // Query DynamoDB for all sessions with this userId, filter status='active' AND type='speaking'
  const result = await docClient.send(
    new QueryCommand({
      TableName: process.env.SESSIONS_TABLE_NAME,
      KeyConditionExpression: 'userId = :uid',
      FilterExpression: '#status = :active AND #type = :speaking',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#type': 'type',
      },
      ExpressionAttributeValues: {
        ':uid': userId,
        ':active': 'active',
        ':speaking': 'speaking',
      },
    })
  );

  const activeSessions = result.Items ?? [];

  // No active sessions found
  if (activeSessions.length === 0) {
    return { type: 'no_active_session', content: '', sessionId: '' };
  }

  // If multiple active sessions, sort by updatedAt descending and pick the most recent
  activeSessions.sort((a, b) => {
    const dateA = new Date(a.updatedAt as string).getTime();
    const dateB = new Date(b.updatedAt as string).getTime();
    return dateB - dateA;
  });
  const session = activeSessions[0];

  // Check expiry: if updatedAt + 24h < now, mark as expired
  const updatedAt = new Date(session.updatedAt as string).getTime();
  const now = Date.now();
  const expiryMs = SESSION_EXPIRY_HOURS * 60 * 60 * 1000;

  if (now - updatedAt > expiryMs) {
    // Update status to 'expired' in DynamoDB
    await docClient.send(
      new UpdateCommand({
        TableName: process.env.SESSIONS_TABLE_NAME,
        Key: { userId, sessionId: session.sessionId },
        UpdateExpression: 'SET #status = :expired, updatedAt = :now',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':expired': 'expired',
          ':now': new Date().toISOString(),
        },
      })
    );
    return { type: 'no_active_session', content: '', sessionId: '' };
  }

  // Build SessionData from the session record (pre-feature shape — kept
  // byte-identical on this path so Quick-mode resume responses are unchanged).
  const sessionData: SessionData = {
    sessionId: session.sessionId as string,
    jobPosition: session.jobPosition as string,
    seniorityLevel: session.seniorityLevel as SeniorityLevel,
    questionCategory: session.questionCategory as QuestionCategory,
    questions: (session.questions as Array<Record<string, unknown>> ?? []).map((q) => ({
      questionId: q.questionId as string,
      questionText: q.questionText as string,
      questionType: q.questionType as QuestionType | undefined,
      transcription: q.transcription as string | undefined,
      feedback: q.feedback as FeedbackReport | undefined,
      answeredAt: q.answeredAt as string | undefined,
    })),
    createdAt: session.createdAt as string,
    updatedAt: session.updatedAt as string,
  };

  const response: ChatResponse = {
    type: 'session_resumed',
    sessionData,
    sessionId: session.sessionId as string,
    content: '',
  };

  // --- JD Targeting: mode-aware resume response (Requirements 9.1, 9.2, 9.5, 9.6) ---
  // Quick-mode (or mode-absent) sessions leave `response` and `sessionData`
  // byte-identical to the pre-feature shape — no `mode`, `jdContext`, or
  // `jdContextExpired` keys are added. Only when the effective mode is
  // 'targeted' do we surface `sessionData.mode` and either attach
  // `sessionData.jdContext` (fresh) or raise `response.jdContextExpired`
  // (retention lapsed or scheduled cleanup already removed the field).
  const effectiveMode = determineSessionMode(session as { mode?: string });
  if (effectiveMode === 'targeted') {
    sessionData.mode = 'targeted';

    // Lazy retention check: if updatedAt is strictly older than
    // JD_RETENTION_DAYS days, treat the JD context as expired even if the
    // scheduled cleanup Lambda has not yet removed the attribute.
    const retentionMs = JD_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const retentionExpired = now - updatedAt > retentionMs;
    const storedJdContext = session.jdContext as JobDescriptionContext | undefined;

    if (!retentionExpired && storedJdContext) {
      // Fresh targeted session — include jdContext verbatim (Requirement 9.1).
      sessionData.jdContext = storedJdContext;
    } else {
      // Either the lazy retention check tripped, or the scheduled cleanup
      // Lambda already removed `jdContext`. In both cases signal to the
      // client that the JD context is no longer available (Requirement 9.6).
      response.jdContextExpired = true;
    }
  }

  return response;
}


async function handleAbandonSession(userId: string, request: ChatRequest): Promise<ChatResponse> {
  const sessionId = request.sessionId!;
  const now = new Date().toISOString();

  await docClient.send(
    new UpdateCommand({
      TableName: process.env.SESSIONS_TABLE_NAME,
      Key: { userId, sessionId },
      UpdateExpression: 'SET #status = :abandoned, updatedAt = :now',
      ConditionExpression: 'userId = :uid AND #status = :active',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':abandoned': 'abandoned',
        ':active': 'active',
        ':now': now,
        ':uid': userId,
      },
    })
  );

  return { type: 'session_abandoned', content: '', sessionId };
}


async function handleAnalyzeAnswer(userId: string, request: ChatRequest): Promise<ChatResponse> {
  const sessionId = request.sessionId!;
  const transcription = request.transcription!;

  // 1. Get the session from DynamoDB to find the current question
  const sessionResult = await docClient.send(
    new GetCommand({
      TableName: process.env.SESSIONS_TABLE_NAME,
      Key: { userId, sessionId },
    })
  );

  if (!sessionResult.Item) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  const session = sessionResult.Item;

  // Verify session ownership
  if (session.userId !== userId) {
    throw new AuthorizationError('Akses ditolak');
  }
  const questions = session.questions || [];
  const currentQuestion = questions[questions.length - 1];

  if (!currentQuestion) {
    throw new Error('No questions found in session');
  }

  const questionText = currentQuestion.questionText;

  // 2. Call Bedrock with a prompt that asks for JSON analysis
  const systemPrompt = `You are an expert English language assessor specializing in job interview preparation. Analyze the candidate's answer and return ONLY a valid JSON object matching this exact structure (no markdown, no extra text):
{
  "scores": {
    "grammar": <number 0-100>,
    "vocabulary": <number 0-100>,
    "relevance": <number 0-100>,
    "fillerWords": <number 0-100>,
    "coherence": <number 0-100>,
    "overall": <number 0-100>
  },
  "grammarErrors": [{"original": "<text>", "correction": "<text>", "rule": "<grammar rule>"}],
  "fillerWordsDetected": [{"word": "<word>", "count": <number>}],
  "suggestions": ["<suggestion1>", "<suggestion2>"],
  "improvedAnswer": "<improved version of the answer>"
}

Scoring guidelines:
- grammar: Accuracy of grammar usage (0=many errors, 100=perfect)
- vocabulary: Range and appropriateness of vocabulary (0=very limited, 100=excellent)
- relevance: How well the answer addresses the interview question (0=off-topic, 100=perfectly relevant)
- fillerWords: Score based on filler word usage (100=no filler words, 0=excessive filler words)
- coherence: Logical flow and clarity of the answer (0=incoherent, 100=perfectly clear)
- overall: Weighted average of all scores`;

  const userPrompt = `Interview Question: "${questionText}"

Candidate's Answer: "${transcription}"

Analyze this answer and return the JSON assessment.`;

  // --- JD Targeting: mode-aware prompt extension (Requirements 8.1, 8.2, 8.3, 8.5, 9.6) ---
  // Only when the session's effective mode is 'targeted', its jdContext is still
  // present (not retention-expired), and at least one of technologies / responsibilities /
  // requirements is non-empty do we append a JD context block to the feedback prompt.
  // Otherwise the prompt passed to Bedrock is byte-identical to the Quick-mode prompt.
  let effectiveSystemPrompt = systemPrompt;
  const effectiveMode = determineSessionMode(session as { mode?: string });
  const jdContext = session.jdContext as JobDescriptionContext | undefined;
  if (effectiveMode === 'targeted' && jdContext) {
    const technologies = Array.isArray(jdContext.technologies) ? jdContext.technologies : [];
    const responsibilities = Array.isArray(jdContext.responsibilities) ? jdContext.responsibilities : [];
    const requirements = Array.isArray(jdContext.requirements) ? jdContext.requirements : [];
    const hasAnyListContent =
      technologies.length > 0 || responsibilities.length > 0 || requirements.length > 0;

    if (hasAnyListContent) {
      effectiveSystemPrompt +=
        `\n\nThis interview targets a specific role. Reference these elements when assessing relevance:\n` +
        `- Technologies: ${technologies.join(', ')}\n` +
        `- Responsibilities: ${responsibilities.join(', ')}\n` +
        `- Requirements: ${requirements.join(', ')}\n` +
        'Include at least one specific suggestion in the `suggestions` array that references an item from these lists.';
    }
  }

  const responseText = await invokeTextModelWithTimeout(
    { modelId: BEDROCK_MODEL_ID, systemPrompt: effectiveSystemPrompt, userPrompt, maxTokens: 2000 },
    15_000,
  );

  // 3. Parse the Bedrock JSON response into a FeedbackReport
  let feedbackReport: FeedbackReport;
  try {
    feedbackReport = JSON.parse(responseText);
  } catch {
    // Try to extract JSON from the response if it contains extra text
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse Bedrock response as JSON');
    }
    feedbackReport = JSON.parse(jsonMatch[0]);
  }

  // 4. Update the session in DynamoDB: add feedback to the current question
  const now = new Date().toISOString();
  const questionIndex = questions.length - 1;

  await docClient.send(
    new UpdateCommand({
      TableName: process.env.SESSIONS_TABLE_NAME,
      Key: { userId, sessionId },
      UpdateExpression: `SET questions[${questionIndex}].feedback = :feedback, questions[${questionIndex}].transcription = :transcription, questions[${questionIndex}].answeredAt = :answeredAt, updatedAt = :updatedAt`,
      ExpressionAttributeValues: {
        ':feedback': feedbackReport,
        ':transcription': transcription,
        ':answeredAt': now,
        ':updatedAt': now,
      },
    })
  );

  // 5. Return ChatResponse with type 'feedback'
  const overallScore = feedbackReport.scores.overall;
  const summaryContent = `Your answer scored ${overallScore}/100 overall. Grammar: ${feedbackReport.scores.grammar}/100, Vocabulary: ${feedbackReport.scores.vocabulary}/100, Relevance: ${feedbackReport.scores.relevance}/100, Filler Words: ${feedbackReport.scores.fillerWords}/100, Coherence: ${feedbackReport.scores.coherence}/100.`;

  return {
    sessionId,
    type: 'feedback',
    content: summaryContent,
    feedbackReport,
  };
}

async function handleNextQuestion(userId: string, request: ChatRequest): Promise<ChatResponse> {
  const sessionId = request.sessionId!;

  // 1. Get session from DynamoDB
  const sessionResult = await docClient.send(
    new GetCommand({
      TableName: process.env.SESSIONS_TABLE_NAME,
      Key: { userId, sessionId },
    })
  );

  if (!sessionResult.Item) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  const session = sessionResult.Item;

  // Verify session ownership
  if (session.userId !== userId) {
    throw new AuthorizationError('Akses ditolak');
  }

  const questions = session.questions || [];
  const jobPosition = session.jobPosition || 'general';

  // Retrieve seniority and category from session, with backward-compatible defaults
  const seniorityLevel: SeniorityLevel = session.seniorityLevel ?? 'mid';
  const questionCategory: QuestionCategory = session.questionCategory ?? 'general';

  // 2. Extract all previous question texts
  const previousQuestions = questions.map((q: { questionText: string }) => q.questionText);

  // 3. Always contextual — buildContextualPrompt handles all fallback scenarios
  const questionType: QuestionType = 'contextual';
  const prompt = buildContextualPrompt(jobPosition, seniorityLevel, questionCategory, questions, previousQuestions);

  const questionText = await invokeTextModelWithTimeout(
    { modelId: BEDROCK_MODEL_ID, userPrompt: prompt, maxTokens: 300 },
    15_000,
  );
  const questionId = crypto.randomUUID();

  // 4. Add the new question to the session's questions array using list_append
  const now = new Date().toISOString();
  await docClient.send(
    new UpdateCommand({
      TableName: process.env.SESSIONS_TABLE_NAME,
      Key: { userId, sessionId },
      UpdateExpression: 'SET questions = list_append(questions, :newQuestion), updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':newQuestion': [{ questionId, questionText, questionType }],
        ':updatedAt': now,
      },
    })
  );

  // 5. Return ChatResponse with type 'question' and questionType
  return {
    sessionId,
    type: 'question',
    content: questionText,
    questionType,
  };
}



async function handleEndSession(userId: string, request: ChatRequest): Promise<ChatResponse> {
  const sessionId = request.sessionId!;

  // 1. Get session from DynamoDB
  const sessionResult = await docClient.send(
    new GetCommand({
      TableName: process.env.SESSIONS_TABLE_NAME,
      Key: { userId, sessionId },
    })
  );

  if (!sessionResult.Item) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  const session = sessionResult.Item;

  // Verify session ownership
  if (session.userId !== userId) {
    throw new AuthorizationError('Akses ditolak');
  }

  const questions = session.questions || [];

  // 2. Collect all feedback reports from answered questions
  const answeredQuestions = questions.filter(
    (q: { feedback?: FeedbackReport }) => q.feedback
  );

  const feedbackSummaries = answeredQuestions.map(
    (q: { questionText: string; feedback: FeedbackReport }, index: number) => ({
      questionNumber: index + 1,
      questionText: q.questionText,
      scores: q.feedback.scores,
    })
  );

  // 3. Call Bedrock with all feedback data to generate SummaryReport
  const systemPrompt = `You are an expert English language assessor. Based on the interview session feedback data, generate a comprehensive summary report. Return ONLY a valid JSON object matching this exact structure (no markdown, no extra text):
{
  "overallScore": <number 0-100>,
  "criteriaScores": {
    "grammar": <number 0-100>,
    "vocabulary": <number 0-100>,
    "relevance": <number 0-100>,
    "fillerWords": <number 0-100>,
    "coherence": <number 0-100>
  },
  "performanceTrend": [{"questionNumber": <number>, "score": <number 0-100>}],
  "topImprovementAreas": ["<area1>", "<area2>", "<area3>"],
  "recommendations": ["<recommendation1>", "<recommendation2>", "<recommendation3>"]
}

Rules:
- overallScore: weighted average across all questions
- criteriaScores: average score per criterion across all questions
- performanceTrend: one entry per answered question with the overall score for that question
- topImprovementAreas: exactly 3 areas that need the most improvement
- recommendations: at least 1 actionable recommendation for improvement`;

  const userPrompt = `Interview session for position: ${session.jobPosition || 'general'}
Total questions answered: ${answeredQuestions.length}

Feedback data per question:
${JSON.stringify(feedbackSummaries, null, 2)}

Generate the summary report JSON.`;

  // --- JD Targeting: mode-aware summary prompt extension (Requirements 8.4, 8.5, 9.6) ---
  // Only when the session's effective mode is 'targeted', its jdContext is still present
  // (i.e., not retention-expired), and at least one of role / technologies / requirements
  // is non-empty do we append a JD instruction block. Otherwise the prompt passed to
  // Bedrock is byte-identical to the Quick-mode (pre-feature) prompt (Requirement 8.5).
  let effectiveSystemPrompt = systemPrompt;
  const effectiveMode = determineSessionMode(session as { mode?: string });
  const jdContext = session.jdContext as JobDescriptionContext | undefined;
  if (effectiveMode === 'targeted' && jdContext) {
    const role = typeof jdContext.role === 'string' ? jdContext.role : '';
    const technologies = Array.isArray(jdContext.technologies) ? jdContext.technologies : [];
    const requirements = Array.isArray(jdContext.requirements) ? jdContext.requirements : [];
    const hasAnyField =
      role.trim() !== '' || technologies.length > 0 || requirements.length > 0;

    if (hasAnyField) {
      effectiveSystemPrompt +=
        `\n\nThis session is targeted at a specific role. In the \`topImprovementAreas\` and \`recommendations\` arrays, reference at least one of:\n` +
        `- Role: ${role}\n` +
        `- Technologies: ${technologies.join(', ')}\n` +
        `- Requirements: ${requirements.join(', ')}\n` +
        'Only include items that are non-empty above.';
    }
  }

  const responseText = await invokeTextModelWithTimeout(
    { modelId: BEDROCK_MODEL_ID, systemPrompt: effectiveSystemPrompt, userPrompt, maxTokens: 2000 },
    15_000,
  );

  // 4. Parse the response into SummaryReport
  let summaryReport: SummaryReport;
  try {
    summaryReport = JSON.parse(responseText);
  } catch {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse Bedrock summary response as JSON');
    }
    summaryReport = JSON.parse(jsonMatch[0]);
  }

  // 5. Update session in DynamoDB: set status='completed', add summaryReport
  const now = new Date().toISOString();
  await docClient.send(
    new UpdateCommand({
      TableName: process.env.SESSIONS_TABLE_NAME,
      Key: { userId, sessionId },
      UpdateExpression: 'SET #status = :status, summaryReport = :summaryReport, updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':status': 'completed',
        ':summaryReport': summaryReport,
        ':updatedAt': now,
      },
    })
  );

  // 6. Return ChatResponse with type 'summary'
  const summaryContent = `Session completed! Your overall score: ${summaryReport.overallScore}/100. Top areas to improve: ${summaryReport.topImprovementAreas.join(', ')}.`;

  return {
    sessionId,
    type: 'summary',
    content: summaryContent,
    summaryReport,
  };
}

async function handleGrammarQuiz(userId: string, request: ChatRequest): Promise<ChatResponse> {
  const sessionId = crypto.randomUUID();
  const now = new Date().toISOString();
  const grammarTopic = request.grammarTopic!;

  // Call Bedrock to generate a quiz question
  const prompt = `You are an English grammar expert. Generate a multiple choice quiz question about the grammar topic: "${grammarTopic}".

Return ONLY a valid JSON object matching this exact structure (no markdown, no extra text):
{
  "question": "<the grammar question>",
  "options": ["<option A>", "<option B>", "<option C>", "<option D>"],
  "correctAnswer": "<the correct option text, must be one of the options>"
}

Rules:
- The question must test understanding of ${grammarTopic}
- Provide exactly 4 options
- Exactly 1 option must be correct
- The correctAnswer must exactly match one of the options`;

  const responseText = await invokeTextModelWithTimeout(
    { modelId: BEDROCK_MODEL_ID, userPrompt: prompt, maxTokens: 1000 },
    15_000,
  );

  let parsedQuiz: { question: string; options: string[]; correctAnswer: string };
  try {
    parsedQuiz = JSON.parse(responseText);
  } catch {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse Bedrock quiz response as JSON');
    }
    parsedQuiz = JSON.parse(jsonMatch[0]);
  }

  const questionId = crypto.randomUUID();
  const quizData: QuizData = {
    questionId,
    question: parsedQuiz.question,
    options: parsedQuiz.options,
    correctAnswer: parsedQuiz.correctAnswer,
  };

  // Save grammar session to DynamoDB
  await docClient.send(
    new PutCommand({
      TableName: process.env.SESSIONS_TABLE_NAME,
      Item: {
        userId,
        sessionId,
        type: 'grammar',
        status: 'active',
        grammarTopic,
        quizResults: [],
        currentQuiz: quizData,
        createdAt: now,
        updatedAt: now,
      },
    })
  );

  return {
    sessionId,
    type: 'quiz',
    content: parsedQuiz.question,
    quizData,
  };
}

async function handleGrammarExplain(userId: string, request: ChatRequest): Promise<ChatResponse> {
  const sessionId = request.sessionId!;
  const selectedAnswer = request.selectedAnswer!;

  // Get the grammar session from DynamoDB
  const sessionResult = await docClient.send(
    new GetCommand({
      TableName: process.env.SESSIONS_TABLE_NAME,
      Key: { userId, sessionId },
    })
  );

  if (!sessionResult.Item) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  const session = sessionResult.Item;

  // Verify session ownership
  if (session.userId !== userId) {
    throw new AuthorizationError('Akses ditolak');
  }

  const currentQuiz = session.currentQuiz as QuizData;

  if (!currentQuiz) {
    throw new Error('No active quiz found in session');
  }

  const isCorrect = selectedAnswer === currentQuiz.correctAnswer;

  // Call Bedrock for explanation
  const prompt = `You are an English grammar expert. A student answered a grammar quiz question.

Question: "${currentQuiz.question}"
Options: ${currentQuiz.options.map((o: string, i: number) => `${i + 1}. ${o}`).join(', ')}
Correct Answer: "${currentQuiz.correctAnswer}"
Student's Answer: "${selectedAnswer}"
Student answered: ${isCorrect ? 'CORRECTLY' : 'INCORRECTLY'}

Provide a clear, educational explanation of why "${currentQuiz.correctAnswer}" is the correct answer. Include the specific grammar rule that applies. If the student answered incorrectly, explain why their answer "${selectedAnswer}" is wrong.

Return ONLY the explanation text, no JSON or formatting.`;

  const explanation = await invokeTextModelWithTimeout(
    { modelId: BEDROCK_MODEL_ID, userPrompt: prompt, maxTokens: 1000 },
    15_000,
  );

  // Save quiz result to DynamoDB
  const quizResult = {
    questionId: currentQuiz.questionId,
    question: currentQuiz.question,
    options: currentQuiz.options,
    correctAnswer: currentQuiz.correctAnswer,
    userAnswer: selectedAnswer,
    isCorrect,
    explanation,
  };

  const now = new Date().toISOString();
  await docClient.send(
    new UpdateCommand({
      TableName: process.env.SESSIONS_TABLE_NAME,
      Key: { userId, sessionId },
      UpdateExpression: 'SET quizResults = list_append(quizResults, :newResult), updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':newResult': [quizResult],
        ':updatedAt': now,
      },
    })
  );

  return {
    sessionId,
    type: 'explanation',
    content: explanation,
  };
}

async function handleWritingPrompt(userId: string, request: ChatRequest): Promise<ChatResponse> {
  const sessionId = crypto.randomUUID();
  const now = new Date().toISOString();
  const writingType = request.writingType!;

  // Call Bedrock to generate a writing prompt
  const prompt = `You are an English writing instructor specializing in job interview preparation. Generate a writing prompt for a ${writingType} exercise.

${writingType === 'essay' ? 'The essay topic should be related to professional development, workplace scenarios, or career goals.' : 'The email scenario should be a professional workplace situation (e.g., requesting time off, following up after a meeting, introducing yourself to a new team).'}

Return ONLY the writing prompt text. Make it clear and specific so the student knows exactly what to write about.`;

  const writingPrompt = await invokeTextModelWithTimeout(
    { modelId: BEDROCK_MODEL_ID, userPrompt: prompt, maxTokens: 500 },
    15_000,
  );

  // Save writing session to DynamoDB
  await docClient.send(
    new PutCommand({
      TableName: process.env.SESSIONS_TABLE_NAME,
      Item: {
        userId,
        sessionId,
        type: 'writing',
        status: 'active',
        writingType,
        writingPrompt,
        createdAt: now,
        updatedAt: now,
      },
    })
  );

  return {
    sessionId,
    type: 'writing_prompt',
    content: writingPrompt,
  };
}

async function handleWritingReview(userId: string, request: ChatRequest): Promise<ChatResponse> {
  const sessionId = request.sessionId!;
  const writingContent = request.writingContent!;

  // Get the writing session from DynamoDB
  const sessionResult = await docClient.send(
    new GetCommand({
      TableName: process.env.SESSIONS_TABLE_NAME,
      Key: { userId, sessionId },
    })
  );

  if (!sessionResult.Item) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  const session = sessionResult.Item;

  // Verify session ownership
  if (session.userId !== userId) {
    throw new AuthorizationError('Akses ditolak');
  }

  // Call Bedrock to analyze the writing
  const systemPrompt = `You are an expert English writing assessor. Analyze the student's writing and return ONLY a valid JSON object matching this exact structure (no markdown, no extra text):
{
  "overallScore": <number 0-100>,
  "aspects": {
    "grammarCorrectness": {
      "score": <number 0-100>,
      "errors": [{"text": "<original text with error>", "correction": "<corrected text>", "explanation": "<why it's wrong>"}]
    },
    "structure": {
      "score": <number 0-100>,
      "feedback": "<feedback on organization and structure>"
    },
    "vocabulary": {
      "score": <number 0-100>,
      "suggestions": ["<vocabulary improvement suggestion>"]
    }
  }
}

Scoring guidelines:
- overallScore: weighted average of all aspects
- grammarCorrectness: accuracy of grammar, spelling, and punctuation
- structure: organization, paragraph flow, and logical coherence
- vocabulary: range, appropriateness, and sophistication of word choice`;

  const userPrompt = `Writing Type: ${session.writingType || 'essay'}
Writing Prompt: "${session.writingPrompt || 'N/A'}"

Student's Writing:
"${writingContent}"

Analyze this writing and return the JSON assessment.`;

  const responseText = await invokeTextModelWithTimeout(
    { modelId: BEDROCK_MODEL_ID, systemPrompt, userPrompt, maxTokens: 2000 },
    15_000,
  );

  let writingReview: WritingReviewData;
  try {
    writingReview = JSON.parse(responseText);
  } catch {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse Bedrock writing review response as JSON');
    }
    writingReview = JSON.parse(jsonMatch[0]);
  }

  // Update session in DynamoDB with writing content and review
  const now = new Date().toISOString();
  await docClient.send(
    new UpdateCommand({
      TableName: process.env.SESSIONS_TABLE_NAME,
      Key: { userId, sessionId },
      UpdateExpression: 'SET userWriting = :userWriting, writingReview = :writingReview, #status = :status, updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':userWriting': writingContent,
        ':writingReview': writingReview,
        ':status': 'completed',
        ':updatedAt': now,
      },
    })
  );

  const summaryContent = `Your writing scored ${writingReview.overallScore}/100 overall. Grammar: ${writingReview.aspects.grammarCorrectness.score}/100, Structure: ${writingReview.aspects.structure.score}/100, Vocabulary: ${writingReview.aspects.vocabulary.score}/100.`;

  return {
    sessionId,
    type: 'writing_review',
    content: summaryContent,
    writingReview,
  };
}

// --- JD analysis handler ---

/**
 * Handle an `analyze_job_description` request.
 *
 * Flow:
 *   1. Pre-increment the per-user daily JD rate-limit counter (atomic).
 *      If the counter is already at the daily limit, throws `RateLimitError`
 *      → HTTP 429 `JD_RATE_LIMIT_EXCEEDED`.
 *   2. Invoke Nova Pro via `invokeTextModelWithTimeout` (15 s). On JSON parse
 *      failure, retry once with a stricter "return ONLY valid JSON" prompt.
 *   3. Normalize the parsed payload into a strict `JobDescriptionContext` and
 *      return `{ type: 'jd_analysis', jdContext }`.
 *   4. On any failure after step 1 succeeded, run the compensation decrement
 *      (best effort) and sanitize the error message through `stripJdFromError`
 *      before rethrowing as `JdAnalysisError` → HTTP 502 `JD_ANALYSIS_FAILED`.
 *
 * Privacy: raw JD text and `jdContext` are NEVER logged — only `logJdEvent`
 * is used for diagnostic observability.
 *
 * Requirements: 3.1, 3.2, 3.5-3.10, 4.1, 4.2, 4.4, 4.5, 11.1, 11.2, 11.7
 */
async function handleAnalyzeJobDescription(
  userId: string,
  requestId: string,
  request: ChatRequest,
): Promise<ChatResponse> {
  const jdRawText = request.jdRawText!;
  const tableName = process.env.SESSIONS_TABLE_NAME!;
  const jdLength = jdRawText.length;

  // Step 1: pre-increment the counter. If we're over the limit, bail out
  // without touching Bedrock and without needing a compensation decrement.
  const withinLimit = await incrementJdRateLimit({
    docClient,
    tableName,
    userId,
    limit: JD_RATE_LIMIT,
  });

  if (!withinLimit) {
    logJdEvent({
      userId,
      requestId,
      outcome: 'rate_limited',
      jdLength,
      errorCode: 'JD_RATE_LIMIT_EXCEEDED',
    });
    throw new RateLimitError('JD analysis daily limit reached');
  }

  try {
    const prompt = buildJdAnalysisPrompt(jdRawText);

    // Step 2: first Nova Pro call.
    const responseText = await invokeTextModelWithTimeout(
      { modelId: BEDROCK_MODEL_ID, userPrompt: prompt, maxTokens: 2000 },
      15_000,
    );

    // Try to parse; on parse failure, retry ONCE with a stricter prompt.
    let parsed: Partial<JobDescriptionContext>;
    try {
      parsed = parseJdAnalysisResponse(responseText);
    } catch (parseErr) {
      if (!(parseErr instanceof JdAnalysisError)) {
        throw parseErr;
      }
      const retryText = await invokeTextModelWithTimeout(
        {
          modelId: BEDROCK_MODEL_ID,
          userPrompt: `${prompt}\n\nReturn ONLY a valid JSON object. No markdown, no code fences, no commentary.`,
          maxTokens: 2000,
        },
        15_000,
      );
      parsed = parseJdAnalysisResponse(retryText);
    }

    const jdContext = normalizeJdContext(parsed);

    logJdEvent({ userId, requestId, outcome: 'success', jdLength });

    return {
      sessionId: '',
      type: 'jd_analysis',
      content: '',
      jdContext,
    };
  } catch (err) {
    // Step 4: compensation decrement (Requirement 4.5) — best effort, so a
    // secondary DynamoDB failure here does not mask the original error.
    try {
      await decrementJdRateLimit({
        docClient,
        tableName,
        userId,
        limit: JD_RATE_LIMIT,
      });
    } catch {
      // Intentionally swallow — preserving the original error is more useful
      // to the caller than surfacing a secondary decrement failure.
    }

    const sanitizedMessage = stripJdFromError(err, jdRawText);
    logJdEvent({
      userId,
      requestId,
      outcome: 'error',
      jdLength,
      errorCode: 'JD_ANALYSIS_FAILED',
    });
    throw new JdAnalysisError(sanitizedMessage);
  }
}

// --- Action router ---

async function routeAction(userId: string, request: ChatRequest, requestId: string = 'unknown'): Promise<ChatResponse> {
  switch (request.action) {
    case 'start_session':
      return handleStartSession(userId, request);
    case 'resume_session':
      return handleResumeSession(userId, request);
    case 'abandon_session':
      return handleAbandonSession(userId, request);
    case 'analyze_answer':
      return handleAnalyzeAnswer(userId, request);
    case 'next_question':
      return handleNextQuestion(userId, request);
    case 'end_session':
      return handleEndSession(userId, request);
    case 'grammar_quiz':
      return handleGrammarQuiz(userId, request);
    case 'grammar_explain':
      return handleGrammarExplain(userId, request);
    case 'writing_prompt':
      return handleWritingPrompt(userId, request);
    case 'writing_review':
      return handleWritingReview(userId, request);
    case 'analyze_job_description':
      return handleAnalyzeJobDescription(userId, requestId, request);
    default:
      throw new Error(`Unhandled action: ${request.action}`);
  }
}

// --- Main handler ---

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  try {
    // Extract userId from Cognito authorizer
    const userId = extractUserId(event);
    if (!userId) {
      return errorResponse(401, 'Unauthorized', 'Token tidak valid');
    }

    // Parse request body
    let body: Record<string, unknown>;
    try {
      body = event.body ? JSON.parse(event.body) : {};
    } catch {
      return errorResponse(400, 'Bad Request', 'Invalid JSON in request body');
    }

    // Validate request
    const validation = validateRequest(body);
    if (!validation.valid) {
      return errorResponse(400, validation.code, validation.message);
    }

    // Route to action handler
    const requestId = event.requestContext?.requestId ?? 'unknown';
    const response = await routeAction(userId, validation.request, requestId);
    return successResponse(200, response);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return errorResponse(403, 'Forbidden', error.message);
    }
    if (error instanceof RateLimitError) {
      return errorResponse(429, 'JD_RATE_LIMIT_EXCEEDED', error.message);
    }
    if (error instanceof JdAnalysisError) {
      return errorResponse(502, 'JD_ANALYSIS_FAILED', error.message);
    }
    console.error('Unhandled error in /chat handler:', error);
    return errorResponse(500, 'Internal Server Error', 'Terjadi kesalahan internal');
  }
};

// Export for testing
export { validateRequest, extractUserId, routeAction, determineQuestionType, buildContextualPrompt, determineSessionMode, handleAnalyzeJobDescription, VALID_ACTIONS, REQUIRED_FIELDS, VALID_MODES, JD_MIN_LENGTH, JD_MAX_LENGTH, JD_RATE_LIMIT, JD_RETENTION_DAYS, AuthorizationError, RateLimitError, INTRODUCTION_QUESTIONS, SESSION_EXPIRY_HOURS };
