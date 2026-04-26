// Sonic Connection Manager — manages lifecycle of bidirectional streams to Amazon Nova Sonic 2
// Implements Requirements: 1.1, 1.2, 1.5, 1.6

import {
  BedrockRuntimeClient,
  InvokeModelWithBidirectionalStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';
import type {
  InvokeModelWithBidirectionalStreamInput,
} from '@aws-sdk/client-bedrock-runtime';
import type { ConversationTurn } from '../../../lib/types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Configuration for opening a Nova Sonic bidirectional stream.
 */
export interface SonicConnectionConfig {
  /** Bedrock model ID (e.g. 'amazon.nova-2-sonic-v1:0') */
  modelId: string;
  /** AWS region for the Bedrock client */
  region: string;
  /** System prompt that defines the AI interviewer persona */
  systemPrompt: string;
  /** Voice ID for Nova Sonic audio output */
  voiceId: string;
  /** Endpointing sensitivity for voice activity detection */
  endpointingSensitivity: 'HIGH' | 'MEDIUM' | 'LOW';
  /** Optional conversation history for reconnection / resume */
  conversationHistory?: ConversationTurn[];
}

/**
 * Handle representing an active bidirectional stream to Nova Sonic.
 *
 * The underlying SDK response is opaque (`unknown`) because the exact
 * streaming types vary across SDK versions. Callers interact with the
 * stream exclusively through the functions exported by this module.
 */
export interface SonicStreamHandle {
  /** The raw SDK bidirectional stream response */
  stream: unknown;
  /** The Bedrock client used to create this stream */
  client: BedrockRuntimeClient;
  /** Async iterator for writing events to the stream input */
  inputStream: AsyncGeneratorController;
  /** Timestamp (epoch ms) when the connection was opened */
  openedAt: number;
  /** Timer ID for the proactive reconnect check (cleared on close) */
  reconnectTimerId: ReturnType<typeof setTimeout> | null;
  /** Whether the stream has been closed */
  closed: boolean;
}

/**
 * Controller that lets us push events into the SDK's async-iterable input
 * stream from outside the generator function.
 */
export interface AsyncGeneratorController {
  /** Push a new event into the input stream */
  push: (event: InputStreamEvent) => void;
  /** Signal the end of the input stream */
  end: () => void;
}

// ---------------------------------------------------------------------------
// Nova Sonic event types (JSON payloads sent/received as bytes)
// ---------------------------------------------------------------------------

/** An event written to the Nova Sonic input stream, matching the SDK's union type. */
type InputStreamEvent = InvokeModelWithBidirectionalStreamInput;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BEDROCK_MODEL_ID =
  process.env.BEDROCK_MODEL_ID ?? 'amazon.nova-2-sonic-v1:0';

/**
 * Nova Sonic connections have an 8-minute (480 s) hard limit.
 * We proactively trigger reconnection at ~7 minutes (420 s) to allow
 * a graceful handover before the limit is reached.
 */
const PROACTIVE_RECONNECT_MS = 7 * 60 * 1000; // 420 000 ms

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Encode a JSON object into a `Uint8Array` suitable for the bidirectional
 * stream's `chunk.bytes` field.
 */
function encodeEvent(payload: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(payload));
}

/**
 * Create a properly typed SDK input event from a JSON payload.
 */
function createStreamEvent(payload: Record<string, unknown>): InputStreamEvent {
  return { chunk: { bytes: encodeEvent(payload) } } as InputStreamEvent;
}

/**
 * Build the session start event that configures Nova Sonic with the system
 * prompt, voice, and endpointing settings.
 */
function buildSessionStartEvent(config: SonicConnectionConfig): Record<string, unknown> {
  return {
    event: {
      sessionStart: {
        inferenceConfiguration: {
          text: {
            systemPrompt: config.systemPrompt,
          },
          audio: {
            outputAudioFormat: {
              sampleRateHertz: 24000,
              mediaType: 'audio/pcm',
            },
            voiceId: config.voiceId,
          },
          endpointing: {
            sensitivity: config.endpointingSensitivity,
          },
        },
      },
    },
  };
}

/**
 * Build a text-input event used to replay a single conversation turn
 * during reconnection.
 */
function buildTextInputEvent(
  role: 'user' | 'assistant',
  text: string,
  promptName: string,
): Record<string, unknown> {
  return {
    event: {
      textInput: {
        promptName,
        role,
        content: text,
      },
    },
  };
}

/**
 * Build an audio-input event from a base64-encoded PCM audio chunk.
 */
function buildAudioInputEvent(
  audioBase64: string,
  promptName: string,
  audioContentName: string,
): Record<string, unknown> {
  return {
    event: {
      audioInput: {
        promptName,
        audioContentName,
        content: audioBase64,
      },
    },
  };
}

/**
 * Build a content-start event that signals the beginning of audio input.
 */
function buildContentStartAudioEvent(
  promptName: string,
  audioContentName: string,
): Record<string, unknown> {
  return {
    event: {
      contentStart: {
        promptName,
        audioContentName,
        type: 'AUDIO',
        interactive: true,
        audioInputConfiguration: {
          mediaType: 'audio/pcm',
          sampleRateHertz: 16000,
          sampleSizeBits: 16,
          channelCount: 1,
          audioType: 'SPEECH',
          encoding: 'base64',
        },
      },
    },
  };
}

/**
 * Build a content-end event that signals the end of audio input.
 */
function buildContentEndEvent(
  promptName: string,
  audioContentName: string,
): Record<string, unknown> {
  return {
    event: {
      contentEnd: {
        promptName,
        audioContentName,
      },
    },
  };
}

/**
 * Build a prompt-start event.
 */
function buildPromptStartEvent(promptName: string): Record<string, unknown> {
  return {
    event: {
      promptStart: {
        promptName,
        textOutputConfiguration: {
          mediaType: 'text/plain',
        },
        audioOutputConfiguration: {
          mediaType: 'audio/pcm',
          sampleRateHertz: 24000,
          sampleSizeBits: 16,
          channelCount: 1,
          voiceId: 'tiffany',
          encoding: 'base64',
        },
      },
    },
  };
}

/**
 * Create an async-generator-based input stream that can be fed events
 * from outside the generator via a push/end controller.
 */
function createInputStreamController(): {
  controller: AsyncGeneratorController;
  iterable: AsyncIterable<InputStreamEvent>;
} {
  // Queue of pending events and a resolver for the next pull
  const queue: InputStreamEvent[] = [];
  let resolve: ((value: IteratorResult<InputStreamEvent>) => void) | null = null;
  let done = false;

  const controller: AsyncGeneratorController = {
    push(event: InputStreamEvent) {
      if (done) return;
      if (resolve) {
        const r = resolve;
        resolve = null;
        r({ value: event, done: false });
      } else {
        queue.push(event);
      }
    },
    end() {
      done = true;
      if (resolve) {
        const r = resolve;
        resolve = null;
        r({ value: undefined as unknown as InputStreamEvent, done: true });
      }
    },
  };

  const iterable: AsyncIterable<InputStreamEvent> = {
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<InputStreamEvent>> {
          if (queue.length > 0) {
            return Promise.resolve({ value: queue.shift()!, done: false });
          }
          if (done) {
            return Promise.resolve({
              value: undefined as unknown as InputStreamEvent,
              done: true,
            });
          }
          return new Promise<IteratorResult<InputStreamEvent>>((r) => {
            resolve = r;
          });
        },
      };
    },
  };

  return { controller, iterable };
}

// ---------------------------------------------------------------------------
// Callback type for proactive reconnect
// ---------------------------------------------------------------------------

/**
 * Optional callback invoked when the proactive reconnect timer fires.
 * The caller (NovaSonic Lambda handler) should use this to orchestrate
 * a seamless reconnection before the 8-minute limit.
 */
export type OnReconnectNeeded = (handle: SonicStreamHandle) => void;

/** Module-level reconnect callback — set via `setOnReconnectNeeded`. */
let onReconnectNeeded: OnReconnectNeeded | null = null;

/**
 * Register a callback that will be invoked when a stream approaches the
 * 8-minute connection limit and needs proactive reconnection.
 */
export function setOnReconnectNeeded(cb: OnReconnectNeeded | null): void {
  onReconnectNeeded = cb;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Open a new bidirectional stream to Amazon Nova Sonic.
 *
 * 1. Creates a `BedrockRuntimeClient` for the specified region.
 * 2. Calls `InvokeModelWithBidirectionalStream` with the Nova Sonic model.
 * 3. Sends the session-start event containing the system prompt.
 * 4. Starts a proactive reconnect timer (~7 minutes).
 * 5. Returns a `SonicStreamHandle` for further interaction.
 *
 * Requirements: 1.1, 1.5
 */
export async function openConnection(
  config: SonicConnectionConfig,
): Promise<SonicStreamHandle> {
  const modelId = config.modelId || BEDROCK_MODEL_ID;

  const client = new BedrockRuntimeClient({ region: config.region });

  // Create the push-based input stream
  const { controller, iterable } = createInputStreamController();

  // Open the bidirectional stream
  const command = new InvokeModelWithBidirectionalStreamCommand({
    modelId,
    body: iterable,
  });

  const response = await client.send(command);

  const handle: SonicStreamHandle = {
    stream: response.body,
    client,
    inputStream: controller,
    openedAt: Date.now(),
    reconnectTimerId: null,
    closed: false,
  };

  // --- Send initial configuration events ---

  // 1. Session start (system prompt, voice, endpointing)
  const sessionStartEvent = buildSessionStartEvent(config);
  controller.push(createStreamEvent(sessionStartEvent));

  // 2. Prompt start
  const promptName = `prompt-${Date.now()}`;
  const promptStartEvent = buildPromptStartEvent(promptName);
  controller.push(createStreamEvent(promptStartEvent));

  // 3. Content start for audio input
  const audioContentName = `audio-${Date.now()}`;
  const contentStartEvent = buildContentStartAudioEvent(promptName, audioContentName);
  controller.push(createStreamEvent(contentStartEvent));

  // --- Replay conversation history if provided (for reconnect / resume) ---
  if (config.conversationHistory && config.conversationHistory.length > 0) {
    for (const turn of config.conversationHistory) {
      const textEvent = buildTextInputEvent(turn.role, turn.text, promptName);
      controller.push(createStreamEvent(textEvent));
    }
  }

  // --- Start proactive reconnect timer ---
  handle.reconnectTimerId = setTimeout(() => {
    if (!handle.closed && onReconnectNeeded) {
      console.log(
        '[SonicConnectionManager] Proactive reconnect timer fired — connection approaching 8-minute limit',
      );
      onReconnectNeeded(handle);
    }
  }, PROACTIVE_RECONNECT_MS);

  return handle;
}

/**
 * Send a base64-encoded PCM audio chunk to an active Nova Sonic stream.
 *
 * Requirements: 1.2
 */
export async function sendAudioChunk(
  handle: SonicStreamHandle,
  audioBase64: string,
  promptName = 'default-prompt',
  audioContentName = 'default-audio',
): Promise<void> {
  if (handle.closed) {
    throw new Error('Cannot send audio chunk — stream is closed');
  }

  const audioEvent = buildAudioInputEvent(audioBase64, promptName, audioContentName);
  handle.inputStream.push(createStreamEvent(audioEvent));
}

/**
 * Gracefully close an active Nova Sonic bidirectional stream.
 *
 * Sends a content-end event, ends the input stream, and clears the
 * proactive reconnect timer.
 *
 * Requirements: 1.5
 */
export async function closeConnection(
  handle: SonicStreamHandle,
  promptName = 'default-prompt',
  audioContentName = 'default-audio',
): Promise<void> {
  if (handle.closed) {
    return; // Already closed — idempotent
  }

  handle.closed = true;

  // Clear the proactive reconnect timer
  if (handle.reconnectTimerId !== null) {
    clearTimeout(handle.reconnectTimerId);
    handle.reconnectTimerId = null;
  }

  // Send content-end to signal we're done sending audio
  try {
    const contentEndEvent = buildContentEndEvent(promptName, audioContentName);
    handle.inputStream.push(createStreamEvent(contentEndEvent));
  } catch (error) {
    console.warn('[SonicConnectionManager] Error sending content-end event:', error);
  }

  // End the input stream
  try {
    handle.inputStream.end();
  } catch (error) {
    console.warn('[SonicConnectionManager] Error ending input stream:', error);
  }
}

/**
 * Create a new Nova Sonic connection with conversation history for continuity.
 *
 * This is used when:
 * - The 8-minute connection limit is approaching (proactive reconnect)
 * - The user resumes a previously active session
 * - A connection drops unexpectedly and needs to be re-established
 *
 * The conversation history is replayed as text-input events so Nova Sonic
 * has full context of the prior conversation.
 *
 * Requirements: 1.6
 */
export async function reconnectWithHistory(
  config: SonicConnectionConfig,
  history: ConversationTurn[],
): Promise<SonicStreamHandle> {
  console.log(
    `[SonicConnectionManager] Reconnecting with ${history.length} conversation turns`,
  );

  // Open a fresh connection with the history embedded in the config
  const configWithHistory: SonicConnectionConfig = {
    ...config,
    conversationHistory: history,
  };

  return openConnection(configWithHistory);
}

/**
 * Returns the elapsed time in milliseconds since the stream was opened.
 * Useful for monitoring how close a connection is to the 8-minute limit.
 */
export function getConnectionAge(handle: SonicStreamHandle): number {
  return Date.now() - handle.openedAt;
}

/**
 * Returns true if the connection is approaching the 8-minute limit
 * (within the last minute).
 */
export function isNearTimeLimit(handle: SonicStreamHandle): boolean {
  return getConnectionAge(handle) >= PROACTIVE_RECONNECT_MS;
}
