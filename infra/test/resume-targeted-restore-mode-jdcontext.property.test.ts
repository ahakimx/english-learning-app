/**
 * Feature: jd-targeting, Property 17: Targeted session resume restores mode
 * and jdContext
 *
 * **Validates: Requirements 9.1, 9.2, 9.4**
 *
 * When `handleResumeSession` returns a targeted session whose `jdContext`
 * is present and the retention window has NOT elapsed, the response SHALL:
 *
 *   (a) Include `sessionData.mode === 'targeted'` (Requirement 9.2).
 *   (b) Include the full `sessionData.jdContext` object matching the stored
 *       record's `jdContext` field-by-field (Requirement 9.1).
 *   (c) NOT set `jdContextExpired` on the response (the context is fresh).
 *   (d) The presence of `jdContext` in the response means the client can
 *       continue the interview using the same context without calling
 *       `analyze_job_description` again (Requirement 9.4 — structural
 *       guarantee: the data is available for the client to use directly).
 */
import fc from 'fast-check';

// ────────────────────────────────────────────────────────────────────────────
// Module mocks (must come before the SUT import)
// ────────────────────────────────────────────────────────────────────────────

const mockSend = jest.fn();

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
  invokeTextModelWithTimeout: jest.fn(),
}));

// SUT — imported AFTER the jest.mock calls so the mocks are wired up.
import { routeAction } from '../lambda/chat/index';
import type {
  JobDescriptionContext,
  QuestionCategory,
  SeniorityLevel,
} from '../lib/types';

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
 * Generator for a valid JobDescriptionContext with varied content.
 * All fields are populated with realistic but randomized values so the
 * property test exercises diverse shapes.
 */
const jdContextArb: fc.Arbitrary<JobDescriptionContext> = fc.record({
  company: fc.oneof(
    fc.constant(''),
    fc.constantFrom('Acme Corp', 'TechStart Inc', 'Global Systems'),
  ),
  role: fc.constantFrom(
    'Senior Backend Engineer',
    'Frontend Developer',
    'DevOps Lead',
    'Full Stack Engineer',
  ),
  technologies: fc.oneof(
    fc.constant([]),
    fc.subarray(['Node.js', 'TypeScript', 'AWS', 'React', 'Python', 'Docker', 'Kubernetes'], { minLength: 1, maxLength: 5 }),
  ),
  responsibilities: fc.oneof(
    fc.constant([]),
    fc.subarray(['Design APIs', 'Lead team', 'Code reviews', 'Deploy services', 'Write docs'], { minLength: 1, maxLength: 4 }),
  ),
  requirements: fc.oneof(
    fc.constant([]),
    fc.subarray(['5+ years experience', 'AWS certification', 'CS degree', 'Agile experience'], { minLength: 1, maxLength: 3 }),
  ),
  softSkills: fc.oneof(
    fc.constant([]),
    fc.subarray(['Leadership', 'Communication', 'Problem-solving', 'Teamwork'], { minLength: 1, maxLength: 3 }),
  ),
  suggestedSeniority: seniorityArb,
  suggestedCategory: categoryArb,
  userNotes: fc.oneof(
    fc.constant(''),
    fc.constantFrom('I have 3 years of experience', 'Transitioning from frontend to backend'),
  ),
});

/**
 * Generator for a session record that is:
 * - mode='targeted'
 * - has a valid jdContext
 * - updatedAt is within the 24h session expiry window AND within the
 *   30-day retention window (so jdContext is NOT expired)
 */
const targetedSessionWithJdContextArb = fc.record({
  sessionId: fc.uuid(),
  userId: fc.constant('test-user-targeted-resume'),
  jobPosition: jobPositionArb,
  seniorityLevel: seniorityArb,
  questionCategory: categoryArb,
  status: fc.constant('active'),
  type: fc.constant('speaking'),
  mode: fc.constant('targeted' as const),
  jdContext: jdContextArb,
  questions: fc.constant([
    {
      questionId: 'q1',
      questionText: 'Tell me about yourself',
      questionType: 'introduction' as const,
    },
  ]),
  createdAt: fc.constant(
    new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  ),
  // 1 minute to 23 hours ago — within 24h expiry AND well within 30-day retention
  updatedAt: fc
    .integer({ min: 60_000, max: 23 * 60 * 60 * 1000 })
    .map((ago) => new Date(Date.now() - ago).toISOString()),
});

const USER_ID = 'test-user-targeted-resume';

// ────────────────────────────────────────────────────────────────────────────
// Property 17
// ────────────────────────────────────────────────────────────────────────────

describe('Feature: jd-targeting, Property 17: Targeted session resume restores mode and jdContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSend.mockReset();
    process.env.SESSIONS_TABLE_NAME = 'test-sessions-table';
  });

  test('resume_session for a targeted session with fresh jdContext returns mode=targeted and the full jdContext (Requirements 9.1, 9.2, 9.4)', async () => {
    await fc.assert(
      fc.asyncProperty(targetedSessionWithJdContextArb, async (session) => {
        jest.clearAllMocks();
        mockSend.mockReset();

        mockSend.mockImplementation((command: { _type?: string }) => {
          if (command._type === 'QueryCommand') {
            return Promise.resolve({ Items: [session] });
          }
          return Promise.resolve({});
        });

        const response = await routeAction(USER_ID, {
          action: 'resume_session',
        });

        // The session is active and within 24h — must resume successfully.
        expect(response.type).toBe('session_resumed');
        expect(response.sessionData).toBeDefined();

        // (a) Requirement 9.2: mode is restored to 'targeted'
        expect(response.sessionData!.mode).toBe('targeted');

        // (b) Requirement 9.1: full jdContext is included in the response
        expect(response.sessionData!.jdContext).toBeDefined();
        expect(response.sessionData!.jdContext).toEqual(session.jdContext);

        // Verify each field individually for clear failure messages
        const returnedCtx = response.sessionData!.jdContext!;
        expect(returnedCtx.company).toBe(session.jdContext.company);
        expect(returnedCtx.role).toBe(session.jdContext.role);
        expect(returnedCtx.technologies).toEqual(session.jdContext.technologies);
        expect(returnedCtx.responsibilities).toEqual(session.jdContext.responsibilities);
        expect(returnedCtx.requirements).toEqual(session.jdContext.requirements);
        expect(returnedCtx.softSkills).toEqual(session.jdContext.softSkills);
        expect(returnedCtx.suggestedSeniority).toBe(session.jdContext.suggestedSeniority);
        expect(returnedCtx.suggestedCategory).toBe(session.jdContext.suggestedCategory);
        expect(returnedCtx.userNotes).toBe(session.jdContext.userNotes);

        // (c) jdContextExpired must NOT be set (context is fresh)
        expect(response.jdContextExpired).toBeUndefined();

        // (d) Requirement 9.4: The jdContext is present in the response,
        // meaning the client can use it directly to continue the interview
        // without calling analyze_job_description again. This is a
        // structural guarantee — if jdContext is in the response, the
        // client has everything it needs.
        expect(response.sessionData!.jdContext).not.toBeUndefined();

        // Base session fields must still round-trip faithfully.
        expect(response.sessionData!.sessionId).toBe(session.sessionId);
        expect(response.sessionData!.jobPosition).toBe(session.jobPosition);
        expect(response.sessionData!.seniorityLevel).toBe(session.seniorityLevel);
        expect(response.sessionData!.questionCategory).toBe(session.questionCategory);
      }),
      { numRuns: 100 },
    );
  });

  test('resume_session preserves array ordering in jdContext lists (Requirement 9.1 — faithful restoration)', async () => {
    await fc.assert(
      fc.asyncProperty(targetedSessionWithJdContextArb, async (session) => {
        jest.clearAllMocks();
        mockSend.mockReset();

        mockSend.mockImplementation((command: { _type?: string }) => {
          if (command._type === 'QueryCommand') {
            return Promise.resolve({ Items: [session] });
          }
          return Promise.resolve({});
        });

        const response = await routeAction(USER_ID, {
          action: 'resume_session',
        });

        expect(response.type).toBe('session_resumed');
        const returnedCtx = response.sessionData!.jdContext!;

        // Array order must be preserved exactly — not sorted, not shuffled.
        // JSON.stringify is a strict ordering check.
        expect(JSON.stringify(returnedCtx.technologies)).toBe(
          JSON.stringify(session.jdContext.technologies),
        );
        expect(JSON.stringify(returnedCtx.responsibilities)).toBe(
          JSON.stringify(session.jdContext.responsibilities),
        );
        expect(JSON.stringify(returnedCtx.requirements)).toBe(
          JSON.stringify(session.jdContext.requirements),
        );
        expect(JSON.stringify(returnedCtx.softSkills)).toBe(
          JSON.stringify(session.jdContext.softSkills),
        );
      }),
      { numRuns: 50 },
    );
  });

  test('resume_session does NOT trigger any DynamoDB write when jdContext is fresh (Requirement 9.4 — no re-analysis needed)', async () => {
    const { UpdateCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');

    await fc.assert(
      fc.asyncProperty(targetedSessionWithJdContextArb, async (session) => {
        jest.clearAllMocks();
        mockSend.mockReset();

        mockSend.mockImplementation((command: { _type?: string }) => {
          if (command._type === 'QueryCommand') {
            return Promise.resolve({ Items: [session] });
          }
          return Promise.resolve({});
        });

        await routeAction(USER_ID, { action: 'resume_session' });

        // No writes should occur — the session is active and fresh.
        // This confirms the handler is read-only on the happy path,
        // meaning no re-analysis or mutation is triggered.
        expect(UpdateCommand).not.toHaveBeenCalled();
        expect(PutCommand).not.toHaveBeenCalled();
      }),
      { numRuns: 50 },
    );
  });
});
