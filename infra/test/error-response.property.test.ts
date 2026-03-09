/**
 * Feature: english-learning-app, Property 21: Error response memiliki HTTP status code dan pesan yang sesuai
 * Validates: Requirements 11.4
 *
 * For every error that occurs in Lambda_Function, the response must have an appropriate
 * HTTP status code (400 for client error, 500 for server error) and a body containing
 * a descriptive error message in JSON format.
 */
import { APIGatewayProxyEvent } from 'aws-lambda';
import fc from 'fast-check';

// ─── Mock AWS SDK clients ───

const mockDynamoSend = jest.fn();
const mockBedrockSend = jest.fn();
const mockPollySend = jest.fn();
const mockTranscribeSend = jest.fn();
const mockS3Send = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({})),
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: jest.fn(() => ({ send: mockDynamoSend })) },
  PutCommand: jest.fn((p: unknown) => ({ _type: 'Put', p })),
  GetCommand: jest.fn((p: unknown) => ({ _type: 'Get', p })),
  UpdateCommand: jest.fn((p: unknown) => ({ _type: 'Update', p })),
  QueryCommand: jest.fn((p: unknown) => ({ _type: 'Query', p })),
}));

jest.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: jest.fn(() => ({ send: mockBedrockSend })),
  InvokeModelCommand: jest.fn((p: unknown) => ({ _type: 'Invoke', p })),
}));

jest.mock('@aws-sdk/client-polly', () => ({
  PollyClient: jest.fn(() => ({ send: mockPollySend })),
  SynthesizeSpeechCommand: jest.fn((p: unknown) => ({ _type: 'Synth', p })),
  Engine: { NEURAL: 'neural' },
  OutputFormat: { MP3: 'mp3' },
  VoiceId: { Joanna: 'Joanna' },
}));

jest.mock('@aws-sdk/client-transcribe', () => ({
  TranscribeClient: jest.fn(() => ({ send: mockTranscribeSend })),
  StartTranscriptionJobCommand: jest.fn((p: unknown) => ({ _type: 'Start', p })),
  GetTranscriptionJobCommand: jest.fn((p: unknown) => ({ _type: 'GetJob', p })),
  TranscriptionJobStatus: { COMPLETED: 'COMPLETED', FAILED: 'FAILED', IN_PROGRESS: 'IN_PROGRESS' },
}));

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({ send: mockS3Send })),
  HeadObjectCommand: jest.fn((p: unknown) => ({ _type: 'Head', p })),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// ─── Import handlers ───

import { handler as chatHandler } from '../lambda/chat/index';
import { handler as transcribeHandler } from '../lambda/transcribe/index';
import { handler as speakHandler } from '../lambda/speak/index';
import { handler as progressHandler } from '../lambda/progress/index';

// ─── Helpers ───

function baseEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    body: null,
    headers: {},
    multiValueHeaders: {},
    isBase64Encoded: false,
    path: '/',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '/',
    requestContext: {
      accountId: '123',
      apiId: 'api',
      authorizer: { claims: { sub: 'uid' } },
      protocol: 'HTTP/1.1',
      httpMethod: 'POST',
      identity: {} as any,
      path: '/',
      stage: 'prod',
      requestId: 'rid',
      requestTimeEpoch: Date.now(),
      resourceId: 'r',
      resourcePath: '/',
    },
    ...overrides,
  };
}

function noAuthEvent(body: string | null, method = 'POST'): APIGatewayProxyEvent {
  return baseEvent({
    httpMethod: method,
    body,
    requestContext: { ...baseEvent().requestContext, httpMethod: method, authorizer: null },
  });
}

function authEvent(body: string | null, userId: string, method = 'POST'): APIGatewayProxyEvent {
  return baseEvent({
    httpMethod: method,
    body,
    requestContext: { ...baseEvent().requestContext, httpMethod: method, authorizer: { claims: { sub: userId } } },
  });
}

/**
 * Validates error response structure:
 * - Status code in expected range
 * - Body is valid JSON with `error` and `message` string fields
 * - Message does not leak internal details (stack traces, AWS ARNs)
 * - CORS headers present
 */
function assertErrorResponse(
  result: { statusCode: number; headers?: { [header: string]: string | number | boolean } | undefined; body: string },
  expectedStatus: { min: number; max: number }
): void {
  expect(result.statusCode).toBeGreaterThanOrEqual(expectedStatus.min);
  expect(result.statusCode).toBeLessThanOrEqual(expectedStatus.max);

  let parsed: Record<string, unknown>;
  expect(() => { parsed = JSON.parse(result.body); }).not.toThrow();
  parsed = JSON.parse(result.body);

  expect(typeof parsed.error).toBe('string');
  expect(typeof parsed.message).toBe('string');
  expect((parsed.error as string).length).toBeGreaterThan(0);
  expect((parsed.message as string).length).toBeGreaterThan(0);

  // No internal detail leakage
  const msg = parsed.message as string;
  expect(msg).not.toMatch(/arn:aws/i);
  expect(msg).not.toMatch(/at\s+\w+\s+\(/); // stack trace pattern

  // CORS headers
  expect(result.headers).toBeDefined();
  expect(result.headers!['Access-Control-Allow-Origin']).toBe('*');
  expect(result.headers!['Content-Type']).toBe('application/json');
}

// ─── Arbitraries ───

const userIdArb = fc.uuid();

const chatInvalidBodyArb = fc.oneof(
  fc.constant({}),
  fc.record({ action: fc.constantFrom('invalid', 'unknown', '') }),
  fc.record({ action: fc.constant('start_session') }),
  fc.record({ action: fc.constant('analyze_answer'), sessionId: fc.uuid() }),
  fc.record({ action: fc.constant('grammar_quiz') }),
  fc.record({ action: fc.constant('writing_prompt'), writingType: fc.constantFrom('poem', 'letter') }),
);

const malformedJsonArb = fc.constantFrom(
  'not-json{{{', '{invalid}', '', 'undefined', '[1,2,3'
);

const speakInvalidBodyArb = fc.oneof(
  fc.constant({}),
  fc.record({ text: fc.constant('') }),
  fc.constant({ text: null }),
  fc.record({ text: fc.constant('   ') }),
);

const progressInvalidBodyArb = fc.oneof(
  fc.constant({}),
  fc.record({ moduleType: fc.constant('invalid'), score: fc.constant(50), sessionId: fc.uuid() }),
  fc.record({ moduleType: fc.constant('speaking'), score: fc.constant(-1), sessionId: fc.uuid() }),
  fc.record({ moduleType: fc.constant('speaking'), score: fc.constant(101), sessionId: fc.uuid() }),
  fc.record({ moduleType: fc.constant('speaking') }),
);

function failAllServices(): void {
  mockDynamoSend.mockRejectedValue(new Error('DynamoDB fail'));
  mockBedrockSend.mockRejectedValue(new Error('Bedrock fail'));
  mockPollySend.mockRejectedValue(new Error('Polly fail'));
  mockTranscribeSend.mockRejectedValue(new Error('Transcribe fail'));
  mockS3Send.mockRejectedValue(new Error('S3 fail'));
  mockFetch.mockRejectedValue(new Error('fetch fail'));
}

// ─── Property Tests ───

describe('Property 21: Error response memiliki HTTP status code dan pesan yang sesuai', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SESSIONS_TABLE_NAME = 'test-sessions';
    process.env.PROGRESS_TABLE_NAME = 'test-progress';
    process.env.AUDIO_BUCKET_NAME = 'test-audio';
    failAllServices();
  });

  // --- 401: No auth token ---

  it('/chat returns 401 error response when no auth token present', async () => {
    await fc.assert(
      fc.asyncProperty(chatInvalidBodyArb, async (body) => {
        const result = await chatHandler(noAuthEvent(JSON.stringify(body)));
        assertErrorResponse(result, { min: 401, max: 401 });
      }),
      { numRuns: 100 }
    );
  });

  it('/speak returns 401 error response when no auth token present', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20 }),
        async (text) => {
          const result = await speakHandler(noAuthEvent(JSON.stringify({ text })));
          assertErrorResponse(result, { min: 401, max: 401 });
        }
      ),
      { numRuns: 100 }
    );
  });

  it('/transcribe returns 401 error response when no auth token present', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20 }),
        async (key) => {
          const result = await transcribeHandler(noAuthEvent(JSON.stringify({ audioS3Key: key })));
          assertErrorResponse(result, { min: 401, max: 401 });
        }
      ),
      { numRuns: 100 }
    );
  });

  it('/progress returns 401 error response when no auth token present', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('GET', 'POST'),
        async (method) => {
          const body = method === 'POST' ? JSON.stringify({ moduleType: 'speaking', score: 50, sessionId: 'sid' }) : null;
          const result = await progressHandler(noAuthEvent(body, method));
          assertErrorResponse(result, { min: 401, max: 401 });
        }
      ),
      { numRuns: 100 }
    );
  });

  // --- 400: Invalid input ---

  it('/chat returns 400 error response for invalid request bodies', async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, chatInvalidBodyArb, async (userId, body) => {
        const result = await chatHandler(authEvent(JSON.stringify(body), userId));
        assertErrorResponse(result, { min: 400, max: 400 });
      }),
      { numRuns: 100 }
    );
  });

  it('/chat returns 400 error response for malformed JSON', async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, malformedJsonArb, async (userId, raw) => {
        const result = await chatHandler(authEvent(raw, userId));
        assertErrorResponse(result, { min: 400, max: 400 });
      }),
      { numRuns: 100 }
    );
  });

  it('/speak returns 400 error response for invalid request bodies', async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, speakInvalidBodyArb, async (userId, body) => {
        const result = await speakHandler(authEvent(JSON.stringify(body), userId));
        assertErrorResponse(result, { min: 400, max: 400 });
      }),
      { numRuns: 100 }
    );
  });

  it('/transcribe returns 400 error response for invalid request bodies', async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, async (userId) => {
        // Missing audioS3Key
        const r1 = await transcribeHandler(authEvent(JSON.stringify({}), userId));
        assertErrorResponse(r1, { min: 400, max: 400 });

        // Empty audioS3Key
        const r2 = await transcribeHandler(authEvent(JSON.stringify({ audioS3Key: '' }), userId));
        assertErrorResponse(r2, { min: 400, max: 400 });

        // User-owned key with unsupported format (passes ownership, fails format)
        const r3 = await transcribeHandler(authEvent(
          JSON.stringify({ audioS3Key: `${userId}/session/q1.xyz` }), userId
        ));
        assertErrorResponse(r3, { min: 400, max: 400 });

        // User-owned key with no extension (passes ownership, fails format)
        const r4 = await transcribeHandler(authEvent(
          JSON.stringify({ audioS3Key: `${userId}/session/noext` }), userId
        ));
        assertErrorResponse(r4, { min: 400, max: 400 });
      }),
      { numRuns: 100 }
    );
  });

  it('/progress POST returns 400 error response for invalid request bodies', async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, progressInvalidBodyArb, async (userId, body) => {
        const result = await progressHandler(authEvent(JSON.stringify(body), userId));
        assertErrorResponse(result, { min: 400, max: 400 });
      }),
      { numRuns: 100 }
    );
  });

  // --- 403: Forbidden (accessing another user's data) ---

  it('/transcribe returns 403 error response when accessing another user audio', async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, userIdArb, async (userId, otherUserId) => {
        fc.pre(userId !== otherUserId);
        const body = { audioS3Key: `${otherUserId}/session/q1.mp3` };
        const result = await transcribeHandler(authEvent(JSON.stringify(body), userId));
        assertErrorResponse(result, { min: 403, max: 403 });
      }),
      { numRuns: 100 }
    );
  });

  // --- 500: Internal server errors ---

  it('/chat returns 500 error response when backend services fail', async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, async (userId) => {
        const body = { action: 'start_session', jobPosition: 'Software Engineer' };
        const result = await chatHandler(authEvent(JSON.stringify(body), userId));
        assertErrorResponse(result, { min: 500, max: 500 });
      }),
      { numRuns: 100 }
    );
  });

  it('/speak returns 500 error response when Polly fails', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
        async (userId, text) => {
          const result = await speakHandler(authEvent(JSON.stringify({ text }), userId));
          assertErrorResponse(result, { min: 500, max: 500 });
        }
      ),
      { numRuns: 100 }
    );
  });

  it('/progress GET returns 500 error response when DynamoDB fails', async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, async (userId) => {
        const result = await progressHandler(authEvent(null, userId, 'GET'));
        assertErrorResponse(result, { min: 500, max: 500 });
      }),
      { numRuns: 100 }
    );
  });

  // --- Error messages never leak internal details ---

  it('error messages never contain stack traces or AWS ARNs across all handlers', async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, chatInvalidBodyArb, async (userId, body) => {
        // Chat 400 errors
        const chatResult = await chatHandler(authEvent(JSON.stringify(body), userId));
        assertErrorResponse(chatResult, { min: 400, max: 400 });

        // Chat 500 errors
        const chat500 = await chatHandler(authEvent(
          JSON.stringify({ action: 'start_session', jobPosition: 'PM' }),
          userId
        ));
        assertErrorResponse(chat500, { min: 500, max: 500 });
      }),
      { numRuns: 100 }
    );
  });
});
