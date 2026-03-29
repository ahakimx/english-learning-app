import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { getProgress } from '../../services/apiClient'
import type { ProgressData } from '../../types'
import Sidebar from './Sidebar'

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [progress, setProgress] = useState<ProgressData | null>(null)
  const [loading, setLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    getProgress()
      .then(setProgress)
      .catch(() => setProgress(null))
      .finally(() => setLoading(false))
  }, [])

  const speakingScore = progress?.speaking.averageScore ?? 0
  const grammarScore = (() => {
    if (!progress?.grammar.topicScores) return 0
    const scores = Object.values(progress.grammar.topicScores)
    if (scores.length === 0) return 0
    return Math.round(scores.reduce((sum, s) => sum + s.accuracy, 0) / scores.length)
  })()
  const writingScore = progress?.writing.averageScore ?? 0
  const overallScore = Math.round((speakingScore + grammarScore + writingScore) / 3)
  const totalSessions = progress?.speaking.totalSessions ?? 0
  const totalQuizzes = progress?.grammar.totalQuizzes ?? 0
  const totalWriting = progress?.writing.totalReviews ?? 0
  const totalPractice = totalSessions + totalQuizzes + totalWriting

  // SVG radial progress
  const radius = 42
  const circumference = 2 * Math.PI * radius
  const strokeOffset = circumference - (overallScore / 100) * circumference

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
            <button type="button" className="text-[#003461] border-b-2 border-[#003461] font-headline font-semibold text-sm h-16 flex items-center">Overview</button>
            <button type="button" onClick={() => navigate('/progress')} className="text-slate-500 hover:text-[#004b87] transition-colors font-headline font-semibold text-sm h-16 flex items-center">Curriculum</button>
            <button type="button" className="text-slate-500 hover:text-[#004b87] transition-colors font-headline font-semibold text-sm h-16 flex items-center">Resources</button>
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
            {user?.email?.charAt(0).toUpperCase() ?? 'U'}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="lg:ml-64 pt-16 min-h-screen">
        <div className="max-w-7xl mx-auto p-4 md:p-10 space-y-8 md:space-y-10">

          {/* Hero Progress Section */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8 items-stretch">
            {/* Overall Progress Radial */}
            <div className="lg:col-span-5 bg-surface-container-low p-6 md:p-8 flex flex-col items-center justify-center text-center rounded-xl">
              <h2 className="font-headline font-bold text-xl md:text-2xl text-primary mb-6 md:mb-8 self-start">Interview Readiness</h2>
              {loading ? (
                <div className="w-48 h-48 md:w-64 md:h-64 rounded-full bg-surface-container animate-pulse" />
              ) : (
                <div className="relative w-48 h-48 md:w-64 md:h-64 flex items-center justify-center">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                    <circle className="text-surface-container-highest" cx="50" cy="50" fill="transparent" r={radius} stroke="currentColor" strokeWidth="8" />
                    <circle className="text-tertiary" cx="50" cy="50" fill="transparent" r={radius} stroke="currentColor" strokeDasharray={circumference} strokeDashoffset={strokeOffset} strokeLinecap="round" strokeWidth="8" />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-4xl md:text-5xl font-headline font-extrabold text-primary">{overallScore}%</span>
                    <span className="text-[10px] md:text-xs font-semibold text-on-surface-variant tracking-widest uppercase">Overall Score</span>
                  </div>
                </div>
              )}
              <p className="mt-6 md:mt-8 text-on-surface-variant text-sm max-w-xs">
                Skor rata-rata dari semua modul. Terus berlatih untuk meningkatkan kemampuan interview Anda.
              </p>
            </div>

            {/* Stats Bento Cards */}
            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-primary p-6 md:p-8 text-white flex flex-col justify-between rounded-xl">
                <div>
                  <span className="material-symbols-outlined text-3xl md:text-4xl mb-4">avg_time</span>
                  <h3 className="text-2xl md:text-3xl font-headline font-bold">{totalPractice}</h3>
                  <p className="text-primary-fixed-dim text-sm mt-1">Total Latihan</p>
                </div>
                <div className="text-xs font-medium bg-primary-container/30 px-3 py-1 self-start rounded-full mt-4">
                  {totalSessions} interview · {totalQuizzes} quiz · {totalWriting} writing
                </div>
              </div>
              <div className="bg-tertiary-container p-6 md:p-8 text-tertiary-fixed flex flex-col justify-between rounded-xl">
                <div>
                  <span className="material-symbols-outlined text-3xl md:text-4xl mb-4">trophy</span>
                  <h3 className="text-2xl md:text-3xl font-headline font-bold">{totalSessions}</h3>
                  <p className="text-tertiary-fixed-dim text-sm mt-1">Sesi Interview</p>
                </div>
                <div className="text-xs font-medium bg-tertiary/20 px-3 py-1 self-start rounded-full mt-4">Rata-rata: {speakingScore}%</div>
              </div>
              <div className="sm:col-span-2 bg-surface-container-lowest p-6 rounded-xl shadow-sm flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 md:w-12 md:h-12 bg-secondary-container rounded-lg flex items-center justify-center text-primary shrink-0">
                    <span className="material-symbols-outlined">trending_up</span>
                  </div>
                  <div>
                    <h4 className="font-bold text-on-surface text-sm md:text-base">Weekly Momentum</h4>
                    <p className="text-[11px] md:text-xs text-on-surface-variant">Speaking {speakingScore}% · Grammar {grammarScore}% · Writing {writingScore}%</p>
                  </div>
                </div>
                <button type="button" onClick={() => navigate('/progress')} className="text-tertiary font-bold text-base md:text-lg">→</button>
              </div>
            </div>
          </section>

          {/* Module Cards Section */}
          <section>
            <div className="flex justify-between items-end mb-6">
              <div>
                <h2 className="font-headline font-bold text-xl md:text-2xl text-primary">Learning Modules</h2>
                <p className="text-on-surface-variant text-sm">Targeted skill development for your next role.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Speaking Card */}
              <div className="bg-surface-container-lowest p-6 rounded-xl shadow-sm group hover:shadow-md transition-shadow flex flex-col h-full border border-surface-container-highest/50">
                <div className="flex justify-between items-start mb-6">
                  <div className="w-12 h-12 bg-blue-50 text-primary rounded-lg flex items-center justify-center">
                    <span className="material-symbols-outlined">mic</span>
                  </div>
                  <span className="text-xs font-bold text-on-surface-variant">{speakingScore}% Done</span>
                </div>
                <h3 className="text-lg font-bold text-primary mb-2">Speaking &amp; Fluency</h3>
                <p className="text-sm text-on-surface-variant flex-1">Master the STAR method and reduce filler words in high-pressure answers.</p>
                <div className="mt-6">
                  <div className="w-full bg-surface-variant h-1 rounded-full mb-4">
                    <div className="bg-primary h-1 rounded-full" style={{ width: `${speakingScore}%` }} />
                  </div>
                  <button type="button" onClick={() => navigate('/speaking')} className="w-full py-2.5 bg-secondary-container text-on-secondary-container text-sm font-semibold rounded-md hover:bg-primary hover:text-white transition-colors">Continue</button>
                </div>
              </div>

              {/* Grammar Card */}
              <div className="bg-surface-container-lowest p-6 rounded-xl shadow-sm group hover:shadow-md transition-shadow flex flex-col h-full border border-surface-container-highest/50">
                <div className="flex justify-between items-start mb-6">
                  <div className="w-12 h-12 bg-emerald-50 text-tertiary rounded-lg flex items-center justify-center">
                    <span className="material-symbols-outlined">spellcheck</span>
                  </div>
                  <span className="text-xs font-bold text-on-surface-variant">{grammarScore}% Done</span>
                </div>
                <h3 className="text-lg font-bold text-primary mb-2">Executive Grammar</h3>
                <p className="text-sm text-on-surface-variant flex-1">Advanced conditional structures for negotiating and pitching ideas effectively.</p>
                <div className="mt-6">
                  <div className="w-full bg-surface-variant h-1 rounded-full mb-4">
                    <div className="bg-tertiary h-1 rounded-full" style={{ width: `${grammarScore}%` }} />
                  </div>
                  <button type="button" onClick={() => navigate('/grammar')} className="w-full py-2.5 bg-secondary-container text-on-secondary-container text-sm font-semibold rounded-md hover:bg-primary hover:text-white transition-colors">Continue</button>
                </div>
              </div>

              {/* Writing Card */}
              <div className="bg-surface-container-lowest p-6 rounded-xl shadow-sm group hover:shadow-md transition-shadow flex flex-col h-full border border-surface-container-highest/50 md:col-span-2 lg:col-span-1">
                <div className="flex justify-between items-start mb-6">
                  <div className="w-12 h-12 bg-amber-50 text-amber-700 rounded-lg flex items-center justify-center">
                    <span className="material-symbols-outlined">history_edu</span>
                  </div>
                  <span className="text-xs font-bold text-on-surface-variant">{writingScore}% Done</span>
                </div>
                <h3 className="text-lg font-bold text-primary mb-2">Technical Writing</h3>
                <p className="text-sm text-on-surface-variant flex-1">Crafting persuasive follow-up emails and refining your professional summary.</p>
                <div className="mt-6">
                  <div className="w-full bg-surface-variant h-1 rounded-full mb-4">
                    <div className="bg-amber-600 h-1 rounded-full" style={{ width: `${writingScore}%` }} />
                  </div>
                  <button type="button" onClick={() => navigate('/writing')} className="w-full py-2.5 bg-secondary-container text-on-secondary-container text-sm font-semibold rounded-md hover:bg-primary hover:text-white transition-colors">Continue</button>
                </div>
              </div>
            </div>
          </section>

          {/* Recommended for You */}
          <section className="bg-surface-container-low p-6 md:p-10 rounded-2xl">
            <div className="flex items-center gap-2 mb-8">
              <span className="material-symbols-outlined text-tertiary">tips_and_updates</span>
              <h2 className="font-headline font-bold text-xl md:text-2xl text-primary">Recommended for You</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10">
              <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 items-start">
                <div className="shrink-0 w-full sm:w-32 h-40 sm:h-20 rounded-lg overflow-hidden bg-surface-container-high flex items-center justify-center">
                  <span className="material-symbols-outlined text-primary" style={{ fontSize: '32px' }}>record_voice_over</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-tertiary tracking-widest uppercase mb-1 block">Soft Skills</span>
                  <h4 className="font-bold text-primary mb-1 text-sm md:text-base">Mastering the "Tell me about yourself" pitch</h4>
                  <p className="text-xs text-on-surface-variant line-clamp-2">Learn how to anchor your career story in 60 seconds with peak impact.</p>
                  <button type="button" onClick={() => navigate('/speaking')} className="text-xs font-bold text-primary inline-flex items-center gap-1 mt-2 hover:underline">
                    Read Guide <span className="material-symbols-outlined text-sm">arrow_forward</span>
                  </button>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 items-start">
                <div className="shrink-0 w-full sm:w-32 h-40 sm:h-20 rounded-lg overflow-hidden bg-surface-container-high flex items-center justify-center">
                  <span className="material-symbols-outlined text-primary" style={{ fontSize: '32px' }}>payments</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-primary tracking-widest uppercase mb-1 block">Strategy</span>
                  <h4 className="font-bold text-primary mb-1 text-sm md:text-base">Salary Negotiation Vocabulary</h4>
                  <p className="text-xs text-on-surface-variant line-clamp-2">The exact phrases used by executives to secure better compensation packages.</p>
                  <button type="button" onClick={() => navigate('/writing')} className="text-xs font-bold text-primary inline-flex items-center gap-1 mt-2 hover:underline">
                    Read Guide <span className="material-symbols-outlined text-sm">arrow_forward</span>
                  </button>
                </div>
              </div>
            </div>
          </section>

        </div>
      </main>

      {/* Contextual FAB */}
      <button
        type="button"
        onClick={() => navigate('/speaking')}
        className="fixed bottom-6 right-6 md:bottom-8 md:right-8 w-14 h-14 bg-tertiary text-white rounded-xl shadow-2xl flex items-center justify-center active:scale-95 transition-transform z-[55]"
        aria-label="Mulai interview baru"
      >
        <span className="material-symbols-outlined" style={{ fontSize: '28px' }}>add</span>
      </button>
    </div>
  )
}
