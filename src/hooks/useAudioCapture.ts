import { useState, useRef, useCallback, useEffect } from 'react';

/** Target audio format for Nova Sonic: 16kHz, 16-bit, mono PCM */
const TARGET_SAMPLE_RATE = 16000;
const SCRIPT_PROCESSOR_BUFFER_SIZE = 4096;

/**
 * Voice gate settings. Streaming silence continuously (10 chunks/s) was measured
 * to choke the AI audio coming back over the same connection to the proxy, so
 * the microphone only sends while the user is speaking.
 */
export const VOICE_GATE_DEFAULTS = {
  /** RMS level a chunk must reach to count as speech (before noise adaptation). */
  minOpenRms: 0.012,
  /** Speech must be this many times louder than the tracked background noise. */
  noiseMultiplier: 3,
  /** Keep sending this long after the last speech chunk, so Nova Sonic hears the turn end. */
  hangoverMs: 1200,
  /** Audio from just before speech starts that is sent along, so the first syllable is not clipped. */
  prerollMs: 300,
  /** While gated, still send one chunk this often so the stream never goes fully idle. */
  keepaliveMs: 2000,
};

function rms(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return samples.length ? Math.sqrt(sum / samples.length) : 0;
}

/**
 * Create a gate that decides which 16 kHz chunks are worth sending.
 * Returns a function that takes the next chunk and the current time in ms and
 * returns the chunks to send now (possibly none, or pre-roll + the chunk).
 */
export function createVoiceGate(options: Partial<typeof VOICE_GATE_DEFAULTS> = {}) {
  const cfg = { ...VOICE_GATE_DEFAULTS, ...options };
  let open = false;
  let lastSpeechAt = -Infinity;
  let lastSentAt = -Infinity;
  // Start low so the first thing heard (often speech) is not mistaken for background noise.
  let noiseFloor = cfg.minOpenRms / cfg.noiseMultiplier;
  let preroll: { chunk: Float32Array; ms: number }[] = [];
  let prerollMs = 0;

  return (chunk: Float32Array, nowMs: number): Float32Array[] => {
    const level = rms(chunk);
    const chunkMs = (chunk.length / TARGET_SAMPLE_RATE) * 1000;
    const isSpeech = level >= Math.max(cfg.minOpenRms, noiseFloor * cfg.noiseMultiplier);

    // Background noise estimate: drops quickly (pauses between words pull it down)
    // and rises slowly, so only steady noise like a fan lifts it over ~20 s.
    if (level < noiseFloor) noiseFloor = noiseFloor * 0.7 + level * 0.3;
    else noiseFloor += (level - noiseFloor) * 0.005;

    if (isSpeech) {
      lastSpeechAt = nowMs;
      lastSentAt = nowMs;
      if (open) return [chunk];
      open = true;
      const out = [...preroll.map((p) => p.chunk), chunk];
      preroll = [];
      prerollMs = 0;
      return out;
    }

    if (open && nowMs - lastSpeechAt <= cfg.hangoverMs) {
      lastSentAt = nowMs;
      return [chunk];
    }
    open = false;

    // Copy: the browser may reuse the input buffer for the next callback.
    preroll.push({ chunk: chunk.slice(), ms: chunkMs });
    prerollMs += chunkMs;
    while (preroll.length > 1 && prerollMs - preroll[0].ms >= cfg.prerollMs) {
      prerollMs -= preroll.shift()!.ms;
    }

    if (nowMs - lastSentAt >= cfg.keepaliveMs) {
      lastSentAt = nowMs;
      return [chunk];
    }
    return [];
  };
}

export interface UseAudioCaptureOptions {
  /** Called with a PCM 16kHz 16-bit mono ArrayBuffer each time a chunk is ready. */
  onAudioChunk: (chunk: ArrayBuffer) => void;
}

export interface UseAudioCaptureReturn {
  /** Whether the microphone is currently capturing audio. */
  isCapturing: boolean;
  /** Start capturing audio from the microphone. */
  start: () => Promise<void>;
  /** Stop capturing and release all audio resources. */
  stop: () => void;
  /** Human-readable error message, or null if no error. */
  error: string | null;
}

/**
 * Downsample a Float32Array from `sourceSampleRate` to `targetSampleRate`
 * using linear interpolation.
 */
export function downsample(
  buffer: Float32Array,
  sourceSampleRate: number,
  targetSampleRate: number,
): Float32Array {
  if (sourceSampleRate === targetSampleRate) {
    return buffer;
  }

  const ratio = sourceSampleRate / targetSampleRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);

  for (let i = 0; i < newLength; i++) {
    const srcIndex = i * ratio;
    const srcIndexFloor = Math.floor(srcIndex);
    const srcIndexCeil = Math.min(srcIndexFloor + 1, buffer.length - 1);
    const fraction = srcIndex - srcIndexFloor;
    result[i] = buffer[srcIndexFloor] * (1 - fraction) + buffer[srcIndexCeil] * fraction;
  }

  return result;
}

/**
 * Convert a Float32Array of audio samples (range -1.0 to 1.0) to a
 * 16-bit signed integer PCM ArrayBuffer.
 */
export function float32ToPcm16(samples: Float32Array): ArrayBuffer {
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    // Clamp to [-1, 1] then scale to Int16 range
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    pcm[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  return pcm.buffer;
}

/**
 * Hook that captures audio from the user's microphone and emits PCM audio
 * chunks (16 kHz, 16-bit, mono) suitable for streaming to Nova Sonic via
 * WebSocket.
 *
 * Uses the Web Audio API with a ScriptProcessorNode for broad browser
 * compatibility. Each captured buffer is downsampled from the browser's
 * native sample rate to 16 kHz, converted to 16-bit PCM, and delivered
 * through the `onAudioChunk` callback.
 */
export function useAudioCapture(options: UseAudioCaptureOptions): UseAudioCaptureReturn {
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);

  // Keep a stable reference to the latest callback so the processor's
  // onaudioprocess handler always invokes the current version.
  const onAudioChunkRef = useRef(options.onAudioChunk);
  onAudioChunkRef.current = options.onAudioChunk;

  /**
   * Release all audio resources (AudioContext, MediaStream tracks,
   * processor node).
   */
  const cleanup = useCallback(() => {
    if (processorNodeRef.current) {
      processorNodeRef.current.onaudioprocess = null;
      processorNodeRef.current.disconnect();
      processorNodeRef.current = null;
    }

    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {
        // Ignore errors when closing an already-closed context
      });
      audioContextRef.current = null;
    }
  }, []);

  /**
   * Start capturing audio from the microphone.
   */
  const start = useCallback(async () => {
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: TARGET_SAMPLE_RATE,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      mediaStreamRef.current = stream;

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      const sourceNode = audioContext.createMediaStreamSource(stream);
      sourceNodeRef.current = sourceNode;

      // ScriptProcessorNode is deprecated but widely supported.
      // AudioWorklet would be the modern alternative but requires a
      // separate worklet file and more complex setup.
      const processorNode = audioContext.createScriptProcessor(
        SCRIPT_PROCESSOR_BUFFER_SIZE,
        1, // mono input
        1, // mono output
      );
      processorNodeRef.current = processorNode;

      const nativeSampleRate = audioContext.sampleRate;
      const voiceGate = createVoiceGate();

      processorNode.onaudioprocess = (event: AudioProcessingEvent) => {
        const inputData = event.inputBuffer.getChannelData(0);

        // Downsample from native rate to 16 kHz
        const downsampled = downsample(inputData, nativeSampleRate, TARGET_SAMPLE_RATE);

        // Only send while the user is speaking (plus pre-roll, hangover and keepalive)
        for (const chunk of voiceGate(downsampled, performance.now())) {
          onAudioChunkRef.current(float32ToPcm16(chunk));
        }
      };

      sourceNode.connect(processorNode);
      // Connect to destination to keep the processor running.
      // The output is silent because we don't write to the output buffer.
      processorNode.connect(audioContext.destination);

      setIsCapturing(true);
    } catch (err: unknown) {
      cleanup();

      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setError('Izinkan akses mikrofon untuk merekam jawaban Anda.');
      } else if (err instanceof DOMException && err.name === 'NotFoundError') {
        setError('Mikrofon tidak terdeteksi. Periksa perangkat Anda.');
      } else if (err instanceof DOMException && err.name === 'NotReadableError') {
        setError('Mikrofon sedang digunakan oleh aplikasi lain.');
      } else {
        setError('Gagal mengakses mikrofon. Periksa pengaturan perangkat Anda.');
      }
    }
  }, [cleanup]);

  /**
   * Stop capturing and release all resources.
   */
  const stop = useCallback(() => {
    cleanup();
    setIsCapturing(false);
  }, [cleanup]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return { isCapturing, start, stop, error };
}
