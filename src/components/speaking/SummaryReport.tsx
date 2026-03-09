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
  if (score >= 80) return 'bg-green-500'
  if (score >= 60) return 'bg-yellow-500'
  if (score >= 40) return 'bg-orange-500'
  return 'bg-red-500'
}

function scoreTextColor(score: number): string {
  if (score >= 80) return 'text-green-600'
  if (score >= 60) return 'text-yellow-600'
  if (score >= 40) return 'text-orange-600'
  return 'text-red-600'
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

  return (
    <div className="space-y-8" data-testid="summary-report">
      {/* Overall Score */}
      <div className="text-center">
        <h2 className="text-lg font-semibold text-gray-700 mb-3">Ringkasan Sesi Interview</h2>
        <div
          className={`inline-flex items-center justify-center w-28 h-28 rounded-full border-4 border-blue-500`}
          data-testid="overall-score"
        >
          <span className={`text-4xl font-bold ${scoreTextColor(overallScore)}`}>{overallScore}</span>
        </div>
        <p className="text-sm text-gray-500 mt-2">Skor Keseluruhan</p>
      </div>

      {/* Criteria Scores */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Skor per Kriteria</h3>
        <div className="space-y-2">
          {Object.entries(criteriaLabels).map(([key, label]) => {
            const score = criteriaScores[key as keyof typeof criteriaScores]
            return (
              <div key={key} className="flex items-center gap-3">
                <span className="text-sm text-gray-600 w-28 shrink-0">{label}</span>
                <div
                  className="flex-1 bg-gray-200 rounded-full h-3"
                  role="progressbar"
                  aria-valuenow={score}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${label} score`}
                >
                  <div className={`h-3 rounded-full ${scoreColor(score)}`} style={{ width: `${score}%` }} />
                </div>
                <span className="text-sm font-medium text-gray-700 w-10 text-right">{score}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Performance Trend */}
      {performanceTrend.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Tren Performa</h3>
          <div className="flex items-end gap-2 h-32" data-testid="performance-trend">
            {performanceTrend.map((item) => {
              const heightPercent = (item.score / maxTrendScore) * 100
              return (
                <div key={item.questionNumber} className="flex flex-col items-center flex-1">
                  <span className="text-xs text-gray-600 mb-1">{item.score}</span>
                  <div
                    className={`w-full rounded-t ${scoreColor(item.score)}`}
                    style={{ height: `${heightPercent}%` }}
                    data-testid={`trend-bar-${item.questionNumber}`}
                    role="img"
                    aria-label={`Pertanyaan ${item.questionNumber}: skor ${item.score}`}
                  />
                  <span className="text-xs text-gray-500 mt-1">Q{item.questionNumber}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Top Improvement Areas */}
      {topImprovementAreas.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Area yang Perlu Ditingkatkan</h3>
          <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700" data-testid="improvement-areas">
            {topImprovementAreas.map((area, i) => (
              <li key={i}>{area}</li>
            ))}
          </ol>
        </div>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Rekomendasi</h3>
          <ul className="list-disc list-inside space-y-1 text-sm text-gray-700" data-testid="recommendations">
            {recommendations.map((rec, i) => (
              <li key={i}>{rec}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-3 pt-4">
        <button
          type="button"
          onClick={onNewSession}
          className="flex-1 px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
          data-testid="new-session-button"
        >
          Mulai Sesi Baru
        </button>
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300 transition-colors"
          data-testid="back-to-dashboard-button"
        >
          Kembali ke Dashboard
        </button>
      </div>
    </div>
  )
}
