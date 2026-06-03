/**
 * Feature: jd-targeting, Property 16 (end_session branch):
 *   Quick mode summary prompts are unchanged
 *
 * **Validates: Requirement 8.5**
 *
 * Requirement 8.5 states that when the `end_session` (or `analyze_answer`)
 * action is invoked for a session whose `mode` is `'quick'` or absent, the
 * Chat_Lambda SHALL use the existing feedback and summary generation logic
 * without referencing any JD context.
 *
 * This test file covers the **`end_session` branch** of Property 16. The
 * `analyze_answer` branch is covered separately by task 9.3 in
 * `analyze-answer-quick-prompt-unchanged.property.test.ts`.
 *
 * The property asserted here is byte-level, not semantic:
 *
 *   For every SessionRecord whose effective mode is Quick (i.e. `mode === 'quick'`,
 *   `mode === undefined`, or `mode` set to any non-'targeted' value), and for
 *   every shape of `jdContext` that may coexist on such a record (absent,
 *   present-and-empty-lists, or present-and-fully-populated), the system
 *   prompt that `handleEndSession` forwards to Bedrock SHALL:
 *
 *     (a) equal, byte-for-byte, the summary system prompt produced for a
 *         baseline "pre-feature" session record — same base fields, no
 *         `mode`, no `jdContext` — proving the Quick code path for summary
 *         generation is literally unchanged;
 *
 *     (b) not contain the targeted-branch marker string
 *         "This session is targeted at a specific role. In the
 *          `topImprovementAreas` and `recommendations` arrays, reference at
 *          least one of:"
 *         — catching any regression where a non-empty `jdContext` accidentally
 *         leaks into the Quick summary branch.
 *
 * NOTE: This complements, but does not overlap with, the following tests:
 *   - 9.3 (analyze_answer Quick prompt byte-identical)       — different action
 *   - 10.2 (targeted end_session summary prompt content)      — different mode
 *   - 11.3 (missing-jdContext-targeted degrades to Quick)     — different premise
 *            (that test asserts `mode === 'targeted'` WITH jdContext omitted
 *             also emits the Quick prompt; this one asserts every non-targeted
 *             mode does so, regardless of whether jdContext is attached).
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
 * A valid Bedrock summary JSON response. The handler parses this into a
 * `SummaryReport`. The content is irrelevant to the property — we only
 * care about the prompt sent INTO Bedrock, not the payload coming back.
 */
const VALID_SUMMARY_RESPONSE = JSON.stringify({
  overallScore: 80,
  criteriaScores: {
    grammar: 80,
    vocabulary: 80,
    relevance: 80,
    fillerWords: 80,
    coherence: 80,
  },
  performanceTrend: [{ questionNumber: 1, score: 80 }],
  topImprovementAreas: ['a', 'b', 'c'],
  recommendations: ['r1'],
});

/**
 * The exact marker string used by the targeted branch of `handleEndSession`
 * in `infra/lambda/chat/index.ts`. Copied verbatim so a rename there will
 * surface as an obvious mismatch here. The Quick summary prompt MUST NOT
 * contain it.
 */
const TARGETED_SUMMARY_MARKER =
  'This session is targeted at a specific role. In the `topImprovementAreas` and `recommendations` arrays, reference at least one of:';

const USER_ID = 'test-user-end-session-quick-prompt-unchanged';

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
 * the record but has no enumerable content; even in the targeted branch
 * the production code short-circuits this to the Quick prompt. We include
 * it here to exercise the `effectiveMode !== 'targeted'` guard independent
 * of any list-length logic.
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
 * must be byte-identical to the baseline in all three cases.
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
 *
 * Crucially the `questions` array always contains at least one answered
 * question with a `feedback` payload — `handleEndSession` iterates these
 * to build the `feedbackSummaries` array spliced into the user prompt,
 * and having zero answered questions would make the baseline and Quick
 * prompts trivially identical (both empty-array prompts) rather than
 * faithfully exercising the summary code path.
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
      first: fc.constantFrom(
        'Tell me about yourself',
        'Describe a challenging project',
        'Why this role?',
      ),
      second: fc.constantFrom(
        'What are your strengths?',
        'Where do you see yourself in 5 years?',
        'Walk me through your experience',
      ),
    })
    .map(({ first, second }) => [
      {
        questionId: 'q1',
        questionText: first,
        questionType: 'introduction' as const,
        transcription: 'First answer',
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
          suggestions: ['first suggestion'],
          improvedAnswer: 'first improved',
        },
      },
      {
        questionId: 'q2',
        questionText: second,
        questionType: 'contextual' as const,
        transcription: 'Second answer',
        answeredAt: new Date(Date.now() - 60_000).toISOString(),
        feedback: {
          scores: {
            grammar: 75,
            vocabulary: 75,
            relevance: 75,
            fillerWords: 75,
            coherence: 75,
            overall: 75,
          },
          grammarErrors: [],
          fillerWordsDetected: [],
          suggestions: ['second suggestion'],
          improvedAnswer: 'second improved',
        },
      },
    ]),
});

// ────────────────────────────────────────────────────────────────────────────
// Test utility: run `end_session` once against a crafted record and return
// the `systemPrompt` string captured by the Bedrock mock.
// ────────────────────────────────────────────────────────────────────────────

async function captureEndSessionPrompt(
  record: Record<string, unknown>,
): Promise<string> {
  mockSend.mockReset();
  mockInvokeTextModelWithTimeout.mockReset();
  mockInvokeTextModelWithTimeout.mockResolvedValue(VALID_SUMMARY_RESPONSE);

  mockSend.mockImplementation((command: { _type?: string }) => {
    if (command._type === 'GetCommand') {
      return Promise.resolve({ Item: record });
    }
    // `end_session` also issues an UpdateCommand to persist the summary.
    return Promise.resolve({});
  });

  const request: ChatRequest = {
    action: 'end_session',
    sessionId: record.sessionId as string,
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
// Property 16 (end_session branch)
// ────────────────────────────────────────────────────────────────────────────

describe('Feature: jd-targeting, Property 16 (end_session branch): Quick mode summary prompts are unchanged', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSend.mockReset();
    mockInvokeTextModelWithTimeout.mockReset();
    process.env.SESSIONS_TABLE_NAME = 'test-sessions-table';
  });

  test('Quick-mode end_session summary prompts are byte-identical to the pre-feature baseline regardless of jdContext shape', async () => {
    await fc.assert(
      fc.asyncProperty(
        baseSessionArb,
        nonTargetedModeArb,
        jdContextAnyShapeArb,
        async (base, mode, jdContext) => {
          // The baseline record is literally pre-feature shape: no `mode`,
          // no `jdContext`. `handleEndSession` must treat it as Quick and
          // produce the original, unchanged Bedrock summary prompt.
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

          const quickPrompt = await captureEndSessionPrompt(quickRecord);
          const baselinePrompt = await captureEndSessionPrompt(baselineRecord);

          // (a) Byte-identical to the pre-feature prompt (Requirement 8.5).
          expect(quickPrompt).toBe(baselinePrompt);

          // (b) The targeted-branch marker must never appear in a Quick
          //     summary prompt, even if a fully populated jdContext is
          //     attached to the record.
          expect(quickPrompt).not.toContain(TARGETED_SUMMARY_MARKER);
        },
      ),
      { numRuns: 75 },
    );
  });

  // ──────────────────────────────────────────────────────────────────────
  // Structural safety-net: jdContext in three concrete shapes. Each case
  // is already subsumed by the property above, but these anchors produce
  // readable failures without relying on fast-check shrinkage.
  // ──────────────────────────────────────────────────────────────────────

  test("mode === 'quick' with jdContext absent: prompt equals the baseline", async () => {
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
          questionText: 'Tell me about yourself.',
          questionType: 'introduction',
          transcription: 'My answer',
          answeredAt: new Date(Date.now() - 120_000).toISOString(),
          feedback: {
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
            suggestions: ['x'],
            improvedAnswer: 'y',
          },
        },
      ],
    };
    const baseline = { ...base };
    const quickNoJd = { ...base, mode: 'quick' };

    const quickPrompt = await captureEndSessionPrompt(quickNoJd);
    const baselinePrompt = await captureEndSessionPrompt(baseline);

    expect(quickPrompt).toBe(baselinePrompt);
    expect(quickPrompt).not.toContain(TARGETED_SUMMARY_MARKER);
  });

  test("mode === 'quick' with jdContext present but all lists empty: prompt equals the baseline", async () => {
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
          questionType: 'introduction',
          transcription: 'My answer',
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
            suggestions: ['s'],
            improvedAnswer: 'i',
          },
        },
      ],
    };
    const baseline = { ...base };
    const quickEmptyJd = {
      ...base,
      mode: 'quick',
      jdContext: {
        company: 'Globex',
        role: 'Product Manager',
        technologies: [],
        responsibilities: [],
        requirements: [],
        softSkills: [],
        suggestedSeniority: 'mid' as SeniorityLevel,
        suggestedCategory: 'general' as QuestionCategory,
        userNotes: '',
      } satisfies JobDescriptionContext,
    };

    const quickPrompt = await captureEndSessionPrompt(quickEmptyJd);
    const baselinePrompt = await captureEndSessionPrompt(baseline);

    expect(quickPrompt).toBe(baselinePrompt);
    expect(quickPrompt).not.toContain(TARGETED_SUMMARY_MARKER);
  });

  test('mode absent with fully populated jdContext: prompt equals the baseline byte-for-byte and leaks no JD content', async () => {
    const base = {
      sessionId: '33333333-3333-4333-8333-333333333333',
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
          transcription: 'Answer',
          answeredAt: new Date(Date.now() - 120_000).toISOString(),
          feedback: {
            scores: {
              grammar: 85,
              vocabulary: 85,
              relevance: 85,
              fillerWords: 85,
              coherence: 85,
              overall: 85,
            },
            grammarErrors: [],
            fillerWordsDetected: [],
            suggestions: ['keep going'],
            improvedAnswer: 'improved',
          },
        },
      ],
    };
    const baseline = { ...base };
    const modeAbsentWithJd = {
      ...base,
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

    const capturedPrompt = await captureEndSessionPrompt(modeAbsentWithJd);
    const baselinePrompt = await captureEndSessionPrompt(baseline);

    expect(capturedPrompt).toBe(baselinePrompt);
    expect(capturedPrompt).not.toContain(TARGETED_SUMMARY_MARKER);
    // Belt-and-braces: none of the attached JD content leaked through.
    expect(capturedPrompt).not.toContain('Acme Corp');
    expect(capturedPrompt).not.toContain('Senior Backend Engineer');
    expect(capturedPrompt).not.toContain('Node.js');
    expect(capturedPrompt).not.toContain('Lead backend');
    expect(capturedPrompt).not.toContain('5+ years');
  });

  test("mode === 'invalid' (any non-'targeted' value) is folded to Quick and matches the baseline", async () => {
    const base = {
      sessionId: '44444444-4444-4444-8444-444444444444',
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
          transcription: 'Python, SQL',
          answeredAt: new Date(Date.now() - 120_000).toISOString(),
          feedback: {
            scores: {
              grammar: 60,
              vocabulary: 60,
              relevance: 60,
              fillerWords: 60,
              coherence: 60,
              overall: 60,
            },
            grammarErrors: [],
            fillerWordsDetected: [],
            suggestions: ['practice'],
            improvedAnswer: 'improved',
          },
        },
      ],
    };
    const invalidModeRecord = { ...base, mode: 'invalid' };
    const baseline = { ...base };

    const invalidPrompt = await captureEndSessionPrompt(invalidModeRecord);
    const baselinePrompt = await captureEndSessionPrompt(baseline);

    expect(invalidPrompt).toBe(baselinePrompt);
    expect(invalidPrompt).not.toContain(TARGETED_SUMMARY_MARKER);
  });
});
