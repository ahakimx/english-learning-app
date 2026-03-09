import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getProgress } from '../../services/apiClient'
import type { ProgressData } from '../../types'
import ProgressChart from './ProgressChart'

export default function ProgressPage() {
  const navigate = useNavigate()
  const [progress, setProgress] = useState<ProgressData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function fetchProgress() {
      try {
        setLoading(true)
        setError(null)
        const data = await getProgress()
        if (!cancelled) setProgress(data)
      } catch {
        if (!cancelled) setError('Gagal memuat data progress. Silakan coba lagi.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchProgress()
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500 text-lg">Memuat data progress...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4">
        <p className="text-red-600">{error}</p>
        <button
          onClick={() => navigate('/dashboard')}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Kembali ke Dashboard
        </button>
      </div>
    )
  }

  const speaking = progress?.speaking ?? { totalSessions: 0, averageScore: 0, scoreHistory: [] }
  const grammar = progress?.grammar ?? { totalQuizzes: 0, topicScores: {} }
  const writing = progress?.writing ?? { totalReviews: 0, averageScore: 0, scoreHistory: [] }

  const topicEntries = Object.entries(grammar.topicScores)

  return (
    <div className="min-h-screen bg-gray-50 p-6 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Progress Belajar</h1>
          <button
            onClick={() => navigate('/dashboard')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Kembali ke Dashboard
          </button>
        </div>

        {/* Summary Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard label="Total Sesi Interview" value={speaking.totalSessions} />
          <StatCard label="Rata-rata Skor Speaking" value={speaking.averageScore} suffix="/ 100" />
          <StatCard label="Jumlah Quiz Grammar" value={grammar.totalQuizzes} />
          <StatCard label="Tulisan Di-review" value={writing.totalReviews} />
        </div>

        {/* Writing average score */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard label="Rata-rata Skor Writing" value={writing.averageScore} suffix="/ 100" />
        </div>

        {/* Grammar Topic Scores */}
        {topicEntries.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-lg font-semibold mb-4">Skor per Topik Grammar</h2>
            <div className="space-y-3">
              {topicEntries.map(([topic, { accuracy }]) => (
                <div key={topic} className="flex items-center gap-4">
                  <span className="w-32 text-sm font-medium text-gray-700">{topic}</span>
                  <div className="flex-1 bg-gray-200 rounded-full h-4">
                    <div
                      className="bg-green-500 h-4 rounded-full transition-all duration-300"
                      style={{ width: `${accuracy}%` }}
                      role="progressbar"
                      aria-valuenow={accuracy}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${topic} accuracy`}
                    />
                  </div>
                  <span className="text-sm font-medium text-gray-600 w-12 text-right">
                    {accuracy}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Score History Charts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ProgressChart
            title="Riwayat Skor Speaking"
            data={speaking.scoreHistory}
            color="#3B82F6"
          />
          <ProgressChart
            title="Riwayat Skor Writing"
            data={writing.scoreHistory}
            color="#8B5CF6"
          />
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">
        {value}
        {suffix && <span className="text-sm font-normal text-gray-500 ml-1">{suffix}</span>}
      </p>
    </div>
  )
}
