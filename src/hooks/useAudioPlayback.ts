import { useRef, useCallback, useEffect } from 'react';

/**
 * Audio playback hook using AudioWorklet with ExpandableBuffer.
 * Based on the official AWS Nova Sonic sample.
 *
 * Worklet is initialized eagerly on mount to avoid race conditions.
 */

const PLAYBACK_SAMPLE_RATE = 24000;

export interface UseAudioPlaybackReturn {
  playChunk: (base64Audio: string) => void;
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
  const pendingChunksRef = useRef<string[]>([]);

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
          sendChunk(node, chunk);
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

  const playChunk = useCallback((base64Audio: string) => {
    if (!readyRef.current) {
      // Buffer until worklet is ready
      pendingChunksRef.current.push(base64Audio);
      return;
    }
    if (!workletNodeRef.current) return;
    sendChunk(workletNodeRef.current, base64Audio);

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

function sendChunk(node: AudioWorkletNode, base64Audio: string) {
  const pcmData = base64ToArrayBuffer(base64Audio);
  const int16 = new Int16Array(pcmData);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768.0;
  }
  node.port.postMessage({ type: 'audio', audioData: float32 }, [float32.buffer]);
}
