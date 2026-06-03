/**
 * Feature: jd-targeting, Property 16 (analyze_answer branch):
 *   Quick mode feedback prompts are unchanged
 *
 * **Validates: Requirement 8.5**
 *
 * Requirement 8.5 states that when the `analyze_answer` (or `end_session`)
 * action is invoked for a session whose `mode` is `'quick'` or absent, the
 * Chat_Lambda SHALL use the existing feedback and summary generation logic
 * without referencing any JD context.
 *
 * This test file covers the **`analyze_answer` branch** of Property 16. The
 * `end_session` branch is covered separately by task 10.3.
 *
 * The property asserted here is byte-level, not semantic:
 *
 *   For every SessionRecord whose effective mode is Quick (i.e. `mode === 'quick'`,
 *   `mode === undefined`, or `mode` set to any non-'targeted' value), and for
 *   every shape of `jdContext` that may coexist on such a record (absent,
 *   present-and-empty-lists, or present-and-fully-populated), the system
 *   prompt that `handleAnalyzeAnswer` forwards to Bedrock SHALL:
 *
 *     (a) equal, byte-for-byte, the system prompt produced for a baseline
 *         "pre-feature" session record — same base fields, no `mode`, no
 *         `jdContext` — proving the Quick code path is literally unchanged;
 *
 *     (b) not contain the targeted-branch marker string
 *         "This interview targets a specific role. Reference these elements
 *          when assessing relevance:"
 *         — catching any regression where a non-empty `jdContext` accidentally
 *         leaks into the Quick branch.
 *
 * NOTE: This complements, but does not overlap with, the following tests:
 *   - 9.2 (targeted analyze_answer prompt content)          — different mode
 *   - 10.3 (Quick end_session prompt byte-identical)        — different action
 *   - 12.4 (non-targeted Prompt Builder totality)            — different SUT (Nova Sonic)
 *   - 11.3 (missing-jdContext-targeted degrades to Quick)    — different premise
 */
import fc from 'fast-check';

// ────────────────────────────────────────────────────────────────────────────
// Module mocks (declared before the SUT import so the mocks are wired up)
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

// SUT — imported after jest.mock calls so the mocks are wired up.
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
 * A valid Bedrock feedback JSON response. The handler parses this into a
 * `FeedbackReport`. The content is irrelevant to the property — we only
 * care about the prompt sent INTO Bedrock, not the payload coming back.
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
 * The exact marker string used by the targeted branch of `handleAnalyzeAnswer`
 * in `infra/lambda/chat/index.ts`. Copied verbatim so a rename there will
 * surface as an obvious mismatch here. The Quick prompt MUST NOT contain it.
 */
const TARGETED_FEEDBACK_MARKER =
  'This interview targets a specific role. Reference these elements when assessing relevance:';

const USER_ID = 'test-user-quick-prompt-unchanged';

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
 * Non-empty JobDescriptionContext generator. Every list is non-empty so
 * that if the Quick branch ever accidentally consulted `jdContext`, the
 * targeted block would be appended and the prompt would diverge from the
 * baseline.
 */
const nonEmptyJdContextArb: fc.Arbitrary<JobDescriptionContext> = fc.record({
  company: fc.string({ minLength: 1, maxLength: 30 }),
  role: fc
    .string({ minLength: 1, maxLength: 30 })
    .filter((s) => s.trim() !== ''),
  technologies: fc.array(fc.string({ minLength: 1, maxLength: 15 }), {
    minLength: 1,
    maxLength: 4,
  }),
  responsibilities: fc.array(fc.string({ minLength: 1, maxLength: 30 }), {
    minLength: 1,
    maxLength: 4,
  }),
  requirements: fc.array(fc.string({ minLength: 1, maxLength: 30 }), {
    minLength: 1,
    maxLength: 4,
  }),
  softSkills: fc.array(fc.string({ minLength: 1, maxLength: 15 }), {
    minLength: 1,
    maxLength: 4,
  }),
  suggestedSeniority: seniorityArb,
  suggestedCategory: categoryArb,
  userNotes: fc.string({ maxLength: 30 }),
});

/**
 * Empty-list JobDescriptionContext. Edge case where `jdContext` exists on
 * the record but has no enumerable content; the targeted branch in the
 * production code already short-circuits this to Quick. We keep it in the
 * generator to exercise the `effectiveMode !== 'targeted'` guard
 * independently of any list-length logic.
 */
const emptyListsJdContextArb: fc.Arbitrary<JobDescriptionContext> = fc.record({
  company: fc.string({ maxLength: 20 }),
  role: fc
    .string({ minLength: 1, maxLength: 20 })
    .filter((s) => s.trim() !== ''),
  technologies: fc.constant([] as string[]),
  responsibilities: fc.constant([] as string[]),
  requirements: fc.constant([] as string[]),
  softSkills: fc.constant([] as string[]),
  suggestedSeniority: seniorityArb,
  suggestedCategory: categoryArb,
  userNotes: fc.constant(''),
});

/**
 * The full space of `jdContext` shapes that may coexist with a Quick-mode
 * session: absent, empty-lists, or fully populated. A Quick-mode session
 * must be byte-identical against the baseline in all three cases.
 */
const jdContextAnyShapeArb: fc.Arbitrary<JobDescriptionContext | undefined> =
  fc.oneof(
    { arbitrary: fc.constant(undefined), weight: 1 },
    { arbitrary: emptyListsJdContextArb, weight: 1 },
    { arbitrary: nonEmptyJdContextArb, weight: 2 },
  );

/**
 * A `mode` value that is NOT the literal `'targeted'`. Covers:
 *  - the valid Quick value (`'quick'`)
 *  - an absent field (`undefined`)
 *  - other non-'targeted' strings that `determineSessionMode` must fold
 *    back to Quick (Requirement 10.4)
 */
const nonTargetedModeArb: fc.Arbitrary<
  'quick' | undefined | 'invalid' | '' | 'QUICK'
> = fc.constantFrom('quick', undefined, 'invalid', '', 'QUICK');

/**
 * Session-level generator: every field the handler reads is randomized
 * except `mode` / `jdContext`, which are injected in the property body so
 * we control the Quick-vs-baseline distinction directly.
 */
const baseSessionArb = fc.record({
  sessionId: fc.uuid(),
  userId: fc.constant(USER_ID),
  jobPosition: jobPositionArb,
  seniorityLevel: seniorityArb,
  questionCategory: categoryArb,
  status: fc.constant('active'),
  type: fc.constant('speaking'),
  createdAt: fc.constant(
    new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  ),
  updatedAt: fc.constant(new Date(Date.now() - 60_000).toISOString()),
  questions: fc
    .record({
      answered: fc.constantFrom(
        'Tell me about yourself',
        'Describe a challenging project',
      ),
      current: fc.constantFrom(
        'What are your strengths?',
        'Where do you see yourself in 5 years?',
        'Walk me through your experience',
      ),
    })
    .map(({ answered, current }) => [
      {
        questionId: 'q1',
        questionText: answered,
        questionType: 'introduction' as const,
        transcription: 'Prior answer',
        answeredAt: new Date(Date.now() - 120_000).toISOString(),
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
          suggestions: ['prior'],
          improvedAnswer: 'prior improved',
        },
      },
      {
        questionId: 'q2',
        questionText: current,
        questionType: 'contextual' as const,
      },
    ]),
});

// ────────────────────────────────────────────────────────────────────────────
// Test utility: run `analyze_answer` once against a crafted record and
// return the `systemPrompt` string captured by the Bedrock mock.
// ────────────────────────────────────────────────────────────────────────────

async function captureAnalyzeAnswerPrompt(
  record: Record<string, unknown>,
  transcription: string,
): Promise<string> {
  mockSend.mockReset();
  mockInvokeTextModelWithTimeout.mockReset();
  mockInvokeTextModelWithTimeout.mockResolvedValue(VALID_FEEDBACK_RESPONSE);

  mockSend.mockImplementation((command: { _type?: string }) => {
    if (command._type === 'GetCommand') {
      return Promise.resolve({ Item: record });
    }
    // `analyze_answer` also issues an UpdateCommand to persist feedback.
    return Promise.resolve({});
  });

  const request: ChatRequest = {
    action: 'analyze_answer',
    sessionId: record.sessionId as string,
    transcription,
  };
  await routeAction(USER_ID, request);

  const firstCall = mockInvokeTextModelWithTimeout.mock.calls[0];
  if (!firstCall) {
    throw new Error('Bedrock mock was never invoked');
  }
  const opts = firstCall[0] as { systemPrompt?: string };
  if (typeof opts.systemPrompt !== 'string') {
    throw new Error('Captured Bedrock call had no systemPrompt string');
  }
  return opts.systemPrompt;
}

// ────────────────────────────────────────────────────────────────────────────
// Property 16 (analyze_answer branch)
// ────────────────────────────────────────────────────────────────────────────

describe('Feature: jd-targeting, Property 16 (analyze_answer branch): Quick mode feedback prompts are unchanged', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSend.mockReset();
    mockInvokeTextModelWithTimeout.mockReset();
    process.env.SESSIONS_TABLE_NAME = 'test-sessions-table';
  });

  test('Quick-mode analyze_answer prompts are byte-identical to the pre-feature baseline regardless of jdContext shape', async () => {
    await fc.assert(
      fc.asyncProperty(
        baseSessionArb,
        nonTargetedModeArb,
        jdContextAnyShapeArb,
        fc.constantFrom(
          'This is my candidate answer.',
          'Saya memiliki pengalaman 3 tahun.',
          '',
          'Short.',
        ),
        async (base, mode, jdContext, transcription) => {
          // The baseline record is literally pre-feature shape: no `mode`,
          // no `jdContext`. `handleAnalyzeAnswer` must treat it as Quick
          // and produce the original, unchanged Bedrock prompt.
          const baselineRecord: Record<string, unknown> = { ...base };

          // The Quick record carries any non-'targeted' mode (including
          // `undefined`) and optionally a `jdContext` that the Quick branch
          // MUST ignore byte-for-byte.
          const quickRecord: Record<string, unknown> = { ...base };
          if (mode !== undefined) {
            quickRecord.mode = mode;
          }
          if (jdContext !== undefined) {
            quickRecord.jdContext = jdContext;
          }

          const quickPrompt = await captureAnalyzeAnswerPrompt(
            quickRecord,
            transcription,
          );
          const baselinePrompt = await captureAnalyzeAnswerPrompt(
            baselineRecord,
            transcription,
          );

          // (a) Byte-identical to the pre-feature prompt (Requirement 8.5).
          expect(quickPrompt).toBe(baselinePrompt);

          // (b) The targeted-branch marker must never appear in a Quick
          //     prompt, even if a fully populated jdContext is attached to
          //     the record.
          expect(quickPrompt).not.toContain(TARGETED_FEEDBACK_MARKER);
        },
      ),
      { numRuns: 75 },
    );
  });

  // ──────────────────────────────────────────────────────────────────────
  // Concrete anchors — readable failure modes without relying on shrinkage.
  // Each case is already subsumed by the property above.
  // ──────────────────────────────────────────────────────────────────────

  test("mode === 'quick' with a fully populated jdContext: prompt equals the baseline and contains no targeted marker", async () => {
    const base = {
      sessionId: '11111111-1111-4111-8111-111111111111',
      userId: USER_ID,
      jobPosition: 'Software Engineer',
      seniorityLevel: 'senior' as SeniorityLevel,
      questionCategory: 'technical' as QuestionCategory,
      status: 'active',
      type: 'speaking',
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 60_000).toISOString(),
      questions: [
        {
          questionId: 'q1',
          questionText: 'What are your strengths?',
          questionType: 'contextual',
        },
      ],
    };
    const baseline = { ...base };
    const quick = {
      ...base,
      mode: 'quick',
      jdContext: {
        company: 'Acme Corp',
        role: 'Senior Backend Engineer',
        technologies: ['Node.js', 'AWS'],
        responsibilities: ['Lead backend'],
        requirements: ['5+ years'],
        softSkills: ['Leadership'],
        suggestedSeniority: 'senior' as SeniorityLevel,
        suggestedCategory: 'technical' as QuestionCategory,
        userNotes: 'From fintech.',
      } satisfies JobDescriptionContext,
    };

    const quickPrompt = await captureAnalyzeAnswerPrompt(quick, 'Answer.');
    const baselinePrompt = await captureAnalyzeAnswerPrompt(baseline, 'Answer.');

    expect(quickPrompt).toBe(baselinePrompt);
    expect(quickPrompt).not.toContain(TARGETED_FEEDBACK_MARKER);
    // Belt-and-braces: none of the attached JD content leaked through.
    expect(quickPrompt).not.toContain('Acme Corp');
    expect(quickPrompt).not.toContain('Node.js');
    expect(quickPrompt).not.toContain('Lead backend');
  });

  test('mode absent with a fully populated jdContext: prompt equals the baseline byte-for-byte', async () => {
    const base = {
      sessionId: '22222222-2222-4222-8222-222222222222',
      userId: USER_ID,
      jobPosition: 'Product Manager',
      seniorityLevel: 'mid' as SeniorityLevel,
      questionCategory: 'general' as QuestionCategory,
      status: 'active',
      type: 'speaking',
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 60_000).toISOString(),
      questions: [
        {
          questionId: 'q1',
          questionText: 'Walk me through your experience.',
          questionType: 'contextual',
        },
      ],
    };
    const baseline = { ...base };
    const modeAbsentWithJd = {
      ...base,
      jdContext: {
        company: 'Globex',
        role: 'Product Manager',
        technologies: [],
        responsibilities: ['Own roadmap'],
        requirements: [],
        softSkills: ['Communication'],
        suggestedSeniority: 'mid' as SeniorityLevel,
        suggestedCategory: 'general' as QuestionCategory,
        userNotes: '',
      } satisfies JobDescriptionContext,
    };

    const captured = await captureAnalyzeAnswerPrompt(
      modeAbsentWithJd,
      'My answer.',
    );
    const baselineCaptured = await captureAnalyzeAnswerPrompt(
      baseline,
      'My answer.',
    );

    expect(captured).toBe(baselineCaptured);
    expect(captured).not.toContain(TARGETED_FEEDBACK_MARKER);
    expect(captured).not.toContain('Globex');
  });

  test("mode === 'invalid' (any non-'targeted' value) is folded to Quick and matches the baseline", async () => {
    const base = {
      sessionId: '33333333-3333-4333-8333-333333333333',
      userId: USER_ID,
      jobPosition: 'Data Analyst',
      seniorityLevel: 'junior' as SeniorityLevel,
      questionCategory: 'general' as QuestionCategory,
      status: 'active',
      type: 'speaking',
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 60_000).toISOString(),
      questions: [
        {
          questionId: 'q1',
          questionText: 'What tools do you use?',
          questionType: 'contextual',
        },
      ],
    };
    const invalidModeRecord = { ...base, mode: 'invalid' };
    const baseline = { ...base };

    const invalidPrompt = await captureAnalyzeAnswerPrompt(
      invalidModeRecord,
      'Answer.',
    );
    const baselinePrompt = await captureAnalyzeAnswerPrompt(baseline, 'Answer.');

    expect(invalidPrompt).toBe(baselinePrompt);
    expect(invalidPrompt).not.toContain(TARGETED_FEEDBACK_MARKER);
  });
});
