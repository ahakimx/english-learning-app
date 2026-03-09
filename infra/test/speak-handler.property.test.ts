/**
 * Feature: english-learning-app, Property 5: Text-to-speech menghasilkan audio valid
 * Validates: Requirements 3.4
 *
 * For any non-empty text string, the Speech_Service (Amazon Polly) must return
 * valid, non-empty base64-encoded audio data.
 */
import { APIGatewayProxyEvent } from 'aws-lambda';
import fc from 'fast-check';

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

// Arbitrary for a valid user ID (UUID-like)
const userIdArb = fc.uuid();

// Arbitrary for non-empty text strings representing interview questions or general text
const nonEmptyTextArb = fc.oneof(
  // Realistic interview question texts
  fc.constantFrom(
    'Tell me about yourself.',
    'What are your greatest strengths?',
    'Why do you want to work here?',
    'Describe a challenging project you worked on.',
    'Where do you see yourself in five years?',
    'How do you handle conflict in the workplace?',
    'What is your experience with agile methodologies?',
    'Can you explain a time you demonstrated leadership?',
    'Why should we hire you for this position?',
    'What motivates you to do your best work?'
  ),
  // Arbitrary non-empty strings (trimmed, at least 1 char)
  fc.string({ minLength: 1, maxLength: 500 }).filter((s) => s.trim().length > 0)
);

// Arbitrary for mock audio byte arrays (non-empty, simulating Polly output)
const audioByteArb = fc
  .uint8Array({ minLength: 1, maxLength: 1024 })
  .filter((arr) => arr.length > 0);

function createEvent(userId: string, text: string): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    body: JSON.stringify({ text }),
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
        claims: { sub: userId },
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
  };
}

function setupPollyMock(audioBytes: Uint8Array) {
  mockPollySend.mockResolvedValue({
    AudioStream: (async function* () {
      yield audioBytes;
    })(),
    ContentType: 'audio/mpeg',
  });
}

describe('Property 5: Text-to-speech menghasilkan audio valid', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should always return valid non-empty base64 audio data for any non-empty text', async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, nonEmptyTextArb, audioByteArb, async (userId, text, audioBytes) => {
        jest.clearAllMocks();
        setupPollyMock(audioBytes);

        const event = createEvent(userId, text);
        const result = await handler(event);

        expect(result.statusCode).toBe(200);

        const body = JSON.parse(result.body);

        // audioData must be a non-empty string
        expect(typeof body.audioData).toBe('string');
        expect(body.audioData.length).toBeGreaterThan(0);

        // audioData must be valid base64 that decodes to the original bytes
        const decoded = Buffer.from(body.audioData, 'base64');
        expect(decoded.length).toBeGreaterThan(0);
        expect(decoded).toEqual(Buffer.from(audioBytes));

        // contentType must be present
        expect(body.contentType).toBe('audio/mpeg');
      }),
      { numRuns: 100 }
    );
  });
});
