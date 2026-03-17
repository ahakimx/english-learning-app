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

import { routeAction } from '../lambda/chat/index';

// ============================================================================
// Feature: speaking-session-resume, Property 7: Starting a new session auto-abandons existing active sessions
// **Validates: Requirements 7.1, 7.2**
// ============================================================================
describe('Feature: speaking-session-resume, Property 7: Starting a new session auto-abandons existing active sessions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SESSIONS_TABLE_NAME = 'test-sessions-table';
  });

  test('For any user with 0-3 existing active sessions, all are abandoned and exactly 1 new active session is created', async () => {
    const { UpdateCommand, PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

    const seniorityArb = fc.constantFrom('junior' as const, 'mid' as const, 'senior' as const, 'lead' as const);
    const categoryArb = fc.constantFrom('general' as const, 'technical' as const);

    const existingSessionArb = fc.record({
      sessionId: fc.uuid(),
      status: fc.constant('active'),
      type: fc.constant('speaking'),
    });

    await fc.assert(
      fc.asyncProperty(
        fc.array(existingSessionArb, { minLength: 0, maxLength: 3 }),
        fc.string({ minLength: 1, maxLength: 30 }),
        seniorityArb,
        categoryArb,
        async (existingSessions, jobPosition, seniorityLevel, questionCategory) => {
          jest.clearAllMocks();

          mockSend.mockImplementation((command: { _type?: string }) => {
            if (command._type === 'QueryCommand') {
              return Promise.resolve({ Items: existingSessions });
            }
            if (command._type === 'UpdateCommand') {
              return Promise.resolve({});
            }
            if (command._type === 'PutCommand') {
              return Promise.resolve({});
            }
            return Promise.resolve({});
          });

          const response = await routeAction('test-user', {
            action: 'start_session',
            jobPosition,
            seniorityLevel,
            questionCategory,
          });

          // Verify response is a new session question
          expect(response.type).toBe('question');
          expect(response.sessionId).toBeDefined();

          // Verify QueryCommand was called once to find existing active sessions
          expect(QueryCommand).toHaveBeenCalledTimes(1);

          // Verify UpdateCommand called once per existing active session (abandon)
          expect(UpdateCommand).toHaveBeenCalledTimes(existingSessions.length);
          for (let i = 0; i < existingSessions.length; i++) {
            const updateParams = UpdateCommand.mock.calls[i][0];
            expect(updateParams.Key.sessionId).toBe(existingSessions[i].sessionId);
            expect(updateParams.ExpressionAttributeValues[':abandoned']).toBe('abandoned');
          }

          // Verify PutCommand called exactly once for the new session
          expect(PutCommand).toHaveBeenCalledTimes(1);
          const putParams = PutCommand.mock.calls[0][0];
          expect(putParams.Item.status).toBe('active');
          expect(putParams.Item.type).toBe('speaking');
        }
      ),
      { numRuns: 100 }
    );
  });
});
