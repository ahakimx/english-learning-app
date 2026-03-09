import { useState, useEffect, useCallback, useRef } from 'react';
import { speak, chat, TimeoutError } from '../../services/apiClient';
import { useAuth } from '../../hooks/useAuth';
import type { FeedbackReport } from '../../types';
import AudioRecorder from './AudioRecorder';
import TranscriptionDisplay from './TranscriptionDisplay';
import FeedbackDisplay from './FeedbackDisplay';

export type SessionPhase = 'listening' | 'recording' | 'processing' | 'feedback';

interface InterviewSessionProps {
  sessionId: string;
  jobPosition: string;
  currentQuestion: string;
  onEndSession: () => void;
  onNextQuestion: () => void;
}

export default function InterviewSession({
  sessionId,
  jobPosition,
  currentQuestion,
  onEndSession,
  onNextQuestion,
}: InterviewSessionProps) {
  const { user } = useAuth();
  const [phase, setPhase] = useState<SessionPhase>('listening');
  const [transcription, setTranscription] = useState<string | null>(null);
  const [feedbackReport, setFeedbackReport] = useState<FeedbackReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isTimeout, setIsTimeout] = useState(false);
  const [pendingTranscription, setPendingTranscription] = useState<string | null>(null);
  const [questionId] = useState(() => `q-${Date.now()}`);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Play question audio via TTS
  useEffect(() => {
    let cancelled = false;

    async function playQuestionAudio() {
      setPhase('listening');
      setTranscription(null);
      setFeedbackReport(null);
      setError(null);

      try {
        const response = await speak(currentQuestion);
        if (cancelled) return;

        const audio = new Audio(`data:audio/mp3;base64,${response.audioData}`);
        audioRef.current = audio;

        audio.onended = () => {
          if (!cancelled) setPhase('recording');
        };

        audio.onerror = () => {
          if (!cancelled) {
            // If audio fails to play, still move to recording
            setPhase('recording');
          }
        };

        await audio.play();
      } catch {
        if (!cancelled) {
          // If TTS fails, skip to recording phase
          setPhase('recording');
        }
      }
    }

    playQuestionAudio();

    return () => {
      cancelled = true;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [currentQuestion]);

  // Handle transcription received from AudioRecorder
  const handleTranscription = useCallback(
    async (text: string) => {
      setTranscription(text);
      setPendingTranscription(text);
      setPhase('processing');
      setError(null);
      setIsTimeout(false);

      try {
        const response = await chat({
          action: 'analyze_answer',
          sessionId,
          transcription: text,
        });

        if (response.feedbackReport) {
          setFeedbackReport(response.feedbackReport);
          setPhase('feedback');
          setPendingTranscription(null);
        } else {
          setError('Feedback tidak tersedia. Silakan coba lagi.');
          setPhase('recording');
        }
      } catch (err) {
        if (err instanceof TimeoutError) {
          setError('Analisis membutuhkan waktu lebih lama dari yang diharapkan. Silakan coba lagi.');
          setIsTimeout(true);
          setPhase('recording');
        } else {
          setError('Gagal menganalisis jawaban. Silakan coba lagi.');
          setIsTimeout(false);
          setPhase('recording');
        }
      }
    },
    [sessionId],
  );

  // Retry analysis after timeout
  const handleRetryAnalysis = useCallback(async () => {
    if (!pendingTranscription) return;
    setPhase('processing');
    setError(null);
    setIsTimeout(false);

    try {
      const response = await chat({
        action: 'analyze_answer',
        sessionId,
        transcription: pendingTranscription,
      });

      if (response.feedbackReport) {
        setFeedbackReport(response.feedbackReport);
        setPhase('feedback');
        setPendingTranscription(null);
      } else {
        setError('Feedback tidak tersedia. Silakan coba lagi.');
        setPhase('recording');
      }
    } catch (err) {
      if (err instanceof TimeoutError) {
        setError('Analisis membutuhkan waktu lebih lama dari yang diharapkan. Silakan coba lagi.');
        setIsTimeout(true);
        setPhase('recording');
      } else {
        setError('Gagal menganalisis jawaban. Silakan coba lagi.');
        setIsTimeout(false);
        setPhase('recording');
      }
    }
  }, [sessionId, pendingTranscription]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-medium text-blue-600 uppercase tracking-wide">
            Posisi: {jobPosition}
          </span>
          <span className="text-xs text-gray-400 ml-4" data-testid="session-id">
            Sesi: {sessionId}
          </span>
        </div>
        <span
          className="text-xs font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-600"
          data-testid="session-phase"
        >
          {phase === 'listening' && 'Mendengarkan pertanyaan...'}
          {phase === 'recording' && 'Rekam jawaban Anda'}
          {phase === 'processing' && 'Menganalisis jawaban...'}
          {phase === 'feedback' && 'Hasil Feedback'}
        </span>
      </div>

      {/* Question */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h3 className="text-sm font-semibold text-gray-500 mb-2">Pertanyaan Interview</h3>
        <p className="text-gray-800 leading-relaxed" data-testid="interview-question">
          {currentQuestion}
        </p>
      </div>

      {/* Error */}
      {error && (
        <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          <p>{error}</p>
          {isTimeout && pendingTranscription && (
            <button
              type="button"
              onClick={handleRetryAnalysis}
              className="mt-2 px-4 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 text-xs font-medium"
            >
              Coba Lagi
            </button>
          )}
        </div>
      )}

      {/* Listening phase */}
      {phase === 'listening' && (
        <div className="flex flex-col items-center py-8" role="status">
          <div className="animate-pulse flex space-x-1 mb-3">
            <span className="w-2 h-6 bg-blue-400 rounded" />
            <span className="w-2 h-8 bg-blue-500 rounded" />
            <span className="w-2 h-5 bg-blue-400 rounded" />
            <span className="w-2 h-7 bg-blue-500 rounded" />
            <span className="w-2 h-4 bg-blue-400 rounded" />
          </div>
          <p className="text-sm text-gray-600">Memutar audio pertanyaan...</p>
        </div>
      )}

      {/* Recording phase */}
      {phase === 'recording' && user && (
        <AudioRecorder
          sessionId={sessionId}
          questionId={questionId}
          userId={user.userId}
          onTranscription={handleTranscription}
        />
      )}

      {/* Processing phase */}
      {phase === 'processing' && (
        <div className="flex flex-col items-center py-8" role="status">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent mb-4" />
          <p className="text-sm text-gray-600">Menganalisis jawaban Anda...</p>
        </div>
      )}

      {/* Transcription (shown during processing and feedback) */}
      {transcription && (phase === 'processing' || phase === 'feedback') && (
        <TranscriptionDisplay transcription={transcription} />
      )}

      {/* Feedback phase */}
      {phase === 'feedback' && feedbackReport && (
        <>
          <FeedbackDisplay feedbackReport={feedbackReport} />

          <div className="flex gap-4 justify-center pt-4">
            <button
              type="button"
              onClick={onNextQuestion}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 text-sm font-medium"
            >
              Pertanyaan Berikutnya
            </button>
            <button
              type="button"
              onClick={onEndSession}
              className="px-6 py-2.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 text-sm font-medium"
            >
              Akhiri Sesi
            </button>
          </div>
        </>
      )}
    </div>
  );
}
