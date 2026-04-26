/**
 * Nova Sonic Proxy Server
 *
 * Express + Socket.IO server that proxies bidirectional streaming between
 * the browser (React frontend) and Amazon Nova Sonic via Bedrock.
 *
 * Architecture: Browser (React) → Socket.IO → This Server → Bedrock Nova Sonic
 *
 * The server uses AWS credentials from the environment (AWS CLI profile, env vars,
 * or IAM role) for the Bedrock call. The frontend still uses Cognito for REST API auth.
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import {
  BedrockRuntimeClient,
  InvokeModelWithBidirectionalStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';
import type { InvokeModelWithBidirectionalStreamInput } from '@aws-sdk/client-bedrock-runtime';
import { NodeHttp2Handler } from '@smithy/node-http-handler';
import { buildSystemPrompt } from './promptBuilder.js';
import type { SeniorityLevel, QuestionCategory } from './promptBuilder.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const BEDROCK_REGION = process.env.AWS_REGION ?? 'us-east-1';
const BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID ?? 'amazon.nova-2-sonic-v1:0';
const VOICE_ID = process.env.VOICE_ID ?? 'tiffany';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SessionConfig {
  jobPosition: string;
  seniorityLevel: SeniorityLevel;
  questionCategory: QuestionCategory;
}

interface ConversationTurn {
  role: 'user' | 'assistant';
  text: string;
}

interface AsyncGeneratorController {
  push: (event: InvokeModelWithBidirectionalStreamInput) => void;
  end: () => void;
}

interface StreamSession {
  inputController: AsyncGeneratorController;
  promptName: string;
  audioContentName: string;
  closed: boolean;
  interrupted: boolean;
  conversationHistory: ConversationTurn[];
  keepAliveTimer: ReturnType<typeof setInterval> | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function encodeEvent(payload: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(payload));
}

function createStreamEvent(payload: Record<string, unknown>): InvokeModelWithBidirectionalStreamInput {
  return { chunk: { bytes: encodeEvent(payload) } } as InvokeModelWithBidirectionalStreamInput;
}

/**
 * Create an async-iterable input stream with a push/end controller.
 */
function createInputStreamController(): {
  controller: AsyncGeneratorController;
  iterable: AsyncIterable<InvokeModelWithBidirectionalStreamInput>;
} {
  const queue: InvokeModelWithBidirectionalStreamInput[] = [];
  let resolve: ((value: IteratorResult<InvokeModelWithBidirectionalStreamInput>) => void) | null = null;
  let done = false;

  const controller: AsyncGeneratorController = {
    push(event) {
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
        r({ value: undefined as unknown as InvokeModelWithBidirectionalStreamInput, done: true });
      }
    },
  };

  const iterable: AsyncIterable<InvokeModelWithBidirectionalStreamInput> = {
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<InvokeModelWithBidirectionalStreamInput>> {
          if (queue.length > 0) {
            return Promise.resolve({ value: queue.shift()!, done: false });
          }
          if (done) {
            return Promise.resolve({
              value: undefined as unknown as InvokeModelWithBidirectionalStreamInput,
              done: true,
            });
          }
          return new Promise((r) => {
            resolve = r;
          });
        },
      };
    },
  };

  return { controller, iterable };
}

// ---------------------------------------------------------------------------
// Nova Sonic event builders (format per AWS docs:
// https://docs.aws.amazon.com/nova/latest/nova2-userguide/sonic-input-events.html)
// ---------------------------------------------------------------------------

function buildSessionStartEvent(): Record<string, unknown> {
  return {
    event: {
      sessionStart: {
        inferenceConfiguration: {
          maxTokens: 2048,
          topP: 0.9,
          temperature: 0.7,
        },
        turnDetectionConfiguration: {
          endpointingSensitivity: 'MEDIUM',
        },
      },
    },
  };
}

function buildPromptStartEvent(promptName: string): Record<string, unknown> {
  return {
    event: {
      promptStart: {
        promptName,
        textOutputConfiguration: { mediaType: 'text/plain' },
        audioOutputConfiguration: {
          mediaType: 'audio/lpcm',
          sampleRateHertz: 24000,
          sampleSizeBits: 16,
          channelCount: 1,
          voiceId: VOICE_ID,
          encoding: 'base64',
          audioType: 'SPEECH',
        },
      },
    },
  };
}

/** System prompt: contentStart(TEXT, SYSTEM) → textInput → contentEnd */
function buildSystemPromptContentStart(promptName: string, contentName: string): Record<string, unknown> {
  return {
    event: {
      contentStart: {
        promptName,
        contentName,
        type: 'TEXT',
        interactive: false,
        role: 'SYSTEM',
        textInputConfiguration: {
          mediaType: 'text/plain',
        },
      },
    },
  };
}

function buildTextInputEvent(promptName: string, contentName: string, content: string): Record<string, unknown> {
  return {
    event: {
      textInput: {
        promptName,
        contentName,
        content,
      },
    },
  };
}

function buildContentEndEvent(promptName: string, contentName: string): Record<string, unknown> {
  return {
    event: {
      contentEnd: {
        promptName,
        contentName,
      },
    },
  };
}

function buildContentStartAudioEvent(promptName: string, contentName: string): Record<string, unknown> {
  return {
    event: {
      contentStart: {
        promptName,
        contentName,
        type: 'AUDIO',
        interactive: true,
        role: 'USER',
        audioInputConfiguration: {
          mediaType: 'audio/lpcm',
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

function buildAudioInputEvent(audioBase64: string, promptName: string, contentName: string): Record<string, unknown> {
  return {
    event: {
      audioInput: {
        promptName,
        contentName,
        content: audioBase64,
      },
    },
  };
}

function buildPromptEndEvent(promptName: string): Record<string, unknown> {
  return {
    event: {
      promptEnd: {
        promptName,
      },
    },
  };
}

function buildSessionEndEvent(): Record<string, unknown> {
  return {
    event: {
      sessionEnd: {},
    },
  };
}

// ---------------------------------------------------------------------------
// Express + Socket.IO setup
// ---------------------------------------------------------------------------

const app = express();
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const httpServer = createServer(app);

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  // Prefer polling transport for App Runner compatibility (no sticky sessions)
  transports: ['polling', 'websocket'],
});

// ---------------------------------------------------------------------------
// Socket.IO connection handler
// ---------------------------------------------------------------------------

io.on('connection', (socket) => {
  console.log(`[Socket.IO] Client connected: ${socket.id}`);

  let session: StreamSession | null = null;

  // --- startSession ---
  socket.on('startSession', async (config: SessionConfig) => {
    console.log(`[Socket.IO] [${socket.id}] startSession:`, config);

    // Clean up any existing session
    if (session && !session.closed) {
      console.log(`[Socket.IO] [${socket.id}] Closing previous session`);
      cleanupSession(session);
    }

    try {
      const systemPrompt = buildSystemPrompt(
        config.jobPosition,
        config.seniorityLevel,
        config.questionCategory,
      );

      console.log(`[Socket.IO] [${socket.id}] Creating BedrockRuntimeClient (region: ${BEDROCK_REGION})`);

      const client = new BedrockRuntimeClient({
        region: BEDROCK_REGION,
        requestHandler: new NodeHttp2Handler({
          requestTimeout: 300_000,
          sessionTimeout: 600_000,
        }),
      });

      const { controller, iterable } = createInputStreamController();

      const promptName = `prompt-${Date.now()}`;
      const audioContentName = `audio-${Date.now()}`;

      session = {
        inputController: controller,
        promptName,
        audioContentName,
        closed: false,
        interrupted: false,
        conversationHistory: [],
        keepAliveTimer: null,
      };

      // IMPORTANT: Queue events BEFORE client.send() — the SDK starts reading
      // from the iterable immediately when send() is called. If the queue is
      // empty, the first event won't be sessionStart.

      // 1. sessionStart (inference config + turn detection)
      const sessionStartEvt = buildSessionStartEvent();
      console.log(`[Socket.IO] [${socket.id}] Queueing sessionStart:`, JSON.stringify(sessionStartEvt));
      controller.push(createStreamEvent(sessionStartEvt));

      // 2. promptStart (audio output config, voice)
      controller.push(createStreamEvent(buildPromptStartEvent(promptName)));

      // 3. System prompt: contentStart(TEXT, SYSTEM) → textInput → contentEnd
      const systemContentName = `system-prompt-${Date.now()}`;
      controller.push(createStreamEvent(buildSystemPromptContentStart(promptName, systemContentName)));
      controller.push(createStreamEvent(buildTextInputEvent(promptName, systemContentName, systemPrompt)));
      controller.push(createStreamEvent(buildContentEndEvent(promptName, systemContentName)));

      // 4. Audio content start (microphone input config)
      controller.push(createStreamEvent(buildContentStartAudioEvent(promptName, audioContentName)));

      // 5. Send a few frames of silence to signal that audio stream is active
      // Nova Sonic needs active audio input before it starts speaking
      const silenceFrame = Buffer.alloc(320).toString('base64'); // 10ms of silence at 16kHz 16-bit mono = 320 bytes
      for (let i = 0; i < 10; i++) {
        controller.push(createStreamEvent(buildAudioInputEvent(silenceFrame, promptName, audioContentName)));
      }
      console.log(`[Socket.IO] [${socket.id}] Sent 10 silence frames to activate audio stream`);

      console.log(`[Socket.IO] [${socket.id}] Events queued, sending InvokeModelWithBidirectionalStream...`);

      const command = new InvokeModelWithBidirectionalStreamCommand({
        modelId: BEDROCK_MODEL_ID,
        body: iterable,
      });

      const response = await client.send(command);

      console.log(`[Socket.IO] [${socket.id}] Stream opened successfully`);

      socket.emit('sessionStarted');
      console.log(`[Socket.IO] [${socket.id}] Session started, processing output stream...`);

      // Process output stream
      processOutputStream(socket, session, response.body as AsyncIterable<{ chunk?: { bytes?: Uint8Array } }>);
    } catch (error) {
      console.error(`[Socket.IO] [${socket.id}] startSession error:`, error);
      socket.emit('error', {
        code: 'NOVA_SONIC_ERROR',
        message: error instanceof Error ? error.message : 'Failed to start Nova Sonic session',
      });
    }
  });

  // --- audioChunk ---
  socket.on('audioChunk', (audioBase64: string) => {
    if (!session || session.closed) return;

    try {
      session.inputController.push(
        createStreamEvent(
          buildAudioInputEvent(audioBase64, session.promptName, session.audioContentName),
        ),
      );
    } catch (error) {
      console.warn(`[Socket.IO] [${socket.id}] audioChunk error:`, error);
    }
  });

  // --- interrupt ---
  socket.on('interrupt', () => {
    if (!session) return;
    console.log(`[Socket.IO] [${socket.id}] Interrupt received`);
    session.interrupted = true;
    // The interrupted flag is checked in processOutputStream to skip audio output
  });

  // --- endSession ---
  socket.on('endSession', () => {
    console.log(`[Socket.IO] [${socket.id}] endSession received`);
    if (session && !session.closed) {
      cleanupSession(session);
    }
    session = null;
  });

  // --- disconnect ---
  socket.on('disconnect', (reason) => {
    console.log(`[Socket.IO] [${socket.id}] Disconnected: ${reason}`);
    if (session && !session.closed) {
      cleanupSession(session);
    }
    session = null;
  });
});

// ---------------------------------------------------------------------------
// Output stream processing
// ---------------------------------------------------------------------------

async function processOutputStream(
  socket: { id: string; emit: (ev: string, ...args: unknown[]) => boolean },
  session: StreamSession,
  outputStream: AsyncIterable<{ chunk?: { bytes?: Uint8Array } }>,
): Promise<void> {
  let eventCount = 0;
  const contentRoles = new Map<string, string>();
  const contentTypes = new Map<string, string>();
  const contentStages = new Map<string, string>();
  // After END_TURN, Nova Sonic re-sends the full transcript as TEXT blocks.
  // We track this to skip the duplicate summary text.
  let skipAssistantTextUntilUserTurn = false;
  let lastRole = '';  // Track last TEXT content role for turn switch detection

  // Audio: send directly to client — the AudioWorklet ring buffer handles smoothing
  let firstAudioLogged = false;

  try {
    for await (const event of outputStream) {
      if (session.closed) break;
      if (!event.chunk?.bytes) continue;

      eventCount++;
      const decoded = new TextDecoder().decode(event.chunk.bytes);

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(decoded);
      } catch {
        console.warn(`[Socket.IO] [${socket.id}] Failed to parse event:`, decoded.substring(0, 200));
        continue;
      }

      const eventData = parsed.event as Record<string, unknown> | undefined;
      if (!eventData) continue;

      // Log event types periodically
      if (eventCount <= 20 || eventCount % 50 === 0) {
        console.log(`[Socket.IO] [${socket.id}] Event #${eventCount}:`, Object.keys(eventData));
      }

      // Track contentStart to map contentId → role, type, and generationStage
      if (eventData.contentStart) {
        const cs = eventData.contentStart as Record<string, unknown>;
        if (cs.contentId && cs.role) {
          const role = (cs.role as string).toUpperCase();
          const type = ((cs.type as string) ?? '').toUpperCase();
          contentRoles.set(cs.contentId as string, role);
          contentTypes.set(cs.contentId as string, type);
          
          let stage = 'FINAL';
          if (cs.additionalModelFields) {
            try {
              const fields = typeof cs.additionalModelFields === 'string' 
                ? JSON.parse(cs.additionalModelFields) 
                : cs.additionalModelFields;
              stage = (fields.generationStage ?? 'FINAL').toUpperCase();
            } catch { /* ignore */ }
          }
          contentStages.set(cs.contentId as string, stage);

          // Detect turn switch: emit BEFORE any transcript for the new turn
          if (role === 'ASSISTANT' && type === 'TEXT' && lastRole === 'USER') {
            socket.emit('turnSwitch', { from: 'user', to: 'ai' });
            skipAssistantTextUntilUserTurn = false;
          } else if (role === 'USER' && type === 'TEXT' && lastRole === 'ASSISTANT') {
            socket.emit('turnSwitch', { from: 'ai', to: 'user' });
          }
          
          if (type === 'TEXT') {
            lastRole = role;
          }
          
          console.log(`[Socket.IO] [${socket.id}] contentStart: contentId=${cs.contentId}, role=${cs.role}, type=${cs.type}, stage=${stage}`);
        }
      }

      // Handle audio output — send immediately, client ring buffer handles smoothing
      if (eventData.audioOutput) {
        if (session.interrupted) continue;

        const audioOutput = eventData.audioOutput as { content?: string };
        if (audioOutput.content) {
          if (!firstAudioLogged) {
            const rawBytes = Buffer.from(audioOutput.content, 'base64');
            console.log(`[Socket.IO] [${socket.id}] First audio chunk: ${rawBytes.length} bytes (${rawBytes.length / 2} samples)`);
            firstAudioLogged = true;
          }
          socket.emit('audioChunk', audioOutput.content);
        }
      }

      // Handle text output
      if (eventData.textOutput) {
        const textOutput = eventData.textOutput as { role?: string; content?: string; contentId?: string };
        if (textOutput.content) {
          const contentType = textOutput.contentId ? contentTypes.get(textOutput.contentId) : undefined;
          const contentStage = textOutput.contentId ? contentStages.get(textOutput.contentId) : undefined;
          const rawRole = (textOutput.role ?? '').toUpperCase();
          
          // Skip AUDIO block text (always duplicate)
          if (contentType === 'AUDIO') continue;
          
          const role: 'user' | 'ai' = rawRole === 'USER' ? 'user' : 'ai';
          
          if (contentStage === 'SPECULATIVE') {
            // SPECULATIVE = real-time partial text during speech — always send
            socket.emit('transcript', { role, text: textOutput.content, partial: true });
          } else if (skipAssistantTextUntilUserTurn && rawRole === 'ASSISTANT') {
            // FINAL after END_TURN = duplicate summary — skip
            continue;
          } else {
            // FINAL text (e.g. USER final) — send
            socket.emit('transcript', { role, text: textOutput.content, partial: false });
          }
        }
      }

      // Handle content end (turn boundary)
      if (eventData.contentEnd) {
        const contentEnd = eventData.contentEnd as { contentId?: string; type?: string; stopReason?: string };
        const trackedRole = contentEnd.contentId ? contentRoles.get(contentEnd.contentId) : undefined;
        console.log(`[Socket.IO] [${socket.id}] contentEnd: contentId=${contentEnd.contentId}, trackedRole=${trackedRole}, type=${contentEnd.type}, stopReason=${contentEnd.stopReason}`);

        // Only emit contentEnd to client for FULL turn ends, not PARTIAL_TURN
        // PARTIAL_TURN means more content blocks coming for the same turn
        if (contentEnd.stopReason !== 'PARTIAL_TURN') {
          if (trackedRole === 'ASSISTANT') {
            socket.emit('contentEnd', { role: 'ai' });
            session.interrupted = false;
            // After ASSISTANT END_TURN, Nova Sonic re-sends full transcript
            // as duplicate TEXT blocks. Skip those.
            if (contentEnd.stopReason === 'END_TURN') {
              skipAssistantTextUntilUserTurn = true;
            }
          } else if (trackedRole === 'USER') {
            socket.emit('contentEnd', { role: 'user' });
            skipAssistantTextUntilUserTurn = false;
          }
        }

        if (contentEnd.contentId) {
          contentRoles.delete(contentEnd.contentId);
          contentTypes.delete(contentEnd.contentId);
          contentStages.delete(contentEnd.contentId);
        }
      }
    }

    console.log(`[Socket.IO] [${socket.id}] Output stream ended after ${eventCount} events`);
  } catch (error) {
    console.error(`[Socket.IO] [${socket.id}] Output stream error after ${eventCount} events:`, error);
    if (!session.closed) {
      socket.emit('error', {
        code: 'NOVA_SONIC_ERROR',
        message: error instanceof Error ? error.message : 'Stream processing error',
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

function cleanupSession(session: StreamSession): void {
  if (session.closed) return;
  session.closed = true;

  // Stop keep-alive
  if (session.keepAliveTimer) {
    clearInterval(session.keepAliveTimer);
    session.keepAliveTimer = null;
  }

  // Closing sequence per AWS docs: contentEnd → promptEnd → sessionEnd
  try {
    session.inputController.push(
      createStreamEvent(buildContentEndEvent(session.promptName, session.audioContentName)),
    );
  } catch {
    // Ignore
  }

  try {
    session.inputController.push(
      createStreamEvent(buildPromptEndEvent(session.promptName)),
    );
  } catch {
    // Ignore
  }

  try {
    session.inputController.push(createStreamEvent(buildSessionEndEvent()));
  } catch {
    // Ignore
  }

  try {
    session.inputController.end();
  } catch {
    // Ignore
  }
}

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

httpServer.listen(PORT, () => {
  console.log(`\n🚀 Nova Sonic proxy server running on http://localhost:${PORT}`);
  console.log(`   Bedrock region: ${BEDROCK_REGION}`);
  console.log(`   Model: ${BEDROCK_MODEL_ID}`);
  console.log(`   Voice: ${VOICE_ID}`);
  console.log(`   Waiting for Socket.IO connections...\n`);
});
