import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { chat, updateProgress } from '../../services/apiClient'
import type { QuizData } from '../../types'
import TopicSelector from './TopicSelector'
import QuizQuestion from './QuizQuestion'
import QuizExplanation from './QuizExplanation'

type Phase = 'select' | 'loading' | 'quiz' | 'explanation'

export default function GrammarModule() {
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>('select')
  const [error, setError] = useState<string | null>(null)
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null)
  const [quizData, setQuizData] = useState<QuizData | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [explanation, setExplanation] = useState<string | null>(null)
  const [lastAnswer, setLastAnswer] = useState<{ selected: string; isCorrect: boolean } | null>(null)
  const [score, setScore] = useState({ correct: 0, total: 0 })

  async function handleSelectTopic(topic: string) {
    setPhase('loading')
    setError(null)
    setSelectedTopic(topic)
    setScore({ correct: 0, total: 0 })
    await fetchQuiz(topic)
  }

  async function fetchQuiz(topic: string) {
    try {
      const response = await chat({ action: 'grammar_quiz', grammarTopic: topic })
      if (response.quizData) {
        setQuizData(response.quizData)
        setSessionId(response.sessionId ?? null)
        setExplanation(null)
        setLastAnswer(null)
        setPhase('quiz')
      } else {
        setError('Gagal memuat soal quiz. Silakan coba lagi.')
        setPhase('select')
      }
    } catch {
      setError('Gagal memuat soal quiz. Silakan coba lagi.')
      setPhase('select')
    }
  }

  async function handleAnswer(selectedAnswer: string, isCorrect: boolean) {
    setLastAnswer({ selected: selectedAnswer, isCorrect })
    const newScore = {
      correct: score.correct + (isCorrect ? 1 : 0),
      total: score.total + 1,
    }
    setScore(newScore)

    // Save progress
    if (quizData) {
      updateProgress({
        moduleType: 'grammar',
        score: isCorrect ? 100 : 0,
        sessionId: quizData.questionId,
      }).catch(() => {
        // Progress update failure is non-blocking
      })
    }

    // Fetch explanation
    try {
      const response = await chat({
        action: 'grammar_explain',
        sessionId: sessionId ?? undefined,
        grammarTopic: selectedTopic ?? undefined,
        selectedAnswer,
      })
      setExplanation(response.content)
      setPhase('explanation')
    } catch {
      setError('Gagal memuat penjelasan. Silakan lanjutkan ke pertanyaan berikutnya.')
      setPhase('explanation')
    }
  }

  async function handleNextQuestion() {
    if (!selectedTopic) return
    setPhase('loading')
    setError(null)
    await fetchQuiz(selectedTopic)
  }

  function handleBackToTopics() {
    setPhase('select')
    setSelectedTopic(null)
    setQuizData(null)
    setSessionId(null)
    setExplanation(null)
    setLastAnswer(null)
    setScore({ correct: 0, total: 0 })
    setError(null)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-gray-900">Grammar Module</h1>
          {phase !== 'select' && selectedTopic && (
            <span className="text-sm text-gray-500" data-testid="current-topic">
              Topik: {selectedTopic}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          {phase !== 'select' && (
            <span className="text-sm text-gray-600" data-testid="score-display">
              Skor: {score.correct}/{score.total}
            </span>
          )}
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            Kembali ke Dashboard
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        {error && (
          <div role="alert" className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {phase === 'select' && (
          <TopicSelector onSelect={handleSelectTopic} />
        )}

        {phase === 'loading' && (
          <div className="flex flex-col items-center justify-center py-16" role="status">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent mb-4" />
            <p className="text-gray-600">Memuat soal quiz...</p>
          </div>
        )}

        {(phase === 'quiz' || phase === 'explanation') && quizData && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <button
              type="button"
              onClick={handleBackToTopics}
              className="text-sm text-gray-500 hover:text-gray-700 mb-4 inline-flex items-center gap-1"
            >
              ← Ganti Topik
            </button>

            <QuizQuestion
              key={quizData.questionId}
              quizData={quizData}
              onAnswer={handleAnswer}
            />

            {phase === 'explanation' && lastAnswer && (
              <QuizExplanation
                explanation={explanation ?? 'Penjelasan tidak tersedia.'}
                isCorrect={lastAnswer.isCorrect}
                correctAnswer={quizData.correctAnswer}
                userAnswer={lastAnswer.selected}
                onNext={handleNextQuestion}
              />
            )}
          </div>
        )}
      </main>
    </div>
  )
}
