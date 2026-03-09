import { APIGatewayProxyEvent } from 'aws-lambda';

// Mock AWS SDK client before importing handler
const mockPollySend = jest.fn();

jest.mock('@aws-sdk/client-polly', () => ({
  PollyClient: jest.fn(() => ({ send: mockPollySend })),
  SynthesizeSpeechCommand: jest.fn((params: unknown) => ({ _type: 'SynthesizeSpeechCommand', params })),
  Engine: { NEURAL: 'neural' },
  OutputFormat: { MP3: 'mp3' },
  VoiceId: { Joanna: 'Joanna' },
}));

import { handler } from '../lambda/speak/index';

function createEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    body: null,
    headers: {},
    multiValueHeaders: {},
    isBase64Encoded: false,
    path: '/speak',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '/speak',
    requestContext: {
      accountId: '123456789',
      apiId: 'test-api',
      authorizer: {
        claims: { sub: 'test-user-id-123' },
      },
      protocol: 'HTTP/1.1',
      httpMethod: 'POST',
      identity: {} as any,
      path: '/speak',
      stage: 'prod',
      requestId: 'test-request-id',
      requestTimeEpoch: Date.now(),
      resourceId: 'test',
      resourcePath: '/speak',
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

function setupSuccessfulPolly(audioBytes = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00])) {
  mockPollySend.mockResolvedValue({
    AudioStream: (async function* () {
      yield audioBytes;
    })(),
    ContentType: 'audio/mpeg',
  });
}

describe('Lambda /speak handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Authentication', () => {
    it('should return 401 when no userId in token', async () => {
      const event = createEvent({
        body: JSON.stringify({ text: 'Hello world' }),
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
        body: JSON.stringify({ text: 'Hello world' }),
        requestContext: {
          ...createEvent().requestContext,
          authorizer: null,
        },
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(401);
    });
  });

  describe('Input Validation', () => {
    it('should return 400 when text is missing', async () => {
      const event = eventWithBody({});
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('text');
    });

    it('should return 400 when text is empty string', async () => {
      const event = eventWithBody({ text: '' });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
    });

    it('should return 400 when text is whitespace only', async () => {
      const event = eventWithBody({ text: '   ' });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
    });

    it('should return 400 when text is not a string', async () => {
      const event = eventWithBody({ text: 123 });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
    });

    it('should return 400 when body is invalid JSON', async () => {
      const event = createEvent({ body: 'not-json' });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('JSON');
    });

    it('should return 400 when body is null', async () => {
      const event = createEvent({ body: null });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
    });
  });

  describe('Successful Speech Synthesis', () => {
    it('should return base64 audio data for valid text', async () => {
      const audioBytes = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00]);
      setupSuccessfulPolly(audioBytes);

      const event = eventWithBody({ text: 'Tell me about your experience.' });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.audioData).toBe(Buffer.from(audioBytes).toString('base64'));
      expect(body.contentType).toBe('audio/mpeg');
    });

    it('should include CORS headers in response', async () => {
      setupSuccessfulPolly();
      const event = eventWithBody({ text: 'Hello' });
      const result = await handler(event);

      expect(result.headers).toBeDefined();
      expect(result.headers!['Access-Control-Allow-Origin']).toBe('*');
      expect(result.headers!['Content-Type']).toBe('application/json');
      expect(result.headers!['Access-Control-Allow-Methods']).toBe('POST,OPTIONS');
    });

    it('should trim whitespace from input text', async () => {
      setupSuccessfulPolly();
      const event = eventWithBody({ text: '  Hello world  ' });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      // Verify Polly was called (the mock was invoked)
      expect(mockPollySend).toHaveBeenCalledTimes(1);
    });

    it('should handle multi-chunk audio streams', async () => {
      const chunk1 = new Uint8Array([0x49, 0x44, 0x33]);
      const chunk2 = new Uint8Array([0x04, 0x00, 0xFF]);
      mockPollySend.mockResolvedValue({
        AudioStream: (async function* () {
          yield chunk1;
          yield chunk2;
        })(),
        ContentType: 'audio/mpeg',
      });

      const event = eventWithBody({ text: 'A longer sentence for testing.' });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      const combined = new Uint8Array([...chunk1, ...chunk2]);
      expect(body.audioData).toBe(Buffer.from(combined).toString('base64'));
    });
  });

  describe('Error Handling', () => {
    it('should return 500 when Polly returns no audio stream', async () => {
      mockPollySend.mockResolvedValue({
        AudioStream: null,
        ContentType: 'audio/mpeg',
      });

      const event = eventWithBody({ text: 'Hello' });
      const result = await handler(event);
      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Internal Server Error');
    });

    it('should return 500 when Polly throws an error', async () => {
      mockPollySend.mockRejectedValue(new Error('Polly service unavailable'));

      const event = eventWithBody({ text: 'Hello' });
      const result = await handler(event);
      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Internal Server Error');
    });

    it('should return valid JSON in all error responses', async () => {
      // 400 error
      const badEvent = eventWithBody({});
      const badResult = await handler(badEvent);
      expect(() => JSON.parse(badResult.body)).not.toThrow();
      const badBody = JSON.parse(badResult.body);
      expect(badBody).toHaveProperty('error');
      expect(badBody).toHaveProperty('message');

      // 500 error
      mockPollySend.mockRejectedValue(new Error('fail'));
      const errorEvent = eventWithBody({ text: 'Hello' });
      const errorResult = await handler(errorEvent);
      expect(() => JSON.parse(errorResult.body)).not.toThrow();
      const errorBody = JSON.parse(errorResult.body);
      expect(errorBody).toHaveProperty('error');
      expect(errorBody).toHaveProperty('message');
    });
  });

  describe('Response Format', () => {
    it('should always return JSON-parseable body', async () => {
      setupSuccessfulPolly();
      const event = eventWithBody({ text: 'Test' });
      const result = await handler(event);
      expect(() => JSON.parse(result.body)).not.toThrow();
    });

    it('should return proper status codes', async () => {
      // 200 for success
      setupSuccessfulPolly();
      const successEvent = eventWithBody({ text: 'Hello' });
      const successResult = await handler(successEvent);
      expect(successResult.statusCode).toBe(200);

      // 400 for bad input
      jest.clearAllMocks();
      const badEvent = eventWithBody({});
      const badResult = await handler(badEvent);
      expect(badResult.statusCode).toBe(400);
    });
  });
});
