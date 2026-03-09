interface TranscriptionDisplayProps {
  transcription: string;
}

export default function TranscriptionDisplay({ transcription }: TranscriptionDisplayProps) {
  if (!transcription) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-2">
        Transkripsi Jawaban Anda:
      </h3>
      <p className="text-gray-800 leading-relaxed" data-testid="transcription-text">
        {transcription}
      </p>
    </div>
  );
}
