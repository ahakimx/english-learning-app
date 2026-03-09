import { APIGatewayProxyEvent } from 'aws-lambda';

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

// Mock global fetch for transcript retrieval
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

import { handler } from '../lambda/transcribe/index';

// Helper to create a mock API Gateway event
function createEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    body: null,
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
        claims: { sub: 'test-user-id-123' },
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

function setupSuccessfulTranscription(transcriptText = 'I have five years of experience in software development.') {
  // S3 HeadObject returns valid file size
  mockS3Send.mockResolvedValue({ ContentLength: 50000 });

  // StartTranscriptionJob succeeds
  mockTranscribeSend.mockImplementation((command: { _type?: string }) => {
    if (command._type === 'StartTranscriptionJobCommand') {
      return Promise.resolve({
        TranscriptionJob: { TranscriptionJobName: 'test-job', TranscriptionJobStatus: 'IN_PROGRESS' },
      });
    }
    if (command._type === 'GetTranscriptionJobCommand') {
      return Promise.resolve({
        TranscriptionJob: {
          TranscriptionJobStatus: 'COMPLETED',
          Transcript: { TranscriptFileUri: 'https://s3.amazonaws.com/transcribe-output/test-job.json' },
        },
      });
    }
    return Promise.resolve({});
  });

  // Fetch transcript JSON
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({
      results: {
        transcripts: [{ transcript: transcriptText }],
      },
    }),
  });
}

describe('Lambda /transcribe handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AUDIO_BUCKET_NAME = 'test-audio-bucket';
  });

  describe('Authentication', () => {
    it('should return 401 when no userId in token', async () => {
      const event = createEvent({
        body: JSON.stringify({ audioS3Key: 'test-user-id-123/session1/q1.webm' }),
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
  });

  describe('Input Validation', () => {
    it('should return 400 when audioS3Key is missing', async () => {
      const event = eventWithBody({});
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('audioS3Key');
    });

    it('should return 400 when audioS3Key is empty string', async () => {
      const event = eventWithBody({ audioS3Key: '' });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
    });

    it('should return 400 when audioS3Key is not a string', async () => {
      const event = eventWithBody({ audioS3Key: 123 });
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

    it('should return 403 when audioS3Key does not belong to user', async () => {
      const event = eventWithBody({ audioS3Key: 'other-user-id/session1/q1.webm' });
      const result = await handler(event);
      expect(result.statusCode).toBe(403);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Forbidden');
    });
  });

  describe('Audio Format Validation', () => {
    it('should return 400 for unsupported audio format', async () => {
      const event = eventWithBody({ audioS3Key: 'test-user-id-123/session1/q1.txt' });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('Format audio tidak didukung');
      expect(body.message).toContain('.txt');
    });

    it('should return 400 for file without extension', async () => {
      const event = eventWithBody({ audioS3Key: 'test-user-id-123/session1/audiofile' });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('Format audio tidak didukung');
    });

    it('should return 400 when audio file is too short', async () => {
      mockS3Send.mockResolvedValue({ ContentLength: 100 }); // Too small
      const event = eventWithBody({ audioS3Key: 'test-user-id-123/session1/q1.webm' });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('Audio terlalu pendek');
    });

    it('should return 400 when audio file not found in S3', async () => {
      mockS3Send.mockRejectedValue({ name: 'NotFound' });
      const event = eventWithBody({ audioS3Key: 'test-user-id-123/session1/q1.webm' });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('tidak ditemukan');
    });
  });

  describe('Successful Transcription', () => {
    it('should return transcription text for valid audio', async () => {
      const expectedText = 'I have five years of experience in software development.';
      setupSuccessfulTranscription(expectedText);

      const event = eventWithBody({ audioS3Key: 'test-user-id-123/session1/q1.webm' });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.transcription).toBe(expectedText);
      expect(body.audioS3Key).toBe('test-user-id-123/session1/q1.webm');
    });

    it('should include CORS headers in response', async () => {
      setupSuccessfulTranscription();
      const event = eventWithBody({ audioS3Key: 'test-user-id-123/session1/q1.webm' });
      const result = await handler(event);

      expect(result.headers).toBeDefined();
      expect(result.headers!['Access-Control-Allow-Origin']).toBe('*');
      expect(result.headers!['Content-Type']).toBe('application/json');
    });

    it('should accept various supported audio formats', async () => {
      const formats = ['webm', 'mp3', 'mp4', 'wav', 'flac', 'ogg', 'amr'];

      for (const format of formats) {
        jest.clearAllMocks();
        setupSuccessfulTranscription();
        const event = eventWithBody({ audioS3Key: `test-user-id-123/session1/q1.${format}` });
        const result = await handler(event);
        expect(result.statusCode).toBe(200);
      }
    });
  });

  describe('Transcription Error Handling', () => {
    it('should return 400 when audio is not detected (empty transcript)', async () => {
      mockS3Send.mockResolvedValue({ ContentLength: 50000 });

      mockTranscribeSend.mockImplementation((command: { _type?: string }) => {
        if (command._type === 'StartTranscriptionJobCommand') {
          return Promise.resolve({
            TranscriptionJob: { TranscriptionJobName: 'test-job', TranscriptionJobStatus: 'IN_PROGRESS' },
          });
        }
        if (command._type === 'GetTranscriptionJobCommand') {
          return Promise.resolve({
            TranscriptionJob: {
              TranscriptionJobStatus: 'COMPLETED',
              Transcript: { TranscriptFileUri: 'https://s3.amazonaws.com/transcribe-output/test-job.json' },
            },
          });
        }
        return Promise.resolve({});
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          results: { transcripts: [{ transcript: '' }] },
        }),
      });

      const event = eventWithBody({ audioS3Key: 'test-user-id-123/session1/q1.webm' });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('Audio tidak terdeteksi');
    });

    it('should return 500 when transcription job fails', async () => {
      mockS3Send.mockResolvedValue({ ContentLength: 50000 });

      mockTranscribeSend.mockImplementation((command: { _type?: string }) => {
        if (command._type === 'StartTranscriptionJobCommand') {
          return Promise.resolve({
            TranscriptionJob: { TranscriptionJobName: 'test-job', TranscriptionJobStatus: 'IN_PROGRESS' },
          });
        }
        if (command._type === 'GetTranscriptionJobCommand') {
          return Promise.resolve({
            TranscriptionJob: {
              TranscriptionJobStatus: 'FAILED',
              FailureReason: 'Invalid audio file',
            },
          });
        }
        return Promise.resolve({});
      });

      const event = eventWithBody({ audioS3Key: 'test-user-id-123/session1/q1.webm' });
      const result = await handler(event);
      expect(result.statusCode).toBe(500);
    });

    it('should return 500 when S3 HeadObject throws unexpected error', async () => {
      mockS3Send.mockRejectedValue(new Error('S3 service unavailable'));
      const event = eventWithBody({ audioS3Key: 'test-user-id-123/session1/q1.webm' });
      const result = await handler(event);
      expect(result.statusCode).toBe(500);
    });

    it('should return valid JSON in all error responses', async () => {
      const event = eventWithBody({});
      const result = await handler(event);
      expect(() => JSON.parse(result.body)).not.toThrow();
      const body = JSON.parse(result.body);
      expect(body).toHaveProperty('error');
      expect(body).toHaveProperty('message');
    });
  });

  describe('Response Format', () => {
    it('should always return JSON-parseable body', async () => {
      setupSuccessfulTranscription();
      const event = eventWithBody({ audioS3Key: 'test-user-id-123/session1/q1.webm' });
      const result = await handler(event);
      expect(() => JSON.parse(result.body)).not.toThrow();
    });

    it('should return proper status codes', async () => {
      // 200 for success
      setupSuccessfulTranscription();
      const successEvent = eventWithBody({ audioS3Key: 'test-user-id-123/session1/q1.webm' });
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
