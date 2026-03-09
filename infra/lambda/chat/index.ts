import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { ChatRequest, ChatResponse, FeedbackReport, SummaryReport, QuizData, WritingReviewData } from '../../lib/types';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const bedrockClient = new BedrockRuntimeClient({});

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
  'grammar_quiz',
  'grammar_explain',
  'writing_prompt',
  'writing_review',
];

const REQUIRED_FIELDS: Record<ChatRequest['action'], (keyof ChatRequest)[]> = {
  start_session: ['jobPosition'],
  analyze_answer: ['sessionId', 'transcription'],
  next_question: ['sessionId'],
  end_session: ['sessionId'],
  grammar_quiz: ['grammarTopic'],
  grammar_explain: ['sessionId', 'selectedAnswer'],
  writing_prompt: ['writingType'],
  writing_review: ['sessionId', 'writingContent'],
};

// --- Custom error for authorization failures ---

class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
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

function validateRequest(body: Record<string, unknown>): { valid: false; message: string } | { valid: true; request: ChatRequest } {
  const { action } = body;

  if (!action || typeof action !== 'string') {
    return { valid: false, message: 'Missing required field: action' };
  }

  if (!VALID_ACTIONS.includes(action as ChatRequest['action'])) {
    return { valid: false, message: `Invalid action: ${action}. Valid actions: ${VALID_ACTIONS.join(', ')}` };
  }

  const typedAction = action as ChatRequest['action'];
  const requiredFields = REQUIRED_FIELDS[typedAction];

  for (const field of requiredFields) {
    const value = body[field];
    if (value === undefined || value === null || value === '') {
      return { valid: false, message: `Missing required field for action '${typedAction}': ${field}` };
    }
  }

  if (typedAction === 'writing_prompt') {
    const writingType = body.writingType;
    if (writingType !== 'essay' && writingType !== 'email') {
      return { valid: false, message: "Invalid writingType. Must be 'essay' or 'email'" };
    }
  }

  return { valid: true, request: body as unknown as ChatRequest };
}

// --- Action handlers (stubs for tasks 5.2-5.4, 6.1-6.2) ---

async function handleStartSession(userId: string, request: ChatRequest): Promise<ChatResponse> {
  const sessionId = crypto.randomUUID();
  const now = new Date().toISOString();

  // Call Bedrock to generate the first interview question
  const prompt = `You are an experienced job interviewer. Generate one interview question for a ${request.jobPosition} position. The question should be professional, relevant to the role, and suitable for an English language assessment. Return ONLY the question text, nothing else.`;

  const bedrockResponse = await bedrockClient.send(
    new InvokeModelCommand({
      modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
  );

  const bedrockBody = JSON.parse(new TextDecoder().decode(bedrockResponse.body));
  const questionText = bedrockBody.content[0].text.trim();
  const questionId = crypto.randomUUID();

  // Save session metadata to DynamoDB
  await docClient.send(
    new PutCommand({
      TableName: process.env.SESSIONS_TABLE_NAME,
      Item: {
        userId,
        sessionId,
        type: 'speaking',
        status: 'active',
        jobPosition: request.jobPosition,
        questions: [{ questionId, questionText }],
        createdAt: now,
        updatedAt: now,
      },
    })
  );

  return {
    sessionId,
    type: 'question',
    content: questionText,
  };
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

  const bedrockResponse = await bedrockClient.send(
    new InvokeModelCommand({
      modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })
  );

  const bedrockBody = JSON.parse(new TextDecoder().decode(bedrockResponse.body));
  const responseText = bedrockBody.content[0].text.trim();

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
      UpdateExpression: 'SET questions[#idx].feedback = :feedback, questions[#idx].transcription = :transcription, questions[#idx].answeredAt = :answeredAt, updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#idx': questionIndex.toString(),
      },
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

  // 2. Extract all previous question texts
  const previousQuestions = questions.map((q: { questionText: string }) => q.questionText);

  // 3. Call Bedrock with previous questions as context
  const previousList = previousQuestions
    .map((q: string, i: number) => `${i + 1}. ${q}`)
    .join('\n');

  const prompt = `You are an experienced job interviewer. Generate one NEW interview question for a ${jobPosition} position.

The following questions have already been asked in this session — do NOT repeat or rephrase any of them:
${previousList}

Generate a completely different question that covers a new aspect of the role. Return ONLY the question text, nothing else.`;

  const bedrockResponse = await bedrockClient.send(
    new InvokeModelCommand({
      modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
  );

  const bedrockBody = JSON.parse(new TextDecoder().decode(bedrockResponse.body));
  const questionText = bedrockBody.content[0].text.trim();
  const questionId = crypto.randomUUID();

  // 4. Add the new question to the session's questions array using list_append
  const now = new Date().toISOString();
  await docClient.send(
    new UpdateCommand({
      TableName: process.env.SESSIONS_TABLE_NAME,
      Key: { userId, sessionId },
      UpdateExpression: 'SET questions = list_append(questions, :newQuestion), updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':newQuestion': [{ questionId, questionText }],
        ':updatedAt': now,
      },
    })
  );

  // 5. Return ChatResponse with type 'question'
  return {
    sessionId,
    type: 'question',
    content: questionText,
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

  const bedrockResponse = await bedrockClient.send(
    new InvokeModelCommand({
      modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })
  );

  const bedrockBody = JSON.parse(new TextDecoder().decode(bedrockResponse.body));
  const responseText = bedrockBody.content[0].text.trim();

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

  const bedrockResponse = await bedrockClient.send(
    new InvokeModelCommand({
      modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
  );

  const bedrockBody = JSON.parse(new TextDecoder().decode(bedrockResponse.body));
  const responseText = bedrockBody.content[0].text.trim();

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

  const bedrockResponse = await bedrockClient.send(
    new InvokeModelCommand({
      modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
  );

  const bedrockBody = JSON.parse(new TextDecoder().decode(bedrockResponse.body));
  const explanation = bedrockBody.content[0].text.trim();

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

  const bedrockResponse = await bedrockClient.send(
    new InvokeModelCommand({
      modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
  );

  const bedrockBody = JSON.parse(new TextDecoder().decode(bedrockResponse.body));
  const writingPrompt = bedrockBody.content[0].text.trim();

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

  const bedrockResponse = await bedrockClient.send(
    new InvokeModelCommand({
      modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })
  );

  const bedrockBody = JSON.parse(new TextDecoder().decode(bedrockResponse.body));
  const responseText = bedrockBody.content[0].text.trim();

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

// --- Action router ---

async function routeAction(userId: string, request: ChatRequest): Promise<ChatResponse> {
  switch (request.action) {
    case 'start_session':
      return handleStartSession(userId, request);
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
      return errorResponse(400, 'Bad Request', validation.message);
    }

    // Route to action handler
    const response = await routeAction(userId, validation.request);
    return successResponse(200, response);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return errorResponse(403, 'Forbidden', error.message);
    }
    console.error('Unhandled error in /chat handler:', error);
    return errorResponse(500, 'Internal Server Error', 'Terjadi kesalahan internal');
  }
};

// Export for testing
export { validateRequest, extractUserId, routeAction, VALID_ACTIONS, REQUIRED_FIELDS, AuthorizationError };
