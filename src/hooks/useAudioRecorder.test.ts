import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAudioRecorder } from './useAudioRecorder';

// --- MediaRecorder mock ---

let mockOnDataAvailable: ((e: { data: Blob }) => void) | null = null;
let mockOnStop: (() => void) | null = null;
let mockState = 'inactive';

const mockStop = vi.fn(() => {
  mockState = 'inactive';
  // Trigger onstop asynchronously like the real API
  setTimeout(() => mockOnStop?.(), 0);
});

const mockStart = vi.fn(() => {
  mockState = 'recording';
});

class MockMediaRecorder {
  state = 'inactive';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor() {
    this.state = mockState;
  }

  start() {
    mockStart();
    this.state = 'recording';
    mockState = 'recording';
    mockOnDataAvailable = this.ondataavailable;
    mockOnStop = this.onstop;
  }

  stop() {
    mockStop();
    this.state = 'inactive';
  }
}

const mockGetUserMedia = vi.fn();
const mockTrackStop = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  mockState = 'inactive';
  mockOnDataAvailable = null;
  mockOnStop = null;

  // Setup navigator.mediaDevices
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: mockGetUserMedia },
    writable: true,
    configurable: true,
  });

  // Setup MediaRecorder
  Object.defineProperty(globalThis, 'MediaRecorder', {
    value: MockMediaRecorder,
    writable: true,
    configurable: true,
  });

  // Default: getUserMedia resolves with a mock stream
  mockGetUserMedia.mockResolvedValue({
    getTracks: () => [{ stop: mockTrackStop }],
  });
});

describe('useAudioRecorder', () => {
  it('starts in idle state', () => {
    const { result } = renderHook(() => useAudioRecorder());
    expect(result.current.isRecording).toBe(false);
    expect(result.current.audioBlob).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('starts recording and sets isRecording to true', async () => {
    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => {
      await result.current.startRecording();
    });

    expect(result.current.isRecording).toBe(true);
    expect(mockGetUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(mockStart).toHaveBeenCalled();
  });

  it('shows permission error when getUserMedia throws NotAllowedError', async () => {
    const err = new DOMException('Permission denied', 'NotAllowedError');
    mockGetUserMedia.mockRejectedValue(err);

    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => {
      await result.current.startRecording();
    });

    expect(result.current.isRecording).toBe(false);
    expect(result.current.error).toBe('Izinkan akses mikrofon untuk merekam jawaban Anda.');
  });

  it('shows device error when getUserMedia throws NotFoundError', async () => {
    const err = new DOMException('No device', 'NotFoundError');
    mockGetUserMedia.mockRejectedValue(err);

    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => {
      await result.current.startRecording();
    });

    expect(result.current.isRecording).toBe(false);
    expect(result.current.error).toBe('Mikrofon tidak terdeteksi. Periksa perangkat Anda.');
  });

  it('shows device error for unknown errors', async () => {
    mockGetUserMedia.mockRejectedValue(new Error('Unknown'));

    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => {
      await result.current.startRecording();
    });

    expect(result.current.error).toBe('Mikrofon tidak terdeteksi. Periksa perangkat Anda.');
  });

  it('stops recording and produces audioBlob', async () => {
    // Mock Date.now to control duration
    const now = Date.now();
    vi.spyOn(Date, 'now')
      .mockReturnValueOnce(now) // start time
      .mockReturnValueOnce(now + 2000); // stop time (2 seconds)

    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => {
      await result.current.startRecording();
    });

    // Simulate data available
    act(() => {
      mockOnDataAvailable?.({ data: new Blob(['audio-data'], { type: 'audio/webm' }) });
    });

    // Stop recording
    await act(async () => {
      result.current.stopRecording();
      // Wait for the setTimeout in mockStop
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(result.current.isRecording).toBe(false);
    expect(result.current.audioBlob).toBeInstanceOf(Blob);
    expect(mockTrackStop).toHaveBeenCalled();
  });

  it('shows error when audio is too short', async () => {
    const now = Date.now();
    vi.spyOn(Date, 'now')
      .mockReturnValueOnce(now) // start time
      .mockReturnValueOnce(now + 500); // stop time (0.5 seconds - too short)

    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => {
      await result.current.startRecording();
    });

    await act(async () => {
      result.current.stopRecording();
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(result.current.isRecording).toBe(false);
    expect(result.current.audioBlob).toBeNull();
    expect(result.current.error).toBe('Audio terlalu pendek. Silakan rekam ulang.');
  });
});
