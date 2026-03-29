interface TranscriptionDisplayProps {
  transcription: string;
}

export default function TranscriptionDisplay({ transcription }: TranscriptionDisplayProps) {
  if (!transcription) return null;

  return (
    <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-xl p-4">
      <h3 className="text-sm font-headline font-bold text-primary mb-2">
        Transkripsi Jawaban Anda:
      </h3>
      <p className="text-on-surface leading-relaxed font-body" data-testid="transcription-text">
        {transcription}
      </p>
    </div>
  );
}
