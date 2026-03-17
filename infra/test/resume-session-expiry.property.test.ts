import fc from 'fast-check';

// Mock AWS SDK clients before importing handler
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

import { routeAction, SESSION_EXPIRY_HOURS } from '../lambda/chat/index';

// --- Generators ---

const baseSessionArb = fc.record({
  sessionId: fc.uuid(),
  userId: fc.constant('test-user'),
  jobPosition: fc.constantFrom('Software Engineer', 'Product Manager'),
  seniorityLevel: fc.constantFrom('junior' as const, 'mid' as const, 'senior' as const, 'lead' as const),
  questionCategory: fc.constantFrom('general' as const, 'technical' as const),
  status: fc.constant('active'),
  type: fc.constant('speaking'),
  questions: fc.constant([
    { questionId: 'q1', questionText: 'Tell me about yourself', questionType: 'introduction' },
  ]),
  createdAt: fc.constant(new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()),
});

const expiryMs = SESSION_EXPIRY_HOURS * 60 * 60 * 1000;

/**
 * Generate a session that is clearly within the 24h window (1 min to 23 hours ago).
 * We use a margin to avoid flaky boundary conditions.
 */
const validSessionArb = baseSessionArb.chain((base) =>
  fc.integer({ min: 60 * 1000, max: 23 * 60 * 60 * 1000 }).map((msAgo) => ({
    ...base,
    updatedAt: new Date(Date.now() - msAgo).toISOString(),
    _isExpired: false,
  }))
);

/**
 * Generate a session that is clearly beyond the 24h window (25 to 48 hours ago).
 * We use a margin to avoid flaky boundary conditions.
 */
const expiredSessionArb = baseSessionArb.chain((base) =>
  fc.integer({ min: 25 * 60 * 60 * 1000, max: 48 * 60 * 60 * 1000 }).map((msAgo) => ({
    ...base,
    updatedAt: new Date(Date.now() - msAgo).toISOString(),
    _isExpired: true,
  }))
);

const sessionArb = fc.oneof(validSessionArb, expiredSessionArb);

// ============================================================================
// Property 3: Expiry threshold correctly classifies sessions
// Feature: speaking-session-resume, Property 3: Expiry threshold correctly classifies sessions
// **Validates: Requirements 2.1, 2.2**
// ============================================================================
describe('Feature: speaking-session-resume, Property 3: Expiry threshold correctly classifies sessions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SESSIONS_TABLE_NAME = 'test-sessions-table';
  });

  test('Sessions beyond 24h return no_active_session and get marked expired; sessions within 24h return session_resumed', async () => {
    const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');

    await fc.assert(
      fc.asyncProperty(sessionArb, async (session) => {
        jest.clearAllMocks();

        const isExpired = session._isExpired;

        // Strip the test helper field before passing to mock
        const { _isExpired, ...dbSession } = session;

        mockSend.mockImplementation((command: { _type?: string }) => {
          if (command._type === 'QueryCommand') {
            return Promise.resolve({ Items: [dbSession] });
          }
          // UpdateCommand for expiry
          if (command._type === 'UpdateCommand') {
            return Promise.resolve({});
          }
          return Promise.resolve({});
        });

        const response = await routeAction('test-user', {
          action: 'resume_session',
        });

        if (isExpired) {
          // Expired session: should return no_active_session
          expect(response.type).toBe('no_active_session');
          // UpdateCommand should have been called to mark as expired
          expect(UpdateCommand).toHaveBeenCalledTimes(1);
          const updateParams = UpdateCommand.mock.calls[0][0];
          expect(updateParams.Key.sessionId).toBe(dbSession.sessionId);
          expect(updateParams.ExpressionAttributeValues[':expired']).toBe('expired');
        } else {
          // Valid session: should return session_resumed
          expect(response.type).toBe('session_resumed');
          expect(response.sessionData).toBeDefined();
          expect(response.sessionData!.sessionId).toBe(dbSession.sessionId);
          // UpdateCommand should NOT have been called
          expect(UpdateCommand).not.toHaveBeenCalled();
        }
      }),
      { numRuns: 100 }
    );
  });
});
