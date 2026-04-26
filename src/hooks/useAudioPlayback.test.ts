import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  useAudioPlayback,
  base64ToArrayBuffer,
  pcm16ToFloat32,
} from './useAudioPlayback';

// --- Web Audio API mocks ---

const mockClose = vi.fn().mockResolvedValue(undefined);
const mockResume = vi.fn().mockResolvedValue(undefined);
const mockConnect = vi.fn();
const mockSourceStop = vi.fn();
const mockSourceDisconnect = vi.fn();

/** Track all created source nodes so tests can trigger onended. */
let createdSources: Array<{
  buffer: AudioBuffer | null;
  onended: (() => void) | null;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}> = [];

const mockCreateBuffer = vi.fn(
  (_channels: number, length: number, sampleRate: number) => {
    const channelData = new Float32Array(length);
    return {
      duration: length / sampleRate,
      length,
      sampleRate,
      numberOfChannels: 1,
      getChannelData: () => channelData,
      copyFromChannel: vi.fn(),
      copyToChannel: vi.fn(),
    } as unknown as AudioBuffer;
  },
);

const mockCreateBufferSource = vi.fn(() => {
  const source = {
    buffer: null as AudioBuffer | null,
    onended: null as (() => void) | null,
    start: vi.fn(),
    stop: mockSourceStop,
    connect: mockConnect,
    disconnect: mockSourceDisconnect,
  };
  createdSources.push(source);
  return source;
});

let mockContextState = 'running';

beforeEach(() => {
  vi.clearAllMocks();
  createdSources = [];
  mockContextState = 'running';

  const MockAudioContext = vi.fn(() => ({
    get state() {
      return mockContextState;
    },
    sampleRate: 24000,
    currentTime: 0,
    destination: {},
    createBuffer: mockCreateBuffer,
    createBufferSource: mockCreateBufferSource,
    resume: mockResume,
    close: mockClose,
  }));

  Object.defineProperty(globalThis, 'AudioContext', {
    value: MockAudioContext,
    writable: true,
    configurable: true,
  });
});

// ---- Pure function tests ----

describe('base64ToArrayBuffer', () => {
  it('decodes an empty base64 string to an empty ArrayBuffer', () => {
    const result = base64ToArrayBuffer('');
    expect(result.byteLength).toBe(0);
  });

  it('decodes a known base64 string correctly', () => {
    // "AQID" is base64 for bytes [1, 2, 3]
    const result = base64ToArrayBuffer('AQID');
    const view = new Uint8Array(result);
    expect(view.length).toBe(3);
    expect(view[0]).toBe(1);
    expect(view[1]).toBe(2);
    expect(view[2]).toBe(3);
  });

  it('decodes base64 PCM data (16-bit samples)', () => {
    // Two 16-bit samples: 0x0100 (256) and 0xFF7F (32767 little-endian)
    // In little-endian bytes: [0x00, 0x01, 0xFF, 0x7F]
    // base64 of [0, 1, 255, 127] = "AAH/fw=="
    const result = base64ToArrayBuffer('AAH/fw==');
    expect(result.byteLength).toBe(4);
    const view = new Int16Array(result);
    expect(view.length).toBe(2);
  });
});

describe('pcm16ToFloat32', () => {
  it('converts silence (0) to 0.0', () => {
    expect(pcm16ToFloat32(0)).toBeCloseTo(0.0, 5);
  });

  it('converts max positive (32767) to ~1.0', () => {
    expect(pcm16ToFloat32(32767)).toBeCloseTo(1.0, 2);
  });

  it('converts max negative (-32768) to -1.0', () => {
    expect(pcm16ToFloat32(-32768)).toBeCloseTo(-1.0, 2);
  });

  it('converts mid-range positive to ~0.5', () => {
    expect(pcm16ToFloat32(16383)).toBeCloseTo(0.5, 2);
  });

  it('converts mid-range negative to ~-0.5', () => {
    expect(pcm16ToFloat32(-16384)).toBeCloseTo(-0.5, 2);
  });
});

// ---- Hook tests ----

describe('useAudioPlayback', () => {
  /**
   * Helper: create a base64-encoded PCM chunk with the given 16-bit samples.
   */
  function makePcmBase64(samples: number[]): string {
    const int16 = new Int16Array(samples);
    const bytes = new Uint8Array(int16.buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  it('starts in idle state with no error', () => {
    const { result } = renderHook(() => useAudioPlayback());
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('plays a chunk and sets isPlaying to true', () => {
    const { result } = renderHook(() => useAudioPlayback());
    const chunk = makePcmBase64([0, 1000, -1000]);

    act(() => {
      result.current.playChunk(chunk);
    });

    expect(result.current.isPlaying).toBe(true);
    expect(result.current.error).toBeNull();
    expect(mockCreateBufferSource).toHaveBeenCalled();
    expect(createdSources[0].start).toHaveBeenCalled();
    expect(mockConnect).toHaveBeenCalled();
  });

  it('sets isPlaying to false when the last source ends', () => {
    const { result } = renderHook(() => useAudioPlayback());
    const chunk = makePcmBase64([100, 200]);

    act(() => {
      result.current.playChunk(chunk);
    });

    expect(result.current.isPlaying).toBe(true);

    // Simulate the source finishing playback
    act(() => {
      createdSources[0].onended?.();
    });

    expect(result.current.isPlaying).toBe(false);
  });

  it('queues multiple chunks for gapless playback', () => {
    const { result } = renderHook(() => useAudioPlayback());
    const chunk1 = makePcmBase64([100, 200]);
    const chunk2 = makePcmBase64([300, 400]);

    act(() => {
      result.current.playChunk(chunk1);
      result.current.playChunk(chunk2);
    });

    expect(createdSources.length).toBe(2);
    // Both sources should have been started
    expect(createdSources[0].start).toHaveBeenCalled();
    expect(createdSources[1].start).toHaveBeenCalled();
    expect(result.current.isPlaying).toBe(true);
  });

  it('remains playing until all queued chunks finish', () => {
    const { result } = renderHook(() => useAudioPlayback());
    const chunk1 = makePcmBase64([100]);
    const chunk2 = makePcmBase64([200]);

    act(() => {
      result.current.playChunk(chunk1);
      result.current.playChunk(chunk2);
    });

    // First chunk ends — still playing because second is scheduled
    act(() => {
      createdSources[0].onended?.();
    });
    expect(result.current.isPlaying).toBe(true);

    // Second chunk ends — now done
    act(() => {
      createdSources[1].onended?.();
    });
    expect(result.current.isPlaying).toBe(false);
  });

  it('stop() immediately halts all playback (barge-in)', () => {
    const { result } = renderHook(() => useAudioPlayback());
    const chunk1 = makePcmBase64([100, 200]);
    const chunk2 = makePcmBase64([300, 400]);

    act(() => {
      result.current.playChunk(chunk1);
      result.current.playChunk(chunk2);
    });

    expect(result.current.isPlaying).toBe(true);

    act(() => {
      result.current.stop();
    });

    expect(result.current.isPlaying).toBe(false);
    // All sources should have been stopped
    expect(mockSourceStop).toHaveBeenCalled();
  });

  it('stop() clears the queue so no more chunks play', () => {
    const { result } = renderHook(() => useAudioPlayback());
    const chunk = makePcmBase64([100]);

    act(() => {
      result.current.playChunk(chunk);
    });

    act(() => {
      result.current.stop();
    });

    // Playing a new chunk after stop should work fresh
    const sourceCountBefore = createdSources.length;

    act(() => {
      result.current.playChunk(makePcmBase64([500]));
    });

    expect(createdSources.length).toBe(sourceCountBefore + 1);
    expect(result.current.isPlaying).toBe(true);
  });

  it('resumes AudioContext if suspended (autoplay policy)', () => {
    mockContextState = 'suspended';

    const { result } = renderHook(() => useAudioPlayback());
    const chunk = makePcmBase64([100]);

    act(() => {
      result.current.playChunk(chunk);
    });

    expect(mockResume).toHaveBeenCalled();
  });

  it('sets error when AudioContext creation fails', () => {
    // Make AudioContext constructor throw
    Object.defineProperty(globalThis, 'AudioContext', {
      value: vi.fn(() => {
        throw new Error('Not supported');
      }),
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useAudioPlayback());

    act(() => {
      result.current.playChunk(makePcmBase64([100]));
    });

    expect(result.current.error).toBe('Audio playback tidak tersedia di browser ini.');
    expect(result.current.isPlaying).toBe(false);
  });

  it('sets error on invalid base64 input but does not crash', () => {
    const { result } = renderHook(() => useAudioPlayback());

    act(() => {
      // Invalid base64 string
      result.current.playChunk('!!!not-valid-base64!!!');
    });

    expect(result.current.error).toBe('Gagal memutar audio. Menampilkan transkrip saja.');
    expect(result.current.isPlaying).toBe(false);
  });

  it('clears previous error when a valid chunk is played', () => {
    const { result } = renderHook(() => useAudioPlayback());

    // Cause an error first
    act(() => {
      result.current.playChunk('!!!invalid!!!');
    });
    expect(result.current.error).not.toBeNull();

    // Now play a valid chunk
    act(() => {
      result.current.playChunk(makePcmBase64([100]));
    });
    expect(result.current.error).toBeNull();
    expect(result.current.isPlaying).toBe(true);
  });

  it('cleans up AudioContext on unmount', () => {
    const { result, unmount } = renderHook(() => useAudioPlayback());

    // Start playback to create the AudioContext
    act(() => {
      result.current.playChunk(makePcmBase64([100]));
    });

    unmount();

    expect(mockClose).toHaveBeenCalled();
  });

  it('stops all sources on unmount', () => {
    const { result, unmount } = renderHook(() => useAudioPlayback());

    act(() => {
      result.current.playChunk(makePcmBase64([100]));
      result.current.playChunk(makePcmBase64([200]));
    });

    unmount();

    // All sources should have been stopped
    expect(mockSourceStop).toHaveBeenCalled();
  });
});
