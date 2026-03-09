/**
 * Feature: english-learning-app, Property 20: Lambda response selalu dalam format JSON valid
 * Validates: Requirements 11.2
 *
 * For every valid request to any of the 4 endpoints (/chat, /transcribe, /speak, /progress),
 * the response body returned by Lambda must be valid JSON that can be parsed.
 */
import { APIGatewayProxyEvent } from 'aws-lambda';
import fc from 'fast-check';

// ─── Mock AWS SDK clients (must be before handler imports) ───

const mockDynamoSend = jest.fn();
const mockBedrockSend = jest.fn();
const mockPollySend = jest.fn();
const mockTranscribeSend = jest.fn();
const mockS3Send = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({})),
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: jest.fn(() => ({ send: mockDynamoSend })),
  },
  PutCommand: jest.fn((params: unknown) => ({ _type: 'PutCommand', params })),
  GetCommand: jest.fn((params: unknown) => ({ _type: 'GetCommand', params })),
  UpdateCommand: jest.fn((params: unknown) => ({ _type: 'UpdateCommand', params })),
  QueryCommand: jest.fn((params: unknown) => ({ _type: 'QueryCommand', params })),
}));

jest.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: jest.fn(() => ({ send: mockBedrockSend })),
  InvokeModelCommand: jest.fn((params: unknown) => ({ _type: 'InvokeModelCommand', params })),
}));

jest.mock('@aws-sdk/client-polly', () => ({
  PollyClient: jest.fn(() => ({ send: mockPollySend })),
  SynthesizeSpeechCommand: jest.fn((params: unknown) => ({ _type: 'SynthesizeSpeechCommand', params })),
  Engine: { NEURAL: 'neural' },
  OutputFormat: { MP3: 'mp3' },
  VoiceId: { Joanna: 'Joanna' },
}));

jest.mock('@aws-sdk/client-transcribe', () => ({
  TranscribeClient: jest.fn(() => ({ send: mockTranscribeSend })),
  StartTranscriptionJobCommand: jest.fn((params: unknown) => ({ _type: 'StartTranscriptionJobCommand', params })),
  GetTranscriptionJobCommand: jest.fn((params: unknown) => ({ _type: 'GetTranscriptionJobCommand', params })),
  TranscriptionJobStatus: {
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED',
    IN_PROGRESS: 'IN_PROGRESS',
  },
}));

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({ send: mockS3Send })),
  HeadObjectCommand: jest.fn((params: unknown) => ({ _type: 'HeadObjectCommand', params })),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// ─── Import handlers after mocks ───

import { handler as chatHandler } from '../lambda/chat/index';
import { handler as transcribeHandler } from '../lambda/transcribe/index';
import { handler as speakHandler } from '../lambda/speak/index';
import { handler as progressHandler } from '../lambda/progress/index';

// ─── Helpers ───

function createBaseEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
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
      accountId: '123456789',
      apiId: 'test-api',
      authorizer: {
        claims: { sub: 'test-user-id' },
      },
      protocol: 'HTTP/1.1',
      httpMethod: 'POST',
      identity: {} as any,
      path: '/',
      stage: 'prod',
      requestId: 'test-request-id',
      requestTimeEpoch: Date.now(),
      resourceId: 'test',
      resourcePath: '/',
    },
    ...overrides,
  };
}

function createEventWithAuth(body: string | null, userId: string, method = 'POST', path = '/'): APIGatewayProxyEvent {
  return createBaseEvent({
    httpMethod: method,
    body,
    path,
    resource: path,
    requestContext: {
      ...createBaseEvent().requestContext,
      httpMethod: method,
      path,
      resourcePath: path,
      authorizer: { claims: { sub: userId } },
    },
  });
}

function assertValidJson(body: string): void {
  expect(typeof body).toBe('string');
  // Empty body for OPTIONS is acceptable
  if (body === '') return;
  let parsed: unknown;
  expect(() => { parsed = JSON.parse(body); }).not.toThrow();
  expect(parsed).toBeDefined();
}

// ─── Arbitraries ───

const userIdArb = fc.uuid();

// Chat request bodies — both valid and invalid variations
const chatValidBodyArb = fc.oneof(
  // start_session
  fc.record({
    action: fc.constant('start_session'),
    jobPosition: fc.constantFrom('Software Engineer', 'Product Manager', 'Data Analyst', 'Marketing Manager', 'UI/UX Designer'),
  }),
  // grammar_quiz
  fc.record({
    action: fc.constant('grammar_quiz'),
    grammarTopic: fc.constantFrom('Tenses', 'Articles', 'Prepositions', 'Conditionals', 'Passive Voice'),
  }),
  // writing_prompt
  fc.record({
    action: fc.constant('writing_prompt'),
    writingType: fc.constantFrom('essay', 'email'),
  })
);

const chatInvalidBodyArb = fc.oneof(
  // Missing action
  fc.constant({}),
  // Invalid action
  fc.record({ action: fc.constantFrom('invalid', 'unknown', 'delete', '') }),
  // Missing required fields
  fc.record({ action: fc.constant('start_session') }),
  fc.record({ action: fc.constant('analyze_answer'), sessionId: fc.constant('sid') }),
  fc.record({ action: fc.constant('grammar_quiz') }),
  // Invalid writingType
  fc.record({ action: fc.constant('writing_prompt'), writingType: fc.constantFrom('poem', 'letter', '') }),
  // Completely random object
  fc.dictionary(fc.string({ minLength: 1, maxLength: 10 }), fc.string({ maxLength: 20 }), { minKeys: 0, maxKeys: 3 })
);

const chatBodyArb = fc.oneof(chatValidBodyArb, chatInvalidBodyArb);

// Transcribe request bodies
const transcribeValidBodyArb = userIdArb.chain(userId =>
  fc.record({
    audioS3Key: fc.constantFrom('webm', 'mp3', 'wav').map(ext => `${userId}/session1/q1.${ext}`),
  }).map(body => ({ userId, body }))
);

const transcribeInvalidBodyArb = fc.oneof(
  fc.constant({ audioS3Key: '' }),
  fc.constant({}),
  fc.record({ audioS3Key: fc.constant('invalid-key-no-user-prefix.mp3') }),
  fc.record({ audioS3Key: fc.constant('other-user/session/q1.mp3') })
);

// Speak request bodies
const speakValidBodyArb = fc.record({
  text: fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0),
});

const speakInvalidBodyArb = fc.oneof(
  fc.constant({}),
  fc.record({ text: fc.constant('') }),
  fc.constant({ text: null }),
);

// Progress request bodies
const progressValidPostBodyArb = fc.record({
  moduleType: fc.constantFrom('speaking', 'grammar', 'writing'),
  score: fc.integer({ min: 0, max: 100 }),
  sessionId: fc.uuid(),
});

const progressInvalidPostBodyArb = fc.oneof(
  fc.constant({}),
  fc.record({ moduleType: fc.constant('invalid_module'), score: fc.constant(50), sessionId: fc.uuid() }),
  fc.record({ moduleType: fc.constant('speaking'), score: fc.constant(-1), sessionId: fc.uuid() }),
  fc.record({ moduleType: fc.constant('speaking'), score: fc.constant(101), sessionId: fc.uuid() }),
  fc.record({ moduleType: fc.constant('speaking') }),
);

// ─── Mock setup helpers ───

function setupChatMocks(userId: string) {
  mockBedrockSend.mockResolvedValue({
    body: new TextEncoder().encode(
      JSON.stringify({ content: [{ text: 'Tell me about your experience.' }] })
    ),
  });
  mockDynamoSend.mockImplementation((command: { _type?: string }) => {
    if (command._type === 'GetCommand') {
      return Promise.resolve({
        Item: {
          userId,
          sessionId: 'sid',
          questions: [{ questionId: 'q1', questionText: 'Tell me about yourself' }],
          currentQuiz: {
            questionId: 'q1',
            question: 'Choose correct form',
            options: ['A', 'B', 'C', 'D'],
            correctAnswer: 'B',
          },
          quizResults: [],
          writingType: 'essay',
          writingPrompt: 'Write about goals',
        },
      });
    }
    if (command._type === 'QueryCommand') {
      return Promise.resolve({ Items: [] });
    }
    return Promise.resolve({});
  });
}

function setupTranscribeMocks() {
  mockS3Send.mockResolvedValue({ ContentLength: 50000 });
  mockTranscribeSend.mockImplementation((command: { _type?: string }) => {
    if (command._type === 'StartTranscriptionJobCommand') {
      return Promise.resolve({});
    }
    if (command._type === 'GetTranscriptionJobCommand') {
      return Promise.resolve({
        TranscriptionJob: {
          TranscriptionJobStatus: 'COMPLETED',
          Transcript: { TranscriptFileUri: 'https://s3.amazonaws.com/output/job.json' },
        },
      });
    }
    return Promise.resolve({});
  });
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ results: { transcripts: [{ transcript: 'Hello world' }] } }),
  });
}

function setupSpeakMocks() {
  mockPollySend.mockResolvedValue({
    AudioStream: (async function* () {
      yield new Uint8Array([1, 2, 3, 4]);
    })(),
    ContentType: 'audio/mpeg',
  });
}

function setupProgressMocks() {
  mockDynamoSend.mockImplementation((command: { _type?: string }) => {
    if (command._type === 'QueryCommand') {
      return Promise.resolve({ Items: [] });
    }
    if (command._type === 'GetCommand') {
      return Promise.resolve({ Item: null });
    }
    return Promise.resolve({});
  });
}

// ─── Property Tests ───

describe('Property 20: Lambda response selalu dalam format JSON valid', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SESSIONS_TABLE_NAME = 'test-sessions-table';
    process.env.PROGRESS_TABLE_NAME = 'test-progress-table';
    process.env.AUDIO_BUCKET_NAME = 'test-audio-bucket';
  });

  it('/chat handler always returns valid JSON body for any request', async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, chatBodyArb, async (userId, body) => {
        jest.clearAllMocks();
        setupChatMocks(userId);

        const event = createEventWithAuth(JSON.stringify(body), userId, 'POST', '/chat');
        const result = await chatHandler(event);

        assertValidJson(result.body);
      }),
      { numRuns: 100 }
    );
  });

  it('/chat handler returns valid JSON even with malformed request body', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        fc.oneof(
          fc.constant('not-json{{{'),
          fc.constant(''),
          fc.constant('null'),
          fc.constant('undefined'),
          fc.constant('12345'),
          fc.constant('[1,2,3]'),
        ),
        async (userId, rawBody) => {
          jest.clearAllMocks();
          setupChatMocks(userId);

          const event = createEventWithAuth(rawBody, userId, 'POST', '/chat');
          const result = await chatHandler(event);

          assertValidJson(result.body);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('/chat handler returns valid JSON when no auth token present', async () => {
    await fc.assert(
      fc.asyncProperty(chatBodyArb, async (body) => {
        jest.clearAllMocks();

        const event = createBaseEvent({
          httpMethod: 'POST',
          body: JSON.stringify(body),
          path: '/chat',
          requestContext: {
            ...createBaseEvent().requestContext,
            authorizer: null,
          },
        });
        const result = await chatHandler(event);

        assertValidJson(result.body);
      }),
      { numRuns: 100 }
    );
  });

  it('/transcribe handler always returns valid JSON body for valid requests', async () => {
    await fc.assert(
      fc.asyncProperty(transcribeValidBodyArb, async ({ userId, body }) => {
        jest.clearAllMocks();
        setupTranscribeMocks();

        const event = createEventWithAuth(JSON.stringify(body), userId, 'POST', '/transcribe');
        const result = await transcribeHandler(event);

        assertValidJson(result.body);
      }),
      { numRuns: 100 }
    );
  });

  it('/transcribe handler returns valid JSON for invalid requests', async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, transcribeInvalidBodyArb, async (userId, body) => {
        jest.clearAllMocks();
        setupTranscribeMocks();

        const event = createEventWithAuth(JSON.stringify(body), userId, 'POST', '/transcribe');
        const result = await transcribeHandler(event);

        assertValidJson(result.body);
      }),
      { numRuns: 100 }
    );
  });

  it('/speak handler always returns valid JSON body for valid requests', async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, speakValidBodyArb, async (userId, body) => {
        jest.clearAllMocks();
        setupSpeakMocks();

        const event = createEventWithAuth(JSON.stringify(body), userId, 'POST', '/speak');
        const result = await speakHandler(event);

        assertValidJson(result.body);
      }),
      { numRuns: 100 }
    );
  });

  it('/speak handler returns valid JSON for invalid requests', async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, speakInvalidBodyArb, async (userId, body) => {
        jest.clearAllMocks();
        setupSpeakMocks();

        const event = createEventWithAuth(JSON.stringify(body), userId, 'POST', '/speak');
        const result = await speakHandler(event);

        assertValidJson(result.body);
      }),
      { numRuns: 100 }
    );
  });

  it('/progress GET handler always returns valid JSON body', async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, async (userId) => {
        jest.clearAllMocks();
        setupProgressMocks();

        const event = createEventWithAuth(null, userId, 'GET', '/progress');
        const result = await progressHandler(event);

        assertValidJson(result.body);
      }),
      { numRuns: 100 }
    );
  });

  it('/progress POST handler always returns valid JSON body for valid requests', async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, progressValidPostBodyArb, async (userId, body) => {
        jest.clearAllMocks();
        setupProgressMocks();

        const event = createEventWithAuth(JSON.stringify(body), userId, 'POST', '/progress');
        const result = await progressHandler(event);

        assertValidJson(result.body);
      }),
      { numRuns: 100 }
    );
  });

  it('/progress POST handler returns valid JSON for invalid requests', async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, progressInvalidPostBodyArb, async (userId, body) => {
        jest.clearAllMocks();
        setupProgressMocks();

        const event = createEventWithAuth(JSON.stringify(body), userId, 'POST', '/progress');
        const result = await progressHandler(event);

        assertValidJson(result.body);
      }),
      { numRuns: 100 }
    );
  });
});
