// NovaSonic Lambda — handles WebSocket message route for real-time interview sessions
// Implements Requirements: 1.1, 1.2, 1.3, 1.5, 2.3, 2.4, 4.1, 4.2, 4.3, 4.4, 5.1, 5.3, 7.3, 7.4, 8.1

import type { APIGatewayProxyResult } from 'aws-lambda';
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
  GoneException,
} from '@aws-sdk/client-apigatewaymanagementapi';
import type {
  ClientMessage,
  ServerMessage,
  ConnectionState,
  ConversationTurn,
  FeedbackReport,
} from '../../../lib/types';
import { buildSystemPrompt } from './promptBuilder';
import {
  createSession,
  getSession,
  updateSession,
  endSession as endSessionInDb,
  autoAbandonActiveSessions,
} from './sessionManager';
import { analyzeAnswer, generateSummary } from './feedbackAnalyzer';
import {
  openConnection,
  sendAudioChunk as sendAudioToSonic,
  closeConnection,
  reconnectWithHistory,
  setOnReconnectNeeded,
} from './sonicConnectionManager';
import type { SonicStreamHandle } from './sonicConnectionManager';

// ---------------------------------------------------------------------------
// Environment variables
// ---------------------------------------------------------------------------

const SESSIONS_TABLE_NAME = process.env.SESSIONS_TABLE_NAME ?? '';
const BEDROCK_MODEL_ID = process.env.BEDROCK_SONIC_MODEL_ID ?? process.env.BEDROCK_MODEL_ID ?? 'amazon.nova-2-sonic-v1:0';
const HAIKU_MODEL_ID = process.env.BEDROCK_TEXT_MODEL_ID ?? process.env.HAIKU_MODEL_ID ?? 'amazon.nova-pro-v1:0';
const WEBSOCKET_ENDPOINT = process.env.WEBSOCKET_ENDPOINT ?? '';
const AWS_REGION = process.env.AWS_REGION ?? 'us-east-1';

// ---------------------------------------------------------------------------
// API Gateway Management API client (for postToConnection)
// ---------------------------------------------------------------------------

let apigwClient: ApiGatewayManagementApiClient | null = null;

function getApigwClient(): ApiGatewayManagementApiClient {
  if (!apigwClient) {
    apigwClient = new ApiGatewayManagementApiClient({
      endpoint: WEBSOCKET_ENDPOINT,
    });
  }
  return apigwClient;
}

// ---------------------------------------------------------------------------
// WebSocket event type
// ---------------------------------------------------------------------------

interface WebSocketMessageEvent {
  requestContext: {
    connectionId: string;
    routeKey: string;
    domainName: string;
    stage: string;
  };
  body: string | null;
}

// ---------------------------------------------------------------------------
// In-memory connection state (per Lambda invocation)
// ---------------------------------------------------------------------------

let connectionState: ConnectionState | null = null;

function initConnectionState(connectionId: string, userId: string): ConnectionState {
  connectionState = {
    connectionId,
    userId,
    sessionId: null,
    sonicStream: null,
    promptName: `prompt-${Date.now()}`,
    audioContentName: `audio-${Date.now()}`,
    conversationHistory: [],
    questionCount: 0,
    currentQuestionTranscript: '',
    pendingFeedbacks: new Map(),
  };
  return connectionState;
}

// ---------------------------------------------------------------------------
// Turn Manager
// ---------------------------------------------------------------------------

/** Current speaker in the conversation */
let currentSpeaker: 'ai' | 'user' | 'idle' = 'idle';

/** Text accumulated from the current AI response */
let currentAiTranscript = '';

/** Text accumulated from the current user utterance */
let currentUserTranscript = '';

/** Whether the AI was interrupted by the user */
let aiInterrupted = false;

/**
 * Update the current speaker and emit a turn_event to the client.
 * Implements Requirements: 4.2, 4.3, 4.4
 */
async function setCurrentSpeaker(
  speaker: 'ai' | 'user' | 'idle',
  interrupted = false,
): Promise<void> {
  const previousSpeaker = currentSpeaker;
  currentSpeaker = speaker;
  aiInterrupted = interrupted;

  if (!connectionState) return;

  // When turn switches from user to AI, the user finished answering.
  // Trigger async feedback analysis.
  if (previousSpeaker === 'user' && speaker === 'ai' && currentUserTranscript.trim()) {
    triggerFeedbackAnalysis();
  }

  const turnEvent: ServerMessage = {
    type: 'turn_event',
    event: {
      currentSpeaker: speaker === 'idle' ? 'ai' : speaker,
      interrupted,
    },
  };

  await sendToClient(turnEvent);
}

/**
 * Trigger asynchronous feedback analysis for the user's last answer.
 * Implements Requirements: 5.1, 5.3
 */
function triggerFeedbackAnalysis(): void {
  if (!connectionState || !currentUserTranscript.trim()) return;

  const questionId = `q-${connectionState.questionCount}`;
  const userAnswer = currentUserTranscript.trim();
  const questionText = currentAiTranscript.trim() || 'Interview question';

  // Store the user's answer in conversation history
  connectionState.conversationHistory.push({
    role: 'user',
    text: userAnswer,
    questionId,
  });

  // Reset user transcript for next answer
  currentUserTranscript = '';

  // Get session info for feedback analysis
  const state = connectionState;

  // Run feedback analysis asynchronously — don't block the conversation
  const feedbackPromise = (async () => {
    try {
      const session = state.sessionId
        ? await getSession(state.userId, state.sessionId)
        : null;

      const jobPosition = session?.jobPosition ?? 'Software Engineer';
      const seniorityLevel = session?.seniorityLevel ?? 'mid';

      const report = await analyzeAnswer(
        questionText,
        userAnswer,
        jobPosition,
        seniorityLevel,
      );

      // Send feedback to client
      const feedbackMessage: ServerMessage = {
        type: 'feedback_event',
        questionId,
        report,
      };
      await sendToClient(feedbackMessage);

      // Update session with feedback
      if (state.sessionId) {
        const currentSession = await getSession(state.userId, state.sessionId);
        if (currentSession) {
          const questions = [...(currentSession.questions || [])];
          questions.push({
            questionId,
            questionText,
            questionType: 'contextual',
            transcription: userAnswer,
            feedback: report,
            answeredAt: new Date().toISOString(),
          });
          await updateSession(state.userId, state.sessionId, { questions });
        }
      }

      return report;
    } catch (error) {
      console.error('[NovaSonic] Feedback analysis failed:', error);
      return null;
    }
  })();

  connectionState.pendingFeedbacks.set(questionId, feedbackPromise as Promise<FeedbackReport>);
}

// ---------------------------------------------------------------------------
// Send message to WebSocket client
// ---------------------------------------------------------------------------

/**
 * Send a ServerMessage to the connected WebSocket client via API Gateway
 * Management API's postToConnection.
 */
async function sendToClient(message: ServerMessage): Promise<void> {
  if (!connectionState) return;

  try {
    const client = getApigwClient();
    await client.send(
      new PostToConnectionCommand({
        ConnectionId: connectionState.connectionId,
        Data: Buffer.from(JSON.stringify(message)),
      }),
    );
  } catch (error) {
    if (error instanceof GoneException) {
      console.warn('[NovaSonic] Client connection is gone, cannot send message');
    } else {
      console.error('[NovaSonic] Failed to send message to client:', error);
    }
  }
}

// ---------------------------------------------------------------------------
// Nova Sonic output stream processing
// ---------------------------------------------------------------------------

/**
 * Process the output stream from Nova Sonic bidirectional connection.
 * Handles audioOutput, textOutput, and contentEnd events.
 * Implements Requirements: 1.3, 2.3, 3.1, 3.2, 4.2, 4.3
 */
async function processOutputStream(handle: SonicStreamHandle): Promise<void> {
  if (!handle.stream) return;

  const stream = handle.stream as AsyncIterable<{ chunk?: { bytes?: Uint8Array } }>;

  try {
    for await (const event of stream) {
      if (!event.chunk?.bytes) continue;

      const decoded = new TextDecoder().decode(event.chunk.bytes);

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(decoded);
      } catch {
        console.warn('[NovaSonic] Failed to parse stream event:', decoded.substring(0, 200));
        continue;
      }

      const eventData = parsed.event as Record<string, unknown> | undefined;
      if (!eventData) continue;

      // Handle audio output from AI
      if (eventData.audioOutput) {
        const audioOutput = eventData.audioOutput as { content?: string };
        if (audioOutput.content && !aiInterrupted) {
          // Set speaker to AI if not already
          if (currentSpeaker !== 'ai') {
            // AI starts speaking — increment question count
            connectionState!.questionCount++;
            await setCurrentSpeaker('ai');
          }

          // Forward audio to client
          const audioMessage: ServerMessage = {
            type: 'audio_chunk',
            data: audioOutput.content,
          };
          await sendToClient(audioMessage);
        }
      }

      // Handle text output (transcript) from AI or ASR
      if (eventData.textOutput) {
        const textOutput = eventData.textOutput as {
          role?: string;
          content?: string;
        };

        if (textOutput.content) {
          const role = textOutput.role === 'user' ? 'user' : 'ai';

          if (role === 'ai') {
            currentAiTranscript += textOutput.content;
          } else {
            currentUserTranscript += textOutput.content;
            // User is speaking
            if (currentSpeaker !== 'user') {
              await setCurrentSpeaker('user');
            }
          }

          // Send transcript event to client
          const transcriptMessage: ServerMessage = {
            type: 'transcript_event',
            event: {
              role,
              text: textOutput.content,
              partial: true,
              timestamp: Date.now(),
            },
          };
          await sendToClient(transcriptMessage);
        }
      }

      // Handle content end (turn boundary)
      if (eventData.contentEnd) {
        const contentEnd = eventData.contentEnd as { role?: string };
        const role = contentEnd.role;

        if (role === 'assistant' || role === 'ai') {
          // AI finished speaking — store AI transcript in history
          if (currentAiTranscript.trim() && connectionState) {
            connectionState.conversationHistory.push({
              role: 'assistant',
              text: currentAiTranscript.trim(),
              questionId: `q-${connectionState.questionCount}`,
            });
          }

          // Send final transcript
          if (currentAiTranscript.trim()) {
            const finalTranscript: ServerMessage = {
              type: 'transcript_event',
              event: {
                role: 'ai',
                text: currentAiTranscript.trim(),
                partial: false,
                timestamp: Date.now(),
              },
            };
            await sendToClient(finalTranscript);
          }

          currentAiTranscript = '';
          aiInterrupted = false;
        } else if (role === 'user') {
          // User finished speaking — send final transcript
          if (currentUserTranscript.trim()) {
            const finalTranscript: ServerMessage = {
              type: 'transcript_event',
              event: {
                role: 'user',
                text: currentUserTranscript.trim(),
                partial: false,
                timestamp: Date.now(),
              },
            };
            await sendToClient(finalTranscript);
          }

          // Turn switches to AI
          await setCurrentSpeaker('ai');
        }
      }
    }
  } catch (error) {
    const errorName = (error as { name?: string }).name;
    if (errorName === 'AbortError' || handle.closed) {
      console.log('[NovaSonic] Stream processing ended (connection closed)');
    } else {
      console.error('[NovaSonic] Error processing output stream:', error);
      await sendToClient({
        type: 'error',
        error: {
          code: 'NOVA_SONIC_ERROR',
          message: 'Error processing AI response stream',
          retryable: true,
        },
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Message handlers
// ---------------------------------------------------------------------------

/**
 * Handle start_session message: create session, open Nova Sonic stream,
 * send system prompt, and start the conversation.
 * Implements Requirements: 1.1, 7.1, 7.6, 8.1
 */
async function handleStartSession(
  config: ClientMessage & { type: 'start_session' },
): Promise<void> {
  if (!connectionState) return;

  const { jobPosition, seniorityLevel, questionCategory } = config.config;

  console.log('[NovaSonic] Starting session', {
    connectionId: connectionState.connectionId,
    jobPosition,
    seniorityLevel,
    questionCategory,
  });

  try {
    // Auto-abandon any existing active sessions (Req 7.6)
    const abandonedCount = await autoAbandonActiveSessions(connectionState.userId);
    if (abandonedCount > 0) {
      console.log(`[NovaSonic] Auto-abandoned ${abandonedCount} active sessions`);
    }

    // Create new session in DynamoDB (Req 7.1)
    const session = await createSession(connectionState.userId, {
      jobPosition,
      seniorityLevel,
      questionCategory,
    });

    connectionState.sessionId = session.sessionId;

    // Update session with connectionId
    await updateSession(connectionState.userId, session.sessionId, {
      connectionId: connectionState.connectionId,
    });

    // Build system prompt (Req 8.1)
    const systemPrompt = buildSystemPrompt(jobPosition, seniorityLevel, questionCategory);

    // Open Nova Sonic bidirectional stream (Req 1.1)
    const handle = await openConnection({
      modelId: BEDROCK_MODEL_ID,
      region: AWS_REGION,
      systemPrompt,
      voiceId: 'tiffany',
      endpointingSensitivity: 'MEDIUM', // Req 4.1
    });

    connectionState.sonicStream = handle;

    // Register proactive reconnect handler (Req 1.5)
    setOnReconnectNeeded(async (oldHandle: SonicStreamHandle) => {
      await handleProactiveReconnect(oldHandle);
    });

    // Send session_started to client
    await sendToClient({
      type: 'session_started',
      sessionId: session.sessionId,
    });

    // Set initial turn to AI (interviewer speaks first)
    await setCurrentSpeaker('ai');

    // Start processing the output stream (non-blocking)
    processOutputStream(handle).catch((err) => {
      console.error('[NovaSonic] Output stream processing error:', err);
    });
  } catch (error) {
    console.error('[NovaSonic] Failed to start session:', error);
    await sendToClient({
      type: 'error',
      error: {
        code: 'NOVA_SONIC_ERROR',
        message: 'Failed to start interview session',
        retryable: true,
      },
    });
  }
}

/**
 * Handle audio_chunk message: forward audio to Nova Sonic stream.
 * Implements Requirements: 1.2
 */
async function handleAudioChunk(
  message: ClientMessage & { type: 'audio_chunk' },
): Promise<void> {
  if (!connectionState?.sonicStream) {
    console.warn('[NovaSonic] Received audio_chunk but no active stream');
    return;
  }

  try {
    const handle = connectionState.sonicStream as SonicStreamHandle;
    await sendAudioToSonic(
      handle,
      message.data,
      connectionState.promptName,
      connectionState.audioContentName,
    );
  } catch (error) {
    console.error('[NovaSonic] Failed to send audio chunk:', error);
    // Don't send error to client for individual audio chunks — too noisy
  }
}

/**
 * Handle end_session message: close Nova Sonic stream, generate summary,
 * send summary_event.
 * Implements Requirements: 1.5, 7.4, 12.1, 12.2
 */
async function handleEndSession(): Promise<void> {
  if (!connectionState) return;

  console.log('[NovaSonic] Ending session', {
    connectionId: connectionState.connectionId,
    sessionId: connectionState.sessionId,
  });

  try {
    // Close Nova Sonic stream (Req 1.5)
    if (connectionState.sonicStream) {
      const handle = connectionState.sonicStream as SonicStreamHandle;
      await closeConnection(
        handle,
        connectionState.promptName,
        connectionState.audioContentName,
      );
      connectionState.sonicStream = null;
    }

    // Wait for all pending feedback analyses to complete
    const pendingEntries = Array.from(connectionState.pendingFeedbacks.entries());
    const feedbackReports: FeedbackReport[] = [];

    for (const [questionId, promise] of pendingEntries) {
      try {
        const report = await promise;
        if (report) {
          feedbackReports.push(report);
        }
      } catch (error) {
        console.error(`[NovaSonic] Failed to get feedback for ${questionId}:`, error);
      }
    }

    // Also collect feedbacks from session record
    if (connectionState.sessionId) {
      const session = await getSession(connectionState.userId, connectionState.sessionId);
      if (session?.questions) {
        for (const q of session.questions) {
          if (q.feedback && !feedbackReports.some((r) => r === q.feedback)) {
            feedbackReports.push(q.feedback);
          }
        }
      }
    }

    // Generate summary via Claude Haiku (Req 12.1, 12.2)
    const jobPosition = connectionState.conversationHistory.length > 0
      ? (await getSession(connectionState.userId, connectionState.sessionId!))?.jobPosition ?? 'Software Engineer'
      : 'Software Engineer';

    const summaryReport = await generateSummary(
      feedbackReports,
      jobPosition,
      connectionState.questionCount,
    );

    // Send summary to client
    await sendToClient({
      type: 'summary_event',
      report: summaryReport,
    });

    // End session in DynamoDB (Req 7.4)
    if (connectionState.sessionId) {
      // Calculate total duration
      const session = await getSession(connectionState.userId, connectionState.sessionId);
      const totalDurationSeconds = session
        ? Math.round((Date.now() - new Date(session.createdAt).getTime()) / 1000)
        : 0;

      await updateSession(connectionState.userId, connectionState.sessionId, {
        conversationHistory: connectionState.conversationHistory,
        totalDurationSeconds,
      });

      await endSessionInDb(
        connectionState.userId,
        connectionState.sessionId,
        summaryReport,
      );
    }

    // Send session_ended to client
    await sendToClient({
      type: 'session_ended',
      sessionId: connectionState.sessionId ?? '',
    });
  } catch (error) {
    console.error('[NovaSonic] Failed to end session:', error);
    await sendToClient({
      type: 'error',
      error: {
        code: 'NOVA_SONIC_ERROR',
        message: 'Failed to end session properly',
        retryable: false,
      },
    });
  }
}

/**
 * Handle interrupt message: stop AI audio output, prioritize user input.
 * Implements Requirements: 4.4
 */
async function handleInterrupt(): Promise<void> {
  if (!connectionState) return;

  console.log('[NovaSonic] Interrupt received', {
    connectionId: connectionState.connectionId,
    currentSpeaker,
  });

  // Mark AI as interrupted
  aiInterrupted = true;

  // Switch turn to user with interrupted flag
  await setCurrentSpeaker('user', true);
}

/**
 * Handle resume_session message: load conversation history, open new
 * Nova Sonic stream with history.
 * Implements Requirements: 1.6, 7.3
 */
async function handleResumeSession(
  message: ClientMessage & { type: 'resume_session' },
): Promise<void> {
  if (!connectionState) return;

  const { sessionId } = message;

  console.log('[NovaSonic] Resuming session', {
    connectionId: connectionState.connectionId,
    sessionId,
  });

  try {
    // Load session from DynamoDB (Req 7.3)
    const session = await getSession(connectionState.userId, sessionId);

    if (!session) {
      await sendToClient({
        type: 'error',
        error: {
          code: 'SESSION_TIMEOUT',
          message: 'Session not found or expired',
          retryable: false,
        },
      });
      return;
    }

    if (session.status !== 'active' && session.status !== 'abandoned') {
      await sendToClient({
        type: 'error',
        error: {
          code: 'SESSION_TIMEOUT',
          message: `Session cannot be resumed (status: ${session.status})`,
          retryable: false,
        },
      });
      return;
    }

    // Update connection state with session data
    connectionState.sessionId = sessionId;
    connectionState.conversationHistory = session.conversationHistory ?? [];
    connectionState.questionCount = session.questions?.length ?? 0;

    // Update session with new connectionId and set status back to active
    await updateSession(connectionState.userId, sessionId, {
      connectionId: connectionState.connectionId,
      status: 'active',
    });

    // Build system prompt
    const systemPrompt = buildSystemPrompt(
      session.jobPosition,
      session.seniorityLevel,
      session.questionCategory,
    );

    // Open new Nova Sonic stream with conversation history (Req 1.6)
    const handle = await reconnectWithHistory(
      {
        modelId: BEDROCK_MODEL_ID,
        region: AWS_REGION,
        systemPrompt,
        voiceId: 'tiffany',
        endpointingSensitivity: 'MEDIUM',
      },
      connectionState.conversationHistory,
    );

    connectionState.sonicStream = handle;

    // Register proactive reconnect handler
    setOnReconnectNeeded(async (oldHandle: SonicStreamHandle) => {
      await handleProactiveReconnect(oldHandle);
    });

    // Send session_started to client
    await sendToClient({
      type: 'session_started',
      sessionId,
    });

    // Set initial turn to AI
    await setCurrentSpeaker('ai');

    // Start processing the output stream
    processOutputStream(handle).catch((err) => {
      console.error('[NovaSonic] Output stream processing error:', err);
    });
  } catch (error) {
    console.error('[NovaSonic] Failed to resume session:', error);
    await sendToClient({
      type: 'error',
      error: {
        code: 'NOVA_SONIC_ERROR',
        message: 'Failed to resume interview session',
        retryable: true,
      },
    });
  }
}

/**
 * Handle proactive reconnection when the 8-minute connection limit approaches.
 * Implements Requirements: 1.5, 1.6
 */
async function handleProactiveReconnect(oldHandle: SonicStreamHandle): Promise<void> {
  if (!connectionState) return;

  console.log('[NovaSonic] Proactive reconnect triggered');

  try {
    // Notify client about reconnection
    await sendToClient({
      type: 'reconnecting',
      attempt: 1,
      maxAttempts: 1,
    });

    // Close old connection
    await closeConnection(
      oldHandle,
      connectionState.promptName,
      connectionState.audioContentName,
    );

    // Save conversation history to DynamoDB
    if (connectionState.sessionId) {
      await updateSession(connectionState.userId, connectionState.sessionId, {
        conversationHistory: connectionState.conversationHistory,
      });
    }

    // Get session for system prompt rebuild
    const session = connectionState.sessionId
      ? await getSession(connectionState.userId, connectionState.sessionId)
      : null;

    const systemPrompt = session
      ? buildSystemPrompt(session.jobPosition, session.seniorityLevel, session.questionCategory)
      : '';

    // Generate new prompt/audio content names
    connectionState.promptName = `prompt-${Date.now()}`;
    connectionState.audioContentName = `audio-${Date.now()}`;

    // Open new connection with history
    const newHandle = await reconnectWithHistory(
      {
        modelId: BEDROCK_MODEL_ID,
        region: AWS_REGION,
        systemPrompt,
        voiceId: 'tiffany',
        endpointingSensitivity: 'MEDIUM',
      },
      connectionState.conversationHistory,
    );

    connectionState.sonicStream = newHandle;

    // Start processing the new output stream
    processOutputStream(newHandle).catch((err) => {
      console.error('[NovaSonic] Output stream processing error after reconnect:', err);
    });

    console.log('[NovaSonic] Proactive reconnect completed successfully');
  } catch (error) {
    console.error('[NovaSonic] Proactive reconnect failed:', error);
    await sendToClient({
      type: 'error',
      error: {
        code: 'NOVA_SONIC_ERROR',
        message: 'Connection renewal failed. Please try reconnecting.',
        retryable: true,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Message parser and router
// ---------------------------------------------------------------------------

/**
 * Parse and validate a ClientMessage from the WebSocket body.
 * Implements Requirements: 2.4
 */
function parseClientMessage(body: string | null): ClientMessage | null {
  if (!body) return null;

  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;

    if (!parsed.type || typeof parsed.type !== 'string') {
      return null;
    }

    const validTypes = ['start_session', 'audio_chunk', 'end_session', 'interrupt', 'resume_session'];
    if (!validTypes.includes(parsed.type)) {
      return null;
    }

    return parsed as unknown as ClientMessage;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Lambda handler
// ---------------------------------------------------------------------------

export const handler = async (event: WebSocketMessageEvent): Promise<APIGatewayProxyResult> => {
  const connectionId = event.requestContext.connectionId;
  const routeKey = event.requestContext.routeKey;

  console.log(`[NovaSonic] WebSocket message from ${connectionId}, route: ${routeKey}`);

  // Initialize connection state if not already set
  if (!connectionState || connectionState.connectionId !== connectionId) {
    // Extract userId from request context (set by Auth Lambda during $connect)
    const userId = 'authenticated-user'; // Placeholder — in production, extracted from authorizer context
    initConnectionState(connectionId, userId);
  }

  // Parse the incoming message
  const message = parseClientMessage(event.body);

  if (!message) {
    console.warn('[NovaSonic] Invalid or missing message body:', event.body?.substring(0, 200));
    await sendToClient({
      type: 'error',
      error: {
        code: 'NOVA_SONIC_ERROR',
        message: 'Invalid message format. Expected JSON with a valid "type" field.',
        retryable: false,
      },
    });
    return { statusCode: 400, body: 'Invalid message' };
  }

  try {
    // Route message to appropriate handler (Req 2.4)
    switch (message.type) {
      case 'start_session':
        await handleStartSession(message);
        break;

      case 'audio_chunk':
        await handleAudioChunk(message);
        break;

      case 'end_session':
        await handleEndSession();
        break;

      case 'interrupt':
        await handleInterrupt();
        break;

      case 'resume_session':
        await handleResumeSession(message);
        break;

      default: {
        // TypeScript exhaustive check
        const _exhaustive: never = message;
        console.warn('[NovaSonic] Unhandled message type:', (_exhaustive as ClientMessage));
      }
    }

    return { statusCode: 200, body: 'OK' };
  } catch (error) {
    console.error('[NovaSonic] Unhandled error in message handler:', error);

    await sendToClient({
      type: 'error',
      error: {
        code: 'NOVA_SONIC_ERROR',
        message: 'An unexpected error occurred',
        retryable: true,
      },
    });

    return { statusCode: 500, body: 'Internal error' };
  }
};
