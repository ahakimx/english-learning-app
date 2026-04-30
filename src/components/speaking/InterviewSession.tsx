import { useState, useEffect, useCallback, useRef } from 'react';
import { speak, chat, TimeoutError } from '../../services/apiClient';
import { useAuth } from '../../hooks/useAuth';
import type { FeedbackReport, SeniorityLevel, QuestionCategory, QuestionType } from '../../types';
import { SENIORITY_LABELS, CATEGORY_LABELS } from './JobPositionSelector';
import AudioRecorder from './AudioRecorder';
import TranscriptionDisplay from './TranscriptionDisplay';
import FeedbackDisplay from './FeedbackDisplay';

export type SessionPhase = 'listening' | 'recording' | 'processing' | 'feedback';

interface InterviewSessionProps {
  sessionId: string;
  jobPosition: string;
  seniorityLevel: SeniorityLevel;
  questionCategory: QuestionCategory;
  currentQuestion: string;
  questionType?: QuestionType;
  onEndSession: () => void;
  onNextQuestion: () => void;
}

export default function InterviewSession({
  sessionId,
  jobPosition,
  seniorityLevel,
  questionCategory,
  currentQuestion,
  questionType,
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
            setPhase('recording');
          }
        };

        await audio.play();
      } catch {
        if (!cancelled) {
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
    <div className="flex flex-col gap-6">
      {/* Metadata Header — Stitch breadcrumb + badges */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <nav className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-3">
            <span>Mock Interview</span>
            <span className="material-symbols-outlined text-[14px]">chevron_right</span>
            <span className="text-primary" data-testid="session-phase">
              {phase === 'listening' && 'Mendengarkan pertanyaan...'}
              {phase === 'recording' && 'Rekam jawaban Anda'}
              {phase === 'processing' && 'Menganalisis jawaban...'}
              {phase === 'feedback' && 'Hasil Feedback'}
            </span>
          </nav>
          <h2 className="text-3xl font-headline font-extrabold text-primary tracking-tight">Active Interview</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="bg-surface-container-low px-4 py-2 rounded-xl flex items-center gap-2 border border-outline-variant/10">
            <span className="material-symbols-outlined text-sm text-primary">work</span>
            <span className="text-xs font-semibold text-on-surface-variant">Posisi: {jobPosition}</span>
          </div>
          <div className="bg-surface-container-low px-4 py-2 rounded-xl flex items-center gap-2 border border-outline-variant/10" data-testid="session-seniority">
            <span className="material-symbols-outlined text-sm text-primary">leaderboard</span>
            <span className="text-xs font-semibold text-on-surface-variant">Tingkat: {SENIORITY_LABELS[seniorityLevel]}</span>
          </div>
          <div className="bg-surface-container-low px-4 py-2 rounded-xl flex items-center gap-2 border border-outline-variant/10" data-testid="session-category">
            <span className="material-symbols-outlined text-sm text-primary">category</span>
            <span className="text-xs font-semibold text-on-surface-variant">Kategori: {CATEGORY_LABELS[questionCategory].label}</span>
          </div>
          <div className="bg-surface-container-low px-4 py-2 rounded-xl flex items-center gap-2 border border-outline-variant/10" data-testid="session-id">
            <span className="material-symbols-outlined text-sm text-outline">tag</span>
            <span className="text-xs font-semibold text-on-surface-variant">Sesi: {sessionId}</span>
          </div>
        </div>
      </div>

      {/* Question Area — Stitch card with Q indicator */}
      <div className="bg-surface-container-lowest rounded-xl p-8 shadow-sm border border-outline-variant/5">
        <div className="flex items-start gap-4">
          <div className="mt-1 w-8 h-8 flex-shrink-0 bg-primary/10 text-primary rounded-full flex items-center justify-center font-bold font-headline">Q</div>
          <div>
            {questionType && (
              <span
                data-testid="question-type-badge"
                className={`inline-block text-xs font-medium px-2.5 py-0.5 rounded-full mb-3 ${
                  questionType === 'introduction'
                    ? 'bg-primary-fixed text-primary'
                    : 'bg-secondary-container text-on-secondary-container'
                }`}
              >
                {questionType === 'introduction' ? 'Perkenalan' : 'Pertanyaan Lanjutan'}
              </span>
            )}
            <h3 className="text-xl font-headline font-bold text-on-surface mb-4" data-testid="interview-question">
              {currentQuestion}
            </h3>
            <p className="text-on-surface-variant leading-relaxed italic text-sm">
              Pastikan untuk menggunakan metode STAR (Situation, Task, Action, Result) dalam jawaban Anda.
            </p>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div role="alert" className="p-4 bg-error-container border border-error/20 rounded-lg text-on-error-container text-sm">
          <p>{error}</p>
          {isTimeout && pendingTranscription && (
            <button
              type="button"
              onClick={handleRetryAnalysis}
              className="mt-2 px-4 py-1.5 bg-error text-on-error rounded hover:bg-error/90 focus:outline-none focus:ring-2 focus:ring-error focus:ring-offset-2 text-xs font-medium"
            >
              Coba Lagi
            </button>
          )}
        </div>
      )}

      {/* Listening phase — Stitch waveform */}
      {phase === 'listening' && (
        <div className="flex flex-col items-center justify-center py-12 bg-surface-container-lowest rounded-xl relative overflow-hidden" role="status">
          <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
          <div className="relative z-10 flex flex-col items-center">
            <div className="animate-pulse flex items-end gap-1 mb-4 h-16">
              <span className="w-1 h-4 bg-primary rounded-full" />
              <span className="w-1 h-8 bg-primary rounded-full" />
              <span className="w-1 h-12 bg-primary rounded-full" />
              <span className="w-1 h-6 bg-primary rounded-full" />
              <span className="w-1 h-10 bg-primary rounded-full" />
              <span className="w-1 h-14 bg-primary rounded-full" />
              <span className="w-1 h-8 bg-primary rounded-full" />
              <span className="w-1 h-4 bg-primary rounded-full" />
            </div>
            <p className="text-sm text-on-surface-variant">Memutar audio pertanyaan...</p>
          </div>
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

      {/* Processing phase — Stitch spinner */}
      {phase === 'processing' && (
        <div className="flex flex-col items-center py-12" role="status">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary border-t-transparent mb-4" />
          <p className="text-sm text-on-surface-variant">Menganalisis jawaban Anda...</p>
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

          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <button
              type="button"
              onClick={onNextQuestion}
              className="flex-1 sm:flex-none px-8 py-3 bg-gradient-to-br from-primary to-primary-container text-on-primary rounded-lg font-headline font-bold shadow-[0_10px_20px_-5px_rgba(0,52,97,0.3)] hover:translate-y-[-2px] transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 flex items-center justify-center gap-2"
            >
              Pertanyaan Berikutnya
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </button>
            <button
              type="button"
              onClick={onEndSession}
              className="flex-1 sm:flex-none px-6 py-3 bg-secondary-container text-on-secondary-container rounded-lg font-headline font-bold hover:bg-surface-container-highest transition-colors focus:outline-none focus:ring-2 focus:ring-secondary focus:ring-offset-2 flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-sm">cancel</span>
              Akhiri Sesi
            </button>
          </div>
        </>
      )}

      {/* Tips Section — Stitch 3-column grid (visible during recording) */}
      {phase === 'recording' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-2">
          <div className="bg-surface-container p-6 rounded-xl flex items-start gap-4 border border-outline-variant/10">
            <span className="material-symbols-outlined text-primary">lightbulb</span>
            <div>
              <h4 className="font-bold text-sm text-primary mb-1">Tips Eksekutif</h4>
              <p className="text-xs text-on-surface-variant leading-relaxed">Fokus pada Impact dan Result. Gunakan angka nyata jika memungkinkan untuk memperkuat jawaban Anda.</p>
            </div>
          </div>
          <div className="bg-surface-container p-6 rounded-xl flex items-start gap-4 border border-outline-variant/10">
            <span className="material-symbols-outlined text-primary">visibility</span>
            <div>
              <h4 className="font-bold text-sm text-primary mb-1">Visual Cues</h4>
              <p className="text-xs text-on-surface-variant leading-relaxed">Pertahankan kontak mata virtual dengan melihat ke arah kamera, bukan ke layar.</p>
            </div>
          </div>
          <div className="bg-surface-container p-6 rounded-xl flex items-start gap-4 border border-outline-variant/10">
            <span className="material-symbols-outlined text-primary">psychology</span>
            <div>
              <h4 className="font-bold text-sm text-primary mb-1">Analisis AI</h4>
              <p className="text-xs text-on-surface-variant leading-relaxed">AI akan menilai intonasi suara, kecepatan bicara, dan penggunaan kata pengisi (filler words).</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
