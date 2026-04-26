import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { chat } from '../../services/apiClient'
import useNovaSonic from '../../hooks/useNovaSonic'
import { useAudioCapture } from '../../hooks/useAudioCapture'
import { useAudioPlayback } from '../../hooks/useAudioPlayback'
import type {
  SummaryReport as SummaryReportType,
  SeniorityLevel,
  QuestionCategory,
  SessionData,
  TranscriptEntry,
  FeedbackReport,
  TranscriptEvent,
  TurnEvent,
  NovaSonicError,
} from '../../types'
import JobPositionSelector from './JobPositionSelector'
import SummaryReport from './SummaryReport'
import ResumePrompt from './ResumePrompt'
import LiveTranscriptPanel from './LiveTranscriptPanel'
import SessionInfoPanel from './SessionInfoPanel'
import Sidebar from '../dashboard/Sidebar'

type Phase = 'checking' | 'resume-prompt' | 'select' | 'loading' | 'interview' | 'summary'

export default function SpeakingModule() {
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>('checking')
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [selectedPosition, setSelectedPosition] = useState<string | null>(null)
  const [summaryReport, setSummaryReport] = useState<SummaryReportType | null>(null)
  const [selectedSeniority, setSelectedSeniority] = useState<SeniorityLevel | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<QuestionCategory | null>(null)
  const [resumeSessionData, setResumeSessionData] = useState<SessionData | null>(null)
  const [isAbandoning, setIsAbandoning] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showPositionSelector, setShowPositionSelector] = useState(false)

  // Real-time interview state
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([])
  const [feedbackCards, setFeedbackCards] = useState<Map<string, FeedbackReport>>(new Map())
  const [sessionDuration, setSessionDuration] = useState(0)
  const [questionCount, setQuestionCount] = useState(0)
  const [currentQuestionNumber, setCurrentQuestionNumber] = useState(0)
  const [fillerWordCount, setFillerWordCount] = useState(0)

  const sessionStartTimeRef = useRef<number | null>(null)
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const transcriptIdCounterRef = useRef(0)
  const currentQuestionIdRef = useRef<string>('q-0')

  // --- Nova Sonic hook callbacks ---

  // Ref for playChunk — assigned after useAudioPlayback hook below
  const playChunkRef = useRef<(b64: string) => void | Promise<void>>(() => {})

  const handleTranscript = useCallback((event: TranscriptEvent) => {
    setTranscripts((prev) => {
      if (event.partial) {
        // Replace existing partial for this role, or add new
        const partialId = `transcript-${event.role}-partial`
        const entry: TranscriptEntry = {
          id: partialId,
          role: event.role,
          text: event.text,
          partial: true,
          timestamp: event.timestamp,
          questionId: currentQuestionIdRef.current,
        }
        const idx = prev.findIndex((t) => t.id === partialId)
        if (idx >= 0) {
          const updated = [...prev]
          updated[idx] = entry
          return updated
        }
        return [...prev, entry]
      }

      // Final: remove partial for this role, add final entry
      const partialId = `transcript-${event.role}-partial`
      const filtered = prev.filter((t) => t.id !== partialId)
      return [
        ...filtered,
        {
          id: `transcript-${event.role}-${transcriptIdCounterRef.current++}`,
          role: event.role,
          text: event.text,
          partial: false,
          timestamp: event.timestamp,
          questionId: currentQuestionIdRef.current,
        },
      ]
    })
  }, [])

  const handleAudio = useCallback((audioData: string) => {
    playChunkRef.current(audioData)
  }, [])

  const handleTurnChange = useCallback((event: TurnEvent) => {
    if (event.currentSpeaker === 'ai' && !event.interrupted) {
      // AI started speaking — possibly a new question
      setCurrentQuestionNumber((prev) => prev + 1)
      setQuestionCount((prev) => Math.max(prev, currentQuestionNumber + 1))
      currentQuestionIdRef.current = `q-${Date.now()}`
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestionNumber])

  const handleFeedback = useCallback((report: FeedbackReport) => {
    const qId = currentQuestionIdRef.current
    setFeedbackCards((prev) => {
      const next = new Map(prev)
      next.set(qId, report)
      return next
    })
    // Count filler words from the report
    const totalFillers = report.fillerWordsDetected.reduce((sum, fw) => sum + fw.count, 0)
    setFillerWordCount((prev) => prev + totalFillers)
  }, [])

  const handleNovaSonicError = useCallback((err: NovaSonicError) => {
    setError(err.message)
  }, [])

  const handleSessionEnd = useCallback((summary: SummaryReportType) => {
    setSummaryReport(summary)
    stopDurationTimer()
    stopAudioCapture()
    stopAudioPlayback()
    setPhase('summary')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- Hooks ---
  const novaSonic = useNovaSonic({
    onTranscript: handleTranscript,
    onAudio: handleAudio,
    onTurnChange: handleTurnChange,
    onFeedback: handleFeedback,
    onError: handleNovaSonicError,
    onSessionEnd: handleSessionEnd,
  })

  const audioCapture = useAudioCapture({
    onAudioChunk: useCallback((chunk: ArrayBuffer) => {
      novaSonic.sendAudioChunk(chunk)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  })

  const { playChunk, stop: stopAudioPlayback, error: audioPlaybackError } = useAudioPlayback()
  playChunkRef.current = playChunk

  const stopAudioCapture = audioCapture.stop

  // --- Duration timer ---
  function startDurationTimer() {
    sessionStartTimeRef.current = Date.now()
    setSessionDuration(0)
    durationTimerRef.current = setInterval(() => {
      if (sessionStartTimeRef.current) {
        setSessionDuration(Math.floor((Date.now() - sessionStartTimeRef.current) / 1000))
      }
    }, 1000)
  }

  function stopDurationTimer() {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current)
      durationTimerRef.current = null
    }
  }

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      stopDurationTimer()
    }
  }, [])

  // --- Phase: checking (on mount) ---
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

  // --- Handlers for select phase (REST API) ---
  async function handleSelectPosition(position: string, seniorityLevel: SeniorityLevel, questionCategory: QuestionCategory) {
    setPhase('loading')
    setError(null)
    setSelectedPosition(position)
    setSelectedSeniority(seniorityLevel)
    setSelectedCategory(questionCategory)
    setShowPositionSelector(false)

    try {
      // Start session — the hook handles both REST API session creation
      // and direct Bedrock connection internally
      await novaSonic.startSession({
        jobPosition: position,
        seniorityLevel,
        questionCategory,
      })

      // Start audio capture
      await audioCapture.start()

      // Reset interview state
      setTranscripts([])
      setFeedbackCards(new Map())
      setSessionDuration(0)
      setQuestionCount(0)
      setCurrentQuestionNumber(1)
      setFillerWordCount(0)
      transcriptIdCounterRef.current = 0
      currentQuestionIdRef.current = `q-${Date.now()}`

      // Start duration timer
      startDurationTimer()

      setSessionId(`session-${Date.now()}`)
      setPhase('interview')
    } catch {
      setError('Gagal memulai sesi interview. Silakan coba lagi.')
      setPhase('select')
    }
  }

  // --- Handler for ending session ---
  async function handleEndSession() {
    audioCapture.stop()
    stopAudioPlayback()
    stopDurationTimer()
    // endSession is now async — it calls REST API for summary
    await novaSonic.endSession()
    // The summary will come via the onSessionEnd callback
  }

  // --- Handler for interrupt/barge-in ---
  function handleInterrupt() {
    novaSonic.interrupt()
    stopAudioPlayback()
  }

  // --- Resume session handler (REST API for checking, then direct Bedrock for interview) ---
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

    setPhase('loading')

    try {
      // Start session with resume — the hook handles direct Bedrock connection
      await novaSonic.startSession({
        jobPosition: resumeSessionData.jobPosition,
        seniorityLevel: resumeSessionData.seniorityLevel,
        questionCategory: resumeSessionData.questionCategory,
        resumeSessionId: resumeSessionData.sessionId,
      })

      // Start audio capture
      await audioCapture.start()

      // Restore transcript state from previous questions
      const restoredTranscripts: TranscriptEntry[] = []
      const restoredFeedback = new Map<string, FeedbackReport>()
      let counter = 0

      for (const q of questions) {
        const qId = q.questionId
        // Add AI question transcript
        restoredTranscripts.push({
          id: `restored-ai-${counter++}`,
          role: 'ai',
          text: q.questionText,
          partial: false,
          timestamp: Date.now(),
          questionId: qId,
        })
        // Add user answer transcript if available
        if (q.transcription) {
          restoredTranscripts.push({
            id: `restored-user-${counter++}`,
            role: 'user',
            text: q.transcription,
            partial: false,
            timestamp: Date.now(),
            questionId: qId,
          })
        }
        // Add feedback if available
        if (q.feedback) {
          restoredFeedback.set(qId, q.feedback)
        }
      }

      setTranscripts(restoredTranscripts)
      setFeedbackCards(restoredFeedback)
      setQuestionCount(questions.length)
      setCurrentQuestionNumber(questions.length)
      setFillerWordCount(0)
      transcriptIdCounterRef.current = counter
      currentQuestionIdRef.current = `q-${Date.now()}`

      startDurationTimer()
      setPhase('interview')
    } catch {
      setError('Gagal melanjutkan sesi interview. Silakan coba lagi.')
      setPhase('select')
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
    // Disconnect Bedrock stream and cleanup
    novaSonic.disconnect()
    audioCapture.stop()
    stopAudioPlayback()
    stopDurationTimer()

    setPhase('select')
    setSessionId(null)
    setSelectedPosition(null)
    setSelectedSeniority(null)
    setSelectedCategory(null)
    setSummaryReport(null)
    setResumeSessionData(null)
    setIsAbandoning(false)
    setError(null)
    setTranscripts([])
    setFeedbackCards(new Map())
    setSessionDuration(0)
    setQuestionCount(0)
    setCurrentQuestionNumber(0)
    setFillerWordCount(0)
  }

  // Map connection state for SessionInfoPanel
  const connectionStateForPanel: 'connected' | 'reconnecting' | 'disconnected' =
    novaSonic.connectionState === 'connected'
      ? 'connected'
      : novaSonic.connectionState === 'connecting'
        ? 'reconnecting'
        : 'disconnected'

  return (
    <div className="min-h-screen bg-surface font-body text-on-surface">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* TopAppBar */}
      <header className="fixed top-0 left-0 lg:left-64 right-0 h-16 bg-[#f8f9fa]/90 backdrop-blur-md flex justify-between items-center px-4 md:px-10 z-50 shadow-sm">
        <div className="flex items-center gap-4 lg:gap-8">
          <button type="button" className="lg:hidden p-2 -ml-2 text-slate-600 cursor-pointer" onClick={() => setSidebarOpen(true)}>
            <span className="material-symbols-outlined">menu</span>
          </button>
          <span className="text-lg md:text-xl font-bold text-[#003461] tracking-tight whitespace-nowrap font-headline">InterviewPrep Pro</span>
          <div className="hidden md:flex gap-6">
            <button type="button" onClick={() => navigate('/dashboard')} className="text-slate-500 hover:text-[#004b87] transition-colors font-headline font-semibold text-sm h-16 flex items-center">Overview</button>
            <button type="button" className="text-[#003461] border-b-2 border-[#003461] font-headline font-semibold text-sm h-16 flex items-center">Speaking</button>
            <button type="button" onClick={() => navigate('/grammar')} className="text-slate-500 hover:text-[#004b87] transition-colors font-headline font-semibold text-sm h-16 flex items-center">Grammar</button>
            <button type="button" onClick={() => navigate('/writing')} className="text-slate-500 hover:text-[#004b87] transition-colors font-headline font-semibold text-sm h-16 flex items-center">Writing</button>
          </div>
        </div>
        <div className="flex items-center gap-2 md:gap-4">
          <button type="button" className="p-2 text-slate-500 hover:text-primary transition-colors active:scale-95 duration-150">
            <span className="material-symbols-outlined">notifications</span>
          </button>
          <button type="button" className="hidden sm:block p-2 text-slate-500 hover:text-primary transition-colors active:scale-95 duration-150">
            <span className="material-symbols-outlined">workspace_premium</span>
          </button>
          <div className="w-8 h-8 rounded-full bg-[#003461] text-white flex items-center justify-center text-xs font-bold shrink-0 border border-outline-variant/30">
            U
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="lg:ml-64 pt-16 min-h-screen">
        <div className={`mx-auto ${phase === 'interview' ? 'max-w-full p-2 md:p-4' : 'max-w-7xl p-4 md:p-10'} space-y-8 md:space-y-10`}>
          {error && (
            <div role="alert" className="mb-6 p-4 bg-error-container border border-error/20 rounded-lg text-on-error-container text-sm">
              {error}
            </div>
          )}

          {phase === 'checking' && (
            <div className="flex flex-col items-center justify-center py-16" role="status" data-testid="checking-indicator">
              <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary border-t-transparent mb-4" />
              <p className="text-on-surface-variant font-body">Memeriksa sesi aktif...</p>
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

          {phase === 'select' && !showPositionSelector && (
            <>
              {/* Hero / Speaking Header */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start mb-12">
                <div className="lg:col-span-8">
                  <h1 className="text-4xl md:text-5xl font-headline font-extrabold text-primary mb-4 leading-tight tracking-tight">Speaking Performance</h1>
                  <p className="text-lg text-on-surface-variant max-w-2xl font-body">Master your executive presence. Refine your delivery for high-stakes interviews with real-time feedback on fluency and tone.</p>
                  {/* Voice Waveform Visualization */}
                  <div className="mt-8 bg-surface-container-low p-8 rounded-xl h-48 flex items-center justify-center gap-1 relative overflow-hidden">
                    <div className="w-1.5 h-12 bg-primary-fixed-dim rounded-full" />
                    <div className="w-1.5 h-16 bg-primary-fixed-dim rounded-full" />
                    <div className="w-1.5 h-24 bg-primary-fixed-dim rounded-full" />
                    <div className="w-1.5 h-32 bg-tertiary-fixed rounded-full shadow-[0_0_15px_rgba(120,251,182,0.4)]" />
                    <div className="w-1.5 h-20 bg-primary-fixed-dim rounded-full" />
                    <div className="w-1.5 h-28 bg-primary-fixed-dim rounded-full" />
                    <div className="w-1.5 h-36 bg-tertiary-fixed rounded-full shadow-[0_0_15px_rgba(120,251,182,0.4)]" />
                    <div className="w-1.5 h-16 bg-primary-fixed-dim rounded-full" />
                    <div className="w-1.5 h-24 bg-primary-fixed-dim rounded-full" />
                    <div className="w-1.5 h-12 bg-primary-fixed-dim rounded-full" />
                    <div className="w-1.5 h-32 bg-tertiary-fixed rounded-full shadow-[0_0_15px_rgba(120,251,182,0.4)]" />
                    <div className="w-1.5 h-20 bg-primary-fixed-dim rounded-full" />
                    <div className="w-1.5 h-16 bg-primary-fixed-dim rounded-full" />
                    <div className="w-1.5 h-28 bg-primary-fixed-dim rounded-full" />
                    <div className="w-1.5 h-36 bg-tertiary-fixed rounded-full shadow-[0_0_15px_rgba(120,251,182,0.4)]" />
                    <div className="w-1.5 h-12 bg-primary-fixed-dim rounded-full" />
                    <div className="absolute bottom-4 left-8 flex items-center gap-2">
                      <span className="w-2 h-2 bg-error rounded-full animate-pulse" />
                      <span className="text-xs font-label uppercase tracking-widest text-on-surface-variant font-bold">Ready to record</span>
                    </div>
                  </div>
                </div>
                <div className="lg:col-span-4 bg-surface-container-lowest p-8 rounded-xl shadow-sm border border-outline-variant/10">
                  <h3 className="font-headline font-bold text-xl mb-6 text-primary">Overview</h3>
                  <div className="space-y-6">
                    <div className="flex justify-between items-end mb-1">
                      <span className="text-sm font-label text-on-surface-variant">Overall Proficiency</span>
                      <span className="text-2xl font-headline font-extrabold text-tertiary">B2+</span>
                    </div>
                    <div className="w-full h-1 bg-surface-variant rounded-full overflow-hidden">
                      <div className="h-full bg-tertiary w-[72%]" />
                    </div>
                    <div className="grid grid-cols-1 gap-4 pt-4">
                      <div className="flex items-center justify-between p-3 bg-surface rounded-lg">
                        <span className="text-sm font-medium">Practice Time</span>
                        <span className="text-sm font-bold text-primary">12h 45m</span>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-surface rounded-lg">
                        <span className="text-sm font-medium">Mock Interviews</span>
                        <span className="text-sm font-bold text-primary">8 Completed</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowPositionSelector(true)}
                      className="w-full bg-gradient-to-br from-primary to-primary-container text-white py-4 rounded-lg font-headline font-bold text-lg shadow-[0_10px_20px_-5px_rgba(0,52,97,0.3)] hover:translate-y-[-2px] transition-all active:scale-95 flex items-center justify-center gap-2"
                    >
                      <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                      Start Practice
                    </button>
                  </div>
                </div>
              </div>

              {/* Performance Metrics */}
              <div className="mb-16">
                <h2 className="text-2xl font-headline font-bold text-primary mb-8">Performance Metrics</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Fluency */}
                  <div className="bg-surface-container-low p-8 rounded-none border-l-4 border-primary">
                    <div className="flex justify-between items-start mb-6">
                      <div className="p-3 bg-white rounded-lg shadow-sm">
                        <span className="material-symbols-outlined text-primary">speed</span>
                      </div>
                      <span className="text-3xl font-headline font-black text-primary/20">01</span>
                    </div>
                    <h3 className="font-headline font-bold text-lg mb-2">Fluency</h3>
                    <p className="text-sm text-on-surface-variant mb-6 leading-relaxed">Pacing and rhythm during continuous speech segments.</p>
                    <div className="flex items-center gap-4">
                      <div className="flex-1 h-1.5 bg-surface-variant rounded-full overflow-hidden">
                        <div className="h-full bg-primary w-[85%]" />
                      </div>
                      <span className="text-sm font-bold">85%</span>
                    </div>
                  </div>
                  {/* Vocabulary */}
                  <div className="bg-surface-container-low p-8 rounded-none border-l-4 border-tertiary">
                    <div className="flex justify-between items-start mb-6">
                      <div className="p-3 bg-white rounded-lg shadow-sm">
                        <span className="material-symbols-outlined text-tertiary">menu_book</span>
                      </div>
                      <span className="text-3xl font-headline font-black text-tertiary/20">02</span>
                    </div>
                    <h3 className="font-headline font-bold text-lg mb-2">Vocabulary</h3>
                    <p className="text-sm text-on-surface-variant mb-6 leading-relaxed">Precision in executive terminology and idiomatic usage.</p>
                    <div className="flex items-center gap-4">
                      <div className="flex-1 h-1.5 bg-surface-variant rounded-full overflow-hidden">
                        <div className="h-full bg-tertiary w-[64%]" />
                      </div>
                      <span className="text-sm font-bold">64%</span>
                    </div>
                  </div>
                  {/* Pronunciation */}
                  <div className="bg-surface-container-low p-8 rounded-none border-l-4 border-on-secondary-container">
                    <div className="flex justify-between items-start mb-6">
                      <div className="p-3 bg-white rounded-lg shadow-sm">
                        <span className="material-symbols-outlined text-on-secondary-container">record_voice_over</span>
                      </div>
                      <span className="text-3xl font-headline font-black text-on-secondary-container/20">03</span>
                    </div>
                    <h3 className="font-headline font-bold text-lg mb-2">Pronunciation</h3>
                    <p className="text-sm text-on-surface-variant mb-6 leading-relaxed">Clarity of enunciation and appropriate sentence stress.</p>
                    <div className="flex items-center gap-4">
                      <div className="flex-1 h-1.5 bg-surface-variant rounded-full overflow-hidden">
                        <div className="h-full bg-on-secondary-container w-[78%]" />
                      </div>
                      <span className="text-sm font-bold">78%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Practice Modules */}
              <div>
                <div className="flex justify-between items-center mb-8">
                  <h2 className="text-2xl font-headline font-bold text-primary">Practice Modules</h2>
                  <button type="button" className="text-primary font-bold text-sm hover:underline flex items-center gap-1">
                    View All History <span className="material-symbols-outlined text-sm">chevron_right</span>
                  </button>
                </div>
                <div className="space-y-4">
                  {/* Self-Introduction */}
                  <div className="group flex flex-col md:flex-row md:items-center justify-between p-6 bg-surface-container-lowest hover:bg-white transition-all rounded-lg shadow-sm border border-transparent hover:border-outline-variant/30">
                    <div className="flex items-center gap-6 mb-4 md:mb-0">
                      <div className="w-12 h-12 rounded bg-primary-fixed flex items-center justify-center text-primary">
                        <span className="material-symbols-outlined">person</span>
                      </div>
                      <div>
                        <h4 className="font-headline font-bold text-lg text-primary">Self-Introduction</h4>
                        <p className="text-sm text-on-surface-variant">Perfecting your 'Elevator Pitch' for the first 2 minutes.</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-8">
                      <div className="hidden sm:block text-right">
                        <div className="text-xs font-label uppercase tracking-widest text-on-surface-variant mb-1">Status</div>
                        <div className="flex items-center gap-1 text-tertiary font-bold text-sm">
                          <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                          Mastered
                        </div>
                      </div>
                      <button type="button" className="bg-secondary-container text-on-secondary-container px-6 py-2 rounded font-bold text-sm group-hover:bg-primary group-hover:text-white transition-colors">
                        Re-practice
                      </button>
                    </div>
                  </div>
                  {/* Strengths and Weaknesses */}
                  <div className="group flex flex-col md:flex-row md:items-center justify-between p-6 bg-surface-container-lowest hover:bg-white transition-all rounded-lg shadow-sm border border-transparent hover:border-outline-variant/30">
                    <div className="flex items-center gap-6 mb-4 md:mb-0">
                      <div className="w-12 h-12 rounded bg-primary-fixed flex items-center justify-center text-primary">
                        <span className="material-symbols-outlined">trending_up</span>
                      </div>
                      <div>
                        <h4 className="font-headline font-bold text-lg text-primary">Strengths and Weaknesses</h4>
                        <p className="text-sm text-on-surface-variant">Navigating vulnerable questions with professional confidence.</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-8">
                      <div className="hidden sm:block text-right">
                        <div className="text-xs font-label uppercase tracking-widest text-on-surface-variant mb-1">Status</div>
                        <div className="flex items-center gap-1 text-primary font-bold text-sm">
                          <span className="material-symbols-outlined text-sm">pending</span>
                          In Progress
                        </div>
                      </div>
                      <button type="button" className="bg-secondary-container text-on-secondary-container px-6 py-2 rounded font-bold text-sm group-hover:bg-primary group-hover:text-white transition-colors">
                        Resume
                      </button>
                    </div>
                  </div>
                  {/* Behavioral STAR Technique */}
                  <div className="group flex flex-col md:flex-row md:items-center justify-between p-6 bg-surface-container-lowest hover:bg-white transition-all rounded-lg shadow-sm border border-transparent hover:border-outline-variant/30">
                    <div className="flex items-center gap-6 mb-4 md:mb-0">
                      <div className="w-12 h-12 rounded bg-primary-fixed flex items-center justify-center text-primary">
                        <span className="material-symbols-outlined">psychology</span>
                      </div>
                      <div>
                        <h4 className="font-headline font-bold text-lg text-primary">Behavioral STAR Technique</h4>
                        <p className="text-sm text-on-surface-variant">Structuring complex narratives for high-impact answers.</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-8">
                      <div className="hidden sm:block text-right">
                        <div className="text-xs font-label uppercase tracking-widest text-on-surface-variant mb-1">Status</div>
                        <div className="flex items-center gap-1 text-on-surface-variant font-bold text-sm">
                          Locked
                        </div>
                      </div>
                      <button type="button" className="bg-surface-container text-outline px-6 py-2 rounded font-bold text-sm cursor-not-allowed opacity-50">
                        <span className="material-symbols-outlined text-sm align-middle">lock</span> Start
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Expert Tip */}
              <div className="mt-16 bg-surface-container-highest p-8 rounded-lg relative overflow-hidden">
                <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
                  <div className="shrink-0 w-24 h-24 rounded-full bg-white flex items-center justify-center shadow-lg">
                    <span className="material-symbols-outlined text-4xl text-primary">lightbulb</span>
                  </div>
                  <div>
                    <h4 className="font-headline font-extrabold text-xl text-primary mb-2 uppercase tracking-tight">Executive Tip of the Day</h4>
                    <p className="text-on-surface-variant font-body leading-relaxed max-w-3xl">"When speaking to stakeholders, pause for 2 seconds before answering complex questions. It signals thoughtfulness and authority while giving you a moment to structure your response using the STAR method."</p>
                  </div>
                </div>
                <div className="absolute -right-10 -bottom-10 opacity-5 pointer-events-none">
                  <span className="material-symbols-outlined text-[200px]">campaign</span>
                </div>
              </div>
            </>
          )}

          {phase === 'select' && showPositionSelector && (
            <div>
              <button
                type="button"
                onClick={() => setShowPositionSelector(false)}
                className="flex items-center gap-1 text-sm text-primary hover:text-primary/80 mb-6 font-semibold"
              >
                <span className="material-symbols-outlined text-sm">arrow_back</span>
                Back to Overview
              </button>
              <JobPositionSelector onSelect={handleSelectPosition} />
            </div>
          )}

          {phase === 'loading' && (
            <div className="flex flex-col items-center justify-center py-16" role="status">
              <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary border-t-transparent mb-4" />
              <p className="text-on-surface-variant font-body">Memulai sesi interview untuk {selectedPosition}...</p>
            </div>
          )}

          {/* ===== INTERVIEW PHASE — Real-time architecture ===== */}
          {phase === 'interview' && selectedPosition && selectedSeniority && selectedCategory && (
            <div className="flex flex-col h-[calc(100vh-5rem)]" data-testid="interview-realtime">
              {/* Interview header bar */}
              <div className="flex items-center justify-between px-4 py-3 bg-surface-container-lowest rounded-t-xl border border-outline-variant/10">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary">mic</span>
                  <h2 className="text-lg font-headline font-bold text-primary">Live Interview</h2>
                  <span className="text-xs text-on-surface-variant">
                    {selectedPosition} · {selectedSeniority} · {selectedCategory}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {/* Interrupt button — visible when AI is speaking */}
                  {novaSonic.currentTurn === 'ai' && (
                    <button
                      type="button"
                      onClick={handleInterrupt}
                      className="flex items-center gap-1.5 px-4 py-2 bg-secondary-container text-on-secondary-container rounded-lg text-sm font-bold hover:bg-surface-container-highest transition-colors"
                      data-testid="interrupt-button"
                    >
                      <span className="material-symbols-outlined text-sm">front_hand</span>
                      Interrupt
                    </button>
                  )}
                  {/* End Session button */}
                  <button
                    type="button"
                    onClick={handleEndSession}
                    className="flex items-center gap-1.5 px-4 py-2 bg-error-container text-on-error-container rounded-lg text-sm font-bold hover:bg-error/20 transition-colors"
                    data-testid="end-session-button"
                  >
                    <span className="material-symbols-outlined text-sm">stop_circle</span>
                    End Session
                  </button>
                </div>
              </div>

              {/* Main interview layout: 65% transcript + 35% session info */}
              <div className="flex flex-1 gap-3 min-h-0 mt-2">
                {/* Left panel — Live Transcript (65%) */}
                <div className="w-[65%] min-h-0" data-testid="transcript-panel-container">
                  <LiveTranscriptPanel
                    transcripts={transcripts}
                    currentTurn={novaSonic.currentTurn}
                    feedbackCards={feedbackCards}
                  />
                </div>

                {/* Right panel — Session Info (35%) */}
                <div className="w-[35%] min-h-0" data-testid="session-info-container">
                  <SessionInfoPanel
                    jobPosition={selectedPosition}
                    seniorityLevel={selectedSeniority}
                    questionCategory={selectedCategory}
                    sessionDuration={sessionDuration}
                    questionCount={questionCount}
                    currentQuestionNumber={currentQuestionNumber}
                    fillerWordCount={fillerWordCount}
                    connectionState={connectionStateForPanel}
                  />
                </div>
              </div>

              {/* Audio capture error */}
              {audioCapture.error && (
                <div role="alert" className="mt-2 p-3 bg-error-container border border-error/20 rounded-lg text-on-error-container text-sm">
                  {audioCapture.error}
                </div>
              )}

              {/* Audio playback error */}
              {audioPlaybackError && (
                <div role="alert" className="mt-2 p-3 bg-surface-container border border-outline-variant/20 rounded-lg text-on-surface-variant text-sm">
                  {audioPlaybackError} — Menampilkan transkrip saja.
                </div>
              )}
            </div>
          )}

          {/* ===== SUMMARY PHASE ===== */}
          {phase === 'summary' && summaryReport && sessionId && (
            <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/20 p-6">
              <SummaryReport
                summaryReport={summaryReport}
                sessionId={sessionId}
                onNewSession={handleNewSession}
              />
            </div>
          )}

          {phase === 'summary' && !summaryReport && (
            <div className="text-center py-12">
              <p className="text-on-surface-variant font-body" data-testid="summary-placeholder">
                Sesi selesai. Data ringkasan tidak tersedia.
              </p>
              <button
                type="button"
                onClick={handleNewSession}
                className="mt-4 px-6 py-2 bg-primary text-on-primary rounded-lg hover:bg-primary/90"
              >
                Mulai Sesi Baru
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
