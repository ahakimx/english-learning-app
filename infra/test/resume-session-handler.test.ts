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

describe('handleResumeSession unit tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SESSIONS_TABLE_NAME = 'test-sessions-table';
  });

  test('No active sessions → returns no_active_session', async () => {
    mockSend.mockImplementation((command: { _type?: string }) => {
      if (command._type === 'QueryCommand') {
        return Promise.resolve({ Items: [] });
      }
      return Promise.resolve({});
    });

    const response = await routeAction('test-user', {
      action: 'resume_session',
    });

    expect(response.type).toBe('no_active_session');
    expect(response.content).toBe('');
    expect(response.sessionId).toBe('');
  });

  test('Single active session within 24h → returns session_resumed with full sessionData', async () => {
    const session = {
      sessionId: 'sess-123',
      userId: 'test-user',
      jobPosition: 'Software Engineer',
      seniorityLevel: 'mid',
      questionCategory: 'technical',
      status: 'active',
      type: 'speaking',
      questions: [
        {
          questionId: 'q1',
          questionText: 'Tell me about yourself',
          questionType: 'introduction',
          transcription: 'I am a software engineer...',
          feedback: {
            scores: { grammar: 80, vocabulary: 75, relevance: 90, fillerWords: 85, coherence: 80, overall: 82 },
            grammarErrors: [],
            fillerWordsDetected: [],
            suggestions: ['Good answer'],
            improvedAnswer: 'Improved version',
          },
          answeredAt: new Date().toISOString(),
        },
        {
          questionId: 'q2',
          questionText: 'What are your strengths?',
          questionType: 'contextual',
        },
      ],
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), // 1 hour ago
    };

    mockSend.mockImplementation((command: { _type?: string }) => {
      if (command._type === 'QueryCommand') {
        return Promise.resolve({ Items: [session] });
      }
      return Promise.resolve({});
    });

    const response = await routeAction('test-user', {
      action: 'resume_session',
    });

    expect(response.type).toBe('session_resumed');
    expect(response.sessionId).toBe('sess-123');
    expect(response.sessionData).toBeDefined();

    const sd = response.sessionData!;
    expect(sd.sessionId).toBe('sess-123');
    expect(sd.jobPosition).toBe('Software Engineer');
    expect(sd.seniorityLevel).toBe('mid');
    expect(sd.questionCategory).toBe('technical');
    expect(sd.questions).toHaveLength(2);
    expect(sd.questions[0].transcription).toBe('I am a software engineer...');
    expect(sd.questions[0].feedback).toBeDefined();
    expect(sd.questions[1].questionId).toBe('q2');
    expect(sd.questions[1].transcription).toBeUndefined();
    expect(sd.createdAt).toBe(session.createdAt);
    expect(sd.updatedAt).toBe(session.updatedAt);
  });

  test('Single active session beyond 24h → updates to expired, returns no_active_session', async () => {
    const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');

    const session = {
      sessionId: 'sess-old',
      userId: 'test-user',
      jobPosition: 'Data Analyst',
      seniorityLevel: 'junior',
      questionCategory: 'general',
      status: 'active',
      type: 'speaking',
      questions: [
        { questionId: 'q1', questionText: 'Tell me about yourself', questionType: 'introduction' },
      ],
      createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(), // 25 hours ago
    };

    mockSend.mockImplementation((command: { _type?: string }) => {
      if (command._type === 'QueryCommand') {
        return Promise.resolve({ Items: [session] });
      }
      if (command._type === 'UpdateCommand') {
        return Promise.resolve({});
      }
      return Promise.resolve({});
    });

    const response = await routeAction('test-user', {
      action: 'resume_session',
    });

    expect(response.type).toBe('no_active_session');
    expect(UpdateCommand).toHaveBeenCalledTimes(1);
    const updateParams = UpdateCommand.mock.calls[0][0];
    expect(updateParams.Key.sessionId).toBe('sess-old');
    expect(updateParams.ExpressionAttributeValues[':expired']).toBe('expired');
  });

  test('Session with empty questions array → returns session_resumed with empty questions', async () => {
    const session = {
      sessionId: 'sess-empty',
      userId: 'test-user',
      jobPosition: 'Product Manager',
      seniorityLevel: 'senior',
      questionCategory: 'general',
      status: 'active',
      type: 'speaking',
      questions: [],
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 min ago
    };

    mockSend.mockImplementation((command: { _type?: string }) => {
      if (command._type === 'QueryCommand') {
        return Promise.resolve({ Items: [session] });
      }
      return Promise.resolve({});
    });

    const response = await routeAction('test-user', {
      action: 'resume_session',
    });

    expect(response.type).toBe('session_resumed');
    expect(response.sessionData).toBeDefined();
    expect(response.sessionData!.questions).toEqual([]);
    expect(response.sessionData!.sessionId).toBe('sess-empty');
  });
});
