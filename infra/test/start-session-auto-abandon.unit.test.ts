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

describe('handleStartSession auto-abandon unit tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SESSIONS_TABLE_NAME = 'test-sessions-table';
  });

  test('No existing active sessions → create normally', async () => {
    const { PutCommand, QueryCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

    mockSend.mockImplementation((command: { _type?: string }) => {
      if (command._type === 'QueryCommand') {
        return Promise.resolve({ Items: [] });
      }
      if (command._type === 'PutCommand') {
        return Promise.resolve({});
      }
      return Promise.resolve({});
    });

    const response = await routeAction('test-user', {
      action: 'start_session',
      jobPosition: 'Software Engineer',
      seniorityLevel: 'mid',
      questionCategory: 'general',
    });

    expect(response.type).toBe('question');
    expect(response.sessionId).toBeDefined();
    expect(QueryCommand).toHaveBeenCalledTimes(1);
    expect(UpdateCommand).not.toHaveBeenCalled();
    expect(PutCommand).toHaveBeenCalledTimes(1);
    expect(PutCommand.mock.calls[0][0].Item.status).toBe('active');
  });

  test('One existing active session → abandon it, then create new', async () => {
    const { PutCommand, QueryCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

    mockSend.mockImplementation((command: { _type?: string }) => {
      if (command._type === 'QueryCommand') {
        return Promise.resolve({
          Items: [{ sessionId: 'old-session-1', status: 'active', type: 'speaking' }],
        });
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
      jobPosition: 'Data Analyst',
      seniorityLevel: 'junior',
      questionCategory: 'technical',
    });

    expect(response.type).toBe('question');
    expect(QueryCommand).toHaveBeenCalledTimes(1);
    expect(UpdateCommand).toHaveBeenCalledTimes(1);

    const updateParams = UpdateCommand.mock.calls[0][0];
    expect(updateParams.Key.sessionId).toBe('old-session-1');
    expect(updateParams.ExpressionAttributeValues[':abandoned']).toBe('abandoned');

    expect(PutCommand).toHaveBeenCalledTimes(1);
    expect(PutCommand.mock.calls[0][0].Item.status).toBe('active');
  });

  test('Multiple existing active sessions → abandon all, create new', async () => {
    const { PutCommand, QueryCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

    mockSend.mockImplementation((command: { _type?: string }) => {
      if (command._type === 'QueryCommand') {
        return Promise.resolve({
          Items: [
            { sessionId: 'old-1', status: 'active', type: 'speaking' },
            { sessionId: 'old-2', status: 'active', type: 'speaking' },
            { sessionId: 'old-3', status: 'active', type: 'speaking' },
          ],
        });
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
      jobPosition: 'Product Manager',
      seniorityLevel: 'senior',
      questionCategory: 'general',
    });

    expect(response.type).toBe('question');
    expect(QueryCommand).toHaveBeenCalledTimes(1);
    expect(UpdateCommand).toHaveBeenCalledTimes(3);

    const abandonedSessionIds = UpdateCommand.mock.calls.map(
      (call: [{ Key: { sessionId: string } }]) => call[0].Key.sessionId
    );
    expect(abandonedSessionIds).toEqual(expect.arrayContaining(['old-1', 'old-2', 'old-3']));

    expect(PutCommand).toHaveBeenCalledTimes(1);
    expect(PutCommand.mock.calls[0][0].Item.status).toBe('active');
  });

  test('Auto-abandon fails → log error, still create new session', async () => {
    const { PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    mockSend.mockImplementation((command: { _type?: string }) => {
      if (command._type === 'QueryCommand') {
        return Promise.resolve({
          Items: [{ sessionId: 'old-fail', status: 'active', type: 'speaking' }],
        });
      }
      if (command._type === 'UpdateCommand') {
        return Promise.reject(new Error('DynamoDB update failed'));
      }
      if (command._type === 'PutCommand') {
        return Promise.resolve({});
      }
      return Promise.resolve({});
    });

    const response = await routeAction('test-user', {
      action: 'start_session',
      jobPosition: 'Designer',
      seniorityLevel: 'mid',
      questionCategory: 'general',
    });

    expect(response.type).toBe('question');
    expect(response.sessionId).toBeDefined();

    // console.error should have been called for the failed abandon
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to abandon session old-fail'),
      expect.any(Error)
    );

    // PutCommand should still be called — new session created despite abandon failure
    expect(PutCommand).toHaveBeenCalledTimes(1);
    expect(PutCommand.mock.calls[0][0].Item.status).toBe('active');

    consoleSpy.mockRestore();
  });
});
