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

describe('handleAbandonSession unit tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SESSIONS_TABLE_NAME = 'test-sessions-table';
  });

  test('Successful abandon → response type is session_abandoned, UpdateCommand called with correct params', async () => {
    const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');

    mockSend.mockImplementation((command: { _type?: string }) => {
      if (command._type === 'UpdateCommand') {
        return Promise.resolve({});
      }
      return Promise.resolve({});
    });

    const response = await routeAction('test-user', {
      action: 'abandon_session',
      sessionId: 'sess-abc-123',
    });

    expect(response.type).toBe('session_abandoned');
    expect(response.content).toBe('');
    expect(response.sessionId).toBe('sess-abc-123');

    expect(UpdateCommand).toHaveBeenCalledTimes(1);
    const params = UpdateCommand.mock.calls[0][0];
    expect(params.TableName).toBe('test-sessions-table');
    expect(params.Key).toEqual({ userId: 'test-user', sessionId: 'sess-abc-123' });
    expect(params.ExpressionAttributeValues[':abandoned']).toBe('abandoned');
    expect(params.ExpressionAttributeValues[':active']).toBe('active');
    expect(params.ExpressionAttributeValues[':uid']).toBe('test-user');
    expect(params.ExpressionAttributeValues[':now']).toBeDefined();
    expect(params.ConditionExpression).toBe('userId = :uid AND #status = :active');
  });

  test('Session not found → DynamoDB throws ConditionalCheckFailedException, handler throws error', async () => {
    mockSend.mockImplementation((command: { _type?: string }) => {
      if (command._type === 'UpdateCommand') {
        const error = new Error('The conditional request failed');
        error.name = 'ConditionalCheckFailedException';
        return Promise.reject(error);
      }
      return Promise.resolve({});
    });

    await expect(
      routeAction('test-user', {
        action: 'abandon_session',
        sessionId: 'sess-nonexistent',
      })
    ).rejects.toThrow();
  });

  test('Session already not active (race condition) → ConditionalCheckFailedException thrown', async () => {
    mockSend.mockImplementation((command: { _type?: string }) => {
      if (command._type === 'UpdateCommand') {
        const error = new Error('The conditional request failed');
        error.name = 'ConditionalCheckFailedException';
        return Promise.reject(error);
      }
      return Promise.resolve({});
    });

    await expect(
      routeAction('test-user', {
        action: 'abandon_session',
        sessionId: 'sess-already-completed',
      })
    ).rejects.toThrow('The conditional request failed');
  });
});
