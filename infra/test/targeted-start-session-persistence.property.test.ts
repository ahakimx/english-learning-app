import fc from 'fast-check';

// Mock AWS SDK clients BEFORE importing the handler
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

jest.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: jest.fn(() => ({ send: mockSend })),
  InvokeModelCommand: jest.fn((params: unknown) => ({ _type: 'InvokeModelCommand', params })),
}));

import { routeAction } from '../lambda/chat/index';
import { JobDescriptionContext } from '../lib/types';

// --- Generators ---

// Non-empty strings are used for list items so that list-order preservation is
// observable. `role` must be non-empty after trim() per Requirement 6.5.
const jdContextArb: fc.Arbitrary<JobDescriptionContext> = fc.record({
  company: fc.string(),
  role: fc.string({ minLength: 1 }).filter((s) => s.trim() !== ''),
  technologies: fc.array(fc.string({ minLength: 1 })),
  responsibilities: fc.array(fc.string({ minLength: 1 })),
  requirements: fc.array(fc.string({ minLength: 1 })),
  softSkills: fc.array(fc.string({ minLength: 1 })),
  suggestedSeniority: fc.constantFrom('junior' as const, 'mid' as const, 'senior' as const, 'lead' as const),
  suggestedCategory: fc.constantFrom('general' as const, 'technical' as const),
  userNotes: fc.string(),
});

// ============================================================================
// Feature: jd-targeting, Property 7: Targeted start_session persistence is faithful
// **Validates: Requirements 6.3, 6.4, 6.6, 6.8**
// ============================================================================
describe('Feature: jd-targeting, Property 7: Targeted start_session persistence is faithful', () => {
  const FIXED_UUID = '00000000-0000-4000-8000-000000000000';
  let randomUUIDSpy: jest.SpyInstance | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SESSIONS_TABLE_NAME = 'test-sessions';

    // Deterministic IDs: both the sessionId and the first questionId come from
    // crypto.randomUUID(). Pinning it keeps PutCommand.Item snapshot-stable.
    randomUUIDSpy = jest
      .spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValue(FIXED_UUID as `${string}-${string}-${string}-${string}-${string}`);

    // Default mock behavior: QueryCommand returns no pre-existing active sessions;
    // PutCommand / UpdateCommand / etc. succeed with empty responses.
    mockSend.mockImplementation((command: { _type?: string }) => {
      if (command._type === 'QueryCommand') {
        return Promise.resolve({ Items: [] });
      }
      return Promise.resolve({});
    });
  });

  afterEach(() => {
    randomUUIDSpy?.mockRestore();
  });

  test('For any valid JobDescriptionContext, targeted start_session persists mode=targeted and a faithful jdContext (with suggested seniority/category fallbacks)', async () => {
    const { PutCommand } = require('@aws-sdk/lib-dynamodb');

    await fc.assert(
      fc.asyncProperty(jdContextArb, async (ctx) => {
        jest.clearAllMocks();

        // Re-install the default mock after clearAllMocks erased it.
        mockSend.mockImplementation((command: { _type?: string }) => {
          if (command._type === 'QueryCommand') {
            return Promise.resolve({ Items: [] });
          }
          return Promise.resolve({});
        });

        const userId = 'test-user-id';

        const response = await routeAction(userId, {
          action: 'start_session',
          mode: 'targeted',
          jobPosition: ctx.role,
          jdContext: ctx,
        });

        // Sanity: handler returned a question response
        expect(response.type).toBe('question');

        // Exactly one PutCommand was issued for the new Session_Record.
        expect(PutCommand).toHaveBeenCalledTimes(1);
        const putParams = PutCommand.mock.calls[0][0];
        const item = putParams.Item;

        // Requirement 6.6 — mode is persisted as 'targeted'
        expect(item.mode).toBe('targeted');

        // Requirements 6.3, 6.6, 14.1 — jdContext is stored deeply equal to the
        // input context (field-by-field, including all list contents).
        expect(item.jdContext).toEqual(ctx);

        // Requirement 14.2 — array order is preserved verbatim for every list
        // field on the write path.
        expect(item.jdContext.technologies).toEqual(ctx.technologies);
        expect(item.jdContext.responsibilities).toEqual(ctx.responsibilities);
        expect(item.jdContext.requirements).toEqual(ctx.requirements);
        expect(item.jdContext.softSkills).toEqual(ctx.softSkills);

        // Requirement 6.8 — when seniorityLevel / questionCategory are not
        // explicitly supplied in the request, they fall back from the jdContext.
        expect(item.seniorityLevel).toBe(ctx.suggestedSeniority);
        expect(item.questionCategory).toBe(ctx.suggestedCategory);

        // Requirement 6.4 — jobPosition echoes the request (which used ctx.role)
        expect(item.jobPosition).toBe(ctx.role);

        // Table routing sanity check
        expect(putParams.TableName).toBe('test-sessions');
        expect(item.userId).toBe(userId);
        expect(item.type).toBe('speaking');
        expect(item.status).toBe('active');
      }),
      { numRuns: 100 }
    );
  });
});
