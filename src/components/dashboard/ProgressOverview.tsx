import type { ProgressData } from '../../types'

export interface ProgressOverviewProps {
  progress: ProgressData | null
  loading: boolean
}

export default function ProgressOverview({ progress, loading }: ProgressOverviewProps) {
  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm animate-pulse">
        <div className="h-5 bg-gray-200 rounded w-48 mb-4" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-gray-100 rounded" />
          ))}
        </div>
      </div>
    )
  }

  const stats = [
    {
      label: 'Sesi Interview',
      value: progress?.speaking.totalSessions ?? 0,
      score: progress?.speaking.averageScore ?? 0,
    },
    {
      label: 'Quiz Grammar',
      value: progress?.grammar.totalQuizzes ?? 0,
      score: null,
    },
    {
      label: 'Latihan Writing',
      value: progress?.writing.totalReviews ?? 0,
      score: progress?.writing.averageScore ?? 0,
    },
  ]

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Ringkasan Progress</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-gray-50 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">{stat.value}</p>
            <p className="text-sm text-gray-500">{stat.label}</p>
            {stat.score !== null && (
              <p className="text-xs text-gray-400 mt-1">Rata-rata: {stat.score}%</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
