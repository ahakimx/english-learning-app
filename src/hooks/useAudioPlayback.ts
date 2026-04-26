import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Nova Sonic audio output: PCM 24kHz, 16-bit, mono, base64-encoded.
 * Resampling to native rate is handled by the AudioWorklet processor.
 */

export interface UseAudioPlaybackReturn {
  playChunk: (base64Audio: string) => void;
  stop: () => void;
  isPlaying: boolean;
  error: string | null;
}

/**
 * Decode a base64 string into an ArrayBuffer.
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const length = binaryString.length;
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Convert Int16 PCM to Float32 (-1.0 to 1.0).
 */
export function pcm16ToFloat32(sample: number): number {
  return sample < 0 ? sample / 0x8000 : sample / 0x7fff;
}

/**
 * Audio playback hook using AudioWorkletNode.
 *
 * The AudioWorklet runs on a dedicated audio thread, so it's immune to
 * main thread jank from React re-renders. PCM samples are sent to the
 * worklet via MessagePort and played from a ring buffer.
 */
export function useAudioPlayback(): UseAudioPlaybackReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const mountedRef = useRef(true);
  const initPromiseRef = useRef<Promise<void> | null>(null);
  const readyRef = useRef(false);
  const hasChunksRef = useRef(false);

  /**
   * Initialize AudioContext + AudioWorklet. Called once lazily.
   */
  const ensureReady = useCallback(async () => {
    if (readyRef.current) return;
    if (initPromiseRef.current) {
      await initPromiseRef.current;
      return;
    }

    initPromiseRef.current = (async () => {
      try {
        // Don't force sampleRate — let browser use its native rate (typically 48kHz).
        // The AudioWorklet will resample 24kHz → native rate internally.
        const ctx = new AudioContext();
        audioContextRef.current = ctx;

        await ctx.audioWorklet.addModule('/audio-playback-processor.js');

        const workletNode = new AudioWorkletNode(ctx, 'playback-processor', {
          outputChannelCount: [1],
          processorOptions: {
            nativeSampleRate: ctx.sampleRate,
          },
        });
        workletNode.connect(ctx.destination);
        workletNodeRef.current = workletNode;

        if (ctx.state === 'suspended') {
          await ctx.resume();
        }

        console.log(`[useAudioPlayback] AudioWorklet ready, native sample rate: ${ctx.sampleRate}Hz`);
        readyRef.current = true;
      } catch (err) {
        console.error('[useAudioPlayback] Failed to init AudioWorklet:', err);
        if (mountedRef.current) {
          setError('Audio playback tidak tersedia di browser ini.');
        }
      }
    })();

    await initPromiseRef.current;
  }, []);

  /**
   * Queue a base64-encoded PCM audio chunk for playback.
   */
  const playChunk = useCallback(
    (base64Audio: string) => {
      setError(null);

      // If not ready yet, init and queue — don't block
      if (!readyRef.current) {
        ensureReady().then(() => {
          if (!workletNodeRef.current) return;
          try {
            sendSamplesToWorklet(base64Audio);
          } catch { /* ignore */ }
        });
        return;
      }

      if (!workletNodeRef.current) return;

      try {
        sendSamplesToWorklet(base64Audio);
      } catch {
        if (mountedRef.current) {
          setError('Gagal memutar audio. Menampilkan transkrip saja.');
        }
      }
    },
    [ensureReady],
  );

  /**
   * Decode base64 PCM and send Float32 samples to the AudioWorklet.
   */
  function sendSamplesToWorklet(base64Audio: string) {
    const pcmData = base64ToArrayBuffer(base64Audio);
    const int16 = new Int16Array(pcmData);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = pcm16ToFloat32(int16[i]);
    }
    workletNodeRef.current!.port.postMessage(
      { type: 'samples', samples: float32 },
      [float32.buffer],
    );
    if (!hasChunksRef.current) {
      hasChunksRef.current = true;
      if (mountedRef.current) setIsPlaying(true);
    }
  }

  /**
   * Stop all playback immediately (barge-in).
   */
  const stop = useCallback(() => {
    if (workletNodeRef.current) {
      workletNodeRef.current.port.postMessage({ type: 'clear' });
    }
    hasChunksRef.current = false;
    if (mountedRef.current) setIsPlaying(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (workletNodeRef.current) {
        workletNodeRef.current.disconnect();
        workletNodeRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
    };
  }, []);

  return { playChunk, stop, isPlaying, error };
}
