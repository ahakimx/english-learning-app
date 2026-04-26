import { useState, useCallback, useRef, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import type {
  UseNovaSonicOptions,
  UseNovaSonicReturn,
  SessionConfig,
  ConversationTurn,
} from '../types';
import { chat } from '../services/apiClient';

const SONIC_SERVER_URL = import.meta.env.VITE_SONIC_SERVER_URL ?? 'http://localhost:3001';

/**
 * Encode an ArrayBuffer to a base64 string.
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Custom React hook that manages a Socket.IO connection to the Nova Sonic
 * proxy server (localhost:3001) which in turn streams to Amazon Nova Sonic
 * via Bedrock.
 *
 * Session management (create, end, resume, abandon) and feedback analysis
 * still use the existing REST API (/chat endpoint).
 */
export default function useNovaSonic(options: UseNovaSonicOptions): UseNovaSonicReturn {
  const [connectionState, setConnectionState] = useState<UseNovaSonicReturn['connectionState']>('disconnected');
  const [currentTurn, setCurrentTurn] = useState<UseNovaSonicReturn['currentTurn']>('idle');
  const [sessionActive, setSessionActive] = useState(false);

  // Refs for mutable state
  const socketRef = useRef<Socket | null>(null);
  const sessionActiveRef = useRef(false);
  const sessionConfigRef = useRef<SessionConfig | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  // Turn management state
  const currentSpeakerRef = useRef<'ai' | 'user' | 'idle'>('idle');
  const currentAiTranscriptRef = useRef('');
  const currentUserTranscriptRef = useRef('');
  const aiInterruptedRef = useRef(false);
  const conversationHistoryRef = useRef<ConversationTurn[]>([]);
  const questionCountRef = useRef(0);

  // Keep latest callbacks ref
  const callbacksRef = useRef(options);
  callbacksRef.current = options;

  /**
   * Trigger async feedback analysis via REST API after user finishes answering.
   */
  const triggerFeedbackAnalysis = useCallback((_questionText: string, userAnswer: string) => {
    if (!sessionIdRef.current || !sessionConfigRef.current) return;

    const questionId = `q-${questionCountRef.current}`;

    // Store user answer in conversation history
    conversationHistoryRef.current.push({
      role: 'user',
      text: userAnswer,
      questionId,
    });

    // Call REST API for feedback analysis (async, don't block)
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
  }, []);

  /**
   * Set up Socket.IO event listeners on the given socket.
   */
  const setupSocketListeners = useCallback((socket: Socket) => {
    socket.on('sessionStarted', () => {
      console.log('[useNovaSonic] Session started on server');
    });

    socket.on('audioChunk', (audioBase64: string) => {
      if (aiInterruptedRef.current) return;

      // Set speaker to AI if not already
      if (currentSpeakerRef.current !== 'ai') {
        questionCountRef.current++;
        currentSpeakerRef.current = 'ai';
        setCurrentTurn('ai');
        callbacksRef.current.onTurnChange({
          currentSpeaker: 'ai',
          interrupted: false,
        });
      }

      callbacksRef.current.onAudio(audioBase64);
    });

    socket.on('transcript', (data: { role: 'user' | 'ai'; text: string; partial: boolean }) => {
      // Accumulate text per role
      if (data.role === 'ai') {
        currentAiTranscriptRef.current += data.text;
      } else {
        currentUserTranscriptRef.current += data.text;
        if (currentSpeakerRef.current !== 'user') {
          currentSpeakerRef.current = 'user';
          setCurrentTurn('user');
          callbacksRef.current.onTurnChange({
            currentSpeaker: 'user',
            interrupted: false,
          });
        }
      }

      // Emit accumulated text to UI
      callbacksRef.current.onTranscript({
        role: data.role,
        text: data.role === 'ai' ? currentAiTranscriptRef.current : currentUserTranscriptRef.current,
        partial: true,
        timestamp: Date.now(),
      });
    });

    socket.on('contentEnd', (data: { role: 'user' | 'ai' }) => {
      if (data.role === 'ai') {
        aiInterruptedRef.current = false;
      } else if (data.role === 'user') {
        // User turn ended — finalize transcripts only if we have accumulated text
        const aiText = currentAiTranscriptRef.current.trim();
        const userText = currentUserTranscriptRef.current.trim();

        if (aiText) {
          // Finalize AI transcript
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
          currentAiTranscriptRef.current = '';
        }

        if (userText) {
          // Finalize user transcript
          callbacksRef.current.onTranscript({
            role: 'user',
            text: userText,
            partial: false,
            timestamp: Date.now(),
          });
          const lastAssistant = conversationHistoryRef.current
            .filter(t => t.role === 'assistant')
            .pop();
          triggerFeedbackAnalysis(lastAssistant?.text ?? 'Interview question', userText);
          currentUserTranscriptRef.current = '';
        }

        // Turn switches to AI
        currentSpeakerRef.current = 'ai';
        setCurrentTurn('ai');
        callbacksRef.current.onTurnChange({
          currentSpeaker: 'ai',
          interrupted: false,
        });
      }
    });

    socket.on('error', (err: { code: string; message: string }) => {
      console.error('[useNovaSonic] Server error:', err);
      callbacksRef.current.onError({
        code: (err.code as 'NOVA_SONIC_ERROR') || 'NOVA_SONIC_ERROR',
        message: err.message || 'Error from Nova Sonic proxy server',
        retryable: true,
      });
      setConnectionState('error');
    });

    socket.on('connect', () => {
      console.log('[useNovaSonic] Socket.IO connected');
      setConnectionState('connected');
    });

    socket.on('disconnect', (reason) => {
      console.log('[useNovaSonic] Socket.IO disconnected:', reason);
      if (sessionActiveRef.current) {
        setConnectionState('connecting'); // Socket.IO will auto-reconnect
      } else {
        setConnectionState('disconnected');
      }
    });

    socket.on('connect_error', (err) => {
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
  }, [triggerFeedbackAnalysis]);

  /**
   * Public connect method — establishes Socket.IO connection to the proxy server.
   */
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

  /**
   * Public disconnect method.
   */
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

  /**
   * Start a new interview session.
   * 1. Create session via REST API (DynamoDB)
   * 2. Connect to Socket.IO server if not connected
   * 3. Emit startSession to proxy server
   */
  const startSession = useCallback(async (config: SessionConfig) => {
    sessionConfigRef.current = config;
    setConnectionState('connecting');
    console.log('[useNovaSonic] startSession called with config:', config);

    try {
      // Create session via REST API (handles auto-abandon of old sessions)
      console.log('[useNovaSonic] Calling REST API start_session...');
      const response = await chat({
        action: 'start_session',
        jobPosition: config.jobPosition,
        seniorityLevel: config.seniorityLevel,
        questionCategory: config.questionCategory,
      });
      console.log('[useNovaSonic] REST API start_session response:', response.sessionId);

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

      // Connect to Socket.IO if not already connected
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

        // Wait for connection
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Socket.IO connection timeout'));
          }, 10_000);

          socket.on('connect', () => {
            clearTimeout(timeout);
            resolve();
          });

          socket.on('connect_error', (err) => {
            clearTimeout(timeout);
            reject(err);
          });
        });
      }

      // Emit startSession to the proxy server
      console.log('[useNovaSonic] Emitting startSession to proxy server...');
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
        message: error instanceof Error ? error.message : 'Failed to start interview session',
        retryable: true,
      });
    }
  }, [setupSocketListeners]);

  /**
   * Send an audio chunk to the proxy server.
   */
  const sendAudioChunk = useCallback((chunk: ArrayBuffer) => {
    if (!socketRef.current?.connected) return;

    const base64 = arrayBufferToBase64(chunk);
    socketRef.current.emit('audioChunk', base64);
  }, []);

  /**
   * End the current interview session.
   */
  const endSession = useCallback(async () => {
    // Tell the proxy server to close the Bedrock stream
    if (socketRef.current?.connected) {
      socketRef.current.emit('endSession');
    }

    setSessionActive(false);
    sessionActiveRef.current = false;

    // End session via REST API — this generates the summary report
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
          criteriaScores: { grammar: 0, vocabulary: 0, relevance: 0, fillerWords: 0, coherence: 0 },
          performanceTrend: [],
          topImprovementAreas: ['Session ended with errors'],
          recommendations: ['Please try again'],
        });
      }
    }

    setCurrentTurn('idle');
    setConnectionState('disconnected');
  }, []);

  /**
   * Interrupt AI speech (barge-in).
   */
  const interrupt = useCallback(() => {
    aiInterruptedRef.current = true;
    currentSpeakerRef.current = 'user';
    setCurrentTurn('user');

    // Tell the server about the interrupt
    if (socketRef.current?.connected) {
      socketRef.current.emit('interrupt');
    }

    callbacksRef.current.onTurnChange({
      currentSpeaker: 'user',
      interrupted: true,
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

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
