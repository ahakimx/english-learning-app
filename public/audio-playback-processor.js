/**
 * AudioWorklet processor for Nova Sonic audio playback.
 * Based on the official AWS sample:
 * https://github.com/aws-samples/amazon-nova-samples/blob/main/speech-to-speech/amazon-nova-2-sonic/sample-codes/websocket-nodejs/public/src/lib/play/AudioPlayerProcessor.worklet.js
 *
 * Uses an ExpandableBuffer with initial buffering (1 second cushion)
 * to prevent stuttering/robot audio.
 */

class ExpandableBuffer {
  constructor() {
    this.buffer = new Float32Array(24000);
    this.readIndex = 0;
    this.writeIndex = 0;
    this.underflowedSamples = 0;
    this.isInitialBuffering = true;
    this.initialBufferLength = 4800; // 200ms at 24kHz — small enough to fill quickly
  }

  write(samples) {
    if (this.writeIndex + samples.length <= this.buffer.length) {
      // Enough space
    } else {
      if (samples.length <= this.readIndex) {
        // Shift to beginning
        const sub = this.buffer.subarray(this.readIndex, this.writeIndex);
        this.buffer.set(sub);
      } else {
        // Grow buffer
        const newLength = (samples.length + this.writeIndex - this.readIndex) * 2;
        const newBuffer = new Float32Array(newLength);
        newBuffer.set(this.buffer.subarray(this.readIndex, this.writeIndex));
        this.buffer = newBuffer;
      }
      this.writeIndex -= this.readIndex;
      this.readIndex = 0;
    }
    this.buffer.set(samples, this.writeIndex);
    this.writeIndex += samples.length;
    if (this.writeIndex - this.readIndex >= this.initialBufferLength) {
      this.isInitialBuffering = false;
    }
  }

  read(destination) {
    let copyLength = 0;
    if (!this.isInitialBuffering) {
      copyLength = Math.min(destination.length, this.writeIndex - this.readIndex);
    }
    destination.set(this.buffer.subarray(this.readIndex, this.readIndex + copyLength));
    this.readIndex += copyLength;
    if (copyLength < destination.length) {
      destination.fill(0, copyLength);
      this.underflowedSamples += destination.length - copyLength;
    }
    if (copyLength === 0 && this.writeIndex === 0) {
      // Only re-buffer if completely fresh (no data ever written yet)
      this.isInitialBuffering = true;
    }
  }

  clearBuffer() {
    this.readIndex = 0;
    this.writeIndex = 0;
  }
}

class AudioPlayerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.playbackBuffer = new ExpandableBuffer();
    this.port.onmessage = (event) => {
      if (event.data.type === 'audio') {
        this.playbackBuffer.write(event.data.audioData);
      } else if (event.data.type === 'barge-in') {
        this.playbackBuffer.clearBuffer();
      }
    };
  }

  process(inputs, outputs) {
    const output = outputs[0][0];
    this.playbackBuffer.read(output);
    return true;
  }
}

registerProcessor('audio-player-processor', AudioPlayerProcessor);
