import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { chat } from '../../services/apiClient'
import type { ChatResponse, SummaryReport as SummaryReportType, SeniorityLevel, QuestionCategory, QuestionType, SessionData } from '../../types'
import JobPositionSelector from './JobPositionSelector'
import InterviewSession from './InterviewSession'
import SummaryReport from './SummaryReport'
import ResumePrompt from './ResumePrompt'

type Phase = 'checking' | 'resume-prompt' | 'select' | 'loading' | 'interview' | 'summary'

export default function SpeakingModule() {
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>('checking')
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [currentQuestion, setCurrentQuestion] = useState<string | null>(null)
  const [selectedPosition, setSelectedPosition] = useState<string | null>(null)
  const [summaryReport, setSummaryReport] = useState<SummaryReportType | null>(null)
  const [selectedSeniority, setSelectedSeniority] = useState<SeniorityLevel | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<QuestionCategory | null>(null)
  const [currentQuestionType, setCurrentQuestionType] = useState<QuestionType | undefined>(undefined)
  const [resumeSessionData, setResumeSessionData] = useState<SessionData | null>(null)
  const [isAbandoning, setIsAbandoning] = useState(false)

  useEffect(() => {
    async function checkActiveSession() {
      try {
        const response = await chat({ action: 'resume_session' })
        if (response.type === 'session_resumed' && response.sessionData) {
          setResumeSessionData(response.sessionData)
          setPhase('resume-prompt')
        } else {
          setPhase('select')
        }
      } catch {
        setPhase('select')
      }
    }
    checkActiveSession()
  }, [])

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

  async function handleResumeSession() {
    if (!resumeSessionData) return

    setSessionId(resumeSessionData.sessionId)
    setSelectedPosition(resumeSessionData.jobPosition)
    setSelectedSeniority(resumeSessionData.seniorityLevel)
    setSelectedCategory(resumeSessionData.questionCategory)
    setError(null)

    const questions = resumeSessionData.questions

    if (questions.length === 0) {
      setPhase('select')
      return
    }

    const lastQuestion = questions[questions.length - 1]

    if (!lastQuestion.transcription) {
      setCurrentQuestion(lastQuestion.questionText)
      setCurrentQuestionType(lastQuestion.questionType)
      setPhase('interview')
    } else if (!lastQuestion.feedback) {
      setPhase('loading')
      try {
        const response = await chat({
          action: 'analyze_answer',
          sessionId: resumeSessionData.sessionId,
          transcription: lastQuestion.transcription,
        })
        setCurrentQuestion(lastQuestion.questionText)
        setCurrentQuestionType(lastQuestion.questionType)
        setPhase('interview')
      } catch {
        setError('Gagal menganalisis jawaban terakhir. Silakan coba lagi.')
        setPhase('select')
      }
    } else {
      setPhase('loading')
      try {
        const response = await chat({
          action: 'next_question',
          sessionId: resumeSessionData.sessionId,
        })
        setCurrentQuestion(response.content)
        setCurrentQuestionType(response.questionType)
        setPhase('interview')
      } catch {
        setError('Gagal mendapatkan pertanyaan berikutnya. Silakan coba lagi.')
        setPhase('select')
      }
    }
  }

  async function handleAbandonAndStartNew() {
    if (!resumeSessionData) return

    setIsAbandoning(true)
    try {
      await chat({
        action: 'abandon_session',
        sessionId: resumeSessionData.sessionId,
      })
    } catch {
      setError('Sesi lama tidak dapat ditutup, tetapi Anda dapat memulai sesi baru.')
    }
    setIsAbandoning(false)
    setResumeSessionData(null)
    setPhase('select')
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
    setResumeSessionData(null)
    setIsAbandoning(false)
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

        {phase === 'checking' && (
          <div className="flex flex-col items-center justify-center py-16" role="status" data-testid="checking-indicator">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent mb-4" />
            <p className="text-gray-600">Memeriksa sesi aktif...</p>
          </div>
        )}

        {phase === 'resume-prompt' && resumeSessionData && (
          <ResumePrompt
            sessionData={resumeSessionData}
            onResume={handleResumeSession}
            onStartNew={handleAbandonAndStartNew}
            isAbandoning={isAbandoning}
          />
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
