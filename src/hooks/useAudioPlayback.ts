import { useRef, useCallback, useEffect } from 'react';

/**
 * Audio playback hook using AudioWorklet with ExpandableBuffer.
 * Based on the official AWS Nova Sonic sample.
 *
 * Worklet is initialized eagerly on mount to avoid race conditions.
 */

const PLAYBACK_SAMPLE_RATE = 24000;

export interface UseAudioPlaybackReturn {
  /** Queue 16-bit mono PCM (base64 or binary) recorded at `sampleRate` Hz (default 24 kHz). */
  playChunk: (audio: string | ArrayBuffer, sampleRate?: number) => void;
  stop: () => void;
  isPlaying: boolean;
  error: string | null;
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export function pcm16ToFloat32(sample: number): number {
  return sample < 0 ? sample / 0x8000 : sample / 0x7fff;
}

export function useAudioPlayback(): UseAudioPlaybackReturn {
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const readyRef = useRef(false);
  const errorRef = useRef<string | null>(null);
  const pendingChunksRef = useRef<{ audio: string | ArrayBuffer; sampleRate: number }[]>([]);

  // Init on mount
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const ctx = new AudioContext({ sampleRate: PLAYBACK_SAMPLE_RATE });
        audioContextRef.current = ctx;

        await ctx.audioWorklet.addModule('/audio-playback-processor.js');

        if (cancelled) return;

        const node = new AudioWorkletNode(ctx, 'audio-player-processor', {
          outputChannelCount: [1],
        });
        node.connect(ctx.destination);
        workletNodeRef.current = node;
        readyRef.current = true;

        // Flush any chunks that arrived before ready
        for (const chunk of pendingChunksRef.current) {
          sendChunk(node, chunk.audio, chunk.sampleRate);
        }
        pendingChunksRef.current = [];
      } catch (err) {
        console.error('[useAudioPlayback] Init failed:', err);
        errorRef.current = 'Audio playback tidak tersedia.';
      }
    })();

    return () => {
      cancelled = true;
      if (workletNodeRef.current) {
        workletNodeRef.current.disconnect();
        workletNodeRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      readyRef.current = false;
    };
  }, []);

  const playChunk = useCallback((audio: string | ArrayBuffer, sampleRate: number = PLAYBACK_SAMPLE_RATE) => {
    if (!readyRef.current) {
      // Buffer until worklet is ready
      pendingChunksRef.current.push({ audio, sampleRate });
      return;
    }
    if (!workletNodeRef.current) return;
    sendChunk(workletNodeRef.current, audio, sampleRate);

    // Resume AudioContext if suspended (autoplay policy)
    if (audioContextRef.current?.state === 'suspended') {
      audioContextRef.current.resume().catch(() => {});
    }
  }, []);

  const stop = useCallback(() => {
    if (workletNodeRef.current) {
      workletNodeRef.current.port.postMessage({ type: 'barge-in' });
    }
    pendingChunksRef.current = [];
  }, []);

  return {
    playChunk,
    stop,
    isPlaying: false, // Not tracked — avoids re-renders
    error: errorRef.current,
  };
}

/**
 * Linear-interpolation resample of a mono Float32 chunk. Used to bring 16 kHz
 * proxy audio up to the 24 kHz playback context.
 */
export function resample(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate || samples.length === 0) return samples;
  const ratio = fromRate / toRate;
  const out = new Float32Array(Math.round(samples.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, samples.length - 1);
    const frac = pos - i0;
    out[i] = samples[i0] * (1 - frac) + samples[i1] * frac;
  }
  return out;
}

function sendChunk(node: AudioWorkletNode, audio: string | ArrayBuffer, sampleRate: number) {
  const pcmData = typeof audio === 'string' ? base64ToArrayBuffer(audio) : audio;
  const int16 = new Int16Array(pcmData, 0, Math.floor(pcmData.byteLength / 2));
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768.0;
  }
  const playable = resample(float32, sampleRate, PLAYBACK_SAMPLE_RATE);
  node.port.postMessage({ type: 'audio', audioData: playable }, [playable.buffer]);
}
