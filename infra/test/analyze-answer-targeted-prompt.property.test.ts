/**
 * Feature: jd-targeting, Property 14: Targeted analyze_answer prompt includes
 * JD list instruction
 *
 * **Validates: Requirements 8.1, 8.2, 8.3**
 *
 * For any active SessionRecord with `mode === 'targeted'` and a `jdContext`
 * where AT LEAST ONE of `technologies` / `responsibilities` / `requirements`
 * is non-empty, calling `analyze_answer` on that session must produce a
 * Bedrock `systemPrompt` that:
 *
 *   (1) Contains the verbatim targeted-branch marker text
 *         "This interview targets a specific role.
 *          Reference these elements when assessing relevance:"
 *
 *   (2) Enumerates every item from each non-empty list as a substring in
 *       the captured `systemPrompt` (the handler writes
 *         `- Technologies: <items joined by ', '>`,
 *         `- Responsibilities: <items joined by ', '>`,
 *         `- Requirements: <items joined by ', '>`).
 *
 *   (3) Contains the instruction to tie at least one suggestion to those
 *       lists, verbatim:
 *         "Include at least one specific suggestion in the `suggestions`
 *          array that references an item from these lists."
 *
 * Additionally (Requirement 8.2) this file also asserts:
 *
 *   (4) When the same session is targeted but ALL THREE lists are empty,
 *       the Bedrock `systemPrompt` is BYTE-IDENTICAL to the prompt that a
 *       parallel Quick-mode session with the same base fields would
 *       produce. This is the exact contract in Requirement 8.2.
 */
import fc from 'fast-check';

// ────────────────────────────────────────────────────────────────────────────
// Module mocks (must come before the SUT import)
// ────────────────────────────────────────────────────────────────────────────

const mockSend = jest.fn();
const mockInvokeTextModelWithTimeout = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({})),
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: jest.fn(() => ({ send: mockSend })),
  },
  PutCommand: jest.fn((params: unknown) => ({ _type: 'PutCommand', params })),
  GetCommand: jest.fn((params: unknown) => ({ _type: 'GetCommand', params })),
  UpdateCommand: jest.fn((params: unknown) => ({ _type: 'UpdateCommand', params })),
  QueryCommand: jest.fn((params: unknown) => ({ _type: 'QueryCommand', params })),
}));

jest.mock('../lambda/shared/bedrockInvoke', () => ({
  invokeTextModelWithTimeout: (...args: unknown[]) =>
    mockInvokeTextModelWithTimeout(...args),
}));

// SUT — imported AFTER the jest.mock calls so the mocks are wired up.
import { routeAction } from '../lambda/chat/index';
import type {
  ChatRequest,
  JobDescriptionContext,
  QuestionCategory,
  SeniorityLevel,
} from '../lib/types';

// ────────────────────────────────────────────────────────────────────────────
// Test fixtures
// ────────────────────────────────────────────────────────────────────────────

/**
 * A valid Bedrock feedback JSON response used by `analyze_answer`. The
 * handler parses this into a `FeedbackReport`. The content is irrelevant
 * here — this property only cares about the prompt passed IN to Bedrock.
 */
const VALID_FEEDBACK_RESPONSE = JSON.stringify({
  scores: {
    grammar: 80,
    vocabulary: 80,
    relevance: 80,
    fillerWords: 80,
    coherence: 80,
    overall: 80,
  },
  grammarErrors: [],
  fillerWordsDetected: [],
  suggestions: ['Practice more.'],
  improvedAnswer: 'Improved answer.',
});

/**
 * Verbatim marker strings copied from `infra/lambda/chat/index.ts`. Any
 * rename on one side surfaces as an obvious failure on the other.
 */
const TARGETED_MARKER =
  'This interview targets a specific role. Reference these elements when assessing relevance:';
const SUGGESTION_INSTRUCTION =
  'Include at least one specific suggestion in the `suggestions` array that references an item from these lists.';

const USER_ID = 'test-user-analyze-answer-targeted';

// ────────────────────────────────────────────────────────────────────────────
// Generators
// ────────────────────────────────────────────────────────────────────────────

const seniorityArb: fc.Arbitrary<SeniorityLevel> = fc.constantFrom(
  'junior',
  'mid',
  'senior',
  'lead',
);

const categoryArb: fc.Arbitrary<QuestionCategory> = fc.constantFrom(
  'general',
  'technical',
);

const jobPositionArb = fc.constantFrom(
  'Software Engineer',
  'Product Manager',
  'Data Analyst',
  'UI/UX Designer',
  'DevOps Engineer',
);

/**
 * Distinctive list item of the form `JD_<TAG>_<hex>`. Hex suffixes keep the
 * string free of substrings that might accidentally appear in the base
 * Bedrock system prompt (e.g. "Technologies:", "Requirements:", "grammar").
 * Making items unique per run also means a substring-hit in the captured
 * prompt can only come from the JD block we just assembled.
 */
function distinctItem(tag: string): fc.Arbitrary<string> {
  return fc
    .hexaString({ minLength: 4, maxLength: 12 })
    .map((hex) => `JD_${tag}_${hex}`);
}

/**
 * Triple of lists (technologies, responsibilities, requirements) where at
 * least ONE list is non-empty. This is the precondition of Property 14.
 *
 * Implementation: a 3-bit mask in [1, 7] controls which of the three lists
 * is forced to `minLength: 1`. The remaining lists can still contribute
 * additional items of their own (possibly empty). This keeps shrinks
 * well-behaved — the mask shrinks toward 1 (just technologies non-empty),
 * and each array shrinks toward minimum length.
 */
const nonEmptyListsArb = fc.integer({ min: 1, max: 7 }).chain((mask) =>
  fc.tuple(
    (mask & 1)
      ? fc.array(distinctItem('TECH'), { minLength: 1, maxLength: 4 })
      : fc.constant([] as string[]),
    (mask & 2)
      ? fc.array(distinctItem('RESP'), { minLength: 1, maxLength: 4 })
      : fc.constant([] as string[]),
    (mask & 4)
      ? fc.array(distinctItem('REQ'), { minLength: 1, maxLength: 4 })
      : fc.constant([] as string[]),
  ),
);

/**
 * JobDescriptionContext with at least one of technologies / responsibilities
 * / requirements non-empty. `role` is always non-empty (otherwise targeted
 * mode would be invalid to begin with). The other fields are non-sensitive
 * ambient noise that must not leak into the analyze_answer prompt — the
 * handler only ever references technologies / responsibilities / requirements
 * in the feedback branch (Requirement 8.1).
 */
const targetedJdContextWithListsArb: fc.Arbitrary<JobDescriptionContext> = fc
  .tuple(
    nonEmptyListsArb,
    fc.string(),
    fc.string({ minLength: 1 }).filter((s) => s.trim() !== ''),
    fc.array(distinctItem('SOFT'), { maxLength: 3 }),
    seniorityArb,
    categoryArb,
    fc.string(),
  )
  .map(
    ([
      [technologies, responsibilities, requirements],
      company,
      role,
      softSkills,
      suggestedSeniority,
      suggestedCategory,
      userNotes,
    ]) => ({
      company,
      role,
      technologies,
      responsibilities,
      requirements,
      softSkills,
      suggestedSeniority,
      suggestedCategory,
      userNotes,
    }),
  );

/**
 * JobDescriptionContext whose technologies / responsibilities / requirements
 * are ALL empty. Used to exercise Requirement 8.2 (no JD block appended).
 * Other fields are present — the handler must ignore them in the feedback
 * prompt for Quick parity.
 */
const targetedJdContextEmptyListsArb: fc.Arbitrary<JobDescriptionContext> = fc
  .record({
    company: fc.string(),
    role: fc.string({ minLength: 1 }).filter((s) => s.trim() !== ''),
    technologies: fc.constant([] as string[]),
    responsibilities: fc.constant([] as string[]),
    requirements: fc.constant([] as string[]),
    softSkills: fc.array(distinctItem('SOFT'), { maxLength: 3 }),
    suggestedSeniority: seniorityArb,
    suggestedCategory: categoryArb,
    userNotes: fc.string(),
  });

/**
 * `questions` array with one prior answered question and one unanswered
 * current question. `handleAnalyzeAnswer` reads the LAST element as the
 * current question under analysis.
 */
const questionsArb = fc
  .record({
    answeredText: fc.constantFrom(
      'Tell me about yourself',
      'Describe a challenging project',
      'Why this role?',
    ),
    currentText: fc.constantFrom(
      'What are your strengths?',
      'Where do you see yourself in 5 years?',
      'Walk me through your experience',
    ),
  })
  .map(({ answeredText, currentText }) => [
    {
      questionId: 'q1',
      questionText: answeredText,
      questionType: 'introduction' as const,
      transcription: 'Prior answer',
      answeredAt: new Date(Date.now() - 60_000).toISOString(),
      feedback: {
        scores: {
          grammar: 70,
          vocabulary: 70,
          relevance: 70,
          fillerWords: 70,
          coherence: 70,
          overall: 70,
        },
        grammarErrors: [],
        fillerWordsDetected: [],
        suggestions: ['prior suggestion'],
        improvedAnswer: 'prior improved',
      },
    },
    {
      questionId: 'q2',
      questionText: currentText,
      questionType: 'contextual' as const,
    },
  ]);

/**
 * Base active session shape shared by the targeted and Quick baselines.
 * `updatedAt` is irrelevant for analyze_answer (no expiry check), so we use
 * `now` for simplicity.
 */
const baseSessionArb = fc.record({
  sessionId: fc.uuid(),
  userId: fc.constant(USER_ID),
  jobPosition: jobPositionArb,
  seniorityLevel: seniorityArb,
  questionCategory: categoryArb,
  status: fc.constant('active'),
  type: fc.constant('speaking'),
  questions: questionsArb,
  createdAt: fc.constant(new Date().toISOString()),
  updatedAt: fc.constant(new Date().toISOString()),
});

// ────────────────────────────────────────────────────────────────────────────
// Property 14
// ────────────────────────────────────────────────────────────────────────────

describe('Feature: jd-targeting, Property 14: Targeted analyze_answer prompt includes JD list instruction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSend.mockReset();
    mockInvokeTextModelWithTimeout.mockReset();
    process.env.SESSIONS_TABLE_NAME = 'test-sessions-table';
  });

  // ──────────────────────────────────────────────────────────────────────
  // (1)+(2)+(3) Targeted branch with at least one non-empty list:
  // marker + enumerations + suggestion instruction all present.
  // ──────────────────────────────────────────────────────────────────────
  test('targeted session with any non-empty list: prompt contains marker, every list item, and suggestion instruction (Requirements 8.1, 8.3)', async () => {
    await fc.assert(
      fc.asyncProperty(
        baseSessionArb,
        targetedJdContextWithListsArb,
        async (base, jdContext) => {
          jest.clearAllMocks();
          mockSend.mockReset();
          mockInvokeTextModelWithTimeout.mockReset();
          mockInvokeTextModelWithTimeout.mockResolvedValue(VALID_FEEDBACK_RESPONSE);

          const storedRecord = {
            ...base,
            mode: 'targeted' as const,
            jdContext,
          };

          mockSend.mockImplementation((command: { _type?: string }) => {
            if (command._type === 'GetCommand') {
              return Promise.resolve({ Item: storedRecord });
            }
            return Promise.resolve({});
          });

          const request: ChatRequest = {
            action: 'analyze_answer',
            sessionId: base.sessionId,
            transcription: 'This is my candidate answer.',
          };

          await routeAction(USER_ID, request);

          // Capture the systemPrompt passed to Bedrock.
          expect(mockInvokeTextModelWithTimeout).toHaveBeenCalledTimes(1);
          const prompt = mockInvokeTextModelWithTimeout.mock.calls[0][0]
            .systemPrompt as string;

          // (1) Targeted-branch marker (Requirement 8.1)
          expect(prompt).toContain(TARGETED_MARKER);

          // (2) Every item from each non-empty list appears verbatim in the
          // prompt (Requirement 8.1 — "include jdContext.technologies,
          // jdContext.responsibilities, and jdContext.requirements in the
          // feedback prompt"). Because items are JD_<TAG>_<hex> they can
          // only match their own JD block entry.
          for (const tech of jdContext.technologies) {
            expect(prompt).toContain(tech);
          }
          for (const resp of jdContext.responsibilities) {
            expect(prompt).toContain(resp);
          }
          for (const req of jdContext.requirements) {
            expect(prompt).toContain(req);
          }

          // (3) Instruction telling the model to tie at least one
          // suggestion to the JD lists (Requirement 8.3).
          expect(prompt).toContain(SUGGESTION_INSTRUCTION);
        },
      ),
      { numRuns: 75 },
    );
  });

  // ──────────────────────────────────────────────────────────────────────
  // (4) Targeted session with ALL lists empty: prompt byte-identical to
  //     a parallel Quick-mode baseline (Requirement 8.2).
  // ──────────────────────────────────────────────────────────────────────
  test('targeted session with all three lists empty: prompt is byte-identical to the Quick-mode baseline (Requirement 8.2)', async () => {
    await fc.assert(
      fc.asyncProperty(
        baseSessionArb,
        targetedJdContextEmptyListsArb,
        async (base, jdContext) => {
          jest.clearAllMocks();
          mockSend.mockReset();
          mockInvokeTextModelWithTimeout.mockReset();
          mockInvokeTextModelWithTimeout.mockResolvedValue(VALID_FEEDBACK_RESPONSE);

          const targetedRecord = {
            ...base,
            mode: 'targeted' as const,
            jdContext,
          };

          // Parallel Quick baseline: same base, no mode / jdContext (the
          // canonical pre-feature shape for Quick Mode sessions).
          const quickRecord = { ...base };

          const request: ChatRequest = {
            action: 'analyze_answer',
            sessionId: base.sessionId,
            transcription: 'This is my candidate answer.',
          };

          // --- Targeted-with-empty-lists run ---
          mockSend.mockImplementation((command: { _type?: string }) => {
            if (command._type === 'GetCommand') {
              return Promise.resolve({ Item: targetedRecord });
            }
            return Promise.resolve({});
          });
          await routeAction(USER_ID, request);
          expect(mockInvokeTextModelWithTimeout).toHaveBeenCalledTimes(1);
          const targetedPrompt = mockInvokeTextModelWithTimeout.mock.calls[0][0]
            .systemPrompt as string;

          // --- Quick baseline run ---
          mockSend.mockReset();
          mockInvokeTextModelWithTimeout.mockReset();
          mockInvokeTextModelWithTimeout.mockResolvedValue(VALID_FEEDBACK_RESPONSE);
          mockSend.mockImplementation((command: { _type?: string }) => {
            if (command._type === 'GetCommand') {
              return Promise.resolve({ Item: quickRecord });
            }
            return Promise.resolve({});
          });
          await routeAction(USER_ID, request);
          expect(mockInvokeTextModelWithTimeout).toHaveBeenCalledTimes(1);
          const quickPrompt = mockInvokeTextModelWithTimeout.mock.calls[0][0]
            .systemPrompt as string;

          // Byte-identical — the targeted branch MUST NOT append the JD
          // block when all three lists are empty.
          expect(targetedPrompt).toBe(quickPrompt);

          // Belt-and-braces: even without the baseline comparison, no
          // targeted marker may leak.
          expect(targetedPrompt).not.toContain(TARGETED_MARKER);
          expect(targetedPrompt).not.toContain(SUGGESTION_INSTRUCTION);
        },
      ),
      { numRuns: 30 },
    );
  });
});
