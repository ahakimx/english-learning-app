/**
 * AudioWorklet processor for Nova Sonic audio playback.
 * Based on the official AWS sample:
 * https://github.com/aws-samples/amazon-nova-samples/blob/main/speech-to-speech/amazon-nova-2-sonic/sample-codes/websocket-nodejs/public/src/lib/play/AudioPlayerProcessor.worklet.js
 *
 * Adds a jitter buffer on top of the sample's expandable buffer. Audio from the
 * proxy arrives in bursts and, at the start of a turn, slower than real time, so
 * playing each chunk as soon as it lands produces many tiny dropouts. Instead:
 *   - playback starts only once a cushion is queued (or the stream goes quiet),
 *   - when the queue runs dry mid-turn it pauses and refills before resuming,
 *     growing the refill target each time the network stalls,
 *   - every start and stop is faded over a few milliseconds so there are no clicks.
 */

// Tuned against recorded chunk arrivals from the production proxy (Indonesia -> us-east-1),
// where a turn's audio sometimes trickles in at ~25% of real time for several seconds.
const START_CUSHION_S = 0.4; // queued audio needed before a turn starts playing
const RESUME_CUSHION_S = 0.5; // queued audio needed to resume after running dry
const MAX_RESUME_CUSHION_S = 2.0; // cap for the adaptive resume cushion
const RESUME_STEP_S = 0.3; // resume cushion growth per mid-turn stall
const FLUSH_AFTER_S = 0.6; // play whatever is queued once no audio has arrived for this long
const NEW_TURN_GAP_S = 1.0; // silence longer than this means the next audio is a new turn
const FADE_S = 0.005;

class JitterBuffer {
  constructor(rate) {
    this.rate = rate;
    this.buffer = new Float32Array(rate * 2);
    this.readIndex = 0;
    this.writeIndex = 0;
    this.startTarget = Math.round(rate * START_CUSHION_S);
    this.resumeTarget = Math.round(rate * RESUME_CUSHION_S);
    this.maxResumeTarget = Math.round(rate * MAX_RESUME_CUSHION_S);
    this.fadeLength = Math.max(1, Math.round(rate * FADE_S));
    this.reset();
  }

  reset() {
    this.readIndex = 0;
    this.writeIndex = 0;
    this.playing = false;
    this.target = this.startTarget;
    this.fadeInRemaining = 0;
    this.lastWriteTime = -Infinity;
    this.ranDryAt = null; // time the queue emptied mid-playback
  }

  get available() {
    return this.writeIndex - this.readIndex;
  }

  write(samples, now) {
    if (this.ranDryAt !== null) {
      if (now - this.ranDryAt < NEW_TURN_GAP_S) {
        // The turn was still going: the network stalled. Ask for a bigger cushion next time.
        this.resumeTarget = Math.min(this.maxResumeTarget, this.resumeTarget + Math.round(this.rate * RESUME_STEP_S));
        this.target = this.resumeTarget;
      } else {
        this.target = this.startTarget;
      }
      this.ranDryAt = null;
    }

    if (this.writeIndex + samples.length > this.buffer.length) {
      if (samples.length <= this.readIndex) {
        // Shift the unread part to the beginning
        this.buffer.copyWithin(0, this.readIndex, this.writeIndex);
      } else {
        const grown = new Float32Array((samples.length + this.available) * 2);
        grown.set(this.buffer.subarray(this.readIndex, this.writeIndex));
        this.buffer = grown;
      }
      this.writeIndex -= this.readIndex;
      this.readIndex = 0;
    }
    this.buffer.set(samples, this.writeIndex);
    this.writeIndex += samples.length;
    this.lastWriteTime = now;
  }

  read(out, now) {
    if (!this.playing) {
      const available = this.available;
      const streamWentQuiet = available > 0 && now - this.lastWriteTime >= FLUSH_AFTER_S;
      if (available >= this.target || streamWentQuiet) {
        this.playing = true;
        this.fadeInRemaining = this.fadeLength;
      } else {
        out.fill(0);
        return;
      }
    }

    const n = Math.min(out.length, this.available);
    out.set(this.buffer.subarray(this.readIndex, this.readIndex + n));
    this.readIndex += n;

    for (let i = 0; i < n && this.fadeInRemaining > 0; i++, this.fadeInRemaining--) {
      out[i] *= (this.fadeLength - this.fadeInRemaining + 1) / this.fadeLength;
    }

    if (n < out.length) {
      // Ran dry: fade out what we have and wait for the queue to refill.
      const fade = Math.min(n, this.fadeLength);
      for (let i = 0; i < fade; i++) {
        out[n - fade + i] *= (fade - 1 - i) / fade;
      }
      out.fill(0, n);
      this.playing = false;
      this.target = this.resumeTarget;
      this.ranDryAt = now;
      this.readIndex = 0;
      this.writeIndex = 0;
    }
  }
}

class AudioPlayerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.playbackBuffer = new JitterBuffer(sampleRate);
    this.port.onmessage = (event) => {
      if (event.data.type === 'audio') {
        this.playbackBuffer.write(event.data.audioData, currentTime);
      } else if (event.data.type === 'barge-in') {
        this.playbackBuffer.reset();
      }
    };
  }

  process(inputs, outputs) {
    this.playbackBuffer.read(outputs[0][0], currentTime);
    return true;
  }
}

registerProcessor('audio-player-processor', AudioPlayerProcessor);
