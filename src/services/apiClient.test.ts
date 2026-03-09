import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ChatRequest } from '../types';

const mockGetAccessToken = vi.fn();
const mockRefreshSession = vi.fn();

vi.mock('./authService', () => ({
  getAccessToken: (...args: unknown[]) => mockGetAccessToken(...args),
  refreshSession: (...args: unknown[]) => mockRefreshSession(...args),
}));

// Must import after mock setup
const importApiClient = () => import('./apiClient');

describe('apiClient', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    originalFetch = globalThis.fetch;
    mockGetAccessToken.mockResolvedValue('test-token');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('chat', () => {
    it('sends POST request with ChatRequest body and auth header', async () => {
      const mockResponse = { sessionId: 's1', type: 'question', content: 'Tell me about yourself' };
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { chat } = await importApiClient();
      const req: ChatRequest = { action: 'start_session', jobPosition: 'Software Engineer' };
      const result = await chat(req);

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toContain('/chat');
      expect(options.method).toBe('POST');
      expect(options.headers.Authorization).toBe('Bearer test-token');
      expect(JSON.parse(options.body)).toEqual(req);
      expect(result).toEqual(mockResponse);
    });
  });

  describe('transcribe', () => {
    it('sends POST with audioS3Key', async () => {
      const mockResponse = { transcription: 'Hello world' };
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { transcribe } = await importApiClient();
      const result = await transcribe('user1/session1/q1.webm');

      const [, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(JSON.parse(options.body)).toEqual({ audioS3Key: 'user1/session1/q1.webm' });
      expect(result.transcription).toBe('Hello world');
    });
  });

  describe('speak', () => {
    it('sends POST with text and returns audio data', async () => {
      const mockResponse = { audioData: 'base64audio==' };
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { speak } = await importApiClient();
      const result = await speak('Hello');

      const [, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(JSON.parse(options.body)).toEqual({ text: 'Hello' });
      expect(result.audioData).toBe('base64audio==');
    });
  });

  describe('getProgress', () => {
    it('sends GET request without body', async () => {
      const mockResponse = {
        speaking: { totalSessions: 5, averageScore: 75, scoreHistory: [] },
        grammar: { totalQuizzes: 10, topicScores: {} },
        writing: { totalReviews: 3, averageScore: 80, scoreHistory: [] },
      };
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { getProgress } = await importApiClient();
      const result = await getProgress();

      const [url, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toContain('/progress');
      expect(options.method).toBe('GET');
      expect(options.body).toBeUndefined();
      expect(result.speaking.totalSessions).toBe(5);
    });
  });

  describe('updateProgress', () => {
    it('sends POST request with progress data', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ message: 'Progress updated successfully' }),
      });

      const { updateProgress } = await importApiClient();
      await updateProgress({ moduleType: 'speaking', score: 85, sessionId: 's1' });

      const [, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(JSON.parse(options.body)).toEqual({
        moduleType: 'speaking',
        score: 85,
        sessionId: 's1',
      });
    });
  });

  describe('error handling', () => {
    it('throws ApiError with status on non-ok response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ message: 'Bad Request' }),
      });

      const { chat, ApiError } = await importApiClient();
      await expect(chat({ action: 'start_session' })).rejects.toThrow(ApiError);
      try {
        await chat({ action: 'start_session' });
      } catch (e) {
        expect((e as InstanceType<typeof ApiError>).status).toBe(400);
      }
    });

    it('refreshes token on 401 and retries once', async () => {
      mockRefreshSession.mockResolvedValue('new-token');
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({ message: 'Unauthorized' }) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ sessionId: 's1', type: 'question', content: 'Q1' }) });
      });

      const { chat } = await importApiClient();
      const result = await chat({ action: 'start_session' });

      expect(mockRefreshSession).toHaveBeenCalledTimes(1);
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      expect(result.content).toBe('Q1');
    });

    it('retries on network error with backoff', async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.reject(new TypeError('Failed to fetch'));
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ sessionId: 's1', type: 'question', content: 'Q1' }) });
      });

      const { chat } = await importApiClient();
      const result = await chat({ action: 'start_session' });

      expect(globalThis.fetch).toHaveBeenCalledTimes(3);
      expect(result.content).toBe('Q1');
    });

    it('throws after max retries on persistent network error', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

      const { chat } = await importApiClient();
      await expect(chat({ action: 'start_session' })).rejects.toThrow('Failed to fetch');
      // 1 initial + 3 retries = 4 calls
      expect(globalThis.fetch).toHaveBeenCalledTimes(4);
    });

    it('does not retry 401 if refresh returns null', async () => {
      mockRefreshSession.mockResolvedValue(null);
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ message: 'Unauthorized' }),
      });

      const { chat, ApiError } = await importApiClient();
      await expect(chat({ action: 'start_session' })).rejects.toThrow(ApiError);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it('throws TimeoutError when fetch is aborted due to timeout', async () => {
      // Simulate fetch throwing AbortError (what happens when AbortController.abort() fires)
      globalThis.fetch = vi.fn().mockImplementation(() => {
        return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'));
      });

      const { chat, TimeoutError } = await importApiClient();
      await expect(
        chat({ action: 'analyze_answer', sessionId: 's1', transcription: 'test' }),
      ).rejects.toThrow(TimeoutError);
      await expect(
        chat({ action: 'analyze_answer', sessionId: 's1', transcription: 'test' }),
      ).rejects.toThrow('Analisis membutuhkan waktu lebih lama');
    });

    it('does not apply timeout for non-AI-analysis actions', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ sessionId: 's1', type: 'question', content: 'Q1' }),
      });

      const { chat } = await importApiClient();
      await chat({ action: 'start_session', jobPosition: 'Software Engineer' });

      // Verify no signal was passed (no AbortController)
      const [, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(options.signal).toBeUndefined();
    });

    it('passes AbortSignal for AI analysis actions', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ sessionId: 's1', type: 'feedback', content: 'Good' }),
      });

      const { chat } = await importApiClient();
      await chat({ action: 'analyze_answer', sessionId: 's1', transcription: 'test' });

      const [, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(options.signal).toBeInstanceOf(AbortSignal);
    });
  });

  describe('auth headers', () => {
    it('sends request without Authorization when no token', async () => {
      mockGetAccessToken.mockResolvedValue(null);
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ speaking: {}, grammar: {}, writing: {} }),
      });

      const { getProgress } = await importApiClient();
      await getProgress();

      const [, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(options.headers.Authorization).toBeUndefined();
    });
  });
});

// Feature: english-learning-app, Property 3: API menolak request tanpa token valid
// **Validates: Requirements 1.5, 12.1**
describe('Property: API menolak request tanpa token valid', () => {
  let originalFetch: typeof globalThis.fetch;
  const mockGetAccessTokenLocal = mockGetAccessToken;
  const mockRefreshSessionLocal = mockRefreshSession;

  beforeEach(() => {
    vi.clearAllMocks();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // All API methods that require authentication
  const apiEndpoints = [
    'chat',
    'transcribe',
    'speak',
    'getProgress',
    'updateProgress',
  ] as const;

  it('should return 401 for all authenticated endpoints when no token is available', async () => {
    const fc = await import('fast-check');

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...apiEndpoints),
        async (endpoint) => {
          vi.clearAllMocks();

          // No token available
          mockGetAccessTokenLocal.mockResolvedValue(null);
          // Refresh also fails
          mockRefreshSessionLocal.mockResolvedValue(null);

          // Server returns 401 for unauthenticated requests
          globalThis.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 401,
            json: () => Promise.resolve({ error: 'Unauthorized', message: 'Token tidak valid' }),
          });

          const { chat, transcribe, speak, getProgress, updateProgress, ApiError } =
            await importApiClient();

          const callEndpoint = (): Promise<unknown> => {
            switch (endpoint) {
              case 'chat':
                return chat({ action: 'start_session', jobPosition: 'Software Engineer' });
              case 'transcribe':
                return transcribe('user/session/q.webm');
              case 'speak':
                return speak('Hello');
              case 'getProgress':
                return getProgress();
              case 'updateProgress':
                return updateProgress({ moduleType: 'speaking', score: 80, sessionId: 's1' });
            }
          };

          let caughtError: unknown = null;
          try {
            await callEndpoint();
          } catch (e) {
            caughtError = e;
          }

          // Must throw an error
          expect(caughtError).not.toBeNull();
          // Must be an ApiError with status 401
          expect(caughtError).toBeInstanceOf(ApiError);
          expect((caughtError as InstanceType<typeof ApiError>).status).toBe(401);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should return 401 for all endpoints when token is invalid/expired and refresh fails', async () => {
    const fc = await import('fast-check');

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...apiEndpoints),
        fc.string({ minLength: 1, maxLength: 128 }), // arbitrary invalid token
        async (endpoint, invalidToken) => {
          vi.clearAllMocks();

          // Return an invalid/expired token
          mockGetAccessTokenLocal.mockResolvedValue(invalidToken);
          // Refresh also fails
          mockRefreshSessionLocal.mockResolvedValue(null);

          // Server always returns 401 for invalid tokens
          globalThis.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 401,
            json: () => Promise.resolve({ error: 'Unauthorized', message: 'Token tidak valid' }),
          });

          const { chat, transcribe, speak, getProgress, updateProgress, ApiError } =
            await importApiClient();

          const callEndpoint = (): Promise<unknown> => {
            switch (endpoint) {
              case 'chat':
                return chat({ action: 'start_session', jobPosition: 'Software Engineer' });
              case 'transcribe':
                return transcribe('user/session/q.webm');
              case 'speak':
                return speak('Hello');
              case 'getProgress':
                return getProgress();
              case 'updateProgress':
                return updateProgress({ moduleType: 'speaking', score: 80, sessionId: 's1' });
            }
          };

          let caughtError: unknown = null;
          try {
            await callEndpoint();
          } catch (e) {
            caughtError = e;
          }

          // Must throw an error
          expect(caughtError).not.toBeNull();
          // Must be an ApiError with status 401
          expect(caughtError).toBeInstanceOf(ApiError);
          expect((caughtError as InstanceType<typeof ApiError>).status).toBe(401);
        },
      ),
      { numRuns: 100 },
    );
  });
});

