import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAudioCapture, downsample, float32ToPcm16 } from './useAudioCapture';

// --- Web Audio API mocks ---

const mockTrackStop = vi.fn();
const mockGetUserMedia = vi.fn();
const mockClose = vi.fn().mockResolvedValue(undefined);
const mockConnect = vi.fn();
const mockDisconnect = vi.fn();

let capturedOnaudioprocess: ((event: AudioProcessingEvent) => void) | null = null;

const mockCreateMediaStreamSource = vi.fn(() => ({
  connect: mockConnect,
  disconnect: mockDisconnect,
}));

const mockCreateScriptProcessor = vi.fn(() => {
  const node = {
    onaudioprocess: null as ((event: AudioProcessingEvent) => void) | null,
    connect: mockConnect,
    disconnect: mockDisconnect,
  };
  // Capture the reference so tests can trigger onaudioprocess
  setTimeout(() => {
    capturedOnaudioprocess = node.onaudioprocess;
  }, 0);
  return node;
});

beforeEach(() => {
  vi.clearAllMocks();
  capturedOnaudioprocess = null;

  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: mockGetUserMedia },
    writable: true,
    configurable: true,
  });

  // Mock AudioContext
  const MockAudioContext = vi.fn(() => ({
    sampleRate: 48000,
    createMediaStreamSource: mockCreateMediaStreamSource,
    createScriptProcessor: mockCreateScriptProcessor,
    destination: {},
    close: mockClose,
  }));

  Object.defineProperty(globalThis, 'AudioContext', {
    value: MockAudioContext,
    writable: true,
    configurable: true,
  });

  // Default: getUserMedia resolves with a mock stream
  mockGetUserMedia.mockResolvedValue({
    getTracks: () => [{ stop: mockTrackStop }],
  });
});

// ---- Pure function tests ----

describe('downsample', () => {
  it('returns the same buffer when source and target rates match', () => {
    const input = new Float32Array([0.1, 0.2, 0.3, 0.4]);
    const result = downsample(input, 16000, 16000);
    expect(result).toBe(input);
  });

  it('downsamples from 48kHz to 16kHz (3:1 ratio)', () => {
    // 6 samples at 48kHz → 2 samples at 16kHz
    const input = new Float32Array([0.0, 0.1, 0.2, 0.3, 0.4, 0.5]);
    const result = downsample(input, 48000, 16000);
    expect(result.length).toBe(2);
  });

  it('produces values via linear interpolation', () => {
    // Simple case: 4 samples at 2x rate → 2 samples at 1x rate
    const input = new Float32Array([0.0, 1.0, 0.0, 1.0]);
    const result = downsample(input, 32000, 16000);
    expect(result.length).toBe(2);
    // First sample at index 0 → input[0] = 0.0
    expect(result[0]).toBeCloseTo(0.0, 5);
    // Second sample at index 2 → input[2] = 0.0
    expect(result[1]).toBeCloseTo(0.0, 5);
  });
});

describe('float32ToPcm16', () => {
  it('converts silence (0.0) to zero', () => {
    const input = new Float32Array([0.0]);
    const result = float32ToPcm16(input);
    const view = new Int16Array(result);
    expect(view[0]).toBe(0);
  });

  it('converts max positive (1.0) to 32767', () => {
    const input = new Float32Array([1.0]);
    const result = float32ToPcm16(input);
    const view = new Int16Array(result);
    expect(view[0]).toBe(32767);
  });

  it('converts max negative (-1.0) to -32768', () => {
    const input = new Float32Array([-1.0]);
    const result = float32ToPcm16(input);
    const view = new Int16Array(result);
    expect(view[0]).toBe(-32768);
  });

  it('clamps values beyond [-1, 1]', () => {
    const input = new Float32Array([2.0, -2.0]);
    const result = float32ToPcm16(input);
    const view = new Int16Array(result);
    expect(view[0]).toBe(32767);
    expect(view[1]).toBe(-32768);
  });

  it('converts multiple samples correctly', () => {
    const input = new Float32Array([0.0, 0.5, -0.5]);
    const result = float32ToPcm16(input);
    const view = new Int16Array(result);
    expect(view.length).toBe(3);
    expect(view[0]).toBe(0);
    // 0.5 * 32767 ≈ 16383
    expect(view[1]).toBeCloseTo(16383, 0);
    // -0.5 * 32768 = -16384
    expect(view[2]).toBeCloseTo(-16384, 0);
  });
});

// ---- Hook tests ----

describe('useAudioCapture', () => {
  it('starts in idle state with no error', () => {
    const onAudioChunk = vi.fn();
    const { result } = renderHook(() => useAudioCapture({ onAudioChunk }));

    expect(result.current.isCapturing).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('starts capturing and sets isCapturing to true', async () => {
    const onAudioChunk = vi.fn();
    const { result } = renderHook(() => useAudioCapture({ onAudioChunk }));

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.isCapturing).toBe(true);
    expect(result.current.error).toBeNull();
    expect(mockGetUserMedia).toHaveBeenCalledWith({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
    expect(mockCreateMediaStreamSource).toHaveBeenCalled();
    expect(mockCreateScriptProcessor).toHaveBeenCalledWith(4096, 1, 1);
  });

  it('stops capturing and releases resources', async () => {
    const onAudioChunk = vi.fn();
    const { result } = renderHook(() => useAudioCapture({ onAudioChunk }));

    await act(async () => {
      await result.current.start();
    });

    act(() => {
      result.current.stop();
    });

    expect(result.current.isCapturing).toBe(false);
    expect(mockTrackStop).toHaveBeenCalled();
    expect(mockClose).toHaveBeenCalled();
  });

  it('shows permission error when getUserMedia throws NotAllowedError', async () => {
    const err = new DOMException('Permission denied', 'NotAllowedError');
    mockGetUserMedia.mockRejectedValue(err);

    const onAudioChunk = vi.fn();
    const { result } = renderHook(() => useAudioCapture({ onAudioChunk }));

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.isCapturing).toBe(false);
    expect(result.current.error).toBe('Izinkan akses mikrofon untuk merekam jawaban Anda.');
  });

  it('shows device error when getUserMedia throws NotFoundError', async () => {
    const err = new DOMException('No device', 'NotFoundError');
    mockGetUserMedia.mockRejectedValue(err);

    const onAudioChunk = vi.fn();
    const { result } = renderHook(() => useAudioCapture({ onAudioChunk }));

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.isCapturing).toBe(false);
    expect(result.current.error).toBe('Mikrofon tidak terdeteksi. Periksa perangkat Anda.');
  });

  it('shows busy error when getUserMedia throws NotReadableError', async () => {
    const err = new DOMException('Device busy', 'NotReadableError');
    mockGetUserMedia.mockRejectedValue(err);

    const onAudioChunk = vi.fn();
    const { result } = renderHook(() => useAudioCapture({ onAudioChunk }));

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.isCapturing).toBe(false);
    expect(result.current.error).toBe('Mikrofon sedang digunakan oleh aplikasi lain.');
  });

  it('shows generic error for unknown errors', async () => {
    mockGetUserMedia.mockRejectedValue(new Error('Unknown'));

    const onAudioChunk = vi.fn();
    const { result } = renderHook(() => useAudioCapture({ onAudioChunk }));

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.isCapturing).toBe(false);
    expect(result.current.error).toBe('Gagal mengakses mikrofon. Periksa pengaturan perangkat Anda.');
  });

  it('calls onAudioChunk with PCM ArrayBuffer when audio is processed', async () => {
    const onAudioChunk = vi.fn();
    const { result } = renderHook(() => useAudioCapture({ onAudioChunk }));

    await act(async () => {
      await result.current.start();
    });

    // Wait for the setTimeout in mock to capture onaudioprocess
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    // Simulate an audio processing event
    const mockInputBuffer = {
      getChannelData: () => new Float32Array(4096).fill(0.5),
    };

    act(() => {
      capturedOnaudioprocess?.({
        inputBuffer: mockInputBuffer,
      } as unknown as AudioProcessingEvent);
    });

    expect(onAudioChunk).toHaveBeenCalledTimes(1);
    const chunk = onAudioChunk.mock.calls[0][0];
    expect(chunk).toBeInstanceOf(ArrayBuffer);
    // The chunk should be smaller than the input due to downsampling (48kHz → 16kHz)
    // 4096 samples / 3 ≈ 1365 samples × 2 bytes = ~2730 bytes
    expect(chunk.byteLength).toBeGreaterThan(0);
    expect(chunk.byteLength).toBeLessThan(4096 * 2); // Less than original size in bytes
  });

  it('clears error when starting a new capture', async () => {
    // First, cause an error
    mockGetUserMedia.mockRejectedValueOnce(new Error('fail'));

    const onAudioChunk = vi.fn();
    const { result } = renderHook(() => useAudioCapture({ onAudioChunk }));

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.error).not.toBeNull();

    // Now allow getUserMedia to succeed
    mockGetUserMedia.mockResolvedValueOnce({
      getTracks: () => [{ stop: mockTrackStop }],
    });

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.isCapturing).toBe(true);
  });

  it('cleans up resources on unmount', async () => {
    const onAudioChunk = vi.fn();
    const { result, unmount } = renderHook(() => useAudioCapture({ onAudioChunk }));

    await act(async () => {
      await result.current.start();
    });

    unmount();

    expect(mockTrackStop).toHaveBeenCalled();
    expect(mockClose).toHaveBeenCalled();
  });
});
