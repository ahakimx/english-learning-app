import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';

const mockUploadData = vi.fn();

vi.mock('aws-amplify/storage', () => ({
  uploadData: (...args: unknown[]) => mockUploadData(...args),
}));

import { uploadAudio } from './audioService';

describe('audioService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUploadData.mockResolvedValue({ path: 'uploaded' });
  });

  it('uploads audio blob to correct S3 path', async () => {
    const blob = new Blob(['audio-data'], { type: 'audio/webm' });
    const key = await uploadAudio(blob, 'user-123', 'session-456', 'q1');

    expect(key).toBe('user-123/session-456/q1.webm');
    expect(mockUploadData).toHaveBeenCalledWith({
      path: 'user-123/session-456/q1.webm',
      data: blob,
      options: { contentType: 'audio/webm' },
    });
  });

  it('uses audio/webm as default content type when blob type is empty', async () => {
    const blob = new Blob(['audio-data']);
    // Blob with no type has empty string
    const key = await uploadAudio(blob, 'u1', 's1', 'q1');

    expect(key).toBe('u1/s1/q1.webm');
    const callArgs = mockUploadData.mock.calls[0][0];
    expect(callArgs.options.contentType).toBe('audio/webm');
  });

  it('returns correct key format with different inputs', async () => {
    const blob = new Blob(['data'], { type: 'audio/webm' });
    const key = await uploadAudio(blob, 'abc', 'def', 'ghi');
    expect(key).toBe('abc/def/ghi.webm');
  });
});

// Feature: english-learning-app, Property 6: Upload audio menghasilkan S3 key yang valid
// **Validates: Requirements 4.3**
describe('Property 6: Upload audio menghasilkan S3 key yang valid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUploadData.mockResolvedValue({ path: 'uploaded' });
  });

  it('should return a valid S3 key in format {userId}/{sessionId}/{questionId}.webm for any valid inputs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^[a-zA-Z0-9]+$/).filter(s => s.length > 0),
        fc.stringMatching(/^[a-zA-Z0-9]+$/).filter(s => s.length > 0),
        fc.stringMatching(/^[a-zA-Z0-9]+$/).filter(s => s.length > 0),
        async (userId, sessionId, questionId) => {
          mockUploadData.mockResolvedValue({ path: 'uploaded' });
          const blob = new Blob(['audio-data'], { type: 'audio/webm' });

          const key = await uploadAudio(blob, userId, sessionId, questionId);

          // Key must be non-empty
          expect(key.length).toBeGreaterThan(0);

          // Key must follow the format {userId}/{sessionId}/{questionId}.webm
          expect(key).toBe(`${userId}/${sessionId}/${questionId}.webm`);

          // Key must end with .webm extension
          expect(key.endsWith('.webm')).toBe(true);

          // Key must have exactly 2 slashes (3 path segments)
          const segments = key.split('/');
          expect(segments).toHaveLength(3);
          expect(segments[0]).toBe(userId);
          expect(segments[1]).toBe(sessionId);
          expect(segments[2]).toBe(`${questionId}.webm`);

          // uploadData must be called with the correct path and data
          expect(mockUploadData).toHaveBeenCalledWith({
            path: key,
            data: blob,
            options: { contentType: 'audio/webm' },
          });
        }
      ),
      { numRuns: 100 }
    );
  });
});
