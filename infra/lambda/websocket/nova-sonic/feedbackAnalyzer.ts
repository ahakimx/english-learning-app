// Feedback Analyzer — uses Claude Haiku for structured feedback analysis
// Implements Requirements: 5.1, 5.2, 5.4, 5.5, 12.1, 12.2

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import type { FeedbackReport, SummaryReport, SeniorityLevel } from '../../../lib/types';

const bedrockClient = new BedrockRuntimeClient({});

const HAIKU_MODEL_ID = process.env.HAIKU_MODEL_ID ?? 'us.anthropic.claude-haiku-4-5-20251001-v1:0';

/** Timeout in milliseconds for a single Claude Haiku invocation */
const INVOKE_TIMEOUT_MS = 15_000;

/** Maximum number of retry attempts after the initial call */
const MAX_RETRIES = 2;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Invoke Claude Haiku with a system prompt and user prompt.
 * Rejects if the call takes longer than `INVOKE_TIMEOUT_MS`.
 */
async function invokeHaiku(systemPrompt: string, userPrompt: string): Promise<string> {
  const abortController = new AbortController();
  const timer = setTimeout(() => abortController.abort(), INVOKE_TIMEOUT_MS);

  try {
    const response = await bedrockClient.send(
      new InvokeModelCommand({
        modelId: HAIKU_MODEL_ID,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
          anthropic_version: 'bedrock-2023-05-31',
          max_tokens: 2000,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      }),
      { abortSignal: abortController.signal },
    );

    const body = JSON.parse(new TextDecoder().decode(response.body));
    return (body.content[0].text as string).trim();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Invoke Claude Haiku with retry logic.
 * - First attempt + up to MAX_RETRIES retries (total up to 3 attempts).
 * - Each attempt has a 15-second timeout.
 * - Returns the raw response text on success, or `null` after all attempts fail.
 */
async function invokeHaikuWithRetry(systemPrompt: string, userPrompt: string): Promise<string | null> {
  const totalAttempts = 1 + MAX_RETRIES; // initial + retries

  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    try {
      return await invokeHaiku(systemPrompt, userPrompt);
    } catch (error) {
      console.error(`Claude Haiku attempt ${attempt}/${totalAttempts} failed:`, error);
      if (attempt === totalAttempts) {
        return null;
      }
      // No additional delay between retries — the 15s timeout already provides spacing
    }
  }

  return null;
}

/**
 * Parse a JSON string into an object. If direct parsing fails, try to extract
 * a JSON object from the text using a regex (handles cases where Claude wraps
 * JSON in markdown code fences or extra prose).
 */
function parseJsonResponse<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    // Attempt regex extraction of the outermost JSON object
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error('Failed to extract JSON from response');
    }
    return JSON.parse(match[0]) as T;
  }
}

/**
 * Clamp a number to the 0-100 integer range.
 */
function clampScore(value: unknown): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (isNaN(num)) return 0;
  return Math.max(0, Math.min(100, Math.round(num)));
}

/**
 * Normalise a raw parsed object into a well-formed FeedbackReport,
 * ensuring all required fields exist and scores are within 0-100.
 */
function normaliseFeedbackReport(raw: Record<string, unknown>): FeedbackReport {
  const scores = (raw.scores ?? {}) as Record<string, unknown>;

  return {
    scores: {
      grammar: clampScore(scores.grammar),
      vocabulary: clampScore(scores.vocabulary),
      relevance: clampScore(scores.relevance),
      fillerWords: clampScore(scores.fillerWords),
      coherence: clampScore(scores.coherence),
      overall: clampScore(scores.overall),
    },
    grammarErrors: Array.isArray(raw.grammarErrors)
      ? raw.grammarErrors.map((e: Record<string, unknown>) => ({
          original: String(e.original ?? ''),
          correction: String(e.correction ?? ''),
          rule: String(e.rule ?? ''),
        }))
      : [],
    fillerWordsDetected: Array.isArray(raw.fillerWordsDetected)
      ? raw.fillerWordsDetected.map((f: Record<string, unknown>) => ({
          word: String(f.word ?? ''),
          count: typeof f.count === 'number' ? f.count : Number(f.count) || 0,
        }))
      : [],
    suggestions: Array.isArray(raw.suggestions)
      ? raw.suggestions.map((s: unknown) => String(s))
      : [],
    improvedAnswer: typeof raw.improvedAnswer === 'string' ? raw.improvedAnswer : '',
  };
}

/**
 * Build a default / fallback FeedbackReport used when Claude Haiku is
 * unreachable after all retries.
 */
function buildFallbackFeedbackReport(): FeedbackReport {
  return {
    scores: {
      grammar: 0,
      vocabulary: 0,
      relevance: 0,
      fillerWords: 0,
      coherence: 0,
      overall: 0,
    },
    grammarErrors: [],
    fillerWordsDetected: [],
    suggestions: ['Analisis sedang diproses'],
    improvedAnswer: '',
  };
}

/**
 * Normalise a raw parsed object into a well-formed SummaryReport.
 */
function normaliseSummaryReport(raw: Record<string, unknown>): SummaryReport {
  const criteriaScores = (raw.criteriaScores ?? {}) as Record<string, unknown>;

  return {
    overallScore: clampScore(raw.overallScore),
    criteriaScores: {
      grammar: clampScore(criteriaScores.grammar),
      vocabulary: clampScore(criteriaScores.vocabulary),
      relevance: clampScore(criteriaScores.relevance),
      fillerWords: clampScore(criteriaScores.fillerWords),
      coherence: clampScore(criteriaScores.coherence),
    },
    performanceTrend: Array.isArray(raw.performanceTrend)
      ? raw.performanceTrend.map((p: Record<string, unknown>) => ({
          questionNumber: typeof p.questionNumber === 'number' ? p.questionNumber : Number(p.questionNumber) || 0,
          score: clampScore(p.score),
        }))
      : [],
    topImprovementAreas: Array.isArray(raw.topImprovementAreas)
      ? raw.topImprovementAreas.map((a: unknown) => String(a))
      : [],
    recommendations: Array.isArray(raw.recommendations)
      ? raw.recommendations.map((r: unknown) => String(r))
      : [],
  };
}

/**
 * Build a default / fallback SummaryReport used when Claude Haiku is
 * unreachable after all retries.
 */
function buildFallbackSummaryReport(feedbackReports: FeedbackReport[], questionCount: number): SummaryReport {
  // Compute averages from the available feedback reports
  const count = feedbackReports.length || 1;
  const avg = (field: keyof FeedbackReport['scores']) =>
    Math.round(feedbackReports.reduce((sum, r) => sum + r.scores[field], 0) / count);

  return {
    overallScore: avg('overall'),
    criteriaScores: {
      grammar: avg('grammar'),
      vocabulary: avg('vocabulary'),
      relevance: avg('relevance'),
      fillerWords: avg('fillerWords'),
      coherence: avg('coherence'),
    },
    performanceTrend: feedbackReports.map((r, i) => ({
      questionNumber: i + 1,
      score: r.scores.overall,
    })),
    topImprovementAreas: ['Analisis sedang diproses'],
    recommendations: ['Analisis sedang diproses'],
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyse a single user answer using Claude Haiku.
 *
 * - Builds a prompt asking Claude Haiku to evaluate the answer.
 * - Sends the prompt via InvokeModel with a 15-second timeout.
 * - Retries up to 2 times on failure.
 * - Falls back to a default FeedbackReport with "Analisis sedang diproses"
 *   if all attempts fail.
 *
 * Requirements: 5.1, 5.2, 5.5
 */
export async function analyzeAnswer(
  questionText: string,
  userTranscript: string,
  jobPosition: string,
  seniorityLevel: SeniorityLevel,
): Promise<FeedbackReport> {
  const systemPrompt = `You are an expert English language assessor specializing in job interview preparation for ${seniorityLevel}-level ${jobPosition} positions. Analyze the candidate's answer and return ONLY a valid JSON object matching this exact structure (no markdown, no extra text):
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

Candidate's Answer: "${userTranscript}"

Analyze this answer and return the JSON assessment.`;

  const responseText = await invokeHaikuWithRetry(systemPrompt, userPrompt);

  if (responseText === null) {
    console.warn('All Claude Haiku attempts failed — returning fallback FeedbackReport');
    return buildFallbackFeedbackReport();
  }

  try {
    const parsed = parseJsonResponse<Record<string, unknown>>(responseText);
    return normaliseFeedbackReport(parsed);
  } catch (parseError) {
    console.error('Failed to parse FeedbackReport JSON:', parseError);
    return buildFallbackFeedbackReport();
  }
}

/**
 * Generate a summary report for the entire interview session.
 *
 * - Collects all FeedbackReports from the session.
 * - Sends them to Claude Haiku to produce a SummaryReport.
 * - Retries up to 2 times on failure.
 * - Falls back to a computed SummaryReport if all attempts fail.
 *
 * Requirements: 12.1, 12.2
 */
export async function generateSummary(
  feedbackReports: FeedbackReport[],
  jobPosition: string,
  questionCount: number,
): Promise<SummaryReport> {
  const feedbackSummaries = feedbackReports.map((r, i) => ({
    questionNumber: i + 1,
    scores: r.scores,
  }));

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
- topImprovementAreas: at least 3 areas that need the most improvement
- recommendations: at least 1 actionable recommendation for improvement`;

  const userPrompt = `Interview session for position: ${jobPosition}
Total questions answered: ${questionCount}

Feedback data per question:
${JSON.stringify(feedbackSummaries, null, 2)}

Generate the summary report JSON.`;

  const responseText = await invokeHaikuWithRetry(systemPrompt, userPrompt);

  if (responseText === null) {
    console.warn('All Claude Haiku attempts failed — returning fallback SummaryReport');
    return buildFallbackSummaryReport(feedbackReports, questionCount);
  }

  try {
    const parsed = parseJsonResponse<Record<string, unknown>>(responseText);
    return normaliseSummaryReport(parsed);
  } catch (parseError) {
    console.error('Failed to parse SummaryReport JSON:', parseError);
    return buildFallbackSummaryReport(feedbackReports, questionCount);
  }
}
