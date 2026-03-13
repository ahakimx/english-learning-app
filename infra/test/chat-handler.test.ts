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

import { handler, validateRequest, VALID_ACTIONS, REQUIRED_FIELDS } from '../lambda/chat/index';

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

describe('Lambda /chat handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SESSIONS_TABLE_NAME = 'test-sessions-table';

    // Default mock: Bedrock returns a question, DynamoDB PutCommand succeeds
    mockSend.mockImplementation((command: { _type?: string }) => {
      if (command._type === 'InvokeModelCommand') {
        return Promise.resolve({
          body: new TextEncoder().encode(
            JSON.stringify({
              content: [{ text: 'Tell me about your experience with software development.' }],
            })
          ),
        });
      }
      // DynamoDB PutCommand
      return Promise.resolve({});
    });
  });
  // --- CORS and OPTIONS ---
  describe('CORS', () => {
    test('OPTIONS request returns 200 with CORS headers', async () => {
      const event = createEvent({ httpMethod: 'OPTIONS' });
      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      expect(result.headers).toMatchObject({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      });
    });

    test('all responses include CORS headers', async () => {
      const event = eventWithBody({ action: 'start_session', jobPosition: 'Software Engineer' });
      const result = await handler(event);
      expect(result.headers!['Access-Control-Allow-Origin']).toBe('*');
    });
  });

  // --- Authentication ---
  describe('Authentication', () => {
    test('returns 401 when no authorizer claims present', async () => {
      const event = createEvent({
        body: JSON.stringify({ action: 'start_session', jobPosition: 'Software Engineer' }),
        requestContext: {
          ...createEvent().requestContext,
          authorizer: null,
        },
      });
      const result = await handler(event);
      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Unauthorized');
    });

    test('returns 401 when claims.sub is missing', async () => {
      const event = createEvent({
        body: JSON.stringify({ action: 'start_session', jobPosition: 'Software Engineer' }),
        requestContext: {
          ...createEvent().requestContext,
          authorizer: { claims: {} },
        },
      });
      const result = await handler(event);
      expect(result.statusCode).toBe(401);
    });
  });

  // --- Input Validation ---
  describe('Input Validation', () => {
    test('returns 400 when body is empty', async () => {
      const event = eventWithBody({});
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('action');
    });

    test('returns 400 when action is missing', async () => {
      const event = eventWithBody({ sessionId: 'some-id' });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('action');
    });

    test('returns 400 for invalid action', async () => {
      const event = eventWithBody({ action: 'invalid_action' });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('Invalid action');
    });

    test('returns 400 when body is invalid JSON', async () => {
      const event = createEvent({ body: 'not-json{{{' });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Invalid JSON');
    });

    test('returns 400 when start_session missing jobPosition', async () => {
      const event = eventWithBody({ action: 'start_session' });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('jobPosition');
    });

    test('returns 400 when analyze_answer missing sessionId', async () => {
      const event = eventWithBody({ action: 'analyze_answer', transcription: 'hello' });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('sessionId');
    });

    test('returns 400 when analyze_answer missing transcription', async () => {
      const event = eventWithBody({ action: 'analyze_answer', sessionId: 'sid' });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('transcription');
    });

    test('returns 400 when next_question missing sessionId', async () => {
      const event = eventWithBody({ action: 'next_question' });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('sessionId');
    });

    test('returns 400 when end_session missing sessionId', async () => {
      const event = eventWithBody({ action: 'end_session' });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('sessionId');
    });

    test('returns 400 when grammar_quiz missing grammarTopic', async () => {
      const event = eventWithBody({ action: 'grammar_quiz' });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('grammarTopic');
    });

    test('returns 400 when grammar_explain missing sessionId', async () => {
      const event = eventWithBody({ action: 'grammar_explain', selectedAnswer: 'A' });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('sessionId');
    });

    test('returns 400 when grammar_explain missing selectedAnswer', async () => {
      const event = eventWithBody({ action: 'grammar_explain', sessionId: 'sid' });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('selectedAnswer');
    });

    test('returns 400 when writing_prompt missing writingType', async () => {
      const event = eventWithBody({ action: 'writing_prompt' });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('writingType');
    });

    test('returns 400 when writing_prompt has invalid writingType', async () => {
      const event = eventWithBody({ action: 'writing_prompt', writingType: 'poem' });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('writingType');
    });

    test('returns 400 when writing_review missing sessionId', async () => {
      const event = eventWithBody({ action: 'writing_review', writingContent: 'My essay' });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('sessionId');
    });

    test('returns 400 when writing_review missing writingContent', async () => {
      const event = eventWithBody({ action: 'writing_review', sessionId: 'sid' });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('writingContent');
    });

    test('returns 400 when required field is empty string', async () => {
      const event = eventWithBody({ action: 'start_session', jobPosition: '' });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('jobPosition');
    });
  });

  // --- Action Routing ---
  describe('Action Routing', () => {
    test('start_session returns 200 with question type', async () => {
      const event = eventWithBody({ action: 'start_session', jobPosition: 'Software Engineer' });
      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.type).toBe('question');
      expect(body.sessionId).toBeDefined();
      expect(body.content).toBe('Tell me about your experience with software development.');
    });

    test('analyze_answer returns 200 with feedback type', async () => {
      const feedbackJson = {
        scores: { grammar: 80, vocabulary: 75, relevance: 90, fillerWords: 85, coherence: 70, overall: 80 },
        grammarErrors: [{ original: 'I is', correction: 'I am', rule: 'Subject-verb agreement' }],
        fillerWordsDetected: [{ word: 'um', count: 2 }],
        suggestions: ['Use more varied vocabulary'],
        improvedAnswer: 'I am experienced in software development.',
      };
      mockSend.mockImplementation((command: { _type?: string }) => {
        if (command._type === 'GetCommand') {
          return Promise.resolve({
            Item: {
              userId: 'test-user-id-123',
              sessionId: 'sid',
              questions: [{ questionId: 'q1', questionText: 'Tell me about yourself' }],
            },
          });
        }
        if (command._type === 'InvokeModelCommand') {
          return Promise.resolve({
            body: new TextEncoder().encode(
              JSON.stringify({ content: [{ text: JSON.stringify(feedbackJson) }] })
            ),
          });
        }
        return Promise.resolve({});
      });
      const event = eventWithBody({ action: 'analyze_answer', sessionId: 'sid', transcription: 'My answer' });
      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).type).toBe('feedback');
    });

    test('next_question returns 200 with question type', async () => {
      mockSend.mockImplementation((command: { _type?: string }) => {
        if (command._type === 'GetCommand') {
          return Promise.resolve({
            Item: {
              userId: 'test-user-id-123',
              sessionId: 'sid',
              jobPosition: 'Software Engineer',
              questions: [{ questionId: 'q1', questionText: 'First question' }],
            },
          });
        }
        if (command._type === 'InvokeModelCommand') {
          return Promise.resolve({
            body: new TextEncoder().encode(
              JSON.stringify({ content: [{ text: 'A new interview question' }] })
            ),
          });
        }
        return Promise.resolve({});
      });
      const event = eventWithBody({ action: 'next_question', sessionId: 'sid' });
      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).type).toBe('question');
    });

    test('end_session returns 200 with summary type', async () => {
      const summaryJson = {
        overallScore: 80,
        criteriaScores: { grammar: 80, vocabulary: 75, relevance: 85, fillerWords: 70, coherence: 80 },
        performanceTrend: [{ questionNumber: 1, score: 80 }],
        topImprovementAreas: ['Grammar', 'Vocabulary', 'Filler words'],
        recommendations: ['Practice more'],
      };
      mockSend.mockImplementation((command: { _type?: string }) => {
        if (command._type === 'GetCommand') {
          return Promise.resolve({
            Item: {
              userId: 'test-user-id-123',
              sessionId: 'sid',
              jobPosition: 'Software Engineer',
              questions: [{
                questionId: 'q1',
                questionText: 'Tell me about yourself',
                feedback: { scores: { grammar: 80, vocabulary: 75, relevance: 85, fillerWords: 70, coherence: 80, overall: 80 }, grammarErrors: [], fillerWordsDetected: [], suggestions: ['tip'], improvedAnswer: 'better' },
              }],
            },
          });
        }
        if (command._type === 'InvokeModelCommand') {
          return Promise.resolve({
            body: new TextEncoder().encode(
              JSON.stringify({ content: [{ text: JSON.stringify(summaryJson) }] })
            ),
          });
        }
        return Promise.resolve({});
      });
      const event = eventWithBody({ action: 'end_session', sessionId: 'sid' });
      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).type).toBe('summary');
    });

    test('grammar_quiz returns 200 with quiz type', async () => {
      const quizJson = {
        question: 'Choose the correct form of the verb.',
        options: ['He go', 'He goes', 'He going', 'He gone'],
        correctAnswer: 'He goes',
      };
      mockSend.mockImplementation((command: { _type?: string }) => {
        if (command._type === 'InvokeModelCommand') {
          return Promise.resolve({
            body: new TextEncoder().encode(
              JSON.stringify({ content: [{ text: JSON.stringify(quizJson) }] })
            ),
          });
        }
        return Promise.resolve({});
      });
      const event = eventWithBody({ action: 'grammar_quiz', grammarTopic: 'Tenses' });
      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).type).toBe('quiz');
    });

    test('grammar_explain returns 200 with explanation type', async () => {
      mockSend.mockImplementation((command: { _type?: string }) => {
        if (command._type === 'GetCommand') {
          return Promise.resolve({
            Item: {
              userId: 'test-user-id-123',
              sessionId: 'sid',
              currentQuiz: {
                questionId: 'q1',
                question: 'Choose the correct form.',
                options: ['He go', 'He goes', 'He going', 'He gone'],
                correctAnswer: 'He goes',
              },
              quizResults: [],
            },
          });
        }
        if (command._type === 'InvokeModelCommand') {
          return Promise.resolve({
            body: new TextEncoder().encode(
              JSON.stringify({ content: [{ text: 'The correct answer is "He goes" because...' }] })
            ),
          });
        }
        return Promise.resolve({});
      });
      const event = eventWithBody({ action: 'grammar_explain', sessionId: 'sid', selectedAnswer: 'He goes' });
      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).type).toBe('explanation');
    });

    test('writing_prompt with essay returns 200', async () => {
      mockSend.mockImplementation((command: { _type?: string }) => {
        if (command._type === 'InvokeModelCommand') {
          return Promise.resolve({
            body: new TextEncoder().encode(
              JSON.stringify({ content: [{ text: 'Write an essay about your career goals.' }] })
            ),
          });
        }
        return Promise.resolve({});
      });
      const event = eventWithBody({ action: 'writing_prompt', writingType: 'essay' });
      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).type).toBe('writing_prompt');
    });

    test('writing_prompt with email returns 200', async () => {
      mockSend.mockImplementation((command: { _type?: string }) => {
        if (command._type === 'InvokeModelCommand') {
          return Promise.resolve({
            body: new TextEncoder().encode(
              JSON.stringify({ content: [{ text: 'Write a professional email to your manager.' }] })
            ),
          });
        }
        return Promise.resolve({});
      });
      const event = eventWithBody({ action: 'writing_prompt', writingType: 'email' });
      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).type).toBe('writing_prompt');
    });

    test('writing_review returns 200 with writing_review type', async () => {
      const reviewJson = {
        overallScore: 75,
        aspects: {
          grammarCorrectness: { score: 70, errors: [] },
          structure: { score: 80, feedback: 'Good structure.' },
          vocabulary: { score: 75, suggestions: ['Use more varied words'] },
        },
      };
      mockSend.mockImplementation((command: { _type?: string }) => {
        if (command._type === 'GetCommand') {
          return Promise.resolve({
            Item: {
              userId: 'test-user-id-123',
              sessionId: 'sid',
              writingType: 'essay',
              writingPrompt: 'Write about your goals.',
            },
          });
        }
        if (command._type === 'InvokeModelCommand') {
          return Promise.resolve({
            body: new TextEncoder().encode(
              JSON.stringify({ content: [{ text: JSON.stringify(reviewJson) }] })
            ),
          });
        }
        return Promise.resolve({});
      });
      const event = eventWithBody({ action: 'writing_review', sessionId: 'sid', writingContent: 'My essay content' });
      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).type).toBe('writing_review');
    });
  });

  // --- Response Format ---
  describe('Response Format', () => {
    test('success response body is valid JSON with required ChatResponse fields', async () => {
      const event = eventWithBody({ action: 'start_session', jobPosition: 'Data Analyst' });
      const result = await handler(event);
      const body = JSON.parse(result.body);
      expect(body).toHaveProperty('sessionId');
      expect(body).toHaveProperty('type');
      expect(body).toHaveProperty('content');
    });

    test('error response body is valid JSON with error and message fields', async () => {
      const event = eventWithBody({ action: 'invalid' });
      const result = await handler(event);
      const body = JSON.parse(result.body);
      expect(body).toHaveProperty('error');
      expect(body).toHaveProperty('message');
    });

    test('Content-Type header is application/json', async () => {
      const event = eventWithBody({ action: 'start_session', jobPosition: 'PM' });
      const result = await handler(event);
      expect(result.headers!['Content-Type']).toBe('application/json');
    });
  });

  // --- start_session implementation ---
  describe('start_session', () => {
    test('saves session metadata to DynamoDB with correct fields', async () => {
      const { PutCommand } = require('@aws-sdk/lib-dynamodb');
      const event = eventWithBody({ action: 'start_session', jobPosition: 'Software Engineer' });
      await handler(event);

      expect(PutCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          TableName: 'test-sessions-table',
          Item: expect.objectContaining({
            userId: 'test-user-id-123',
            type: 'speaking',
            status: 'active',
            jobPosition: 'Software Engineer',
          }),
        })
      );
    });

    test('session item has valid UUID sessionId', async () => {
      const { PutCommand } = require('@aws-sdk/lib-dynamodb');
      const event = eventWithBody({ action: 'start_session', jobPosition: 'Data Analyst' });
      await handler(event);

      const putCall = PutCommand.mock.calls[0][0];
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(putCall.Item.sessionId).toMatch(uuidRegex);
    });

    test('session item has questions array with introduction question', async () => {
      const { PutCommand } = require('@aws-sdk/lib-dynamodb');
      const event = eventWithBody({ action: 'start_session', jobPosition: 'Product Manager', seniorityLevel: 'mid' });
      await handler(event);

      const putCall = PutCommand.mock.calls[0][0];
      expect(putCall.Item.questions).toHaveLength(1);
      expect(putCall.Item.questions[0]).toHaveProperty('questionId');
      expect(putCall.Item.questions[0]).toHaveProperty('questionText');
      expect(putCall.Item.questions[0].questionType).toBe('introduction');
    });

    test('session item has ISO 8601 timestamps', async () => {
      const { PutCommand } = require('@aws-sdk/lib-dynamodb');
      const event = eventWithBody({ action: 'start_session', jobPosition: 'UI/UX Designer' });
      await handler(event);

      const putCall = PutCommand.mock.calls[0][0];
      expect(new Date(putCall.Item.createdAt).toISOString()).toBe(putCall.Item.createdAt);
      expect(new Date(putCall.Item.updatedAt).toISOString()).toBe(putCall.Item.updatedAt);
    });

    test('does not call Bedrock for start_session', async () => {
      const { InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
      const event = eventWithBody({ action: 'start_session', jobPosition: 'Marketing Manager' });
      await handler(event);

      expect(InvokeModelCommand).not.toHaveBeenCalled();
    });

    test('returns introduction question for junior seniority', async () => {
      const event = eventWithBody({ action: 'start_session', jobPosition: 'Software Engineer', seniorityLevel: 'junior' });
      const result = await handler(event);
      const body = JSON.parse(result.body);
      expect(body.questionType).toBe('introduction');
      expect(body.content).toContain('educational background');
    });

    test('returns introduction question for mid seniority', async () => {
      const event = eventWithBody({ action: 'start_session', jobPosition: 'Software Engineer', seniorityLevel: 'mid' });
      const result = await handler(event);
      const body = JSON.parse(result.body);
      expect(body.questionType).toBe('introduction');
      expect(body.content).toContain('professional experience');
    });

    test('returns introduction question for senior seniority', async () => {
      const event = eventWithBody({ action: 'start_session', jobPosition: 'Software Engineer', seniorityLevel: 'senior' });
      const result = await handler(event);
      const body = JSON.parse(result.body);
      expect(body.questionType).toBe('introduction');
      expect(body.content).toContain('career journey');
    });

    test('returns introduction question for lead seniority', async () => {
      const event = eventWithBody({ action: 'start_session', jobPosition: 'Software Engineer', seniorityLevel: 'lead' });
      const result = await handler(event);
      const body = JSON.parse(result.body);
      expect(body.questionType).toBe('introduction');
      expect(body.content).toContain('leading teams');
    });

    test('stores questionType introduction in DynamoDB', async () => {
      const { PutCommand } = require('@aws-sdk/lib-dynamodb');
      const event = eventWithBody({ action: 'start_session', jobPosition: 'Data Analyst', seniorityLevel: 'senior' });
      await handler(event);

      const putCall = PutCommand.mock.calls[0][0];
      expect(putCall.Item.questions[0].questionType).toBe('introduction');
    });

    test('returns 500 when DynamoDB put fails', async () => {
      mockSend.mockImplementation(() => {
        return Promise.reject(new Error('DynamoDB error'));
      });

      const event = eventWithBody({ action: 'start_session', jobPosition: 'Software Engineer' });
      const result = await handler(event);
      expect(result.statusCode).toBe(500);
    });

    test('returned sessionId matches the one saved to DynamoDB', async () => {
      const { PutCommand } = require('@aws-sdk/lib-dynamodb');
      const event = eventWithBody({ action: 'start_session', jobPosition: 'Data Analyst' });
      const result = await handler(event);
      const responseBody = JSON.parse(result.body);

      const putCall = PutCommand.mock.calls[0][0];
      expect(responseBody.sessionId).toBe(putCall.Item.sessionId);
    });

    test('defaults to mid seniority when not provided', async () => {
      const { PutCommand } = require('@aws-sdk/lib-dynamodb');
      const event = eventWithBody({ action: 'start_session', jobPosition: 'Software Engineer' });
      const result = await handler(event);
      const body = JSON.parse(result.body);

      expect(body.questionType).toBe('introduction');
      expect(body.content).toContain('professional experience'); // mid template

      const putCall = PutCommand.mock.calls[0][0];
      expect(putCall.Item.seniorityLevel).toBe('mid');
    });
  });

  // --- analyze_answer implementation ---
  describe('analyze_answer', () => {
    const validFeedback = {
      scores: { grammar: 80, vocabulary: 75, relevance: 90, fillerWords: 85, coherence: 70, overall: 80 },
      grammarErrors: [{ original: 'I is', correction: 'I am', rule: 'Subject-verb agreement' }],
      fillerWordsDetected: [{ word: 'um', count: 2 }],
      suggestions: ['Use more varied vocabulary'],
      improvedAnswer: 'I am experienced in software development.',
    };

    function setupAnalyzeMocks(feedbackOverride?: object) {
      const feedback = feedbackOverride ?? validFeedback;
      mockSend.mockImplementation((command: { _type?: string }) => {
        if (command._type === 'GetCommand') {
          return Promise.resolve({
            Item: {
              userId: 'test-user-id-123',
              sessionId: 'test-session-id',
              questions: [{ questionId: 'q1', questionText: 'Tell me about yourself' }],
            },
          });
        }
        if (command._type === 'InvokeModelCommand') {
          return Promise.resolve({
            body: new TextEncoder().encode(
              JSON.stringify({ content: [{ text: JSON.stringify(feedback) }] })
            ),
          });
        }
        // UpdateCommand
        return Promise.resolve({});
      });
    }

    test('fetches session from DynamoDB using userId and sessionId', async () => {
      setupAnalyzeMocks();
      const { GetCommand } = require('@aws-sdk/lib-dynamodb');
      const event = eventWithBody({ action: 'analyze_answer', sessionId: 'test-session-id', transcription: 'My answer' });
      await handler(event);

      expect(GetCommand).toHaveBeenCalledWith({
        TableName: 'test-sessions-table',
        Key: { userId: 'test-user-id-123', sessionId: 'test-session-id' },
      });
    });

    test('calls Bedrock with transcription and question in prompt', async () => {
      setupAnalyzeMocks();
      const { InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
      const event = eventWithBody({ action: 'analyze_answer', sessionId: 'test-session-id', transcription: 'I have five years experience' });
      await handler(event);

      expect(InvokeModelCommand).toHaveBeenCalledTimes(1);
      const bedrockCall = InvokeModelCommand.mock.calls[0][0];
      const body = JSON.parse(bedrockCall.body);
      expect(body.messages[0].content).toContain('I have five years experience');
      expect(body.messages[0].content).toContain('Tell me about yourself');
      expect(body.system).toBeDefined();
    });

    test('updates session in DynamoDB with feedback, transcription, and timestamps', async () => {
      setupAnalyzeMocks();
      const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');
      const event = eventWithBody({ action: 'analyze_answer', sessionId: 'test-session-id', transcription: 'My answer text' });
      await handler(event);

      expect(UpdateCommand).toHaveBeenCalledTimes(1);
      const updateCall = UpdateCommand.mock.calls[0][0];
      expect(updateCall.TableName).toBe('test-sessions-table');
      expect(updateCall.Key).toEqual({ userId: 'test-user-id-123', sessionId: 'test-session-id' });
      expect(updateCall.ExpressionAttributeValues[':feedback']).toEqual(validFeedback);
      expect(updateCall.ExpressionAttributeValues[':transcription']).toBe('My answer text');
      expect(updateCall.ExpressionAttributeValues[':answeredAt']).toBeDefined();
      expect(updateCall.ExpressionAttributeValues[':updatedAt']).toBeDefined();
    });

    test('returns feedbackReport in response body', async () => {
      setupAnalyzeMocks();
      const event = eventWithBody({ action: 'analyze_answer', sessionId: 'test-session-id', transcription: 'My answer' });
      const result = await handler(event);
      const body = JSON.parse(result.body);

      expect(body.type).toBe('feedback');
      expect(body.feedbackReport).toBeDefined();
      expect(body.feedbackReport.scores.grammar).toBe(80);
      expect(body.feedbackReport.scores.overall).toBe(80);
      expect(body.feedbackReport.grammarErrors).toHaveLength(1);
      expect(body.feedbackReport.fillerWordsDetected).toHaveLength(1);
      expect(body.feedbackReport.suggestions).toHaveLength(1);
      expect(body.feedbackReport.improvedAnswer).toBe('I am experienced in software development.');
    });

    test('returns content with score summary', async () => {
      setupAnalyzeMocks();
      const event = eventWithBody({ action: 'analyze_answer', sessionId: 'test-session-id', transcription: 'My answer' });
      const result = await handler(event);
      const body = JSON.parse(result.body);

      expect(body.content).toContain('80/100');
      expect(body.content).toContain('Grammar');
      expect(body.content).toContain('Vocabulary');
    });

    test('returns 500 when session not found in DynamoDB', async () => {
      mockSend.mockImplementation((command: { _type?: string }) => {
        if (command._type === 'GetCommand') {
          return Promise.resolve({ Item: undefined });
        }
        return Promise.resolve({});
      });

      const event = eventWithBody({ action: 'analyze_answer', sessionId: 'nonexistent', transcription: 'My answer' });
      const result = await handler(event);
      expect(result.statusCode).toBe(500);
    });

    test('returns 500 when Bedrock fails during analysis', async () => {
      mockSend.mockImplementation((command: { _type?: string }) => {
        if (command._type === 'GetCommand') {
          return Promise.resolve({
            Item: {
              userId: 'test-user-id-123',
              sessionId: 'sid',
              questions: [{ questionId: 'q1', questionText: 'Tell me about yourself' }],
            },
          });
        }
        if (command._type === 'InvokeModelCommand') {
          return Promise.reject(new Error('Bedrock timeout'));
        }
        return Promise.resolve({});
      });

      const event = eventWithBody({ action: 'analyze_answer', sessionId: 'sid', transcription: 'My answer' });
      const result = await handler(event);
      expect(result.statusCode).toBe(500);
    });

    test('handles Bedrock response with extra text around JSON', async () => {
      mockSend.mockImplementation((command: { _type?: string }) => {
        if (command._type === 'GetCommand') {
          return Promise.resolve({
            Item: {
              userId: 'test-user-id-123',
              sessionId: 'sid',
              questions: [{ questionId: 'q1', questionText: 'Tell me about yourself' }],
            },
          });
        }
        if (command._type === 'InvokeModelCommand') {
          const wrappedJson = `Here is the analysis:\n${JSON.stringify(validFeedback)}\nEnd of analysis.`;
          return Promise.resolve({
            body: new TextEncoder().encode(
              JSON.stringify({ content: [{ text: wrappedJson }] })
            ),
          });
        }
        return Promise.resolve({});
      });

      const event = eventWithBody({ action: 'analyze_answer', sessionId: 'sid', transcription: 'My answer' });
      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.feedbackReport.scores.overall).toBe(80);
    });

    test('uses the last question in the session for analysis', async () => {
      mockSend.mockImplementation((command: { _type?: string }) => {
        if (command._type === 'GetCommand') {
          return Promise.resolve({
            Item: {
              userId: 'test-user-id-123',
              sessionId: 'sid',
              questions: [
                { questionId: 'q1', questionText: 'First question', feedback: {} },
                { questionId: 'q2', questionText: 'Second question' },
              ],
            },
          });
        }
        if (command._type === 'InvokeModelCommand') {
          return Promise.resolve({
            body: new TextEncoder().encode(
              JSON.stringify({ content: [{ text: JSON.stringify(validFeedback) }] })
            ),
          });
        }
        return Promise.resolve({});
      });

      const { InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
      const event = eventWithBody({ action: 'analyze_answer', sessionId: 'sid', transcription: 'My answer' });
      await handler(event);

      const bedrockCall = InvokeModelCommand.mock.calls[0][0];
      const body = JSON.parse(bedrockCall.body);
      expect(body.messages[0].content).toContain('Second question');
    });

    test('updates the correct question index in DynamoDB', async () => {
      mockSend.mockImplementation((command: { _type?: string }) => {
        if (command._type === 'GetCommand') {
          return Promise.resolve({
            Item: {
              userId: 'test-user-id-123',
              sessionId: 'sid',
              questions: [
                { questionId: 'q1', questionText: 'First question', feedback: {} },
                { questionId: 'q2', questionText: 'Second question' },
              ],
            },
          });
        }
        if (command._type === 'InvokeModelCommand') {
          return Promise.resolve({
            body: new TextEncoder().encode(
              JSON.stringify({ content: [{ text: JSON.stringify(validFeedback) }] })
            ),
          });
        }
        return Promise.resolve({});
      });

      const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');
      const event = eventWithBody({ action: 'analyze_answer', sessionId: 'sid', transcription: 'My answer' });
      await handler(event);

      const updateCall = UpdateCommand.mock.calls[0][0];
      expect(updateCall.ExpressionAttributeNames['#idx']).toBe('1');
    });
  });

  // --- next_question implementation ---
  describe('next_question', () => {
    const sessionWithQuestions = {
      userId: 'test-user-id-123',
      sessionId: 'test-session-id',
      jobPosition: 'Software Engineer',
      questions: [
        { questionId: 'q1', questionText: 'Tell me about yourself', feedback: { scores: { overall: 80 } } },
        { questionId: 'q2', questionText: 'What is your greatest strength?', feedback: { scores: { overall: 75 } } },
      ],
    };

    function setupNextQuestionMocks(newQuestionText = 'Describe a challenging project you worked on.') {
      mockSend.mockImplementation((command: { _type?: string }) => {
        if (command._type === 'GetCommand') {
          return Promise.resolve({ Item: sessionWithQuestions });
        }
        if (command._type === 'InvokeModelCommand') {
          return Promise.resolve({
            body: new TextEncoder().encode(
              JSON.stringify({ content: [{ text: newQuestionText }] })
            ),
          });
        }
        // UpdateCommand
        return Promise.resolve({});
      });
    }

    test('fetches session from DynamoDB', async () => {
      setupNextQuestionMocks();
      const { GetCommand } = require('@aws-sdk/lib-dynamodb');
      const event = eventWithBody({ action: 'next_question', sessionId: 'test-session-id' });
      await handler(event);

      expect(GetCommand).toHaveBeenCalledWith({
        TableName: 'test-sessions-table',
        Key: { userId: 'test-user-id-123', sessionId: 'test-session-id' },
      });
    });

    test('sends previous questions to Bedrock as context', async () => {
      setupNextQuestionMocks();
      const { InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
      const event = eventWithBody({ action: 'next_question', sessionId: 'test-session-id' });
      await handler(event);

      expect(InvokeModelCommand).toHaveBeenCalledTimes(1);
      const bedrockCall = InvokeModelCommand.mock.calls[0][0];
      const body = JSON.parse(bedrockCall.body);
      const prompt = body.messages[0].content;
      expect(prompt).toContain('Tell me about yourself');
      expect(prompt).toContain('What is your greatest strength?');
      expect(prompt).toContain('Software Engineer');
    });

    test('appends new question to session using list_append', async () => {
      setupNextQuestionMocks();
      const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');
      const event = eventWithBody({ action: 'next_question', sessionId: 'test-session-id' });
      await handler(event);

      expect(UpdateCommand).toHaveBeenCalledTimes(1);
      const updateCall = UpdateCommand.mock.calls[0][0];
      expect(updateCall.TableName).toBe('test-sessions-table');
      expect(updateCall.Key).toEqual({ userId: 'test-user-id-123', sessionId: 'test-session-id' });
      expect(updateCall.UpdateExpression).toContain('list_append');
      const newQuestion = updateCall.ExpressionAttributeValues[':newQuestion'];
      expect(newQuestion).toHaveLength(1);
      expect(newQuestion[0].questionText).toBe('Describe a challenging project you worked on.');
      expect(newQuestion[0].questionId).toBeDefined();
    });

    test('returns question type with new question content', async () => {
      setupNextQuestionMocks('How do you handle tight deadlines?');
      const event = eventWithBody({ action: 'next_question', sessionId: 'test-session-id' });
      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.type).toBe('question');
      expect(body.content).toBe('How do you handle tight deadlines?');
      expect(body.sessionId).toBe('test-session-id');
    });

    test('returns 500 when session not found', async () => {
      mockSend.mockImplementation((command: { _type?: string }) => {
        if (command._type === 'GetCommand') {
          return Promise.resolve({ Item: undefined });
        }
        return Promise.resolve({});
      });

      const event = eventWithBody({ action: 'next_question', sessionId: 'nonexistent' });
      const result = await handler(event);
      expect(result.statusCode).toBe(500);
    });

    test('returns 500 when Bedrock fails', async () => {
      mockSend.mockImplementation((command: { _type?: string }) => {
        if (command._type === 'GetCommand') {
          return Promise.resolve({ Item: sessionWithQuestions });
        }
        if (command._type === 'InvokeModelCommand') {
          return Promise.reject(new Error('Bedrock error'));
        }
        return Promise.resolve({});
      });

      const event = eventWithBody({ action: 'next_question', sessionId: 'test-session-id' });
      const result = await handler(event);
      expect(result.statusCode).toBe(500);
    });

    test('returns questionType contextual in response', async () => {
      setupNextQuestionMocks();
      const event = eventWithBody({ action: 'next_question', sessionId: 'test-session-id' });
      const result = await handler(event);
      const body = JSON.parse(result.body);
      expect(body.questionType).toBe('contextual');
    });

    test('stores questionType contextual in DynamoDB update', async () => {
      setupNextQuestionMocks();
      const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');
      const event = eventWithBody({ action: 'next_question', sessionId: 'test-session-id' });
      await handler(event);

      const updateCall = UpdateCommand.mock.calls[0][0];
      const newQuestion = updateCall.ExpressionAttributeValues[':newQuestion'];
      expect(newQuestion[0].questionType).toBe('contextual');
    });

    test('uses contextual path with transcription available', async () => {
      const sessionWithTranscription = {
        userId: 'test-user-id-123',
        sessionId: 'test-session-id',
        jobPosition: 'Software Engineer',
        seniorityLevel: 'mid',
        questionCategory: 'general',
        questions: [
          { questionId: 'q1', questionText: 'Tell me about yourself', transcription: 'I am a developer with 5 years experience' },
        ],
      };
      mockSend.mockImplementation((command: { _type?: string }) => {
        if (command._type === 'GetCommand') {
          return Promise.resolve({ Item: sessionWithTranscription });
        }
        if (command._type === 'InvokeModelCommand') {
          return Promise.resolve({
            body: new TextEncoder().encode(JSON.stringify({ content: [{ text: 'Follow-up question' }] })),
          });
        }
        return Promise.resolve({});
      });

      const { InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
      const event = eventWithBody({ action: 'next_question', sessionId: 'test-session-id' });
      const result = await handler(event);

      const bedrockCall = InvokeModelCommand.mock.calls[0][0];
      const bedrockBody = JSON.parse(bedrockCall.body);
      expect(bedrockBody.messages[0].content).toContain('I am a developer with 5 years experience');

      const body = JSON.parse(result.body);
      expect(body.questionType).toBe('contextual');
      expect(body.content).toBe('Follow-up question');
    });

    test('uses contextual path with no transcription (general fallback)', async () => {
      const sessionNoTranscription = {
        userId: 'test-user-id-123',
        sessionId: 'test-session-id',
        jobPosition: 'Data Analyst',
        seniorityLevel: 'senior',
        questionCategory: 'general',
        questions: [
          { questionId: 'q1', questionText: 'Tell me about yourself' },
        ],
      };
      mockSend.mockImplementation((command: { _type?: string }) => {
        if (command._type === 'GetCommand') {
          return Promise.resolve({ Item: sessionNoTranscription });
        }
        if (command._type === 'InvokeModelCommand') {
          return Promise.resolve({
            body: new TextEncoder().encode(JSON.stringify({ content: [{ text: 'General question' }] })),
          });
        }
        return Promise.resolve({});
      });

      const { InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
      const event = eventWithBody({ action: 'next_question', sessionId: 'test-session-id' });
      const result = await handler(event);

      const bedrockCall = InvokeModelCommand.mock.calls[0][0];
      const bedrockBody = JSON.parse(bedrockCall.body);
      const prompt = bedrockBody.messages[0].content;
      expect(prompt).toContain('Data Analyst');
      expect(prompt).toContain('senior');

      const body = JSON.parse(result.body);
      expect(body.questionType).toBe('contextual');
    });

    test('uses contextual path with empty last transcription (fallback to earlier)', async () => {
      const sessionEmptyLastTranscription = {
        userId: 'test-user-id-123',
        sessionId: 'test-session-id',
        jobPosition: 'Product Manager',
        seniorityLevel: 'mid',
        questionCategory: 'general',
        questions: [
          { questionId: 'q1', questionText: 'Tell me about yourself', transcription: 'I manage products' },
          { questionId: 'q2', questionText: 'Describe your experience', transcription: '' },
        ],
      };
      mockSend.mockImplementation((command: { _type?: string }) => {
        if (command._type === 'GetCommand') {
          return Promise.resolve({ Item: sessionEmptyLastTranscription });
        }
        if (command._type === 'InvokeModelCommand') {
          return Promise.resolve({
            body: new TextEncoder().encode(JSON.stringify({ content: [{ text: 'Fallback question' }] })),
          });
        }
        return Promise.resolve({});
      });

      const { InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
      const event = eventWithBody({ action: 'next_question', sessionId: 'test-session-id' });
      const result = await handler(event);

      const bedrockCall = InvokeModelCommand.mock.calls[0][0];
      const bedrockBody = JSON.parse(bedrockCall.body);
      expect(bedrockBody.messages[0].content).toContain('I manage products');

      const body = JSON.parse(result.body);
      expect(body.questionType).toBe('contextual');
    });
  });

  // --- determineQuestionType unit tests ---
  describe('determineQuestionType', () => {
    test('returns contextual for empty array', () => {
      const { determineQuestionType } = require('../lambda/chat/index');
      expect(determineQuestionType([])).toBe('contextual');
    });

    test('returns contextual for array with 1 question', () => {
      const { determineQuestionType } = require('../lambda/chat/index');
      expect(determineQuestionType([{ questionType: 'introduction' }])).toBe('contextual');
    });

    test('returns contextual for array with 10 questions', () => {
      const { determineQuestionType } = require('../lambda/chat/index');
      const questions = Array.from({ length: 10 }, (_, i) => ({
        questionType: i === 0 ? 'introduction' : 'contextual',
        transcription: `Answer ${i}`,
      }));
      expect(determineQuestionType(questions)).toBe('contextual');
    });

    test('returns contextual for questions with legacy random type', () => {
      const { determineQuestionType } = require('../lambda/chat/index');
      expect(determineQuestionType([{ questionType: 'random' }])).toBe('contextual');
    });
  });

  // --- buildContextualPrompt unit tests ---
  describe('buildContextualPrompt', () => {
    test('includes exactly 3 Q&A pairs when session has 5 transcribed questions', () => {
      const { buildContextualPrompt } = require('../lambda/chat/index');
      const questions = Array.from({ length: 5 }, (_, i) => ({
        questionText: `Question ${i + 1}`,
        transcription: `Answer ${i + 1}`,
      }));
      const previousTexts = questions.map((q: { questionText: string }) => q.questionText);
      const prompt = buildContextualPrompt('Software Engineer', 'mid', 'general', questions, previousTexts);

      // Should contain the 3 most recent (Q3, Q4, Q5)
      expect(prompt).toContain('Answer 5');
      expect(prompt).toContain('Answer 4');
      expect(prompt).toContain('Answer 3');
      // Should NOT contain older ones
      expect(prompt).not.toContain('Answer 1');
      expect(prompt).not.toContain('Answer 2');
    });

    test('includes 1 Q&A pair when session has 1 transcribed question', () => {
      const { buildContextualPrompt } = require('../lambda/chat/index');
      const questions = [{ questionText: 'Tell me about yourself', transcription: 'I am a developer' }];
      const previousTexts = ['Tell me about yourself'];
      const prompt = buildContextualPrompt('Software Engineer', 'mid', 'general', questions, previousTexts);

      expect(prompt).toContain('I am a developer');
      expect(prompt).toContain('Tell me about yourself');
    });

    test('produces general prompt when no questions have transcriptions', () => {
      const { buildContextualPrompt } = require('../lambda/chat/index');
      const questions = [
        { questionText: 'Tell me about yourself' },
        { questionText: 'Describe your experience' },
      ];
      const previousTexts = questions.map((q: { questionText: string }) => q.questionText);
      const prompt = buildContextualPrompt('Data Analyst', 'senior', 'general', questions, previousTexts);

      expect(prompt).toContain('Data Analyst');
      expect(prompt).toContain('senior');
      // Should not contain Q&A pair markers since there are no transcriptions
      expect(prompt).not.toContain('Candidate');
    });

    test('falls back to earlier transcription when last transcription is empty', () => {
      const { buildContextualPrompt } = require('../lambda/chat/index');
      const questions = [
        { questionText: 'Tell me about yourself', transcription: 'I manage products and teams' },
        { questionText: 'Describe a challenge', transcription: '' },
      ];
      const previousTexts = questions.map((q: { questionText: string }) => q.questionText);
      const prompt = buildContextualPrompt('Product Manager', 'mid', 'general', questions, previousTexts);

      expect(prompt).toContain('I manage products and teams');
    });
  });

  // --- end_session implementation ---
  describe('end_session', () => {
    const validSummary = {
      overallScore: 78,
      criteriaScores: { grammar: 80, vocabulary: 75, relevance: 85, fillerWords: 70, coherence: 80 },
      performanceTrend: [
        { questionNumber: 1, score: 75 },
        { questionNumber: 2, score: 80 },
      ],
      topImprovementAreas: ['Filler words reduction', 'Vocabulary range', 'Grammar accuracy'],
      recommendations: ['Practice speaking without filler words', 'Read more technical articles'],
    };

    const sessionWithFeedback = {
      userId: 'test-user-id-123',
      sessionId: 'test-session-id',
      jobPosition: 'Software Engineer',
      status: 'active',
      questions: [
        {
          questionId: 'q1',
          questionText: 'Tell me about yourself',
          transcription: 'I am a developer',
          feedback: {
            scores: { grammar: 80, vocabulary: 70, relevance: 85, fillerWords: 75, coherence: 80, overall: 78 },
            grammarErrors: [],
            fillerWordsDetected: [],
            suggestions: ['Be more specific'],
            improvedAnswer: 'I am an experienced developer...',
          },
        },
        {
          questionId: 'q2',
          questionText: 'What is your greatest strength?',
          transcription: 'My strength is problem solving',
          feedback: {
            scores: { grammar: 85, vocabulary: 80, relevance: 90, fillerWords: 70, coherence: 85, overall: 82 },
            grammarErrors: [],
            fillerWordsDetected: [{ word: 'um', count: 1 }],
            suggestions: ['Provide concrete examples'],
            improvedAnswer: 'My greatest strength is problem solving...',
          },
        },
      ],
    };

    function setupEndSessionMocks(summaryOverride?: object) {
      const summary = summaryOverride ?? validSummary;
      mockSend.mockImplementation((command: { _type?: string }) => {
        if (command._type === 'GetCommand') {
          return Promise.resolve({ Item: sessionWithFeedback });
        }
        if (command._type === 'InvokeModelCommand') {
          return Promise.resolve({
            body: new TextEncoder().encode(
              JSON.stringify({ content: [{ text: JSON.stringify(summary) }] })
            ),
          });
        }
        // UpdateCommand
        return Promise.resolve({});
      });
    }

    test('fetches session from DynamoDB', async () => {
      setupEndSessionMocks();
      const { GetCommand } = require('@aws-sdk/lib-dynamodb');
      const event = eventWithBody({ action: 'end_session', sessionId: 'test-session-id' });
      await handler(event);

      expect(GetCommand).toHaveBeenCalledWith({
        TableName: 'test-sessions-table',
        Key: { userId: 'test-user-id-123', sessionId: 'test-session-id' },
      });
    });

    test('sends feedback data to Bedrock for summary generation', async () => {
      setupEndSessionMocks();
      const { InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
      const event = eventWithBody({ action: 'end_session', sessionId: 'test-session-id' });
      await handler(event);

      expect(InvokeModelCommand).toHaveBeenCalledTimes(1);
      const bedrockCall = InvokeModelCommand.mock.calls[0][0];
      const body = JSON.parse(bedrockCall.body);
      expect(body.messages[0].content).toContain('Software Engineer');
      expect(body.system).toContain('overallScore');
      expect(body.system).toContain('topImprovementAreas');
    });

    test('updates session status to completed with summaryReport', async () => {
      setupEndSessionMocks();
      const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');
      const event = eventWithBody({ action: 'end_session', sessionId: 'test-session-id' });
      await handler(event);

      expect(UpdateCommand).toHaveBeenCalledTimes(1);
      const updateCall = UpdateCommand.mock.calls[0][0];
      expect(updateCall.TableName).toBe('test-sessions-table');
      expect(updateCall.Key).toEqual({ userId: 'test-user-id-123', sessionId: 'test-session-id' });
      expect(updateCall.ExpressionAttributeValues[':status']).toBe('completed');
      expect(updateCall.ExpressionAttributeValues[':summaryReport']).toEqual(validSummary);
      expect(updateCall.ExpressionAttributeValues[':updatedAt']).toBeDefined();
    });

    test('returns summary type with summaryReport in response', async () => {
      setupEndSessionMocks();
      const event = eventWithBody({ action: 'end_session', sessionId: 'test-session-id' });
      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.type).toBe('summary');
      expect(body.sessionId).toBe('test-session-id');
      expect(body.summaryReport).toBeDefined();
      expect(body.summaryReport.overallScore).toBe(78);
      expect(body.summaryReport.criteriaScores.grammar).toBe(80);
      expect(body.summaryReport.topImprovementAreas).toHaveLength(3);
      expect(body.summaryReport.recommendations.length).toBeGreaterThan(0);
      expect(body.summaryReport.performanceTrend).toHaveLength(2);
    });

    test('content includes overall score and improvement areas', async () => {
      setupEndSessionMocks();
      const event = eventWithBody({ action: 'end_session', sessionId: 'test-session-id' });
      const result = await handler(event);
      const body = JSON.parse(result.body);
      expect(body.content).toContain('78/100');
      expect(body.content).toContain('Filler words reduction');
    });

    test('returns 500 when session not found', async () => {
      mockSend.mockImplementation((command: { _type?: string }) => {
        if (command._type === 'GetCommand') {
          return Promise.resolve({ Item: undefined });
        }
        return Promise.resolve({});
      });

      const event = eventWithBody({ action: 'end_session', sessionId: 'nonexistent' });
      const result = await handler(event);
      expect(result.statusCode).toBe(500);
    });

    test('returns 500 when Bedrock fails during summary generation', async () => {
      mockSend.mockImplementation((command: { _type?: string }) => {
        if (command._type === 'GetCommand') {
          return Promise.resolve({ Item: sessionWithFeedback });
        }
        if (command._type === 'InvokeModelCommand') {
          return Promise.reject(new Error('Bedrock timeout'));
        }
        return Promise.resolve({});
      });

      const event = eventWithBody({ action: 'end_session', sessionId: 'test-session-id' });
      const result = await handler(event);
      expect(result.statusCode).toBe(500);
    });

    test('handles Bedrock response with extra text around JSON', async () => {
      mockSend.mockImplementation((command: { _type?: string }) => {
        if (command._type === 'GetCommand') {
          return Promise.resolve({ Item: sessionWithFeedback });
        }
        if (command._type === 'InvokeModelCommand') {
          const wrappedJson = `Here is the summary:\n${JSON.stringify(validSummary)}\nDone.`;
          return Promise.resolve({
            body: new TextEncoder().encode(
              JSON.stringify({ content: [{ text: wrappedJson }] })
            ),
          });
        }
        return Promise.resolve({});
      });

      const event = eventWithBody({ action: 'end_session', sessionId: 'test-session-id' });
      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.summaryReport.overallScore).toBe(78);
    });
  });

  // --- grammar_quiz implementation ---
  describe('grammar_quiz', () => {
    const validQuiz = {
      question: 'Choose the correct form of the verb: She ___ to the store every day.',
      options: ['go', 'goes', 'going', 'gone'],
      correctAnswer: 'goes',
    };

    function setupGrammarQuizMocks(quizOverride?: object) {
      const quiz = quizOverride ?? validQuiz;
      mockSend.mockImplementation((command: { _type?: string }) => {
        if (command._type === 'InvokeModelCommand') {
          return Promise.resolve({
            body: new TextEncoder().encode(
              JSON.stringify({ content: [{ text: JSON.stringify(quiz) }] })
            ),
          });
        }
        return Promise.resolve({});
      });
    }

    test('calls Bedrock with grammar topic in prompt', async () => {
      setupGrammarQuizMocks();
      const { InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
      const event = eventWithBody({ action: 'grammar_quiz', grammarTopic: 'Tenses' });
      await handler(event);

      expect(InvokeModelCommand).toHaveBeenCalledTimes(1);
      const bedrockCall = InvokeModelCommand.mock.calls[0][0];
      const body = JSON.parse(bedrockCall.body);
      expect(body.messages[0].content).toContain('Tenses');
    });

    test('saves grammar session to DynamoDB with correct fields', async () => {
      setupGrammarQuizMocks();
      const { PutCommand } = require('@aws-sdk/lib-dynamodb');
      const event = eventWithBody({ action: 'grammar_quiz', grammarTopic: 'Articles' });
      await handler(event);

      expect(PutCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          TableName: 'test-sessions-table',
          Item: expect.objectContaining({
            userId: 'test-user-id-123',
            type: 'grammar',
            status: 'active',
            grammarTopic: 'Articles',
            quizResults: [],
          }),
        })
      );
    });

    test('saves currentQuiz with quizData in DynamoDB', async () => {
      setupGrammarQuizMocks();
      const { PutCommand } = require('@aws-sdk/lib-dynamodb');
      const event = eventWithBody({ action: 'grammar_quiz', grammarTopic: 'Tenses' });
      await handler(event);

      const putCall = PutCommand.mock.calls[0][0];
      expect(putCall.Item.currentQuiz).toBeDefined();
      expect(putCall.Item.currentQuiz.question).toBe(validQuiz.question);
      expect(putCall.Item.currentQuiz.options).toHaveLength(4);
      expect(putCall.Item.currentQuiz.correctAnswer).toBe('goes');
      expect(putCall.Item.currentQuiz.questionId).toBeDefined();
    });

    test('returns quizData in response body', async () => {
      setupGrammarQuizMocks();
      const event = eventWithBody({ action: 'grammar_quiz', grammarTopic: 'Tenses' });
      const result = await handler(event);
      const body = JSON.parse(result.body);

      expect(body.type).toBe('quiz');
      expect(body.quizData).toBeDefined();
      expect(body.quizData.question).toBe(validQuiz.question);
      expect(body.quizData.options).toEqual(validQuiz.options);
      expect(body.quizData.correctAnswer).toBe('goes');
      expect(body.quizData.questionId).toBeDefined();
    });

    test('returns valid UUID sessionId', async () => {
      setupGrammarQuizMocks();
      const event = eventWithBody({ action: 'grammar_quiz', grammarTopic: 'Tenses' });
      const result = await handler(event);
      const body = JSON.parse(result.body);

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(body.sessionId).toMatch(uuidRegex);
    });

    test('returns 500 when Bedrock fails', async () => {
      mockSend.mockImplementation((command: { _type?: string }) => {
        if (command._type === 'InvokeModelCommand') {
          return Promise.reject(new Error('Bedrock error'));
        }
        return Promise.resolve({});
      });

      const event = eventWithBody({ action: 'grammar_quiz', grammarTopic: 'Tenses' });
      const result = await handler(event);
      expect(result.statusCode).toBe(500);
    });

    test('handles Bedrock response with extra text around JSON', async () => {
      mockSend.mockImplementation((command: { _type?: string }) => {
        if (command._type === 'InvokeModelCommand') {
          const wrappedJson = `Here is the quiz:\n${JSON.stringify(validQuiz)}\nEnd.`;
          return Promise.resolve({
            body: new TextEncoder().encode(
              JSON.stringify({ content: [{ text: wrappedJson }] })
            ),
          });
        }
        return Promise.resolve({});
      });

      const event = eventWithBody({ action: 'grammar_quiz', grammarTopic: 'Tenses' });
      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.quizData.correctAnswer).toBe('goes');
    });
  });

  // --- grammar_explain implementation ---
  describe('grammar_explain', () => {
    const currentQuiz = {
      questionId: 'quiz-q1',
      question: 'She ___ to the store every day.',
      options: ['go', 'goes', 'going', 'gone'],
      correctAnswer: 'goes',
    };

    function setupGrammarExplainMocks(explanationText = 'The correct answer is "goes" because with third person singular subjects, we use the -s form of the verb in present simple tense.') {
      mockSend.mockImplementation((command: { _type?: string }) => {
        if (command._type === 'GetCommand') {
          return Promise.resolve({
            Item: {
              userId: 'test-user-id-123',
              sessionId: 'grammar-session-id',
              type: 'grammar',
              grammarTopic: 'Tenses',
              currentQuiz,
              quizResults: [],
            },
          });
        }
        if (command._type === 'InvokeModelCommand') {
          return Promise.resolve({
            body: new TextEncoder().encode(
              JSON.stringify({ content: [{ text: explanationText }] })
            ),
          });
        }
        return Promise.resolve({});
      });
    }

    test('fetches session from DynamoDB', async () => {
      setupGrammarExplainMocks();
      const { GetCommand } = require('@aws-sdk/lib-dynamodb');
      const event = eventWithBody({ action: 'grammar_explain', sessionId: 'grammar-session-id', selectedAnswer: 'goes' });
      await handler(event);

      expect(GetCommand).toHaveBeenCalledWith({
        TableName: 'test-sessions-table',
        Key: { userId: 'test-user-id-123', sessionId: 'grammar-session-id' },
      });
    });

    test('calls Bedrock with question and answer context', async () => {
      setupGrammarExplainMocks();
      const { InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
      const event = eventWithBody({ action: 'grammar_explain', sessionId: 'grammar-session-id', selectedAnswer: 'go' });
      await handler(event);

      const bedrockCall = InvokeModelCommand.mock.calls[0][0];
      const body = JSON.parse(bedrockCall.body);
      expect(body.messages[0].content).toContain('goes');
      expect(body.messages[0].content).toContain('go');
      expect(body.messages[0].content).toContain('INCORRECTLY');
    });

    test('sends CORRECTLY when answer matches correctAnswer', async () => {
      setupGrammarExplainMocks();
      const { InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
      const event = eventWithBody({ action: 'grammar_explain', sessionId: 'grammar-session-id', selectedAnswer: 'goes' });
      await handler(event);

      const bedrockCall = InvokeModelCommand.mock.calls[0][0];
      const body = JSON.parse(bedrockCall.body);
      expect(body.messages[0].content).toContain('CORRECTLY');
    });

    test('saves quiz result to DynamoDB with list_append', async () => {
      setupGrammarExplainMocks();
      const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');
      const event = eventWithBody({ action: 'grammar_explain', sessionId: 'grammar-session-id', selectedAnswer: 'goes' });
      await handler(event);

      expect(UpdateCommand).toHaveBeenCalledTimes(1);
      const updateCall = UpdateCommand.mock.calls[0][0];
      expect(updateCall.TableName).toBe('test-sessions-table');
      expect(updateCall.UpdateExpression).toContain('list_append');
      const newResult = updateCall.ExpressionAttributeValues[':newResult'];
      expect(newResult).toHaveLength(1);
      expect(newResult[0].questionId).toBe('quiz-q1');
      expect(newResult[0].userAnswer).toBe('goes');
      expect(newResult[0].isCorrect).toBe(true);
      expect(newResult[0].correctAnswer).toBe('goes');
      expect(newResult[0].explanation).toBeDefined();
    });

    test('marks incorrect answer as isCorrect=false', async () => {
      setupGrammarExplainMocks();
      const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');
      const event = eventWithBody({ action: 'grammar_explain', sessionId: 'grammar-session-id', selectedAnswer: 'go' });
      await handler(event);

      const updateCall = UpdateCommand.mock.calls[0][0];
      const newResult = updateCall.ExpressionAttributeValues[':newResult'];
      expect(newResult[0].isCorrect).toBe(false);
      expect(newResult[0].userAnswer).toBe('go');
    });

    test('returns explanation content', async () => {
      setupGrammarExplainMocks();
      const event = eventWithBody({ action: 'grammar_explain', sessionId: 'grammar-session-id', selectedAnswer: 'goes' });
      const result = await handler(event);
      const body = JSON.parse(result.body);

      expect(body.type).toBe('explanation');
      expect(body.content).toContain('goes');
      expect(body.sessionId).toBe('grammar-session-id');
    });

    test('returns 500 when session not found', async () => {
      mockSend.mockImplementation((command: { _type?: string }) => {
        if (command._type === 'GetCommand') {
          return Promise.resolve({ Item: undefined });
        }
        return Promise.resolve({});
      });

      const event = eventWithBody({ action: 'grammar_explain', sessionId: 'nonexistent', selectedAnswer: 'A' });
      const result = await handler(event);
      expect(result.statusCode).toBe(500);
    });

    test('returns 500 when Bedrock fails', async () => {
      mockSend.mockImplementation((command: { _type?: string }) => {
        if (command._type === 'GetCommand') {
          return Promise.resolve({
            Item: {
              userId: 'test-user-id-123',
              sessionId: 'sid',
              currentQuiz,
              quizResults: [],
            },
          });
        }
        if (command._type === 'InvokeModelCommand') {
          return Promise.reject(new Error('Bedrock error'));
        }
        return Promise.resolve({});
      });

      const event = eventWithBody({ action: 'grammar_explain', sessionId: 'sid', selectedAnswer: 'goes' });
      const result = await handler(event);
      expect(result.statusCode).toBe(500);
    });
  });

  // --- writing_prompt implementation ---
  describe('writing_prompt', () => {
    function setupWritingPromptMocks(promptText = 'Write a professional email to your manager requesting a day off next Friday.') {
      mockSend.mockImplementation((command: { _type?: string }) => {
        if (command._type === 'InvokeModelCommand') {
          return Promise.resolve({
            body: new TextEncoder().encode(
              JSON.stringify({ content: [{ text: promptText }] })
            ),
          });
        }
        return Promise.resolve({});
      });
    }

    test('calls Bedrock with writing type in prompt', async () => {
      setupWritingPromptMocks();
      const { InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
      const event = eventWithBody({ action: 'writing_prompt', writingType: 'email' });
      await handler(event);

      expect(InvokeModelCommand).toHaveBeenCalledTimes(1);
      const bedrockCall = InvokeModelCommand.mock.calls[0][0];
      const body = JSON.parse(bedrockCall.body);
      expect(body.messages[0].content).toContain('email');
    });

    test('saves writing session to DynamoDB with correct fields', async () => {
      setupWritingPromptMocks();
      const { PutCommand } = require('@aws-sdk/lib-dynamodb');
      const event = eventWithBody({ action: 'writing_prompt', writingType: 'essay' });
      await handler(event);

      expect(PutCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          TableName: 'test-sessions-table',
          Item: expect.objectContaining({
            userId: 'test-user-id-123',
            type: 'writing',
            status: 'active',
            writingType: 'essay',
            writingPrompt: expect.any(String),
          }),
        })
      );
    });

    test('returns valid UUID sessionId', async () => {
      setupWritingPromptMocks();
      const event = eventWithBody({ action: 'writing_prompt', writingType: 'essay' });
      const result = await handler(event);
      const body = JSON.parse(result.body);

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(body.sessionId).toMatch(uuidRegex);
    });

    test('returns writing prompt content from Bedrock', async () => {
      setupWritingPromptMocks('Write an essay about leadership qualities.');
      const event = eventWithBody({ action: 'writing_prompt', writingType: 'essay' });
      const result = await handler(event);
      const body = JSON.parse(result.body);

      expect(body.type).toBe('writing_prompt');
      expect(body.content).toBe('Write an essay about leadership qualities.');
    });

    test('saves ISO 8601 timestamps', async () => {
      setupWritingPromptMocks();
      const { PutCommand } = require('@aws-sdk/lib-dynamodb');
      const event = eventWithBody({ action: 'writing_prompt', writingType: 'email' });
      await handler(event);

      const putCall = PutCommand.mock.calls[0][0];
      expect(new Date(putCall.Item.createdAt).toISOString()).toBe(putCall.Item.createdAt);
      expect(new Date(putCall.Item.updatedAt).toISOString()).toBe(putCall.Item.updatedAt);
    });

    test('returns 500 when Bedrock fails', async () => {
      mockSend.mockImplementation((command: { _type?: string }) => {
        if (command._type === 'InvokeModelCommand') {
          return Promise.reject(new Error('Bedrock error'));
        }
        return Promise.resolve({});
      });

      const event = eventWithBody({ action: 'writing_prompt', writingType: 'essay' });
      const result = await handler(event);
      expect(result.statusCode).toBe(500);
    });
  });

  // --- writing_review implementation ---
  describe('writing_review', () => {
    const validReview = {
      overallScore: 75,
      aspects: {
        grammarCorrectness: {
          score: 70,
          errors: [{ text: 'I has', correction: 'I have', explanation: 'Subject-verb agreement' }],
        },
        structure: {
          score: 80,
          feedback: 'Good paragraph organization with clear introduction and conclusion.',
        },
        vocabulary: {
          score: 75,
          suggestions: ['Use more formal vocabulary', 'Avoid repetitive word choices'],
        },
      },
    };

    const writingSession = {
      userId: 'test-user-id-123',
      sessionId: 'writing-session-id',
      type: 'writing',
      status: 'active',
      writingType: 'essay',
      writingPrompt: 'Write about your career goals.',
    };

    function setupWritingReviewMocks(reviewOverride?: object) {
      const review = reviewOverride ?? validReview;
      mockSend.mockImplementation((command: { _type?: string }) => {
        if (command._type === 'GetCommand') {
          return Promise.resolve({ Item: writingSession });
        }
        if (command._type === 'InvokeModelCommand') {
          return Promise.resolve({
            body: new TextEncoder().encode(
              JSON.stringify({ content: [{ text: JSON.stringify(review) }] })
            ),
          });
        }
        return Promise.resolve({});
      });
    }

    test('fetches session from DynamoDB', async () => {
      setupWritingReviewMocks();
      const { GetCommand } = require('@aws-sdk/lib-dynamodb');
      const event = eventWithBody({ action: 'writing_review', sessionId: 'writing-session-id', writingContent: 'My essay text' });
      await handler(event);

      expect(GetCommand).toHaveBeenCalledWith({
        TableName: 'test-sessions-table',
        Key: { userId: 'test-user-id-123', sessionId: 'writing-session-id' },
      });
    });

    test('calls Bedrock with writing content and prompt context', async () => {
      setupWritingReviewMocks();
      const { InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
      const event = eventWithBody({ action: 'writing_review', sessionId: 'writing-session-id', writingContent: 'My career goal is to become a leader.' });
      await handler(event);

      expect(InvokeModelCommand).toHaveBeenCalledTimes(1);
      const bedrockCall = InvokeModelCommand.mock.calls[0][0];
      const body = JSON.parse(bedrockCall.body);
      expect(body.messages[0].content).toContain('My career goal is to become a leader.');
      expect(body.messages[0].content).toContain('Write about your career goals.');
      expect(body.system).toContain('overallScore');
    });

    test('updates session in DynamoDB with writing and review', async () => {
      setupWritingReviewMocks();
      const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');
      const event = eventWithBody({ action: 'writing_review', sessionId: 'writing-session-id', writingContent: 'My essay text' });
      await handler(event);

      expect(UpdateCommand).toHaveBeenCalledTimes(1);
      const updateCall = UpdateCommand.mock.calls[0][0];
      expect(updateCall.TableName).toBe('test-sessions-table');
      expect(updateCall.Key).toEqual({ userId: 'test-user-id-123', sessionId: 'writing-session-id' });
      expect(updateCall.ExpressionAttributeValues[':userWriting']).toBe('My essay text');
      expect(updateCall.ExpressionAttributeValues[':writingReview']).toEqual(validReview);
      expect(updateCall.ExpressionAttributeValues[':status']).toBe('completed');
      expect(updateCall.ExpressionAttributeValues[':updatedAt']).toBeDefined();
    });

    test('returns writingReview in response body', async () => {
      setupWritingReviewMocks();
      const event = eventWithBody({ action: 'writing_review', sessionId: 'writing-session-id', writingContent: 'My essay' });
      const result = await handler(event);
      const body = JSON.parse(result.body);

      expect(body.type).toBe('writing_review');
      expect(body.writingReview).toBeDefined();
      expect(body.writingReview.overallScore).toBe(75);
      expect(body.writingReview.aspects.grammarCorrectness.score).toBe(70);
      expect(body.writingReview.aspects.grammarCorrectness.errors).toHaveLength(1);
      expect(body.writingReview.aspects.structure.score).toBe(80);
      expect(body.writingReview.aspects.vocabulary.score).toBe(75);
      expect(body.writingReview.aspects.vocabulary.suggestions).toHaveLength(2);
    });

    test('returns content with score summary', async () => {
      setupWritingReviewMocks();
      const event = eventWithBody({ action: 'writing_review', sessionId: 'writing-session-id', writingContent: 'My essay' });
      const result = await handler(event);
      const body = JSON.parse(result.body);

      expect(body.content).toContain('75/100');
      expect(body.content).toContain('Grammar');
      expect(body.content).toContain('Structure');
      expect(body.content).toContain('Vocabulary');
    });

    test('returns 500 when session not found', async () => {
      mockSend.mockImplementation((command: { _type?: string }) => {
        if (command._type === 'GetCommand') {
          return Promise.resolve({ Item: undefined });
        }
        return Promise.resolve({});
      });

      const event = eventWithBody({ action: 'writing_review', sessionId: 'nonexistent', writingContent: 'My essay' });
      const result = await handler(event);
      expect(result.statusCode).toBe(500);
    });

    test('returns 500 when Bedrock fails', async () => {
      mockSend.mockImplementation((command: { _type?: string }) => {
        if (command._type === 'GetCommand') {
          return Promise.resolve({ Item: writingSession });
        }
        if (command._type === 'InvokeModelCommand') {
          return Promise.reject(new Error('Bedrock error'));
        }
        return Promise.resolve({});
      });

      const event = eventWithBody({ action: 'writing_review', sessionId: 'writing-session-id', writingContent: 'My essay' });
      const result = await handler(event);
      expect(result.statusCode).toBe(500);
    });

    test('handles Bedrock response with extra text around JSON', async () => {
      mockSend.mockImplementation((command: { _type?: string }) => {
        if (command._type === 'GetCommand') {
          return Promise.resolve({ Item: writingSession });
        }
        if (command._type === 'InvokeModelCommand') {
          const wrappedJson = `Here is the review:\n${JSON.stringify(validReview)}\nDone.`;
          return Promise.resolve({
            body: new TextEncoder().encode(
              JSON.stringify({ content: [{ text: wrappedJson }] })
            ),
          });
        }
        return Promise.resolve({});
      });

      const event = eventWithBody({ action: 'writing_review', sessionId: 'writing-session-id', writingContent: 'My essay' });
      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.writingReview.overallScore).toBe(75);
    });
  });
});

// --- validateRequest unit tests ---
describe('validateRequest', () => {
  test('returns valid for correct start_session request', () => {
    const result = validateRequest({ action: 'start_session', jobPosition: 'Engineer' });
    expect(result.valid).toBe(true);
  });

  test('returns invalid when action is not a string', () => {
    const result = validateRequest({ action: 123 });
    expect(result.valid).toBe(false);
  });

  test('returns invalid when action is null', () => {
    const result = validateRequest({ action: null });
    expect(result.valid).toBe(false);
  });

  test('VALID_ACTIONS contains all 8 actions', () => {
    expect(VALID_ACTIONS).toHaveLength(8);
  });

  test('REQUIRED_FIELDS has entry for every valid action', () => {
    for (const action of VALID_ACTIONS) {
      expect(REQUIRED_FIELDS).toHaveProperty(action);
    }
  });
});

// --- Authorization: session ownership checks ---
describe('Authorization - Session Ownership', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SESSIONS_TABLE_NAME = 'test-sessions-table';
  });

  test('analyze_answer returns 403 when session belongs to another user', async () => {
    mockSend.mockImplementation((command: { _type?: string }) => {
      if (command._type === 'GetCommand') {
        return Promise.resolve({
          Item: {
            userId: 'other-user-id',
            sessionId: 'sid',
            questions: [{ questionId: 'q1', questionText: 'Tell me about yourself' }],
          },
        });
      }
      return Promise.resolve({});
    });
    const event = eventWithBody(
      { action: 'analyze_answer', sessionId: 'sid', transcription: 'My answer' },
      'test-user-id-123'
    );
    const result = await handler(event);
    expect(result.statusCode).toBe(403);
    const body = JSON.parse(result.body);
    expect(body.error).toBe('Forbidden');
  });

  test('next_question returns 403 when session belongs to another user', async () => {
    mockSend.mockImplementation((command: { _type?: string }) => {
      if (command._type === 'GetCommand') {
        return Promise.resolve({
          Item: {
            userId: 'other-user-id',
            sessionId: 'sid',
            jobPosition: 'Software Engineer',
            questions: [{ questionId: 'q1', questionText: 'First question' }],
          },
        });
      }
      return Promise.resolve({});
    });
    const event = eventWithBody(
      { action: 'next_question', sessionId: 'sid' },
      'test-user-id-123'
    );
    const result = await handler(event);
    expect(result.statusCode).toBe(403);
    const body = JSON.parse(result.body);
    expect(body.error).toBe('Forbidden');
  });

  test('end_session returns 403 when session belongs to another user', async () => {
    mockSend.mockImplementation((command: { _type?: string }) => {
      if (command._type === 'GetCommand') {
        return Promise.resolve({
          Item: {
            userId: 'other-user-id',
            sessionId: 'sid',
            jobPosition: 'Software Engineer',
            questions: [],
          },
        });
      }
      return Promise.resolve({});
    });
    const event = eventWithBody(
      { action: 'end_session', sessionId: 'sid' },
      'test-user-id-123'
    );
    const result = await handler(event);
    expect(result.statusCode).toBe(403);
    const body = JSON.parse(result.body);
    expect(body.error).toBe('Forbidden');
  });

  test('grammar_explain returns 403 when session belongs to another user', async () => {
    mockSend.mockImplementation((command: { _type?: string }) => {
      if (command._type === 'GetCommand') {
        return Promise.resolve({
          Item: {
            userId: 'other-user-id',
            sessionId: 'sid',
            currentQuiz: {
              questionId: 'q1',
              question: 'Choose the correct form.',
              options: ['A', 'B', 'C', 'D'],
              correctAnswer: 'B',
            },
            quizResults: [],
          },
        });
      }
      return Promise.resolve({});
    });
    const event = eventWithBody(
      { action: 'grammar_explain', sessionId: 'sid', selectedAnswer: 'B' },
      'test-user-id-123'
    );
    const result = await handler(event);
    expect(result.statusCode).toBe(403);
    const body = JSON.parse(result.body);
    expect(body.error).toBe('Forbidden');
  });

  test('writing_review returns 403 when session belongs to another user', async () => {
    mockSend.mockImplementation((command: { _type?: string }) => {
      if (command._type === 'GetCommand') {
        return Promise.resolve({
          Item: {
            userId: 'other-user-id',
            sessionId: 'sid',
            writingType: 'essay',
            writingPrompt: 'Write about goals.',
          },
        });
      }
      return Promise.resolve({});
    });
    const event = eventWithBody(
      { action: 'writing_review', sessionId: 'sid', writingContent: 'My essay' },
      'test-user-id-123'
    );
    const result = await handler(event);
    expect(result.statusCode).toBe(403);
    const body = JSON.parse(result.body);
    expect(body.error).toBe('Forbidden');
  });

  test('analyze_answer succeeds when session userId matches token userId', async () => {
    const feedbackJson = {
      scores: { grammar: 80, vocabulary: 75, relevance: 90, fillerWords: 85, coherence: 70, overall: 80 },
      grammarErrors: [],
      fillerWordsDetected: [],
      suggestions: ['Keep practicing'],
      improvedAnswer: 'Better answer.',
    };
    mockSend.mockImplementation((command: { _type?: string }) => {
      if (command._type === 'GetCommand') {
        return Promise.resolve({
          Item: {
            userId: 'test-user-id-123',
            sessionId: 'sid',
            questions: [{ questionId: 'q1', questionText: 'Tell me about yourself' }],
          },
        });
      }
      if (command._type === 'InvokeModelCommand') {
        return Promise.resolve({
          body: new TextEncoder().encode(
            JSON.stringify({ content: [{ text: JSON.stringify(feedbackJson) }] })
          ),
        });
      }
      return Promise.resolve({});
    });
    const event = eventWithBody(
      { action: 'analyze_answer', sessionId: 'sid', transcription: 'My answer' },
      'test-user-id-123'
    );
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
  });
});
