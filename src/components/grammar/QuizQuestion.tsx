import { useState } from 'react'
import type { QuizData } from '../../types'

interface QuizQuestionProps {
  quizData: QuizData
  onAnswer: (selectedAnswer: string, isCorrect: boolean) => void
}

export default function QuizQuestion({ quizData, onAnswer }: QuizQuestionProps) {
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null)
  const answered = selectedAnswer !== null

  function handleSelect(option: string) {
    if (answered) return
    setSelectedAnswer(option)
    const isCorrect = option === quizData.correctAnswer
    onAnswer(option, isCorrect)
  }

  function getOptionClass(option: string): string {
    const base = 'w-full text-left px-4 py-3 rounded-lg border text-sm font-medium transition-colors'
    if (!answered) {
      return `${base} border-gray-200 hover:border-blue-400 hover:bg-blue-50 cursor-pointer`
    }
    if (option === quizData.correctAnswer) {
      return `${base} border-green-500 bg-green-50 text-green-800`
    }
    if (option === selectedAnswer && option !== quizData.correctAnswer) {
      return `${base} border-red-500 bg-red-50 text-red-800`
    }
    return `${base} border-gray-200 text-gray-400 cursor-default`
  }

  return (
    <div>
      <p className="text-lg font-medium text-gray-900 mb-6" data-testid="quiz-question">
        {quizData.question}
      </p>
      <div className="space-y-3" role="group" aria-label="Pilihan jawaban">
        {quizData.options.map((option, index) => (
          <button
            key={index}
            type="button"
            disabled={answered}
            onClick={() => handleSelect(option)}
            className={getOptionClass(option)}
            aria-label={`Pilihan ${String.fromCharCode(65 + index)}: ${option}`}
            data-testid={`option-${index}`}
          >
            <span className="font-bold mr-2">{String.fromCharCode(65 + index)}.</span>
            {option}
            {answered && option === quizData.correctAnswer && (
              <span className="ml-2" aria-label="Jawaban benar">✓</span>
            )}
            {answered && option === selectedAnswer && option !== quizData.correctAnswer && (
              <span className="ml-2" aria-label="Jawaban salah">✗</span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
