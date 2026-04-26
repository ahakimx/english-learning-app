import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Audio playback hook based on the official AWS Nova Sonic sample:
 * https://github.com/aws-samples/sample-nova-sonic-websocket-agentcore
 *
 * Uses a queue of AudioBufferSourceNodes played sequentially.
 * Each chunk is decoded, queued, and played one after another via onended callback.
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
  const length = binaryString.length;
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export function pcm16ToFloat32(sample: number): number {
  return sample < 0 ? sample / 0x8000 : sample / 0x7fff;
}

export function useAudioPlayback(): UseAudioPlaybackReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const mountedRef = useRef(true);

  /**
   * Get or create AudioContext at the playback sample rate (24kHz).
   * Using the same sample rate as Nova Sonic output avoids resampling issues.
   */
  const getAudioContext = useCallback((): AudioContext | null => {
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      return audioContextRef.current;
    }
    try {
      const ctx = new AudioContext({ sampleRate: PLAYBACK_SAMPLE_RATE });
      console.log(`[useAudioPlayback] AudioContext created, actual sampleRate: ${ctx.sampleRate}`);
      audioContextRef.current = ctx;
      return ctx;
    } catch {
      if (mountedRef.current) setError('Audio playback tidak tersedia.');
      return null;
    }
  }, []);

  /**
   * Play next audio buffer in the queue. Called recursively via onended.
   */
  const playNextAudio = useCallback(() => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      if (mountedRef.current) setIsPlaying(false);
      return;
    }

    const ctx = audioContextRef.current;
    if (!ctx || ctx.state === 'closed') {
      audioQueueRef.current = [];
      isPlayingRef.current = false;
      if (mountedRef.current) setIsPlaying(false);
      return;
    }

    // Resume if suspended (autoplay policy)
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    isPlayingRef.current = true;
    if (mountedRef.current) setIsPlaying(true);

    const audioBuffer = audioQueueRef.current.shift()!;
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);

    source.onended = () => {
      playNextAudio();
    };

    source.start();
  }, []);

  /**
   * Queue a base64-encoded PCM audio chunk for playback.
   * Follows the same pattern as the official AWS sample.
   */
  const playChunk = useCallback(
    (base64Audio: string) => {
      setError(null);

      const ctx = getAudioContext();
      if (!ctx) return;

      try {
        // Decode base64 → Int16 PCM → Float32
        const pcmData = base64ToArrayBuffer(base64Audio);
        const int16 = new Int16Array(pcmData);
        const float32 = new Float32Array(int16.length);
        for (let i = 0; i < int16.length; i++) {
          float32[i] = pcm16ToFloat32(int16[i]);
        }

        // Create AudioBuffer at 24kHz (matching Nova Sonic output)
        const audioBuffer = ctx.createBuffer(1, float32.length, PLAYBACK_SAMPLE_RATE);
        audioBuffer.getChannelData(0).set(float32);

        // Queue and start playing if not already
        audioQueueRef.current.push(audioBuffer);

        if (!isPlayingRef.current) {
          console.log(`[useAudioPlayback] Starting playback, queue size: ${audioQueueRef.current.length}`);
          playNextAudio();
        }
      } catch {
        if (mountedRef.current) {
          setError('Gagal memutar audio. Menampilkan transkrip saja.');
        }
      }
    },
    [getAudioContext, playNextAudio],
  );

  /**
   * Stop all playback immediately (barge-in).
   */
  const stop = useCallback(() => {
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    if (mountedRef.current) setIsPlaying(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      audioQueueRef.current = [];
      isPlayingRef.current = false;
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
    };
  }, []);

  return { playChunk, stop, isPlaying, error };
}
