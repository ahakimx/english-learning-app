import type {
  JobDescriptionContext,
  QuestionCategory,
  SeniorityLevel,
} from '../../lib/types';

/**
 * Error thrown by the JD analysis helper when the Nova Pro response cannot be
 * parsed into JSON or cannot be normalized into a valid `JobDescriptionContext`
 * (most notably when `role` is empty).
 *
 * The Chat Lambda handler maps this error to HTTP 502 `JD_ANALYSIS_FAILED`.
 */
export class JdAnalysisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JdAnalysisError';
  }
}

const VALID_SENIORITY: readonly SeniorityLevel[] = ['junior', 'mid', 'senior', 'lead'];
const VALID_CATEGORY: readonly QuestionCategory[] = ['general', 'technical'];

/**
 * Build the Nova Pro extraction prompt for a raw job description.
 *
 * Returns a single string with `{jdRawText}` substituted in. The model is
 * instructed to return ONLY a valid JSON object matching the
 * `JobDescriptionContext` shape (minus `userNotes`, which is always forced to
 * `''` by `normalizeJdContext`).
 */
export function buildJdAnalysisPrompt(jdRawText: string): string {
  return `You are an expert recruiter. Extract structured information from the following job description. Return ONLY a valid JSON object (no markdown, no extra text) matching this exact structure:
{
  "company": "<company name or empty string>",
  "role": "<job title>",
  "technologies": ["<tech 1>", "<tech 2>", ...],
  "responsibilities": ["<responsibility 1>", ...],
  "requirements": ["<requirement 1>", ...],
  "softSkills": ["<soft skill 1>", ...],
  "suggestedSeniority": "junior" | "mid" | "senior" | "lead",
  "suggestedCategory": "general" | "technical"
}

Rules:
- \`role\` must be a non-empty string.
- \`suggestedSeniority\` and \`suggestedCategory\` must be one of the listed values.
- List fields may be empty arrays if no information is available.
- Do not include the field \`userNotes\` in your response.

Job description:
---
${jdRawText}
---`;
}

/**
 * Strip a single optional leading/trailing markdown code fence from a string.
 * Handles both ```` ```json ```` and ```` ``` ```` fences on arbitrary
 * whitespace. Does not recurse into nested fences.
 */
function stripMarkdownFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) {
    return trimmed;
  }

  // Remove opening fence, optionally followed by a language tag, up to and
  // including the first newline.
  const withoutOpen = trimmed.replace(/^```[a-zA-Z0-9_-]*\s*\r?\n?/, '');

  // Remove trailing closing fence (possibly preceded by whitespace / newline).
  return withoutOpen.replace(/\r?\n?\s*```\s*$/, '').trim();
}

/**
 * Parse a Nova Pro response into a partial `JobDescriptionContext`.
 *
 * The model is instructed not to emit markdown, but in practice Bedrock models
 * sometimes wrap JSON in triple-backtick fences. This function:
 *   1. strips a single outer markdown code fence if present,
 *   2. attempts `JSON.parse` on the result,
 *   3. falls back to extracting the outermost `{...}` block on failure,
 *   4. throws `JdAnalysisError` if no valid JSON object can be recovered.
 *
 * Shape-level validation (role non-empty, enum coercion, etc.) happens in
 * `normalizeJdContext`; this function only guarantees the return value is a
 * plain object.
 */
export function parseJdAnalysisResponse(
  responseText: string,
): Partial<JobDescriptionContext> {
  const stripped = stripMarkdownFences(responseText);

  const tryParse = (candidate: string): unknown => {
    try {
      return JSON.parse(candidate);
    } catch {
      return undefined;
    }
  };

  let parsed = tryParse(stripped);

  if (parsed === undefined) {
    // Fallback: extract the outermost JSON object from the text.
    const match = stripped.match(/\{[\s\S]*\}/);
    if (match) {
      parsed = tryParse(match[0]);
    }
  }

  if (parsed === undefined || parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new JdAnalysisError('Failed to parse JD analysis response as JSON');
  }

  return parsed as Partial<JobDescriptionContext>;
}

/**
 * Coerce an unknown value to a `string[]`, defaulting to `[]` when the input
 * is not an array. Non-string elements are filtered out rather than stringified
 * so that unexpected model output does not produce garbage entries like
 * `"[object Object]"`.
 */
function coerceStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const result: string[] = [];
  for (const item of value) {
    if (typeof item === 'string') {
      result.push(item);
    }
  }
  return result;
}

/**
 * Normalize a parsed JD analysis payload into a strict `JobDescriptionContext`.
 *
 * Guarantees on the returned value:
 *   - `role` is a non-empty string (throws `JdAnalysisError` otherwise);
 *   - `company` is a string (default `''`);
 *   - `technologies`, `responsibilities`, `requirements`, `softSkills` are
 *     arrays of strings (default `[]`), preserving input order;
 *   - `suggestedSeniority` is one of `junior|mid|senior|lead` (default `'mid'`
 *     when absent or invalid);
 *   - `suggestedCategory` is one of `general|technical` (default `'general'`
 *     when absent or invalid);
 *   - `userNotes` is **always** `''`, regardless of any value the model may
 *     have emitted. The user supplies notes later in the review UI.
 */
export function normalizeJdContext(
  parsed: Partial<JobDescriptionContext>,
): JobDescriptionContext {
  const rawRole = (parsed as { role?: unknown }).role;
  if (typeof rawRole !== 'string' || rawRole.trim() === '') {
    throw new JdAnalysisError('JD analysis response is missing a non-empty `role`');
  }

  const rawCompany = (parsed as { company?: unknown }).company;
  const company = typeof rawCompany === 'string' ? rawCompany : '';

  const rawSeniority = (parsed as { suggestedSeniority?: unknown }).suggestedSeniority;
  const suggestedSeniority: SeniorityLevel = VALID_SENIORITY.includes(
    rawSeniority as SeniorityLevel,
  )
    ? (rawSeniority as SeniorityLevel)
    : 'mid';

  const rawCategory = (parsed as { suggestedCategory?: unknown }).suggestedCategory;
  const suggestedCategory: QuestionCategory = VALID_CATEGORY.includes(
    rawCategory as QuestionCategory,
  )
    ? (rawCategory as QuestionCategory)
    : 'general';

  return {
    company,
    role: rawRole,
    technologies: coerceStringArray((parsed as { technologies?: unknown }).technologies),
    responsibilities: coerceStringArray(
      (parsed as { responsibilities?: unknown }).responsibilities,
    ),
    requirements: coerceStringArray((parsed as { requirements?: unknown }).requirements),
    softSkills: coerceStringArray((parsed as { softSkills?: unknown }).softSkills),
    suggestedSeniority,
    suggestedCategory,
    // userNotes is always forced to '' regardless of model output.
    userNotes: '',
  };
}
