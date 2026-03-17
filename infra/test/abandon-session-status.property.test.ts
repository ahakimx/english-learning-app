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
// Feature: speaking-session-resume, Property 6: Abandon session transitions status correctly
// **Validates: Requirements 5.2, 5.3**
// ============================================================================
describe('Feature: speaking-session-resume, Property 6: Abandon session transitions status correctly', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SESSIONS_TABLE_NAME = 'test-sessions-table';
  });

  test('For any active session, handleAbandonSession sets status to abandoned and updates updatedAt', async () => {
    const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');

    await fc.assert(
      fc.asyncProperty(fc.uuid(), async (sessionId) => {
        jest.clearAllMocks();

        // Mock DynamoDB UpdateCommand to succeed (session exists and is active)
        mockSend.mockImplementation((command: { _type?: string }) => {
          if (command._type === 'UpdateCommand') {
            return Promise.resolve({});
          }
          return Promise.resolve({});
        });

        const response = await routeAction('test-user', {
          action: 'abandon_session',
          sessionId,
        });

        // Verify response type
        expect(response.type).toBe('session_abandoned');
        expect(response.sessionId).toBe(sessionId);

        // Verify UpdateCommand was called exactly once
        expect(UpdateCommand).toHaveBeenCalledTimes(1);
        const updateParams = UpdateCommand.mock.calls[0][0];

        // Verify key targets the correct session
        expect(updateParams.Key).toEqual({ userId: 'test-user', sessionId });

        // Verify status is set to 'abandoned'
        expect(updateParams.ExpressionAttributeValues[':abandoned']).toBe('abandoned');

        // Verify updatedAt is set (ISO string)
        expect(updateParams.ExpressionAttributeValues[':now']).toBeDefined();
        expect(() => new Date(updateParams.ExpressionAttributeValues[':now'])).not.toThrow();

        // Verify ConditionExpression checks userId and active status
        expect(updateParams.ConditionExpression).toContain(':uid');
        expect(updateParams.ConditionExpression).toContain(':active');
        expect(updateParams.ExpressionAttributeValues[':uid']).toBe('test-user');
        expect(updateParams.ExpressionAttributeValues[':active']).toBe('active');
      }),
      { numRuns: 100 }
    );
  });
});
