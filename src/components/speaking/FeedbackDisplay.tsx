import type { FeedbackReport } from '../../types';

interface FeedbackDisplayProps {
  feedbackReport: FeedbackReport;
}

const criteriaLabels: Record<string, string> = {
  grammar: 'Grammar',
  vocabulary: 'Vocabulary',
  relevance: 'Relevance',
  fillerWords: 'Filler Words',
  coherence: 'Coherence',
};

function scoreColor(score: number): string {
  if (score >= 80) return 'bg-green-500';
  if (score >= 60) return 'bg-yellow-500';
  if (score >= 40) return 'bg-orange-500';
  return 'bg-red-500';
}

export default function FeedbackDisplay({ feedbackReport }: FeedbackDisplayProps) {
  const { scores, grammarErrors, fillerWordsDetected, suggestions, improvedAnswer } = feedbackReport;

  return (
    <div className="space-y-6" data-testid="feedback-display">
      {/* Overall Score */}
      <div className="text-center">
        <p className="text-sm font-medium text-gray-500 mb-1">Skor Keseluruhan</p>
        <div
          className="inline-flex items-center justify-center w-20 h-20 rounded-full border-4 border-blue-500"
          data-testid="overall-score"
        >
          <span className="text-2xl font-bold text-blue-700">{scores.overall}</span>
        </div>
      </div>

      {/* Criteria Scores */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-3">Skor per Kriteria</h4>
        <div className="space-y-2">
          {Object.entries(criteriaLabels).map(([key, label]) => {
            const score = scores[key as keyof typeof scores];
            return (
              <div key={key} className="flex items-center gap-3">
                <span className="text-sm text-gray-600 w-28 shrink-0">{label}</span>
                <div className="flex-1 bg-gray-200 rounded-full h-3" role="progressbar" aria-valuenow={score} aria-valuemin={0} aria-valuemax={100} aria-label={`${label} score`}>
                  <div className={`h-3 rounded-full ${scoreColor(score)}`} style={{ width: `${score}%` }} />
                </div>
                <span className="text-sm font-medium text-gray-700 w-10 text-right">{score}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Grammar Errors */}
      {grammarErrors.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Kesalahan Grammar</h4>
          <ul className="space-y-2" data-testid="grammar-errors-list">
            {grammarErrors.map((err, i) => (
              <li key={i} className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
                <p>
                  <span className="line-through text-red-600">{err.original}</span>
                  {' → '}
                  <span className="font-medium text-green-700">{err.correction}</span>
                </p>
                <p className="text-gray-500 mt-1 text-xs">{err.rule}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Filler Words */}
      {fillerWordsDetected.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Filler Words Terdeteksi</h4>
          <div className="flex flex-wrap gap-2" data-testid="filler-words-list">
            {fillerWordsDetected.map((fw, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 bg-yellow-50 border border-yellow-300 rounded-full px-3 py-1 text-sm text-yellow-800"
              >
                {fw.word}
                <span className="bg-yellow-200 text-yellow-900 rounded-full px-1.5 text-xs font-medium">
                  {fw.count}×
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Saran Perbaikan</h4>
          <ul className="list-disc list-inside space-y-1 text-sm text-gray-700" data-testid="suggestions-list">
            {suggestions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Improved Answer */}
      {improvedAnswer && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Contoh Jawaban yang Lebih Baik</h4>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-gray-800 leading-relaxed" data-testid="improved-answer">
            {improvedAnswer}
          </div>
        </div>
      )}
    </div>
  );
}
