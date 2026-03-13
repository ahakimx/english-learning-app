import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { chat } from '../../services/apiClient'
import type { ChatResponse, SummaryReport as SummaryReportType, SeniorityLevel, QuestionCategory, QuestionType } from '../../types'
import JobPositionSelector from './JobPositionSelector'
import InterviewSession from './InterviewSession'
import SummaryReport from './SummaryReport'

type Phase = 'select' | 'loading' | 'interview' | 'summary'

export default function SpeakingModule() {
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>('select')
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [currentQuestion, setCurrentQuestion] = useState<string | null>(null)
  const [selectedPosition, setSelectedPosition] = useState<string | null>(null)
  const [summaryReport, setSummaryReport] = useState<SummaryReportType | null>(null)
  const [selectedSeniority, setSelectedSeniority] = useState<SeniorityLevel | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<QuestionCategory | null>(null)
  const [currentQuestionType, setCurrentQuestionType] = useState<QuestionType | undefined>(undefined)

  async function handleSelectPosition(position: string, seniorityLevel: SeniorityLevel, questionCategory: QuestionCategory) {
    setPhase('loading')
    setError(null)
    setSelectedPosition(position)
    setSelectedSeniority(seniorityLevel)
    setSelectedCategory(questionCategory)

    try {
      const response: ChatResponse = await chat({
        action: 'start_session',
        jobPosition: position,
        seniorityLevel,
        questionCategory,
      })
      setSessionId(response.sessionId)
      setCurrentQuestion(response.content)
      setCurrentQuestionType(response.questionType)
      setPhase('interview')
    } catch {
      setError('Gagal memulai sesi interview. Silakan coba lagi.')
      setPhase('select')
    }
  }

  async function handleNextQuestion() {
    if (!sessionId) return
    setError(null)

    try {
      const response: ChatResponse = await chat({
        action: 'next_question',
        sessionId,
      })
      setCurrentQuestion(response.content)
      setCurrentQuestionType(response.questionType)
    } catch {
      setError('Gagal mendapatkan pertanyaan berikutnya. Silakan coba lagi.')
    }
  }

  async function handleEndSession() {
    if (!sessionId) return
    setError(null)

    try {
      const response: ChatResponse = await chat({
        action: 'end_session',
        sessionId,
      })
      if (response.summaryReport) {
        setSummaryReport(response.summaryReport)
      }
      setPhase('summary')
    } catch {
      setError('Gagal mengakhiri sesi. Silakan coba lagi.')
    }
  }

  function handleNewSession() {
    setPhase('select')
    setSessionId(null)
    setCurrentQuestion(null)
    setSelectedPosition(null)
    setSelectedSeniority(null)
    setSelectedCategory(null)
    setSummaryReport(null)
    setCurrentQuestionType(undefined)
    setError(null)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Speaking Module</h1>
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          Kembali ke Dashboard
        </button>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {error && (
          <div role="alert" className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {phase === 'select' && (
          <JobPositionSelector onSelect={handleSelectPosition} />
        )}

        {phase === 'loading' && (
          <div className="flex flex-col items-center justify-center py-16" role="status">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent mb-4" />
            <p className="text-gray-600">Memulai sesi interview untuk {selectedPosition}...</p>
          </div>
        )}

        {phase === 'interview' && currentQuestion && sessionId && selectedPosition && selectedSeniority && selectedCategory && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <InterviewSession
              sessionId={sessionId}
              jobPosition={selectedPosition}
              seniorityLevel={selectedSeniority}
              questionCategory={selectedCategory}
              currentQuestion={currentQuestion}
              questionType={currentQuestionType}
              onNextQuestion={handleNextQuestion}
              onEndSession={handleEndSession}
            />
          </div>
        )}

        {phase === 'summary' && summaryReport && sessionId && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <SummaryReport
              summaryReport={summaryReport}
              sessionId={sessionId}
              onNewSession={handleNewSession}
            />
          </div>
        )}

        {phase === 'summary' && !summaryReport && (
          <div className="text-center py-12">
            <p className="text-gray-600" data-testid="summary-placeholder">
              Sesi selesai. Data ringkasan tidak tersedia.
            </p>
            <button
              type="button"
              onClick={handleNewSession}
              className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Mulai Sesi Baru
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
