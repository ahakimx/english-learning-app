import { useState, useCallback, useRef, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import type {
  UseNovaSonicOptions,
  UseNovaSonicReturn,
  SessionConfig,
  ConversationTurn,
} from '../types';
import { chat } from '../services/apiClient';

const SONIC_SERVER_URL =
  import.meta.env.VITE_SONIC_SERVER_URL ?? 'http://localhost:3001';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Encode an ArrayBuffer to a base64 string. */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * React hook that manages a Socket.IO connection to the Nova Sonic proxy
 * server which streams bidirectional audio to/from Amazon Nova Sonic via
 * Bedrock.
 *
 * Session lifecycle (create / end / resume) and per-answer feedback analysis
 * still go through the REST API (`/chat` endpoint).
 */
export default function useNovaSonic(
  options: UseNovaSonicOptions,
): UseNovaSonicReturn {
  // ---- React state exposed to consumers ----
  const [connectionState, setConnectionState] =
    useState<UseNovaSonicReturn['connectionState']>('disconnected');
  const [currentTurn, setCurrentTurn] =
    useState<UseNovaSonicReturn['currentTurn']>('idle');
  const [sessionActive, setSessionActive] = useState(false);

  // ---- Mutable refs ----
  const socketRef = useRef<Socket | null>(null);
  const sessionActiveRef = useRef(false);
  const sessionConfigRef = useRef<SessionConfig | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  // Turn / transcript management
  const currentSpeakerRef = useRef<'ai' | 'user' | 'idle'>('idle');
  const currentAiTranscriptRef = useRef('');
  const currentUserTranscriptRef = useRef('');
  const aiInterruptedRef = useRef(false);
  const conversationHistoryRef = useRef<ConversationTurn[]>([]);
  const questionCountRef = useRef(0);

  // Keep latest callbacks in a ref so socket listeners never go stale.
  const callbacksRef = useRef(options);
  callbacksRef.current = options;

  // -----------------------------------------------------------------------
  // Feedback analysis (REST)
  // -----------------------------------------------------------------------

  const triggerFeedbackAnalysis = useCallback(
    (_questionText: string, userAnswer: string) => {
      if (!sessionIdRef.current || !sessionConfigRef.current) return;

      const questionId = `q-${questionCountRef.current}`;

      conversationHistoryRef.current.push({
        role: 'user',
        text: userAnswer,
        questionId,
      });

      chat({
        action: 'analyze_answer',
        sessionId: sessionIdRef.current,
        transcription: userAnswer,
        jobPosition: sessionConfigRef.current.jobPosition,
        seniorityLevel: sessionConfigRef.current.seniorityLevel,
      })
        .then((response) => {
          if (response.feedbackReport) {
            callbacksRef.current.onFeedback(response.feedbackReport);
          }
        })
        .catch((err) => {
          console.warn('[useNovaSonic] Feedback analysis failed:', err);
        });
    },
    [],
  );

  // -----------------------------------------------------------------------
  // Socket.IO event wiring
  // -----------------------------------------------------------------------

  const setupSocketListeners = useCallback(
    (socket: Socket) => {
      // -- sessionStarted --
      socket.on('sessionStarted', () => {
        console.log('[useNovaSonic] Session started on server');
      });

      // -- audioChunk (base64 PCM from AI) --
      socket.on('audioChunk', (audioBase64: string) => {
        if (aiInterruptedRef.current) return;
        callbacksRef.current.onAudio(audioBase64);
      });

      // -- turnSwitch (server detected role change — finalize before new text) --
      socket.on('turnSwitch', (data: { from: string; to: string }) => {
        console.log(`[useNovaSonic] turnSwitch: ${data.from} → ${data.to}`);

        // Finalize user transcript
        const userText = currentUserTranscriptRef.current.trim();
        if (userText) {
          callbacksRef.current.onTranscript({
            role: 'user',
            text: userText,
            partial: false,
            timestamp: Date.now(),
          });
          const lastAssistant = conversationHistoryRef.current
            .filter((t) => t.role === 'assistant').pop();
          triggerFeedbackAnalysis(lastAssistant?.text ?? 'Interview question', userText);
        }

        // Finalize AI transcript
        const aiText = currentAiTranscriptRef.current.trim();
        if (aiText) {
          callbacksRef.current.onTranscript({
            role: 'ai',
            text: aiText,
            partial: false,
            timestamp: Date.now(),
          });
          conversationHistoryRef.current.push({
            role: 'assistant',
            text: aiText,
            questionId: `q-${questionCountRef.current}`,
          });
        }

        // Reset accumulators
        currentAiTranscriptRef.current = '';
        currentUserTranscriptRef.current = '';

        if (data.to === 'ai') {
          questionCountRef.current++;
          currentSpeakerRef.current = 'ai';
          setCurrentTurn('ai');
          callbacksRef.current.onTurnChange({ currentSpeaker: 'ai', interrupted: false });
        } else {
          currentSpeakerRef.current = 'user';
          setCurrentTurn('user');
          callbacksRef.current.onTurnChange({ currentSpeaker: 'user', interrupted: false });
        }
      });

      // -- transcript (text fragment — accumulate per role) --
      socket.on(
        'transcript',
        (data: { role: 'user' | 'ai'; text: string; partial: boolean }) => {
          if (data.role === 'ai') {
            currentAiTranscriptRef.current += data.text;
          } else {
            currentUserTranscriptRef.current += data.text;

            // First user text after AI → switch speaker to user
            if (currentSpeakerRef.current !== 'user') {
              currentSpeakerRef.current = 'user';
              setCurrentTurn('user');
              callbacksRef.current.onTurnChange({
                currentSpeaker: 'user',
                interrupted: false,
              });
            }
          }

          // Emit accumulated text as partial (replaces the partial entry in UI)
          callbacksRef.current.onTranscript({
            role: data.role,
            text:
              data.role === 'ai'
                ? currentAiTranscriptRef.current
                : currentUserTranscriptRef.current,
            partial: true,
            timestamp: Date.now(),
          });
        },
      );

      // -- contentEnd (content block ended) --
      socket.on('contentEnd', (data: { role: 'user' | 'ai' }) => {
        if (data.role === 'ai') {
          aiInterruptedRef.current = false;
        } else if (data.role === 'user') {
          currentSpeakerRef.current = 'ai';
          setCurrentTurn('ai');
          callbacksRef.current.onTurnChange({
            currentSpeaker: 'ai',
            interrupted: false,
          });
        }
      });

      // -- error --
      socket.on('error', (err: { code: string; message: string }) => {
        console.error('[useNovaSonic] Server error:', err);
        callbacksRef.current.onError({
          code: (err.code as 'NOVA_SONIC_ERROR') || 'NOVA_SONIC_ERROR',
          message: err.message || 'Error from Nova Sonic proxy server',
          retryable: true,
        });
        setConnectionState('error');
      });

      // -- connection lifecycle --
      socket.on('connect', () => {
        console.log('[useNovaSonic] Socket.IO connected');
        setConnectionState('connected');
      });

      socket.on('disconnect', (reason: string) => {
        console.log('[useNovaSonic] Socket.IO disconnected:', reason);
        if (sessionActiveRef.current) {
          setConnectionState('connecting'); // auto-reconnect in progress
        } else {
          setConnectionState('disconnected');
        }
      });

      socket.on('connect_error', (err: Error) => {
        console.error('[useNovaSonic] Socket.IO connect_error:', err.message);
        if (!sessionActiveRef.current) {
          callbacksRef.current.onError({
            code: 'CONNECTION_FAILED',
            message: `Cannot connect to Nova Sonic server at ${SONIC_SERVER_URL}. Is the server running?`,
            retryable: true,
          });
          setConnectionState('error');
        }
      });
    },
    [triggerFeedbackAnalysis],
  );

  // -----------------------------------------------------------------------
  // Public: connect
  // -----------------------------------------------------------------------

  const connect = useCallback(async () => {
    if (socketRef.current?.connected) {
      setConnectionState('connected');
      return;
    }

    setConnectionState('connecting');

    const socket = io(SONIC_SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketRef.current = socket;
    setupSocketListeners(socket);
  }, [setupSocketListeners]);

  // -----------------------------------------------------------------------
  // Public: disconnect
  // -----------------------------------------------------------------------

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    setConnectionState('disconnected');
    setSessionActive(false);
    sessionActiveRef.current = false;
    setCurrentTurn('idle');
    sessionConfigRef.current = null;
    sessionIdRef.current = null;
    conversationHistoryRef.current = [];
    questionCountRef.current = 0;
    currentAiTranscriptRef.current = '';
    currentUserTranscriptRef.current = '';
    currentSpeakerRef.current = 'idle';
    aiInterruptedRef.current = false;
  }, []);

  // -----------------------------------------------------------------------
  // Public: startSession
  // -----------------------------------------------------------------------

  const startSession = useCallback(
    async (config: SessionConfig) => {
      sessionConfigRef.current = config;
      setConnectionState('connecting');
      console.log('[useNovaSonic] startSession called with config:', config);

      try {
        // 1. Create session via REST API (DynamoDB, auto-abandon old sessions)
        console.log('[useNovaSonic] Calling REST API start_session...');
        const response = await chat({
          action: 'start_session',
          jobPosition: config.jobPosition,
          seniorityLevel: config.seniorityLevel,
          questionCategory: config.questionCategory,
        });
        console.log(
          '[useNovaSonic] REST API start_session response:',
          response.sessionId,
        );

        sessionIdRef.current = response.sessionId;

        // Reset conversation state
        conversationHistoryRef.current = config.resumeSessionId
          ? conversationHistoryRef.current
          : [];
        questionCountRef.current = 0;
        currentAiTranscriptRef.current = '';
        currentUserTranscriptRef.current = '';
        currentSpeakerRef.current = 'idle';
        aiInterruptedRef.current = false;

        // 2. Connect Socket.IO if not already connected
        if (!socketRef.current?.connected) {
          const socket = io(SONIC_SERVER_URL, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
          });

          socketRef.current = socket;
          setupSocketListeners(socket);

          // Wait for connection (with timeout)
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error('Socket.IO connection timeout'));
            }, 10_000);

            socket.on('connect', () => {
              clearTimeout(timeout);
              resolve();
            });

            socket.on('connect_error', (err: Error) => {
              clearTimeout(timeout);
              reject(err);
            });
          });
        }

        // 3. Emit startSession to the proxy server
        console.log(
          '[useNovaSonic] Emitting startSession to proxy server...',
        );
        socketRef.current!.emit('startSession', {
          jobPosition: config.jobPosition,
          seniorityLevel: config.seniorityLevel,
          questionCategory: config.questionCategory,
        });

        setConnectionState('connected');
        setSessionActive(true);
        sessionActiveRef.current = true;
        setCurrentTurn('ai'); // AI speaks first
      } catch (error) {
        console.error('[useNovaSonic] startSession failed:', error);
        setConnectionState('error');
        callbacksRef.current.onError({
          code: 'NOVA_SONIC_ERROR',
          message:
            error instanceof Error
              ? error.message
              : 'Failed to start interview session',
          retryable: true,
        });
      }
    },
    [setupSocketListeners],
  );

  // -----------------------------------------------------------------------
  // Public: sendAudioChunk
  // -----------------------------------------------------------------------

  const sendAudioChunk = useCallback((chunk: ArrayBuffer) => {
    if (!socketRef.current?.connected) return;
    const base64 = arrayBufferToBase64(chunk);
    socketRef.current.emit('audioChunk', base64);
  }, []);

  // -----------------------------------------------------------------------
  // Public: endSession
  // -----------------------------------------------------------------------

  const endSession = useCallback(async () => {
    // Tell the proxy server to close the Bedrock stream
    if (socketRef.current?.connected) {
      socketRef.current.emit('endSession');
    }

    setSessionActive(false);
    sessionActiveRef.current = false;

    // End session via REST API — generates the summary report
    if (sessionIdRef.current) {
      try {
        const response = await chat({
          action: 'end_session',
          sessionId: sessionIdRef.current,
        });

        if (response.summaryReport) {
          callbacksRef.current.onSessionEnd(response.summaryReport);
        }
      } catch (error) {
        console.error('[useNovaSonic] Failed to end session via API:', error);
        callbacksRef.current.onSessionEnd({
          overallScore: 0,
          criteriaScores: {
            grammar: 0,
            vocabulary: 0,
            relevance: 0,
            fillerWords: 0,
            coherence: 0,
          },
          performanceTrend: [],
          topImprovementAreas: ['Session ended with errors'],
          recommendations: ['Please try again'],
        });
      }
    }

    setCurrentTurn('idle');
    setConnectionState('disconnected');
  }, []);

  // -----------------------------------------------------------------------
  // Public: interrupt (barge-in)
  // -----------------------------------------------------------------------

  const interrupt = useCallback(() => {
    aiInterruptedRef.current = true;
    currentSpeakerRef.current = 'user';
    setCurrentTurn('user');

    if (socketRef.current?.connected) {
      socketRef.current.emit('interrupt');
    }

    callbacksRef.current.onTurnChange({
      currentSpeaker: 'user',
      interrupted: true,
    });
  }, []);

  // -----------------------------------------------------------------------
  // Cleanup on unmount
  // -----------------------------------------------------------------------

  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  // -----------------------------------------------------------------------
  // Return public interface
  // -----------------------------------------------------------------------

  return {
    connect,
    disconnect,
    startSession,
    sendAudioChunk,
    endSession,
    interrupt,
    connectionState,
    currentTurn,
    sessionActive,
  };
}
