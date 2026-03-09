/**
 * Feature: english-learning-app, Property 7: Transkripsi menghasilkan teks bahasa Inggris
 * Validates: Requirements 4.4
 *
 * For any valid audio S3 key, the Transcription_Service must return a non-empty
 * transcription string in English.
 */
import { APIGatewayProxyEvent } from 'aws-lambda';
import fc from 'fast-check';

// Mock AWS SDK clients before importing handler
const mockTranscribeSend = jest.fn();
const mockS3Send = jest.fn();

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

import { handler } from '../lambda/transcribe/index';

const SUPPORTED_FORMATS = ['webm', 'mp3', 'mp4', 'wav', 'flac', 'ogg', 'amr'];

// Arbitrary for a valid audio file extension
const audioExtensionArb = fc.constantFrom(...SUPPORTED_FORMATS);

// Arbitrary for a valid user ID (UUID-like)
const userIdArb = fc.uuid();

// Arbitrary for a session ID segment
const sessionIdArb = fc.uuid();

// Arbitrary for a question ID segment
const questionIdArb = fc.stringMatching(/^q[0-9]{1,3}$/);

// Arbitrary for a valid S3 key: {userId}/{sessionId}/{questionId}.{ext}
const validS3KeyArb = fc.tuple(userIdArb, sessionIdArb, questionIdArb, audioExtensionArb).map(
  ([userId, sessionId, questionId, ext]) => ({
    userId,
    s3Key: `${userId}/${sessionId}/${questionId}.${ext}`,
  })
);

// Arbitrary for non-empty English transcription text
const transcriptionTextArb = fc
  .array(
    fc.constantFrom(
      'I have experience in software development.',
      'My greatest strength is problem solving.',
      'I worked on a team of five engineers.',
      'The project was completed ahead of schedule.',
      'I am passionate about building scalable systems.',
      'Communication is key in any team environment.',
      'I led the migration to a microservices architecture.',
      'Testing and code quality are very important to me.',
      'I enjoy learning new technologies and frameworks.',
      'My previous role involved managing client relationships.'
    ),
    { minLength: 1, maxLength: 3 }
  )
  .map((sentences) => sentences.join(' '));

function createEvent(userId: string, audioS3Key: string): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    body: JSON.stringify({ audioS3Key }),
    headers: {},
    multiValueHeaders: {},
    isBase64Encoded: false,
    path: '/transcribe',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '/transcribe',
    requestContext: {
      accountId: '123456789',
      apiId: 'test-api',
      authorizer: {
        claims: { sub: userId },
      },
      protocol: 'HTTP/1.1',
      httpMethod: 'POST',
      identity: {} as any,
      path: '/transcribe',
      stage: 'prod',
      requestId: 'test-request-id',
      requestTimeEpoch: Date.now(),
      resourceId: 'test',
      resourcePath: '/transcribe',
    },
  };
}

function setupMocks(transcriptText: string) {
  // S3 HeadObject returns valid file size
  mockS3Send.mockResolvedValue({ ContentLength: 50000 });

  // Transcribe: start job then return completed with transcript URI
  mockTranscribeSend.mockImplementation((command: { _type?: string }) => {
    if (command._type === 'StartTranscriptionJobCommand') {
      return Promise.resolve({
        TranscriptionJob: {
          TranscriptionJobName: 'test-job',
          TranscriptionJobStatus: 'IN_PROGRESS',
        },
      });
    }
    if (command._type === 'GetTranscriptionJobCommand') {
      return Promise.resolve({
        TranscriptionJob: {
          TranscriptionJobStatus: 'COMPLETED',
          Transcript: {
            TranscriptFileUri: 'https://s3.amazonaws.com/transcribe-output/test-job.json',
          },
        },
      });
    }
    return Promise.resolve({});
  });

  // Fetch transcript JSON
  mockFetch.mockResolvedValue({
    ok: true,
    json: () =>
      Promise.resolve({
        results: {
          transcripts: [{ transcript: transcriptText }],
        },
      }),
  });
}

describe('Property 7: Transkripsi menghasilkan teks bahasa Inggris', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AUDIO_BUCKET_NAME = 'test-audio-bucket';
  });

  it('should always return a non-empty transcription string for any valid audio S3 key', async () => {
    await fc.assert(
      fc.asyncProperty(validS3KeyArb, transcriptionTextArb, async ({ userId, s3Key }, expectedText) => {
        jest.clearAllMocks();
        setupMocks(expectedText);

        const event = createEvent(userId, s3Key);
        const result = await handler(event);

        expect(result.statusCode).toBe(200);

        const body = JSON.parse(result.body);

        // Transcription must be a non-empty string
        expect(typeof body.transcription).toBe('string');
        expect(body.transcription.length).toBeGreaterThan(0);

        // Transcription must match the expected text from the service
        expect(body.transcription).toBe(expectedText);
      }),
      { numRuns: 100 }
    );
  });
});
