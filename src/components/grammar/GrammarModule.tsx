import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { chat, updateProgress } from '../../services/apiClient'
import type { QuizData } from '../../types'
import QuizQuestion from './QuizQuestion'
import QuizExplanation from './QuizExplanation'
import Sidebar from '../dashboard/Sidebar'

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
  const [sidebarOpen, setSidebarOpen] = useState(false)

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

  const GRAMMAR_TOPICS = [
    { id: 'tenses', name: 'Precision in Tenses', icon: 'history', progress: 85, bgClass: 'bg-primary-fixed', textClass: 'text-primary' },
    { id: 'articles', name: 'Articles & Determiners', icon: 'article', progress: 68, bgClass: 'bg-secondary-container', textClass: 'text-secondary' },
    { id: 'prepositions', name: 'Prepositions of Strategy', icon: 'pin_drop', progress: 42, bgClass: 'bg-tertiary-fixed', textClass: 'text-tertiary' },
    { id: 'conditionals', name: 'Complex Conditionals', icon: 'alt_route', progress: 55, bgClass: 'bg-secondary-container', textClass: 'text-secondary' },
    { id: 'passive-voice', name: 'Passive Voice Structure', icon: 'swap_horiz', progress: 92, bgClass: 'bg-primary-fixed', textClass: 'text-primary' },
  ]

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
            <button type="button" onClick={() => navigate('/speaking')} className="text-slate-500 hover:text-[#004b87] transition-colors font-headline font-semibold text-sm h-16 flex items-center">Speaking</button>
            <button type="button" className="text-[#003461] border-b-2 border-[#003461] font-headline font-semibold text-sm h-16 flex items-center">Grammar</button>
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
        <div className="max-w-7xl mx-auto p-4 md:p-10 space-y-8 md:space-y-10">
          {error && (
            <div role="alert" className="mb-6 p-4 bg-error-container border border-error/20 rounded-lg text-on-error-container text-sm">
              {error}
            </div>
          )}

          {phase === 'select' && (
            <>
              {/* Hero Section */}
              <section className="mb-10">
                <div className="flex flex-col md:flex-row justify-between items-end gap-6">
                  <div>
                    <span className="text-tertiary font-bold tracking-widest text-xs uppercase mb-2 block">Executive Core</span>
                    <h1 className="text-4xl md:text-5xl font-headline font-extrabold text-primary mb-3 leading-tight tracking-tight">Grammar for Business</h1>
                    <p className="text-on-surface-variant max-w-2xl leading-relaxed font-body">
                      Master the linguistic nuances that project authority and professionalism in high-stakes negotiations and executive interviews.
                    </p>
                  </div>
                  <div className="bg-surface-container-low p-6 rounded-xl flex items-center gap-6">
                    <div className="relative w-16 h-16">
                      <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                        <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#e1e3e4" strokeWidth="3" />
                        <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#003c23" strokeDasharray="72, 100" strokeWidth="3" />
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-tertiary">72%</span>
                    </div>
                    <div>
                      <p className="text-xs text-on-surface-variant font-medium uppercase tracking-widest">Overall Mastery</p>
                      <p className="text-lg font-bold text-primary font-headline">Advanced Level</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Bento Grid Layout */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
                {/* Left Column: Topic Progress */}
                <div className="md:col-span-8 space-y-8">
                  <div className="bg-surface-container-low rounded-xl p-8">
                    <div className="flex justify-between items-center mb-8">
                      <h3 className="text-xl font-bold text-primary font-headline">Topic Progress</h3>
                      <span className="text-xs font-semibold text-on-surface-variant bg-surface-container-highest px-3 py-1 rounded-full">5 TOPICS ACTIVE</span>
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                      {GRAMMAR_TOPICS.map((topic) => (
                        <button
                          key={topic.id}
                          type="button"
                          onClick={() => handleSelectTopic(topic.id)}
                          className="bg-surface-container-lowest p-5 rounded-lg flex items-center gap-6 group hover:shadow-md transition-shadow text-left w-full cursor-pointer"
                        >
                          <div className={`w-12 h-12 rounded-lg ${topic.bgClass} flex items-center justify-center ${topic.textClass}`}>
                            <span className="material-symbols-outlined">{topic.icon}</span>
                          </div>
                          <div className="flex-grow">
                            <div className="flex justify-between items-center mb-2">
                              <h4 className="font-bold text-on-surface font-headline">{topic.name}</h4>
                              <span className="text-xs font-medium text-tertiary">Progress: {topic.progress}%</span>
                            </div>
                            <div className="w-full bg-surface-variant h-1 rounded-full overflow-hidden">
                              <div className="bg-tertiary h-full" style={{ width: `${topic.progress}%` }} />
                            </div>
                          </div>
                          <span className="material-symbols-outlined text-outline group-hover:text-primary transition-colors">chevron_right</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Daily Quiz CTA */}
                  <div className="relative overflow-hidden bg-gradient-to-br from-primary to-primary-container rounded-xl p-8 text-white">
                    <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-8">
                      <div className="max-w-md">
                        <h3 className="text-2xl font-bold font-headline mb-2">Daily Grammar Quiz</h3>
                        <p className="text-primary-fixed text-sm mb-6 leading-relaxed font-body">Challenge yourself with 5 curated scenarios from actual board-level interviews. Maintain your 12-day streak.</p>
                        <button
                          type="button"
                          onClick={() => handleSelectTopic('tenses')}
                          className="bg-surface-container-lowest text-primary px-8 py-3 rounded-md text-sm font-bold flex items-center gap-2 hover:bg-white active:scale-95 transition-all"
                        >
                          <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                          Start Today's Quiz
                        </button>
                      </div>
                      <div className="flex gap-4">
                        <div className="bg-white/10 backdrop-blur-md p-4 rounded-lg text-center min-w-[80px]">
                          <p className="text-2xl font-bold font-headline">12</p>
                          <p className="text-[10px] uppercase tracking-wider opacity-80">Streak</p>
                        </div>
                        <div className="bg-white/10 backdrop-blur-md p-4 rounded-lg text-center min-w-[80px]">
                          <p className="text-2xl font-bold font-headline">450</p>
                          <p className="text-[10px] uppercase tracking-wider opacity-80">XP</p>
                        </div>
                      </div>
                    </div>
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-20 -mt-20" />
                  </div>
                </div>

                {/* Right Column: Sidebar Actions */}
                <div className="md:col-span-4 space-y-8">
                  {/* Review Mistakes */}
                  <div className="bg-surface-container-low rounded-xl p-8">
                    <div className="flex items-center gap-3 mb-6">
                      <span className="material-symbols-outlined text-error">assignment_late</span>
                      <h3 className="text-lg font-bold text-primary font-headline">Review Mistakes</h3>
                    </div>
                    <p className="text-sm text-on-surface-variant mb-6 leading-relaxed font-body">Focus on your recurring errors in 'Passive Voice' and 'Prepositions' to polish your output.</p>
                    <div className="space-y-4 mb-8">
                      <div className="flex items-start gap-4 p-3 bg-error-container/20 rounded-lg">
                        <div className="mt-1 text-error">
                          <span className="material-symbols-outlined text-sm">close</span>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-on-surface mb-1">Passive Voice Structure</p>
                          <p className="text-xs text-on-surface-variant">3 errors this week</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-4 p-3 bg-error-container/20 rounded-lg">
                        <div className="mt-1 text-error">
                          <span className="material-symbols-outlined text-sm">close</span>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-on-surface mb-1">Prepositions of Strategy</p>
                          <p className="text-xs text-on-surface-variant">1 error this week</p>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSelectTopic('passive-voice')}
                      className="w-full py-3 rounded-md text-sm font-bold bg-secondary-container text-on-secondary-container hover:opacity-90 transition-colors"
                    >
                      Re-take Practice Set
                    </button>
                  </div>

                  {/* Expert Tip */}
                  <div className="bg-surface-container-highest rounded-xl p-8 border-l-4 border-primary">
                    <span className="text-primary font-bold text-[10px] tracking-widest uppercase mb-2 block">Executive Insights</span>
                    <h4 className="text-lg font-bold text-primary font-headline mb-3">The Power of the Subjunctive</h4>
                    <p className="text-sm text-on-surface-variant leading-relaxed italic mb-4 font-body">
                      "Using the subjunctive mood ('It is vital that he be present') signals a high level of education and command in formal documentation."
                    </p>
                    <button type="button" className="text-sm font-bold text-primary flex items-center gap-1 hover:underline">
                      Read Full Editorial
                      <span className="material-symbols-outlined text-sm">arrow_outward</span>
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {phase === 'loading' && (
            <div className="flex flex-col items-center justify-center py-16" role="status">
              <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary border-t-transparent mb-4" />
              <p className="text-on-surface-variant font-body">Memuat soal quiz...</p>
            </div>
          )}

          {(phase === 'quiz' || phase === 'explanation') && quizData && (
            <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/20 p-6">
              <div className="flex items-center justify-between mb-4">
                <button
                  type="button"
                  onClick={handleBackToTopics}
                  className="text-sm text-primary hover:text-primary/80 inline-flex items-center gap-1 font-semibold"
                >
                  <span className="material-symbols-outlined text-sm">arrow_back</span>
                  Ganti Topik
                </button>
                {selectedTopic && (
                  <span className="text-sm text-on-surface-variant font-body" data-testid="current-topic">
                    Topik: {selectedTopic}
                  </span>
                )}
                <span className="text-sm text-on-surface-variant font-body" data-testid="score-display">
                  Skor: {score.correct}/{score.total}
                </span>
              </div>

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
        </div>
      </main>
    </div>
  )
}
