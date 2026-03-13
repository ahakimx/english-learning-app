import { APIGatewayProxyEvent } from 'aws-lambda';

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
}));

jest.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: jest.fn(() => ({ send: mockSend })),
  InvokeModelCommand: jest.fn((params: unknown) => ({ _type: 'InvokeModelCommand', params })),
}));

import { handler, validateRequest } from '../lambda/chat/index';

// Helper to create a mock API Gateway event
function createEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    body: null,
    headers: {},
    multiValueHeaders: {},
    isBase64Encoded: false,
    path: '/chat',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '/chat',
    requestContext: {
      accountId: '123456789',
      apiId: 'test-api',
      authorizer: {
        claims: { sub: 'test-user-id-123' },
      },
      protocol: 'HTTP/1.1',
      httpMethod: 'POST',
      identity: {} as any,
      path: '/chat',
      stage: 'prod',
      requestId: 'test-request-id',
      requestTimeEpoch: Date.now(),
      resourceId: 'test',
      resourcePath: '/chat',
    },
    ...overrides,
  };
}

function eventWithBody(body: Record<string, unknown>, userId = 'test-user-id-123'): APIGatewayProxyEvent {
  return createEvent({
    body: JSON.stringify(body),
    requestContext: {
      ...createEvent().requestContext,
      authorizer: { claims: { sub: userId } },
    },
  });
}

// Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
describe('Chat Lambda - Seniority Level and Question Category', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SESSIONS_TABLE_NAME = 'test-sessions-table';

    // Default mock: Bedrock returns a question, DynamoDB commands succeed
    mockSend.mockImplementation((command: { _type?: string }) => {
      if (command._type === 'InvokeModelCommand') {
        return Promise.resolve({
          body: new TextEncoder().encode(
            JSON.stringify({
              content: [{ text: 'Tell me about your experience with cloud infrastructure.' }],
            })
          ),
        });
      }
      // DynamoDB PutCommand / UpdateCommand
      return Promise.resolve({});
    });
  });

  // Test 1: handleStartSession with seniorityLevel='senior' and questionCategory='technical'
  // stores both in DynamoDB PutCommand item
  describe('handleStartSession stores seniority and category', () => {
    test('stores seniorityLevel=senior and questionCategory=technical in DynamoDB item', async () => {
      const { PutCommand } = require('@aws-sdk/lib-dynamodb');
      const event = eventWithBody({
        action: 'start_session',
        jobPosition: 'Software Engineer',
        seniorityLevel: 'senior',
        questionCategory: 'technical',
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(200);

      expect(PutCommand).toHaveBeenCalledTimes(1);
      const putCall = PutCommand.mock.calls[0][0];
      expect(putCall.Item.seniorityLevel).toBe('senior');
      expect(putCall.Item.questionCategory).toBe('technical');
      expect(putCall.Item.jobPosition).toBe('Software Engineer');
    });

    // Test 2: handleStartSession without seniorityLevel/questionCategory defaults to 'mid' and 'general'
    test('defaults to seniorityLevel=mid and questionCategory=general when not provided', async () => {
      const { PutCommand } = require('@aws-sdk/lib-dynamodb');
      const event = eventWithBody({
        action: 'start_session',
        jobPosition: 'Data Analyst',
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(200);

      expect(PutCommand).toHaveBeenCalledTimes(1);
      const putCall = PutCommand.mock.calls[0][0];
      expect(putCall.Item.seniorityLevel).toBe('mid');
      expect(putCall.Item.questionCategory).toBe('general');
    });
  });

  // Test 3: handleNextQuestion retrieves seniorityLevel and questionCategory from session
  // and includes them in Bedrock prompt
  describe('handleNextQuestion reads seniority and category from session', () => {
    test('retrieves seniorityLevel and questionCategory from session and includes them in Bedrock prompt', async () => {
      const sessionWithSeniority = {
        userId: 'test-user-id-123',
        sessionId: 'test-session-id',
        jobPosition: 'DevOps Engineer',
        seniorityLevel: 'lead',
        questionCategory: 'technical',
        questions: [
          { questionId: 'q1', questionText: 'Describe your CI/CD experience.' },
        ],
      };

      mockSend.mockImplementation((command: { _type?: string }) => {
        if (command._type === 'GetCommand') {
          return Promise.resolve({ Item: sessionWithSeniority });
        }
        if (command._type === 'InvokeModelCommand') {
          return Promise.resolve({
            body: new TextEncoder().encode(
              JSON.stringify({ content: [{ text: 'How do you handle infrastructure scaling?' }] })
            ),
          });
        }
        // UpdateCommand
        return Promise.resolve({});
      });

      const { InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
      const event = eventWithBody({ action: 'next_question', sessionId: 'test-session-id' });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(InvokeModelCommand).toHaveBeenCalledTimes(1);

      const bedrockCall = InvokeModelCommand.mock.calls[0][0];
      const body = JSON.parse(bedrockCall.body);
      const prompt: string = body.messages[0].content;

      // Prompt must contain the seniority level from the session
      expect(prompt).toContain('lead');
      // Prompt must contain technical category instructions
      expect(prompt.toLowerCase()).toContain('technical');
      // Prompt must contain the job position
      expect(prompt).toContain('DevOps Engineer');
    });

    // Test 4: handleNextQuestion defaults to 'mid' and 'general' when session record
    // is missing those fields (backward compatibility)
    test('defaults to mid/general when session record is missing seniority and category fields', async () => {
      const legacySession = {
        userId: 'test-user-id-123',
        sessionId: 'legacy-session-id',
        jobPosition: 'Product Manager',
        // No seniorityLevel or questionCategory — simulates a pre-feature session
        questions: [
          { questionId: 'q1', questionText: 'Tell me about yourself.' },
        ],
      };

      mockSend.mockImplementation((command: { _type?: string }) => {
        if (command._type === 'GetCommand') {
          return Promise.resolve({ Item: legacySession });
        }
        if (command._type === 'InvokeModelCommand') {
          return Promise.resolve({
            body: new TextEncoder().encode(
              JSON.stringify({ content: [{ text: 'What motivates you in your career?' }] })
            ),
          });
        }
        return Promise.resolve({});
      });

      const { InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
      const event = eventWithBody({ action: 'next_question', sessionId: 'legacy-session-id' });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(InvokeModelCommand).toHaveBeenCalledTimes(1);

      const bedrockCall = InvokeModelCommand.mock.calls[0][0];
      const body = JSON.parse(bedrockCall.body);
      const prompt: string = body.messages[0].content;

      // Should use default 'mid' seniority in the prompt
      expect(prompt).toContain('mid');
      // Should use default 'general' category instructions (behavioral/soft skills/motivation)
      const hasGeneralKeywords =
        prompt.toLowerCase().includes('behavioral') ||
        prompt.toLowerCase().includes('soft skills') ||
        prompt.toLowerCase().includes('motivation');
      expect(hasGeneralKeywords).toBe(true);
    });
  });

  // Tests 5 & 6: Validation returns 400 for invalid enum values
  describe('Validation rejects invalid seniority and category values', () => {
    // Test 5: Returns 400 with descriptive message for invalid seniorityLevel
    test('returns 400 for invalid seniorityLevel (e.g., expert)', async () => {
      const event = eventWithBody({
        action: 'start_session',
        jobPosition: 'Software Engineer',
        seniorityLevel: 'expert',
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(400);

      const body = JSON.parse(result.body);
      expect(body.message).toContain('seniorityLevel');
      expect(body.message).toContain('expert');
      expect(body.message).toContain('junior');
      expect(body.message).toContain('mid');
      expect(body.message).toContain('senior');
      expect(body.message).toContain('lead');
    });

    // Test 6: Returns 400 with descriptive message for invalid questionCategory
    test('returns 400 for invalid questionCategory (e.g., advanced)', async () => {
      const event = eventWithBody({
        action: 'start_session',
        jobPosition: 'Software Engineer',
        questionCategory: 'advanced',
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(400);

      const body = JSON.parse(result.body);
      expect(body.message).toContain('questionCategory');
      expect(body.message).toContain('advanced');
      expect(body.message).toContain('general');
      expect(body.message).toContain('technical');
    });

    // Also verify via validateRequest directly for completeness
    test('validateRequest returns invalid for seniorityLevel=expert', () => {
      const result = validateRequest({
        action: 'start_session',
        jobPosition: 'Engineer',
        seniorityLevel: 'expert',
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.message).toContain('seniorityLevel');
        expect(result.message).toContain('expert');
      }
    });

    test('validateRequest returns invalid for questionCategory=advanced', () => {
      const result = validateRequest({
        action: 'start_session',
        jobPosition: 'Engineer',
        questionCategory: 'advanced',
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.message).toContain('questionCategory');
        expect(result.message).toContain('advanced');
      }
    });
  });
});
