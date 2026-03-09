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
    <div className="flex flex-col items-center gap-4">
      {/* Record / Stop button */}
      <button
        type="button"
        onClick={handleRecordClick}
        disabled={isProcessing}
        aria-label={phase === 'recording' ? 'Berhenti merekam' : 'Mulai merekam'}
        className={`relative w-16 h-16 rounded-full flex items-center justify-center transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 ${
          phase === 'recording'
            ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
            : isProcessing
              ? 'bg-gray-300 cursor-not-allowed'
              : 'bg-red-500 hover:bg-red-600 focus:ring-red-400'
        }`}
      >
        {phase === 'recording' ? (
          /* Stop icon (square) */
          <span className="w-5 h-5 bg-white rounded-sm" />
        ) : (
          /* Record icon (circle) */
          <span className="w-5 h-5 bg-white rounded-full" />
        )}

        {/* Pulsing indicator when recording */}
        {phase === 'recording' && (
          <span
            className="absolute inset-0 rounded-full border-2 border-red-400 animate-ping"
            data-testid="recording-indicator"
          />
        )}
      </button>

      {/* Status text */}
      <p className="text-sm text-gray-600" data-testid="recorder-status">
        {phase === 'idle' && 'Tekan tombol untuk mulai merekam'}
        {phase === 'recording' && 'Merekam... Tekan untuk berhenti'}
        {phase === 'uploading' && 'Mengunggah audio...'}
        {phase === 'transcribing' && 'Memproses transkripsi...'}
      </p>

      {/* Error message */}
      {error && (
        <div role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
          {error}
        </div>
      )}
    </div>
  );
}
