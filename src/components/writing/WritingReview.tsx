import type { WritingReviewData } from '../../types';

interface WritingReviewProps {
  writingReview: WritingReviewData;
}

function ScoreBadge({ score }: { score: number }) {
  let color = 'bg-red-100 text-red-700';
  if (score >= 80) color = 'bg-green-100 text-green-700';
  else if (score >= 60) color = 'bg-yellow-100 text-yellow-700';

  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${color}`}>
      {score}/100
    </span>
  );
}

export default function WritingReview({ writingReview }: WritingReviewProps) {
  const { overallScore, aspects } = writingReview;
  const { grammarCorrectness, structure, vocabulary } = aspects;

  return (
    <div data-testid="writing-review">
      {/* Overall Score */}
      <div className="text-center mb-6">
        <p className="text-sm text-gray-500 mb-1">Skor Keseluruhan</p>
        <p className="text-5xl font-bold text-blue-600" data-testid="overall-score">
          {overallScore}
        </p>
        <p className="text-sm text-gray-400">dari 100</p>
      </div>

      {/* Grammar Correctness */}
      <section className="mb-6" data-testid="grammar-section">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-800">Grammar Correctness</h3>
          <ScoreBadge score={grammarCorrectness.score} />
        </div>
        {grammarCorrectness.errors.length > 0 ? (
          <ul className="space-y-2">
            {grammarCorrectness.errors.map((err, i) => (
              <li key={i} className="p-3 bg-red-50 border border-red-100 rounded-lg text-sm">
                <p>
                  <span className="line-through text-red-600">{err.text}</span>
                  {' → '}
                  <span className="font-medium text-green-700">{err.correction}</span>
                </p>
                <p className="text-gray-500 text-xs mt-1">{err.explanation}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">Tidak ada kesalahan grammar yang ditemukan. Bagus!</p>
        )}
      </section>

      {/* Structure */}
      <section className="mb-6" data-testid="structure-section">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-800">Structure &amp; Organization</h3>
          <ScoreBadge score={structure.score} />
        </div>
        <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg">{structure.feedback}</p>
      </section>

      {/* Vocabulary */}
      <section data-testid="vocabulary-section">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-800">Vocabulary</h3>
          <ScoreBadge score={vocabulary.score} />
        </div>
        {vocabulary.suggestions.length > 0 ? (
          <ul className="list-disc list-inside space-y-1 text-sm text-gray-700 bg-gray-50 p-3 rounded-lg">
            {vocabulary.suggestions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">Tidak ada saran vocabulary tambahan.</p>
        )}
      </section>
    </div>
  );
}
