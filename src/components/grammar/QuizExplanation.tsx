interface QuizExplanationProps {
  explanation: string
  isCorrect: boolean
  correctAnswer: string
  userAnswer: string
  onNext: () => void
}

export default function QuizExplanation({
  explanation,
  isCorrect,
  correctAnswer,
  userAnswer,
  onNext,
}: QuizExplanationProps) {
  return (
    <div className="mt-6 p-5 rounded-lg border border-gray-200 bg-gray-50">
      <div className="flex items-center gap-2 mb-3">
        {isCorrect ? (
          <span className="inline-flex items-center gap-1 text-green-700 font-semibold" data-testid="result-correct">
            ✓ Jawaban Anda Benar!
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-red-700 font-semibold" data-testid="result-incorrect">
            ✗ Jawaban Anda Salah
          </span>
        )}
      </div>

      {!isCorrect && (
        <p className="text-sm text-gray-700 mb-2" data-testid="user-answer-info">
          Jawaban Anda: <span className="font-medium text-red-600">{userAnswer}</span>
          {' · '}
          Jawaban benar: <span className="font-medium text-green-600">{correctAnswer}</span>
        </p>
      )}

      <div className="mt-3 text-sm text-gray-800 leading-relaxed" data-testid="explanation-text">
        {explanation}
      </div>

      <button
        type="button"
        onClick={onNext}
        className="mt-5 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        data-testid="next-question-btn"
      >
        Pertanyaan Berikutnya
      </button>
    </div>
  )
}
