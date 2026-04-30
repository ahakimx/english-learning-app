import { useState, useRef, useCallback, useEffect } from 'react';

/** Target audio format for Nova Sonic: 16kHz, 16-bit, mono PCM */
const TARGET_SAMPLE_RATE = 16000;
const SCRIPT_PROCESSOR_BUFFER_SIZE = 4096;

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

      processorNode.onaudioprocess = (event: AudioProcessingEvent) => {
        const inputData = event.inputBuffer.getChannelData(0);

        // Downsample from native rate to 16 kHz
        const downsampled = downsample(inputData, nativeSampleRate, TARGET_SAMPLE_RATE);

        // Convert float samples to 16-bit PCM
        const pcmBuffer = float32ToPcm16(downsampled);

        onAudioChunkRef.current(pcmBuffer);
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
