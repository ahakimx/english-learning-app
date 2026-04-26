/**
 * AudioWorklet processor for continuous PCM playback with resampling.
 * Runs on a dedicated audio thread.
 *
 * Receives PCM samples at 24kHz via MessagePort, resamples to the
 * AudioContext's native sample rate (typically 48kHz), and plays
 * continuously from a ring buffer.
 */
class PlaybackProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    // Source sample rate (Nova Sonic output)
    this.sourceSampleRate = 24000;
    // Native sample rate from AudioContext (e.g. 48000)
    this.nativeSampleRate = options.processorOptions?.nativeSampleRate || sampleRate;
    this.resampleRatio = this.nativeSampleRate / this.sourceSampleRate;

    // Ring buffer in native sample rate: 5 seconds
    this.bufferSize = Math.ceil(this.nativeSampleRate * 5);
    this.buffer = new Float32Array(this.bufferSize);
    this.writePos = 0;
    this.readPos = 0;
    this.available = 0;

    this.port.onmessage = (event) => {
      if (event.data.type === 'samples') {
        // Resample from 24kHz to native rate, then write to ring buffer
        const resampled = this.resample(event.data.samples);
        this.writeSamples(resampled);
      } else if (event.data.type === 'clear') {
        this.writePos = 0;
        this.readPos = 0;
        this.available = 0;
      }
    };
  }

  /**
   * Linear interpolation resample from sourceSampleRate to nativeSampleRate.
   */
  resample(input) {
    if (this.resampleRatio === 1) return input;

    const outputLength = Math.ceil(input.length * this.resampleRatio);
    const output = new Float32Array(outputLength);
    const ratio = 1 / this.resampleRatio; // step through input

    for (let i = 0; i < outputLength; i++) {
      const srcPos = i * ratio;
      const srcIdx = Math.floor(srcPos);
      const frac = srcPos - srcIdx;
      const s0 = input[srcIdx] || 0;
      const s1 = input[Math.min(srcIdx + 1, input.length - 1)] || 0;
      output[i] = s0 + frac * (s1 - s0);
    }

    return output;
  }

  writeSamples(samples) {
    for (let i = 0; i < samples.length; i++) {
      this.buffer[this.writePos] = samples[i];
      this.writePos = (this.writePos + 1) % this.bufferSize;
    }
    this.available = Math.min(this.available + samples.length, this.bufferSize);
  }

  process(inputs, outputs) {
    const output = outputs[0][0];
    if (!output) return true;

    const toRead = Math.min(output.length, this.available);
    for (let i = 0; i < toRead; i++) {
      output[i] = this.buffer[this.readPos];
      this.readPos = (this.readPos + 1) % this.bufferSize;
    }
    for (let i = toRead; i < output.length; i++) {
      output[i] = 0;
    }
    this.available -= toRead;

    return true;
  }
}

registerProcessor('playback-processor', PlaybackProcessor);
