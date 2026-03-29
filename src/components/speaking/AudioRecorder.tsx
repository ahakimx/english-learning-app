import { useState, useEffect } from 'react';
import { useAudioRecorder } from '../../hooks/useAudioRecorder';
import { uploadAudio } from '../../services/audioService';
import { transcribe } from '../../services/apiClient';

interface AudioRecorderProps {
  sessionId: string;
  questionId: string;
  userId: string;
  onTranscription: (text: string) => void;
}

type RecorderPhase = 'idle' | 'recording' | 'uploading' | 'transcribing';

export default function AudioRecorder({
  sessionId,
  questionId,
  userId,
  onTranscription,
}: AudioRecorderProps) {
  const { isRecording, startRecording, stopRecording, audioBlob, error: recorderError } =
    useAudioRecorder();

  const [phase, setPhase] = useState<RecorderPhase>('idle');
  const [error, setError] = useState<string | null>(null);

  // Sync phase with isRecording
  useEffect(() => {
    if (isRecording) {
      setPhase('recording');
      setError(null);
    }
  }, [isRecording]);

  // When recorderError changes, show it
  useEffect(() => {
    if (recorderError) {
      setError(recorderError);
      setPhase('idle');
    }
  }, [recorderError]);

  // Process audio blob after recording stops
  useEffect(() => {
    if (!audioBlob) return;

    let cancelled = false;

    async function processAudio() {
      try {
        setPhase('uploading');
        setError(null);

        const s3Key = await uploadAudio(audioBlob!, userId, sessionId, questionId);

        if (cancelled) return;
        setPhase('transcribing');

        const result = await transcribe(s3Key);

        if (cancelled) return;
        setPhase('idle');
        onTranscription(result.transcription);
      } catch {
        if (!cancelled) {
          setError('Gagal memproses transkripsi. Silakan coba lagi.');
          setPhase('idle');
        }
      }
    }

    processAudio();

    return () => {
      cancelled = true;
    };
  }, [audioBlob, userId, sessionId, questionId, onTranscription]);

  function handleRecordClick() {
    if (phase === 'recording') {
      stopRecording();
    } else if (phase === 'idle') {
      startRecording();
    }
  }

  const isProcessing = phase === 'uploading' || phase === 'transcribing';

  return (
    <div className="flex flex-col items-center justify-center py-12 bg-surface-container-lowest rounded-xl relative overflow-hidden">
      {/* Subtle Background Gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />

      {/* Decorative Waveform (visible during recording) */}
      {phase === 'recording' && (
        <div className="absolute bottom-20 w-full flex items-center justify-center gap-1 opacity-20 h-16">
          <div className="w-1 bg-primary h-4 rounded-full" />
          <div className="w-1 bg-primary h-8 rounded-full" />
          <div className="w-1 bg-primary h-12 rounded-full" />
          <div className="w-1 bg-primary h-6 rounded-full" />
          <div className="w-1 bg-primary h-10 rounded-full" />
          <div className="w-1 bg-primary h-14 rounded-full" />
          <div className="w-1 bg-primary h-8 rounded-full" />
          <div className="w-1 bg-primary h-4 rounded-full" />
        </div>
      )}

      <div className="relative z-10 flex flex-col items-center">
        {/* Large Record Button — Stitch style */}
        <button
          type="button"
          onClick={handleRecordClick}
          disabled={isProcessing}
          aria-label={phase === 'recording' ? 'Berhenti merekam' : 'Mulai merekam'}
          className={`relative w-24 h-24 rounded-full bg-white shadow-2xl flex items-center justify-center border-4 transition-all duration-200 ${
            phase === 'recording'
              ? 'border-error/30'
              : isProcessing
                ? 'border-surface-container-highest cursor-not-allowed'
                : 'border-error/10 hover:border-error/30'
          }`}
        >
          <div
            className={`w-16 h-16 rounded-full flex items-center justify-center text-white ${
              phase === 'recording'
                ? 'bg-error/90 shadow-[0_0_20px_rgba(186,26,26,0.3)]'
                : isProcessing
                  ? 'bg-surface-container-highest'
                  : 'bg-error shadow-[0_0_20px_rgba(186,26,26,0.3)]'
            }`}
          >
            {phase === 'recording' ? (
              <span className="w-5 h-5 bg-white rounded-sm" />
            ) : isProcessing ? (
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
            ) : (
              <span className="material-symbols-outlined text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>mic</span>
            )}
          </div>

          {/* Pulsing indicator when recording */}
          {phase === 'recording' && (
            <span
              className="absolute inset-0 rounded-full border-2 border-error animate-ping"
              data-testid="recording-indicator"
            />
          )}
        </button>

        {/* Status text */}
        <div className="mt-8 text-center">
          <p className="text-lg font-bold text-on-surface mb-2" data-testid="recorder-status">
            {phase === 'idle' && 'Tekan tombol untuk mulai merekam'}
            {phase === 'recording' && 'Merekam... Tekan untuk berhenti'}
            {phase === 'uploading' && 'Mengunggah audio...'}
            {phase === 'transcribing' && 'Memproses transkripsi...'}
          </p>
          <p className="text-sm text-on-surface-variant">
            Pastikan mikrofon Anda aktif dan lingkungan tenang.
          </p>
        </div>
      </div>

      {/* Microphone ready indicator */}
      {phase === 'idle' && (
        <div className="absolute top-6 right-6 flex flex-col gap-2">
          <div className="bg-tertiary-container/30 text-tertiary px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-tertiary" />
            Mikrofon Siap
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div role="alert" className="relative z-10 mt-4 text-sm text-on-error-container bg-error-container border border-error/20 rounded-lg px-4 py-2">
          {error}
        </div>
      )}
    </div>
  );
}
