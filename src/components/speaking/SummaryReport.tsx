import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import type { SummaryReport as SummaryReportType, FeedbackReport } from '../../types'
import { updateProgress } from '../../services/apiClient'

interface SummaryReportProps {
  summaryReport: SummaryReportType
  sessionId: string
  onNewSession: () => void
  feedbackReports?: FeedbackReport[]
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

/* ------------------------------------------------------------------ */
/*  Aura Wave Chart helpers                                           */
/* ------------------------------------------------------------------ */

interface TrendPoint {
  questionNumber: number
  score: number
}

const SVG_W = 1000
const SVG_H = 300
const PAD_X = 100 // left/right padding so bubbles don't clip
const PAD_TOP = 30
const PAD_BOT = 30

/** Map a data point index + score to SVG coordinates */
function toSvg(index: number, score: number, total: number): { x: number; y: number } {
  const usableW = SVG_W - PAD_X * 2
  const usableH = SVG_H - PAD_TOP - PAD_BOT
  const x = total === 1 ? SVG_W / 2 : PAD_X + (index / (total - 1)) * usableW
  // score 100 = top (PAD_TOP), score 0 = bottom (SVG_H - PAD_BOT)
  const y = PAD_TOP + (1 - score / 100) * usableH
  return { x, y }
}

/** Build a smooth cubic-bezier SVG path through the given points, with lead-in from left edge */
function buildSmoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M ${points[0].x},${points[0].y}`

  // Start from left edge at the first point's Y, then curve into the first point
  const first = points[0]
  let d = `M 0,${first.y} C ${first.x / 2},${first.y} ${first.x / 2},${first.y} ${first.x},${first.y}`

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(i + 2, points.length - 1)]

    const tension = 0.35
    const cp1x = p1.x + (p2.x - p0.x) * tension
    const cp1y = p1.y + (p2.y - p0.y) * tension
    const cp2x = p2.x - (p3.x - p1.x) * tension
    const cp2y = p2.y - (p3.y - p1.y) * tension

    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`
  }
  return d
}

/** Build the closed area-fill path matching Stitch design: M 0,H L 0,firstY [curve] L lastX,H Z */
function buildAreaPath(linePath: string, points: { x: number; y: number }[]): string {
  if (points.length === 0) return ''
  const first = points[0]
  const last = points[points.length - 1]
  const curvePart = linePath.includes('C') ? linePath.substring(linePath.indexOf('C')) : ''
  // Stitch pattern: start bottom-left, go up to first point Y, follow curve, close bottom-right
  return `M 0,${SVG_H} L 0,${first.y} C ${first.x / 2},${first.y} ${first.x / 2},${first.y} ${first.x},${first.y} ${curvePart} L ${last.x},${SVG_H} Z`
}

/** Bubble color based on score */
function bubbleBg(score: number): string {
  if (score >= 80) return '#49d08f'
  if (score >= 70) return '#003461'
  if (score >= 60) return '#2a5a8a'
  if (score >= 40) return '#4a5568'
  return '#ba1a1a'
}

function bubbleText(score: number): string {
  if (score >= 80) return '#0a1628'
  return '#ffffff'
}

function bubbleBorder(score: number): string {
  if (score >= 80) return 'border-2 border-[#49d08f]/50'
  return 'border border-white/10'
}

function bubbleFontWeight(score: number): string {
  return score >= 80 ? 'font-extrabold' : 'font-bold'
}

/* ------------------------------------------------------------------ */
/*  Trend insight helper                                              */
/* ------------------------------------------------------------------ */

function computeTrendInsight(trend: TrendPoint[]): string | null {
  if (trend.length < 2) return null
  let bestImprovement = -Infinity
  let fromQ = 0
  let toQ = 0
  let points = 0
  for (let i = 1; i < trend.length; i++) {
    const diff = trend[i].score - trend[i - 1].score
    if (diff > bestImprovement) {
      bestImprovement = diff
      fromQ = trend[i - 1].questionNumber
      toQ = trend[i].questionNumber
      points = diff
    }
  }
  if (bestImprovement <= 0) return null
  return `Performa Anda meningkat <strong class="font-bold text-tertiary">${points} poin</strong> dari Q${fromQ} ke Q${toQ}. Pertahankan momentum ini!`
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export default function SummaryReport({ summaryReport, sessionId, onNewSession, feedbackReports = [] }: SummaryReportProps) {
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

  const { overallScore, criteriaScores, performanceTrend: backendTrend, topImprovementAreas, recommendations } = summaryReport

  // Build performanceTrend from feedbackReports if backend data is incomplete
  const performanceTrend = backendTrend.length >= feedbackReports.length
    ? backendTrend
    : feedbackReports.length > 0
      ? feedbackReports.map((r, i) => ({ questionNumber: i + 1, score: r.scores.overall }))
      : backendTrend

  const maxTrendScore = Math.max(...performanceTrend.map((t) => t.score), 1)

  // SVG circular progress calculations
  const radius = 88
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (overallScore / 100) * circumference

  // Aura wave chart data
  const showAuraChart = performanceTrend.length >= 2
  const svgPoints = performanceTrend.map((pt, i) => toSvg(i, pt.score, performanceTrend.length))
  const linePath = buildSmoothPath(svgPoints)
  const areaPath = buildAreaPath(linePath, svgPoints)

  // Summary stats
  const scores = performanceTrend.map((t) => t.score)
  const maxScore = scores.length > 0 ? Math.max(...scores) : 0
  const minScore = scores.length > 0 ? Math.min(...scores) : 0
  const avgScore = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length) : 0

  const trendInsight = computeTrendInsight(performanceTrend)

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

      {/* Performance Trend — Aura Wave Chart (2+ points) or Bar fallback (1 point) */}
      {performanceTrend.length > 0 && (
        <section className="space-y-8">
          {showAuraChart ? (
            /* ---- Dynamic Aura Wave Chart ---- */
            <div className="bg-[#0a1628] rounded-xl p-10 min-h-[350px] relative overflow-hidden flex flex-col" data-testid="performance-trend">
              {/* Header */}
              <div className="flex justify-between items-center relative z-20 mb-8">
                <h3 className="text-2xl font-headline font-bold text-white">Tren Performa</h3>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[#49d08f]" />
                    <span className="text-[10px] font-bold text-[#49d08f] uppercase tracking-widest">Momentum</span>
                  </div>
                  <div className="bg-[#1a2a3a] px-3 py-1.5 rounded-lg text-xs font-bold text-white/80">
                    Q1 - Q{performanceTrend.length} Analysis
                  </div>
                </div>
              </div>

              {/* Chart Area */}
              <div className="relative flex-1 w-full min-h-[250px]">
                {/* SVG Chart */}
                <svg
                  className="absolute inset-0 w-full h-full z-10"
                  viewBox={`0 0 ${SVG_W} ${SVG_H}`}
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <defs>
                    <linearGradient id="auraWaveGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#49d08f" stopOpacity="0.2" />
                      <stop offset="100%" stopColor="#49d08f" stopOpacity="0" />
                    </linearGradient>
                    <filter id="glowLine" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="12" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                  </defs>
                  {/* Area fill */}
                  <path d={areaPath} fill="url(#auraWaveGradient)" />
                  {/* Glow line */}
                  <path d={linePath} fill="none" stroke="#49d08f" strokeWidth="12" strokeOpacity="0.4" filter="url(#glowLine)" />
                  {/* Main line */}
                  <path d={linePath} fill="none" stroke="#49d08f" strokeWidth="3" strokeLinecap="round" />
                </svg>

                {/* Floating score bubbles */}
                {performanceTrend.map((pt, i) => {
                  const svgPt = svgPoints[i]
                  // Convert SVG coords to percentage for CSS positioning
                  const leftPct = (svgPt.x / SVG_W) * 100
                  const topPct = (svgPt.y / SVG_H) * 100
                  return (
                    <div
                      key={pt.questionNumber}
                      className="absolute z-20 flex flex-col items-center gap-2 -translate-x-1/2 -translate-y-1/2"
                      style={{ left: `${leftPct}%`, top: `${topPct}%` }}
                      data-testid={`trend-bar-${pt.questionNumber}`}
                      role="img"
                      aria-label={`Pertanyaan ${pt.questionNumber}: skor ${pt.score}`}
                    >
                      <div
                        className={`w-[56px] h-[56px] rounded-xl flex items-center justify-center text-xl shadow-lg ${bubbleBorder(pt.score)} ${bubbleFontWeight(pt.score)}`}
                        style={{ backgroundColor: bubbleBg(pt.score), color: bubbleText(pt.score) }}
                      >
                        {pt.score}
                      </div>
                      <div className="text-[10px] text-white/60 font-bold uppercase tracking-wider">Q{pt.questionNumber}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            /* ---- Fallback: simple bar chart for 1 data point ---- */
            <div>
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
            </div>
          )}

          {/* Summary Stats Row */}
          {performanceTrend.length >= 2 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-surface-container-lowest p-6 rounded-lg shadow-[0_8px_16px_-4px_rgba(25,28,29,0.04)] flex items-center gap-4">
                <div className="w-3 h-3 rounded-full bg-tertiary" />
                <div>
                  <div className="text-xs font-bold text-on-surface-variant uppercase mb-1">Skor Tertinggi</div>
                  <div className="text-3xl font-headline font-extrabold text-primary">{maxScore}</div>
                </div>
              </div>
              <div className="bg-surface-container-lowest p-6 rounded-lg shadow-[0_8px_16px_-4px_rgba(25,28,29,0.04)] flex items-center gap-4">
                <div className="w-3 h-3 rounded-full bg-error" />
                <div>
                  <div className="text-xs font-bold text-on-surface-variant uppercase mb-1">Skor Terendah</div>
                  <div className="text-3xl font-headline font-extrabold text-primary">{minScore}</div>
                </div>
              </div>
              <div className="bg-surface-container-lowest p-6 rounded-lg shadow-[0_8px_16px_-4px_rgba(25,28,29,0.04)] flex items-center gap-4">
                <div className="w-3 h-3 rounded-full bg-primary" />
                <div>
                  <div className="text-xs font-bold text-on-surface-variant uppercase mb-1">Rata-rata</div>
                  <div className="text-3xl font-headline font-extrabold text-primary">{avgScore.toFixed(1)}</div>
                </div>
              </div>
            </div>
          )}

          {/* Trend Insight Card */}
          {trendInsight && (
            <div className="bg-surface-container-highest p-5 rounded-r-xl border-l-4 border-tertiary flex items-center gap-4">
              <span className="material-symbols-outlined text-tertiary text-2xl">lightbulb</span>
              <p className="text-sm text-on-surface" dangerouslySetInnerHTML={{ __html: trendInsight }} />
            </div>
          )}
        </section>
      )}

      {/* Per-Question Feedback Details */}
      {feedbackReports.length > 0 && (
        <section>
          <div className="flex items-center gap-4 mb-6">
            <div className="w-10 h-10 rounded bg-primary-fixed flex items-center justify-center">
              <span className="material-symbols-outlined text-primary">rate_review</span>
            </div>
            <h3 className="font-headline text-2xl font-bold text-on-surface">Detail Feedback Per Pertanyaan</h3>
          </div>
          <div className="space-y-8" data-testid="per-question-feedback">
            {feedbackReports.map((report, idx) => (
              <div key={idx} className="bg-surface-container-lowest rounded-xl p-8 shadow-[0_24px_24px_-4px_rgba(25,28,29,0.04)] space-y-8">
                <div className="flex items-center justify-between">
                  <h4 className="text-xl font-headline font-bold text-primary">Pertanyaan {idx + 1}</h4>
                  <span className={`text-lg font-headline font-extrabold ${scoreTextColor(report.scores.overall)}`}>
                    {report.scores.overall}/100
                  </span>
                </div>

                {/* Score bars */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
                  {Object.entries(criteriaLabels).map(([key, label]) => {
                    const score = report.scores[key as keyof typeof report.scores]
                    return (
                      <div key={key} className="space-y-1">
                        <div className="flex justify-between items-center text-xs font-bold">
                          <span className="text-on-surface">{label}</span>
                          <span className={scoreTextColor(score)}>{score}</span>
                        </div>
                        <div className="h-1 w-full bg-surface-container-highest rounded-full overflow-hidden">
                          <div className={`h-full ${scoreColor(score)} rounded-full`} style={{ width: `${score}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Grammar Errors */}
                {report.grammarErrors.length > 0 && (
                  <div>
                    <h4 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-4">Grammar Corrections</h4>
                    <div className="bg-surface rounded-lg overflow-hidden">
                      <table className="w-full text-left">
                        <thead className="border-b border-outline-variant/10 text-xs font-bold text-on-surface-variant uppercase">
                          <tr>
                            <th className="px-6 py-4">Original Text</th>
                            <th className="px-6 py-4">Corrected Text</th>
                            <th className="px-6 py-4">Labels</th>
                          </tr>
                        </thead>
                        <tbody className="text-sm">
                          {report.grammarErrors.map((err, i) => (
                            <tr key={i} className={i < report.grammarErrors.length - 1 ? 'border-b border-outline-variant/5' : ''}>
                              <td className="px-6 py-4 line-through text-on-surface-variant">{err.original}</td>
                              <td className="px-6 py-4 font-medium text-primary">{err.correction}</td>
                              <td className="px-6 py-4">
                                <span className="px-2 py-0.5 bg-secondary-container text-on-secondary-container rounded text-[10px] font-bold uppercase">{err.rule}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Filler Words */}
                {report.fillerWordsDetected.length > 0 && (
                  <div>
                    <h4 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-4">Filler Words Detected</h4>
                    <div className="flex flex-wrap gap-3">
                      {report.fillerWordsDetected.map((fw, i) => (
                        <div key={i} className="flex items-center gap-2 px-4 py-2 bg-error-container/20 border-l-4 border-error rounded-r-lg">
                          <span className="text-error font-bold">&ldquo;{fw.word}&rdquo;</span>
                          <span className="text-xs bg-error text-on-error px-2 rounded-full">{fw.count}x</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Suggestions */}
                {report.suggestions.length > 0 && (
                  <div>
                    <h4 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-4">Suggestions</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {report.suggestions.map((s, i) => (
                        <div key={i} className="p-6 border-l-4 border-primary bg-surface-container-low rounded-r-xl">
                          <p className="text-sm text-on-surface-variant leading-relaxed">{s}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Improved Answer */}
                {report.improvedAnswer && (
                  <div className="p-8 border-l-4 border-tertiary-fixed bg-tertiary-container/10 rounded-r-xl relative">
                    <div className="absolute top-6 right-6 text-tertiary-fixed">
                      <span className="material-symbols-outlined text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
                    </div>
                    <h4 className="text-sm font-bold text-tertiary uppercase tracking-widest mb-4">Improved Answer Recommendation</h4>
                    <p className="italic text-on-surface leading-loose pr-12">
                      &ldquo;{report.improvedAnswer}&rdquo;
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Top Improvement Areas */}
      {topImprovementAreas.length > 0 && (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-10">
          <div className="bg-surface-container-low p-8 rounded-xl border-l-8 border-primary">
            <h3 className="text-xl font-headline font-bold mb-6 text-primary flex items-center gap-3">
              <span className="material-symbols-outlined">trending_up</span>
              Area yang Perlu Ditingkatkan
            </h3>
            <ul className="space-y-4" data-testid="improvement-areas">
              {topImprovementAreas.map((area, i) => (
                <li key={i} className="flex items-start gap-4">
                  <span className="material-symbols-outlined text-primary mt-1">check_circle</span>
                  <div>
                    <span className="text-sm text-on-surface-variant leading-relaxed">{area}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Recommendations */}
          {recommendations.length > 0 && (
            <div className="bg-surface-container-low p-8 rounded-xl border-l-8 border-tertiary">
              <h3 className="text-xl font-headline font-bold mb-6 text-tertiary flex items-center gap-3">
                <span className="material-symbols-outlined">tips_and_updates</span>
                Rekomendasi
              </h3>
              <ul className="space-y-4" data-testid="recommendations">
                {recommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-4">
                    <span className="material-symbols-outlined text-tertiary mt-1" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                    <div>
                      <span className="text-sm text-on-surface-variant leading-relaxed">{rec}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* Standalone Recommendations (when no improvement areas) */}
      {topImprovementAreas.length === 0 && recommendations.length > 0 && (
        <section>
          <div className="bg-surface-container-low p-8 rounded-xl border-l-8 border-tertiary">
            <h3 className="text-xl font-headline font-bold mb-6 text-tertiary flex items-center gap-3">
              <span className="material-symbols-outlined">tips_and_updates</span>
              Rekomendasi
            </h3>
            <ul className="space-y-4" data-testid="recommendations">
              {recommendations.map((rec, i) => (
                <li key={i} className="flex items-start gap-4">
                  <span className="material-symbols-outlined text-tertiary mt-1" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                  <div>
                    <span className="text-sm text-on-surface-variant leading-relaxed">{rec}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Expert Insight Card */}
      <section className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary to-primary-container p-12 text-white shadow-xl">
        <div className="relative z-10 max-w-3xl">
          <span className="material-symbols-outlined text-6xl opacity-30 mb-6">format_quote</span>
          <p className="text-2xl font-headline font-bold leading-tight mb-8">
            &ldquo;Your technical skills are evident, but your storytelling needs more &lsquo;connective tissue&rsquo;. Focus on why you made specific decisions, not just what the decisions were. That is where the executive maturity shines through.&rdquo;
          </p>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center border-2 border-primary-fixed">
              <span className="material-symbols-outlined text-white">person</span>
            </div>
            <div>
              <div className="font-bold">Interview Coach &bull; AI Mentor</div>
              <div className="text-primary-fixed-dim text-sm">Strategic Career Advisory</div>
            </div>
          </div>
        </div>
        {/* Decorative circle */}
        <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-white/5 rounded-full blur-3xl" />
      </section>

      {/* Pro Tips Section */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-surface-container-low p-6 rounded-lg border-l-4 border-secondary shadow-sm" data-testid="pro-tips">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-secondary">category</span>
            <h5 className="font-headline font-bold text-secondary text-sm">STAR Method</h5>
          </div>
          <p className="text-xs text-on-surface-variant">
            Strukturkan jawaban Anda menggunakan Situation, Task, Action, dan Result untuk kejelasan maksimal.
          </p>
        </div>
        <div className="bg-surface-container-low p-6 rounded-lg border-l-4 border-secondary shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-secondary">timer</span>
            <h5 className="font-headline font-bold text-secondary text-sm">Embrace the Pause</h5>
          </div>
          <p className="text-xs text-on-surface-variant">
            Berhenti sejenak sebelum menjawab menunjukkan bahwa Anda berpikir kritis, bukan panik.
          </p>
        </div>
        <div className="bg-surface-container-low p-6 rounded-lg border-l-4 border-secondary shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-secondary">query_stats</span>
            <h5 className="font-headline font-bold text-secondary text-sm">Quantify Success</h5>
          </div>
          <p className="text-xs text-on-surface-variant">
            Angka memberikan kredibilitas instan. Selalu sertakan persentase, nominal, atau jumlah orang.
          </p>
        </div>
      </section>

      {/* Sticky Footer Actions */}
      <div className="fixed bottom-0 left-0 md:left-64 right-0 bg-[#f3f4f5]/80 backdrop-blur-xl border-t border-outline-variant/20 px-6 py-4 z-40 shadow-[0_-4px_24px_-4px_rgba(25,28,29,0.04)]">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row gap-4 justify-between items-center">
          <div className="hidden sm:block">
            <p className="text-sm text-on-surface-variant">Session ID: <span className="font-mono font-bold">#{sessionId}</span></p>
          </div>
          <div className="flex items-center gap-4 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="flex-1 sm:flex-none px-6 py-2 rounded-md font-bold text-sm bg-secondary-container text-on-secondary-container hover:bg-surface-container-highest transition-all active:scale-95 focus:ring-2 focus:ring-primary"
              data-testid="back-to-dashboard-button"
            >
              Kembali ke Dashboard
            </button>
            <button
              type="button"
              onClick={onNewSession}
              className="flex-1 sm:flex-none px-6 py-2 rounded-md font-bold text-sm bg-gradient-to-r from-primary to-primary-container text-white shadow-lg hover:brightness-110 transition-all active:scale-95 focus:ring-2 focus:ring-primary"
              data-testid="new-session-button"
            >
              Mulai Sesi Baru
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
