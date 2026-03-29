import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import type { SummaryReport as SummaryReportType } from '../../types'
import { updateProgress } from '../../services/apiClient'

interface SummaryReportProps {
  summaryReport: SummaryReportType
  sessionId: string
  onNewSession: () => void
}

const criteriaLabels: Record<string, string> = {
  grammar: 'Grammar',
  vocabulary: 'Vocabulary',
  relevance: 'Relevance',
  fillerWords: 'Filler Words',
  coherence: 'Coherence',
}

function scoreColor(score: number): string {
  if (score >= 80) return 'bg-tertiary'
  if (score >= 60) return 'bg-primary-fixed-dim'
  if (score >= 40) return 'bg-outline'
  return 'bg-error'
}

function scoreTextColor(score: number): string {
  if (score >= 80) return 'text-tertiary'
  if (score >= 60) return 'text-primary'
  if (score >= 40) return 'text-outline'
  return 'text-error'
}

function scoreBadgeLabel(score: number): string {
  if (score >= 80) return 'Excellent'
  if (score >= 60) return 'Good'
  if (score >= 40) return 'Fair'
  return 'Needs Improvement'
}

function scoreBadgeStyle(score: number): string {
  if (score >= 80) return 'bg-tertiary-container text-on-tertiary-container'
  if (score >= 60) return 'bg-primary-fixed text-primary'
  if (score >= 40) return 'bg-surface-container-high text-on-surface-variant'
  return 'bg-error-container text-on-error-container'
}

export default function SummaryReport({ summaryReport, sessionId, onNewSession }: SummaryReportProps) {
  const navigate = useNavigate()
  const progressSaved = useRef(false)

  useEffect(() => {
    if (progressSaved.current) return
    progressSaved.current = true
    updateProgress({
      moduleType: 'speaking',
      score: summaryReport.overallScore,
      sessionId,
    }).catch(() => {
      // Progress save failed silently — non-blocking
    })
  }, [summaryReport.overallScore, sessionId])

  const { overallScore, criteriaScores, performanceTrend, topImprovementAreas, recommendations } = summaryReport

  const maxTrendScore = Math.max(...performanceTrend.map((t) => t.score), 1)

  // SVG circular progress calculations
  const radius = 88
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (overallScore / 100) * circumference

  return (
    <div className="space-y-12 pb-32" data-testid="summary-report">
      {/* Hero Results Section: Asymmetric Bento Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Score Card */}
        <div className="lg:col-span-4 bg-surface-container-lowest p-8 rounded-xl shadow-sm flex flex-col items-center justify-center text-center">
          <span className="text-xs font-bold text-primary tracking-[0.2em] uppercase mb-6">Overall Performance</span>
          <div className="relative w-48 h-48 flex items-center justify-center" data-testid="overall-score">
            <svg className="w-full h-full transform -rotate-90">
              <circle
                className="text-surface-container"
                cx="96" cy="96" r={radius}
                fill="transparent" stroke="currentColor" strokeWidth="12"
              />
              <circle
                className={scoreTextColor(overallScore)}
                cx="96" cy="96" r={radius}
                fill="transparent" stroke="currentColor" strokeWidth="12"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
              />
            </svg>
            <div className="absolute flex flex-col items-center">
              <span className="font-headline text-5xl font-extrabold text-on-surface">{overallScore}</span>
              <span className="text-on-surface-variant font-semibold">/100</span>
            </div>
          </div>
          <div className="mt-8">
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${scoreBadgeStyle(overallScore)}`}>
              {scoreBadgeLabel(overallScore)}
            </span>
          </div>
          <p className="text-sm text-on-surface-variant mt-3">Skor Keseluruhan</p>
        </div>

        {/* Criteria Breakdown */}
        <div className="lg:col-span-8 bg-surface-container-low p-8 rounded-xl">
          <h3 className="font-headline text-lg font-bold text-primary mb-6">Performance Breakdown</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
            {Object.entries(criteriaLabels).map(([key, label]) => {
              const score = criteriaScores[key as keyof typeof criteriaScores]
              const isLast = key === 'coherence'
              return (
                <div key={key} className={`space-y-2 ${isLast ? 'md:col-span-2' : ''}`}>
                  <div className="flex justify-between items-center text-sm">
                    <span className="font-semibold text-on-surface">{label}</span>
                    <span className={`font-bold ${scoreTextColor(score)}`}>{score}</span>
                  </div>
                  <div
                    className="h-1.5 w-full bg-surface-container-highest rounded-full overflow-hidden"
                    role="progressbar"
                    aria-valuenow={score}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${label} score`}
                  >
                    <div className={`h-full ${scoreColor(score)} rounded-full`} style={{ width: `${score}%` }} />
                  </div>
                </div>
              )
            })}
          </div>

          {/* Speech Analysis Waveform */}
          <div className="mt-10 p-4 bg-surface-container-lowest rounded-lg">
            <div className="flex items-center gap-3 mb-2">
              <span className="material-symbols-outlined text-primary text-sm">mic</span>
              <span className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">Speech Analysis</span>
            </div>
            <div className="flex items-end gap-1 h-12 w-full">
              {[4, 8, 10, 6, 12, 8, 4, 10, 6, 12, 12, 8, 4, 10, 6, 12].map((h, i) => (
                <div key={i} className={`w-1 rounded-full ${i % 3 === 2 ? 'bg-tertiary-fixed' : 'bg-primary-fixed-dim'}`} style={{ height: `${(h / 12) * 100}%` }} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Performance Trend */}
      {performanceTrend.length > 0 && (
        <section>
          <div className="flex items-center gap-4 mb-6">
            <div className="w-10 h-10 rounded bg-primary-fixed flex items-center justify-center">
              <span className="material-symbols-outlined text-primary">trending_up</span>
            </div>
            <h3 className="font-headline text-2xl font-bold text-on-surface">Tren Performa</h3>
          </div>
          <div className="bg-surface-container-lowest rounded-xl p-8 shadow-sm">
            <div className="flex items-end gap-3 h-32" data-testid="performance-trend">
              {performanceTrend.map((item) => {
                const heightPercent = (item.score / maxTrendScore) * 100
                return (
                  <div key={item.questionNumber} className="flex flex-col items-center flex-1">
                    <span className="text-xs font-bold text-on-surface-variant mb-1">{item.score}</span>
                    <div
                      className={`w-full rounded-t ${scoreColor(item.score)}`}
                      style={{ height: `${heightPercent}%` }}
                      data-testid={`trend-bar-${item.questionNumber}`}
                      role="img"
                      aria-label={`Pertanyaan ${item.questionNumber}: skor ${item.score}`}
                    />
                    <span className="text-xs text-on-surface-variant mt-1 font-medium">Q{item.questionNumber}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {/* Top Improvement Areas */}
      {topImprovementAreas.length > 0 && (
        <section>
          <div className="flex items-center gap-4 mb-6">
            <div className="w-10 h-10 rounded bg-secondary-container flex items-center justify-center">
              <span className="material-symbols-outlined text-primary">lightbulb</span>
            </div>
            <h3 className="font-headline text-2xl font-bold text-on-surface">Area yang Perlu Ditingkatkan</h3>
          </div>
          <div className="space-y-4" data-testid="improvement-areas">
            {topImprovementAreas.map((area, i) => (
              <div key={i} className="p-5 bg-surface-container-low border-l-4 border-primary rounded-r-xl flex gap-4">
                <span className="material-symbols-outlined text-primary mt-1">check_circle</span>
                <p className="text-sm text-on-surface-variant leading-relaxed">{area}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <section>
          <div className="flex items-center gap-4 mb-6">
            <div className="w-10 h-10 rounded bg-tertiary-container flex items-center justify-center">
              <span className="material-symbols-outlined text-tertiary-fixed">auto_awesome</span>
            </div>
            <h3 className="font-headline text-2xl font-bold text-on-surface">Rekomendasi</h3>
          </div>
          <div className="space-y-4" data-testid="recommendations">
            {recommendations.map((rec, i) => (
              <div key={i} className="p-5 bg-surface-container-low border-l-4 border-tertiary rounded-r-xl flex gap-4">
                <span className="material-symbols-outlined text-tertiary mt-1">star</span>
                <p className="text-sm text-on-surface-variant leading-relaxed">{rec}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Sticky Footer Actions */}
      <div className="fixed bottom-0 left-0 md:left-64 right-0 bg-white/80 backdrop-blur-xl border-t border-slate-200/20 px-6 py-4 z-40">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row gap-4 justify-between items-center">
          <div className="hidden sm:block">
            <p className="text-xs text-on-surface-variant font-medium">Session ID: #{sessionId}</p>
          </div>
          <div className="flex items-center gap-4 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="flex-1 sm:flex-none px-6 py-3 rounded-lg bg-secondary-container text-on-secondary-container text-sm font-headline font-bold hover:bg-surface-container-highest transition-all flex items-center justify-center gap-2"
              data-testid="back-to-dashboard-button"
            >
              <span className="material-symbols-outlined text-sm">dashboard</span>
              Kembali ke Dashboard
            </button>
            <button
              type="button"
              onClick={onNewSession}
              className="flex-1 sm:flex-none px-8 py-3 rounded-lg bg-gradient-to-br from-primary to-primary-container text-white text-sm font-headline font-bold shadow-lg shadow-primary-container/25 hover:opacity-90 hover:translate-y-[-2px] transition-all active:scale-95 flex items-center justify-center gap-2"
              data-testid="new-session-button"
            >
              <span className="material-symbols-outlined text-sm">replay</span>
              Mulai Sesi Baru
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
