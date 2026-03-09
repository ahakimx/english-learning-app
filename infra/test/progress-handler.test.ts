import { APIGatewayProxyEvent } from 'aws-lambda';

// Mock AWS SDK clients before importing handler
const mockDynamoSend = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({})),
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: jest.fn(() => ({ send: mockDynamoSend })),
  },
  QueryCommand: jest.fn((params: unknown) => ({ _type: 'QueryCommand', params })),
  PutCommand: jest.fn((params: unknown) => ({ _type: 'PutCommand', params })),
  UpdateCommand: jest.fn((params: unknown) => ({ _type: 'UpdateCommand', params })),
  GetCommand: jest.fn((params: unknown) => ({ _type: 'GetCommand', params })),
}));

import { handler } from '../lambda/progress/index';

function createEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    body: null,
    headers: {},
    multiValueHeaders: {},
    isBase64Encoded: false,
    path: '/progress',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '/progress',
    requestContext: {
      accountId: '123456789',
      apiId: 'test-api',
      authorizer: {
        claims: { sub: 'test-user-id-123' },
      },
      protocol: 'HTTP/1.1',
      httpMethod: 'GET',
      identity: {} as any,
      path: '/progress',
      stage: 'prod',
      requestId: 'test-request-id',
      requestTimeEpoch: Date.now(),
      resourceId: 'test',
      resourcePath: '/progress',
    },
    ...overrides,
  };
}

function postEvent(body: Record<string, unknown>, userId = 'test-user-id-123'): APIGatewayProxyEvent {
  return createEvent({
    httpMethod: 'POST',
    body: JSON.stringify(body),
    requestContext: {
      ...createEvent().requestContext,
      httpMethod: 'POST',
      authorizer: { claims: { sub: userId } },
    },
  });
}

function getEvent(userId = 'test-user-id-123'): APIGatewayProxyEvent {
  return createEvent({
    httpMethod: 'GET',
    requestContext: {
      ...createEvent().requestContext,
      authorizer: { claims: { sub: userId } },
    },
  });
}


describe('Lambda /progress handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Authentication', () => {
    it('should return 401 when no userId in token', async () => {
      const event = createEvent({
        requestContext: {
          ...createEvent().requestContext,
          authorizer: {},
        },
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Unauthorized');
    });

    it('should return 401 when authorizer claims are missing', async () => {
      const event = createEvent({
        requestContext: {
          ...createEvent().requestContext,
          authorizer: null,
        },
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(401);
    });
  });

  describe('CORS preflight', () => {
    it('should return 200 for OPTIONS request', async () => {
      const event = createEvent({ httpMethod: 'OPTIONS' });
      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      expect(result.headers!['Access-Control-Allow-Origin']).toBe('*');
      expect(result.headers!['Access-Control-Allow-Methods']).toBe('GET,POST,OPTIONS');
    });
  });

  describe('Unsupported methods', () => {
    it('should return 400 for unsupported HTTP methods', async () => {
      const event = createEvent({ httpMethod: 'DELETE' });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('Unsupported method');
    });
  });

  describe('GET /progress', () => {
    it('should return empty progress when no data exists', async () => {
      mockDynamoSend.mockResolvedValue({ Items: [] });

      const event = getEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.speaking.totalSessions).toBe(0);
      expect(body.speaking.averageScore).toBe(0);
      expect(body.speaking.scoreHistory).toEqual([]);
      expect(body.grammar.totalQuizzes).toBe(0);
      expect(body.grammar.topicScores).toEqual({});
      expect(body.writing.totalReviews).toBe(0);
      expect(body.writing.averageScore).toBe(0);
      expect(body.writing.scoreHistory).toEqual([]);
    });

    it('should return progress data from DynamoDB', async () => {
      mockDynamoSend.mockResolvedValue({
        Items: [
          {
            userId: 'test-user-id-123',
            moduleType: 'speaking',
            totalSessions: 5,
            averageScore: 75,
            lastActivityAt: '2024-01-15T10:00:00.000Z',
            scoreHistory: [
              { date: '2024-01-15T10:00:00.000Z', score: 75, sessionId: 'sess-1' },
            ],
            speakingScores: { grammar: 80, vocabulary: 70, relevance: 75, fillerWords: 65, coherence: 85 },
          },
          {
            userId: 'test-user-id-123',
            moduleType: 'grammar',
            totalSessions: 10,
            averageScore: 85,
            lastActivityAt: '2024-01-14T10:00:00.000Z',
            topicScores: { Tenses: { totalQuestions: 20, correctAnswers: 17, accuracy: 85 } },
          },
          {
            userId: 'test-user-id-123',
            moduleType: 'writing',
            totalSessions: 3,
            averageScore: 70,
            lastActivityAt: '2024-01-13T10:00:00.000Z',
            scoreHistory: [
              { date: '2024-01-13T10:00:00.000Z', score: 70, sessionId: 'sess-w1' },
            ],
            writingScores: { grammarCorrectness: 75, structure: 65, vocabulary: 70 },
          },
        ],
      });

      const event = getEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);

      expect(body.speaking.totalSessions).toBe(5);
      expect(body.speaking.averageScore).toBe(75);
      expect(body.speaking.scoreHistory).toHaveLength(1);
      expect(body.speaking.speakingScores.grammar).toBe(80);

      expect(body.grammar.totalQuizzes).toBe(10);
      expect(body.grammar.topicScores.Tenses.accuracy).toBe(85);

      expect(body.writing.totalReviews).toBe(3);
      expect(body.writing.averageScore).toBe(70);
      expect(body.writing.writingScores.grammarCorrectness).toBe(75);
    });

    it('should include CORS headers in response', async () => {
      mockDynamoSend.mockResolvedValue({ Items: [] });

      const event = getEvent();
      const result = await handler(event);

      expect(result.headers!['Access-Control-Allow-Origin']).toBe('*');
      expect(result.headers!['Content-Type']).toBe('application/json');
    });
  });


  describe('POST /progress - Input Validation', () => {
    it('should return 400 when body is invalid JSON', async () => {
      const event = createEvent({
        httpMethod: 'POST',
        body: 'not-json',
        requestContext: {
          ...createEvent().requestContext,
          httpMethod: 'POST',
          authorizer: { claims: { sub: 'test-user-id-123' } },
        },
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('JSON');
    });

    it('should return 400 when moduleType is missing', async () => {
      const event = postEvent({ score: 80, sessionId: 'sess-1' });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('moduleType');
    });

    it('should return 400 when moduleType is invalid', async () => {
      const event = postEvent({ moduleType: 'invalid', score: 80, sessionId: 'sess-1' });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('Invalid moduleType');
    });

    it('should return 400 when score is missing', async () => {
      const event = postEvent({ moduleType: 'speaking', sessionId: 'sess-1' });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('score');
    });

    it('should return 400 when score is out of range', async () => {
      const event = postEvent({ moduleType: 'speaking', score: 150, sessionId: 'sess-1' });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('between 0 and 100');
    });

    it('should return 400 when score is negative', async () => {
      const event = postEvent({ moduleType: 'speaking', score: -5, sessionId: 'sess-1' });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
    });

    it('should return 400 when sessionId is missing', async () => {
      const event = postEvent({ moduleType: 'speaking', score: 80 });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('sessionId');
    });

    it('should return 400 when body is null/empty', async () => {
      const event = createEvent({
        httpMethod: 'POST',
        body: null,
        requestContext: {
          ...createEvent().requestContext,
          httpMethod: 'POST',
          authorizer: { claims: { sub: 'test-user-id-123' } },
        },
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(400);
    });
  });

  describe('POST /progress - User Authorization', () => {
    it('should return 403 when userId in body does not match token userId', async () => {
      // GetCommand returns no existing item (so we reach handlePost)
      mockDynamoSend.mockResolvedValue({ Item: null });

      const event = postEvent({
        userId: 'other-user-id',
        moduleType: 'speaking',
        score: 80,
        sessionId: 'sess-1',
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(403);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Forbidden');
    });

    it('should allow request when userId in body matches token userId', async () => {
      mockDynamoSend.mockResolvedValueOnce({ Item: null }); // GetCommand
      mockDynamoSend.mockResolvedValueOnce({}); // PutCommand

      const event = postEvent({
        userId: 'test-user-id-123',
        moduleType: 'speaking',
        score: 80,
        sessionId: 'sess-1',
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(200);
    });

    it('should allow request when userId is not in body (uses token only)', async () => {
      mockDynamoSend.mockResolvedValueOnce({ Item: null }); // GetCommand
      mockDynamoSend.mockResolvedValueOnce({}); // PutCommand

      const event = postEvent({
        moduleType: 'grammar',
        score: 90,
        sessionId: 'sess-2',
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(200);
    });
  });


  describe('POST /progress - Create New Progress', () => {
    it('should create new progress record when none exists', async () => {
      mockDynamoSend.mockResolvedValueOnce({ Item: null }); // GetCommand - no existing
      mockDynamoSend.mockResolvedValueOnce({}); // PutCommand

      const event = postEvent({
        moduleType: 'speaking',
        score: 85,
        sessionId: 'sess-new',
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.message).toBe('Progress updated successfully');

      // Verify PutCommand was called with correct data
      expect(mockDynamoSend).toHaveBeenCalledTimes(2);
      const putCall = mockDynamoSend.mock.calls[1][0];
      expect(putCall.params.Item.userId).toBe('test-user-id-123');
      expect(putCall.params.Item.moduleType).toBe('speaking');
      expect(putCall.params.Item.totalSessions).toBe(1);
      expect(putCall.params.Item.averageScore).toBe(85);
      expect(putCall.params.Item.scoreHistory).toHaveLength(1);
      expect(putCall.params.Item.scoreHistory[0].score).toBe(85);
      expect(putCall.params.Item.scoreHistory[0].sessionId).toBe('sess-new');
    });

    it('should include speakingScores when moduleType is speaking', async () => {
      mockDynamoSend.mockResolvedValueOnce({ Item: null });
      mockDynamoSend.mockResolvedValueOnce({});

      const speakingScores = { grammar: 80, vocabulary: 70, relevance: 75, fillerWords: 65, coherence: 85 };
      const event = postEvent({
        moduleType: 'speaking',
        score: 75,
        sessionId: 'sess-s1',
        speakingScores,
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(200);

      const putCall = mockDynamoSend.mock.calls[1][0];
      expect(putCall.params.Item.speakingScores).toEqual(speakingScores);
    });

    it('should include topicScores when moduleType is grammar', async () => {
      mockDynamoSend.mockResolvedValueOnce({ Item: null });
      mockDynamoSend.mockResolvedValueOnce({});

      const topicScores = { Tenses: { totalQuestions: 10, correctAnswers: 8, accuracy: 80 } };
      const event = postEvent({
        moduleType: 'grammar',
        score: 80,
        sessionId: 'sess-g1',
        topicScores,
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(200);

      const putCall = mockDynamoSend.mock.calls[1][0];
      expect(putCall.params.Item.topicScores).toEqual(topicScores);
    });

    it('should include writingScores when moduleType is writing', async () => {
      mockDynamoSend.mockResolvedValueOnce({ Item: null });
      mockDynamoSend.mockResolvedValueOnce({});

      const writingScores = { grammarCorrectness: 75, structure: 65, vocabulary: 70 };
      const event = postEvent({
        moduleType: 'writing',
        score: 70,
        sessionId: 'sess-w1',
        writingScores,
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(200);

      const putCall = mockDynamoSend.mock.calls[1][0];
      expect(putCall.params.Item.writingScores).toEqual(writingScores);
    });
  });

  describe('POST /progress - Update Existing Progress', () => {
    it('should update existing progress record with recalculated average', async () => {
      mockDynamoSend.mockResolvedValueOnce({
        Item: {
          userId: 'test-user-id-123',
          moduleType: 'speaking',
          totalSessions: 4,
          averageScore: 70,
          scoreHistory: [
            { date: '2024-01-01T00:00:00.000Z', score: 70, sessionId: 'old-sess' },
          ],
        },
      }); // GetCommand - existing record
      mockDynamoSend.mockResolvedValueOnce({}); // UpdateCommand

      const event = postEvent({
        moduleType: 'speaking',
        score: 90,
        sessionId: 'sess-update',
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(200);

      // Verify UpdateCommand was called
      expect(mockDynamoSend).toHaveBeenCalledTimes(2);
      const updateCall = mockDynamoSend.mock.calls[1][0];
      expect(updateCall._type).toBe('UpdateCommand');
      // New average: ((70 * 4) + 90) / 5 = 74
      expect(updateCall.params.ExpressionAttributeValues[':newTotal']).toBe(5);
      expect(updateCall.params.ExpressionAttributeValues[':newAvg']).toBe(74);
    });
  });

  describe('Error Handling', () => {
    let consoleSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('should return 500 when DynamoDB throws an error on GET', async () => {
      mockDynamoSend.mockRejectedValueOnce(new Error('DynamoDB unavailable'));

      const event = getEvent();
      const result = await handler(event);
      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Internal Server Error');
    });

    it('should return 500 when DynamoDB throws an error on POST', async () => {
      mockDynamoSend.mockRejectedValueOnce(new Error('DynamoDB unavailable'));

      const event = postEvent({
        moduleType: 'speaking',
        score: 80,
        sessionId: 'sess-err',
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(500);
    });

    it('should return valid JSON in all error responses', async () => {
      // 400 error
      const badEvent = postEvent({});
      const badResult = await handler(badEvent);
      expect(() => JSON.parse(badResult.body)).not.toThrow();
      const badBody = JSON.parse(badResult.body);
      expect(badBody).toHaveProperty('error');
      expect(badBody).toHaveProperty('message');

      // 500 error
      mockDynamoSend.mockRejectedValueOnce(new Error('fail'));
      const errorEvent = getEvent();
      const errorResult = await handler(errorEvent);
      expect(() => JSON.parse(errorResult.body)).not.toThrow();
    });
  });

  describe('Response Format', () => {
    it('should always return JSON-parseable body for GET', async () => {
      mockDynamoSend.mockResolvedValue({ Items: [] });
      const event = getEvent();
      const result = await handler(event);
      expect(() => JSON.parse(result.body)).not.toThrow();
    });

    it('should always return JSON-parseable body for POST', async () => {
      mockDynamoSend.mockResolvedValueOnce({ Item: null });
      mockDynamoSend.mockResolvedValueOnce({});

      const event = postEvent({ moduleType: 'speaking', score: 80, sessionId: 'sess-1' });
      const result = await handler(event);
      expect(() => JSON.parse(result.body)).not.toThrow();
    });
  });
});
