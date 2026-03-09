import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { getProgress } from '../../services/apiClient'
import type { ProgressData } from '../../types'
import ModuleCard from './ModuleCard'
import ProgressOverview from './ProgressOverview'

const modules = [
  {
    icon: '🎤',
    name: 'Speaking',
    description: 'Simulasi interview kerja dengan AI. Latih kemampuan berbicara bahasa Inggris Anda.',
    route: '/speaking',
    getProgress: (p: ProgressData | null) => p?.speaking.averageScore ?? 0,
  },
  {
    icon: '📝',
    name: 'Grammar',
    description: 'Quiz grammar multiple choice dengan penjelasan AI untuk meningkatkan tata bahasa.',
    route: '/grammar',
    getProgress: (p: ProgressData | null) => {
      if (!p?.grammar.topicScores) return 0
      const scores = Object.values(p.grammar.topicScores)
      if (scores.length === 0) return 0
      return Math.round(scores.reduce((sum, s) => sum + s.accuracy, 0) / scores.length)
    },
  },
  {
    icon: '✍️',
    name: 'Writing',
    description: 'Latihan menulis essay dan email dengan review AI untuk perbaikan tulisan.',
    route: '/writing',
    getProgress: (p: ProgressData | null) => p?.writing.averageScore ?? 0,
  },
]

export default function Dashboard() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [progress, setProgress] = useState<ProgressData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getProgress()
      .then(setProgress)
      .catch(() => setProgress(null))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate('/progress')}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            Lihat Progress
          </button>
          <span className="text-sm text-gray-500">{user?.email}</span>
          <button
            type="button"
            onClick={logout}
            className="text-sm text-red-600 hover:text-red-800"
          >
            Keluar
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        <section>
          <h2 className="text-lg font-semibold text-gray-700 mb-4">Modul Pembelajaran</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {modules.map((mod) => (
              <ModuleCard
                key={mod.name}
                icon={mod.icon}
                name={mod.name}
                description={mod.description}
                progress={mod.getProgress(progress)}
                route={mod.route}
              />
            ))}
          </div>
        </section>

        <section>
          <ProgressOverview progress={progress} loading={loading} />
        </section>
      </main>
    </div>
  )
}
