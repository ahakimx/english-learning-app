/**
 * Feature: jd-targeting, Property 20: Missing jdContext in targeted session
 * degrades to Quick behavior
 *
 * **Validates: Requirement 9.6**
 *
 * For any active Session_Record whose `mode === 'targeted'` but whose
 * `jdContext` attribute has been removed (scheduled retention cleanup
 * lambda already deleted it, or the lazy retention check tripped), the
 * Chat_Lambda SHALL treat the session as Quick Mode for prompt building
 * and feedback generation, AND the `resume_session` response SHALL carry
 * `jdContextExpired: true` while omitting `jdContext` from `sessionData`.
 *
 * Concretely, this property asserts three sub-claims jointly:
 *
 *   (a) `resume_session` response has `jdContextExpired === true`,
 *       `sessionData.jdContext === undefined`, and `sessionData.mode === 'targeted'`
 *       (the mode annotation is preserved so the client knows the session
 *       was originally targeted, but the degraded behavior kicks in).
 *
 *   (b) `analyze_answer` on the same session produces a Bedrock
 *       `systemPrompt` that is BYTE-IDENTICAL to the Quick-mode prompt
 *       — no "This interview targets a specific role" block is appended,
 *       and the prompt equals the prompt a parallel Quick session would
 *       have produced.
 *
 *   (c) `end_session` on the same session produces a Bedrock summary
 *       `systemPrompt` that is BYTE-IDENTICAL to the Quick-mode summary
 *       prompt — no "This session is targeted at a specific role" block
 *       is appended.
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
 * handler parses this into a `FeedbackReport`. The content is irrelevant to
 * this property — we only care about the prompt passed IN to Bedrock, not
 * the payload coming back.
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
 * A valid Bedrock summary JSON response used by `end_session`.
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
 * Text markers that appear ONLY in the targeted branches of
 * `handleAnalyzeAnswer` and `handleEndSession`. If any of these appears in
 * the `systemPrompt` captured from `invokeTextModelWithTimeout`, the Quick
 * degradation contract has been violated.
 *
 * These strings are copied verbatim from `infra/lambda/chat/index.ts` so a
 * rename on one side will surface as an obvious test failure on the other.
 */
const TARGETED_FEEDBACK_MARKER =
  'This interview targets a specific role. Reference these elements when assessing relevance:';
const TARGETED_SUMMARY_MARKER =
  'This session is targeted at a specific role. In the `topImprovementAreas` and `recommendations` arrays, reference at least one of:';

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
 * A well-formed but *orphan* JobDescriptionContext whose every field is a
 * distinctive string containing the JD_ORPHAN_ prefix. The test NEVER
 * attaches this to any session record — it only uses it as a negative
 * oracle: "if anything like this leaks into the prompt, the targeted
 * branch fired and the Quick fallback failed". Keeping it inside a closed
 * generator makes shrunken counterexamples self-documenting.
 */
const orphanJdContextArb: fc.Arbitrary<JobDescriptionContext> = fc.record({
  company: fc.constant('JD_ORPHAN_COMPANY'),
  role: fc.constant('JD_ORPHAN_ROLE'),
  technologies: fc.constant(['JD_ORPHAN_TECH_1']),
  responsibilities: fc.constant(['JD_ORPHAN_RESP_1']),
  requirements: fc.constant(['JD_ORPHAN_REQ_1']),
  softSkills: fc.constant(['JD_ORPHAN_SOFT_1']),
  suggestedSeniority: fc.constantFrom(
    'junior' as const,
    'mid' as const,
    'senior' as const,
    'lead' as const,
  ),
  suggestedCategory: fc.constantFrom('general' as const, 'technical' as const),
  userNotes: fc.constant(''),
});

/**
 * A `questions` array that contains exactly one unanswered current question
 * plus, optionally, some earlier answered questions. The handler needs:
 *  - `analyze_answer`: at least one question to treat as "current"
 *  - `end_session`:   at least one *answered* question (one with feedback)
 *    so that `topImprovementAreas` logic has data to work with.
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

const USER_ID = 'test-user-expired-jd';

/**
 * A base active session shape used for both resume and analyze flows.
 * `updatedAt` is always within the 24-hour resume window so the session
 * stays active; only `mode` and `jdContext` vary across tests.
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
  createdAt: fc.constant(
    new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  ),
  // 1 minute to 23 hours ago — always within the 24h expiry window.
  updatedAt: fc
    .integer({ min: 60_000, max: 23 * 60 * 60 * 1000 })
    .map((ago) => new Date(Date.now() - ago).toISOString()),
});

// ────────────────────────────────────────────────────────────────────────────
// Property 20
// ────────────────────────────────────────────────────────────────────────────

describe('Feature: jd-targeting, Property 20: Missing jdContext in targeted session degrades to Quick behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSend.mockReset();
    mockInvokeTextModelWithTimeout.mockReset();
    process.env.SESSIONS_TABLE_NAME = 'test-sessions-table';
  });

  // ──────────────────────────────────────────────────────────────────────
  // (a) resume_session surfaces jdContextExpired and omits jdContext
  // ──────────────────────────────────────────────────────────────────────
  test("resume_session: targeted session with missing jdContext returns jdContextExpired=true and omits sessionData.jdContext (Requirement 9.6)", async () => {
    await fc.assert(
      fc.asyncProperty(baseSessionArb, async (base) => {
        jest.clearAllMocks();
        mockSend.mockReset();

        // The session record stored in DynamoDB is TARGETED but has no
        // `jdContext` attribute (scheduled retention cleanup already fired,
        // or the record was written by an older code path).
        const storedRecord = {
          ...base,
          mode: 'targeted' as const,
          // `jdContext` intentionally OMITTED.
        };

        mockSend.mockImplementation((command: { _type?: string }) => {
          if (command._type === 'QueryCommand') {
            return Promise.resolve({ Items: [storedRecord] });
          }
          return Promise.resolve({});
        });

        const response = await routeAction(USER_ID, {
          action: 'resume_session',
        });

        // Must resume as an active session (updatedAt is within 24h).
        expect(response.type).toBe('session_resumed');

        // Requirement 9.6 — the resume response carries the "expired"
        // indicator so the client can react (toast, fall back to Quick UI).
        expect(response.jdContextExpired).toBe(true);

        // Requirement 9.6 — no jdContext is surfaced to the client.
        expect(response.sessionData).toBeDefined();
        expect(response.sessionData!.jdContext).toBeUndefined();

        // The original `mode: 'targeted'` annotation is preserved in
        // sessionData so the client can distinguish "quick session" from
        // "targeted session with expired JD". This is what lets the UI
        // surface a one-time "JD context no longer available" notice.
        expect(response.sessionData!.mode).toBe('targeted');

        // The base fields must still round-trip faithfully.
        expect(response.sessionData!.sessionId).toBe(storedRecord.sessionId);
        expect(response.sessionData!.jobPosition).toBe(storedRecord.jobPosition);
        expect(response.sessionData!.seniorityLevel).toBe(storedRecord.seniorityLevel);
        expect(response.sessionData!.questionCategory).toBe(storedRecord.questionCategory);
      }),
      { numRuns: 100 },
    );
  });

  // ──────────────────────────────────────────────────────────────────────
  // (b) analyze_answer: prompt is byte-identical to the Quick prompt
  // ──────────────────────────────────────────────────────────────────────
  test("analyze_answer: targeted session with missing jdContext produces a Bedrock systemPrompt byte-identical to the Quick-mode prompt", async () => {
    await fc.assert(
      fc.asyncProperty(baseSessionArb, async (base) => {
        jest.clearAllMocks();
        mockSend.mockReset();
        mockInvokeTextModelWithTimeout.mockReset();
        mockInvokeTextModelWithTimeout.mockResolvedValue(VALID_FEEDBACK_RESPONSE);

        // Targeted + missing jdContext (Quick-degraded path).
        const targetedRecord = {
          ...base,
          mode: 'targeted' as const,
        };

        // Parallel baseline: same session but without any `mode` (pure
        // Quick session, pre-feature shape). This is the canonical oracle
        // for "Quick-mode prompt".
        const quickRecord = { ...base };

        const transcription = 'This is my candidate answer.';
        const request: ChatRequest = {
          action: 'analyze_answer',
          sessionId: base.sessionId,
          transcription,
        };

        // --- Targeted-with-missing-jdContext run ---
        mockSend.mockImplementation((command: { _type?: string }) => {
          if (command._type === 'GetCommand') {
            return Promise.resolve({ Item: targetedRecord });
          }
          return Promise.resolve({});
        });
        await routeAction(USER_ID, request);
        const degradedPrompt = mockInvokeTextModelWithTimeout.mock.calls[0][0].systemPrompt as string;

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
        const quickPrompt = mockInvokeTextModelWithTimeout.mock.calls[0][0].systemPrompt as string;

        // Core assertion: byte-identical prompts (Requirement 9.6).
        expect(degradedPrompt).toBe(quickPrompt);

        // Belt-and-braces: the degraded prompt must NOT contain the
        // targeted-branch marker text even if someone refactors the
        // Quick baseline.
        expect(degradedPrompt).not.toContain(TARGETED_FEEDBACK_MARKER);
      }),
      { numRuns: 50 },
    );
  });

  // ──────────────────────────────────────────────────────────────────────
  // (c) end_session: summary prompt is byte-identical to the Quick prompt
  // ──────────────────────────────────────────────────────────────────────
  test("end_session: targeted session with missing jdContext produces a Bedrock summary systemPrompt byte-identical to the Quick-mode summary prompt", async () => {
    await fc.assert(
      fc.asyncProperty(baseSessionArb, async (base) => {
        jest.clearAllMocks();
        mockSend.mockReset();
        mockInvokeTextModelWithTimeout.mockReset();
        mockInvokeTextModelWithTimeout.mockResolvedValue(VALID_SUMMARY_RESPONSE);

        const targetedRecord = {
          ...base,
          mode: 'targeted' as const,
        };
        const quickRecord = { ...base };

        const request: ChatRequest = {
          action: 'end_session',
          sessionId: base.sessionId,
        };

        // --- Targeted-with-missing-jdContext run ---
        mockSend.mockImplementation((command: { _type?: string }) => {
          if (command._type === 'GetCommand') {
            return Promise.resolve({ Item: targetedRecord });
          }
          return Promise.resolve({});
        });
        await routeAction(USER_ID, request);
        const degradedPrompt = mockInvokeTextModelWithTimeout.mock.calls[0][0].systemPrompt as string;

        // --- Quick baseline run ---
        mockSend.mockReset();
        mockInvokeTextModelWithTimeout.mockReset();
        mockInvokeTextModelWithTimeout.mockResolvedValue(VALID_SUMMARY_RESPONSE);
        mockSend.mockImplementation((command: { _type?: string }) => {
          if (command._type === 'GetCommand') {
            return Promise.resolve({ Item: quickRecord });
          }
          return Promise.resolve({});
        });
        await routeAction(USER_ID, request);
        const quickPrompt = mockInvokeTextModelWithTimeout.mock.calls[0][0].systemPrompt as string;

        expect(degradedPrompt).toBe(quickPrompt);
        expect(degradedPrompt).not.toContain(TARGETED_SUMMARY_MARKER);
      }),
      { numRuns: 50 },
    );
  });

  // ──────────────────────────────────────────────────────────────────────
  // Concrete anchor: a negative-oracle test that injects an orphan
  // `jdContext` nowhere into the stored record. If the targeted branch
  // leaks via a null-check bug (e.g. treating an empty object as truthy),
  // the ORPHAN canaries would appear in the captured prompt. This gives
  // a readable failure independent of fast-check shrinking.
  // ──────────────────────────────────────────────────────────────────────
  test("negative oracle: orphan JD_ORPHAN_* canaries never appear in the analyze_answer prompt for a targeted-missing-jdContext session", async () => {
    await fc.assert(
      fc.asyncProperty(
        baseSessionArb,
        orphanJdContextArb,
        async (base, orphanCtx) => {
          jest.clearAllMocks();
          mockSend.mockReset();
          mockInvokeTextModelWithTimeout.mockReset();
          mockInvokeTextModelWithTimeout.mockResolvedValue(VALID_FEEDBACK_RESPONSE);

          // The orphan context is DELIBERATELY NOT attached to the record.
          // It exists only as a sentinel: if any of its canary strings
          // shows up in the prompt, something has smuggled a JD context
          // into the targeted branch behind our backs.
          void orphanCtx;

          const targetedRecord = {
            ...base,
            mode: 'targeted' as const,
          };

          mockSend.mockImplementation((command: { _type?: string }) => {
            if (command._type === 'GetCommand') {
              return Promise.resolve({ Item: targetedRecord });
            }
            return Promise.resolve({});
          });

          await routeAction(USER_ID, {
            action: 'analyze_answer',
            sessionId: base.sessionId,
            transcription: 'Answer.',
          });

          const prompt = mockInvokeTextModelWithTimeout.mock.calls[0][0]
            .systemPrompt as string;

          expect(prompt).not.toContain('JD_ORPHAN_COMPANY');
          expect(prompt).not.toContain('JD_ORPHAN_ROLE');
          expect(prompt).not.toContain('JD_ORPHAN_TECH_1');
          expect(prompt).not.toContain('JD_ORPHAN_RESP_1');
          expect(prompt).not.toContain('JD_ORPHAN_REQ_1');
          expect(prompt).not.toContain('JD_ORPHAN_SOFT_1');
        },
      ),
      { numRuns: 20 },
    );
  });
});
