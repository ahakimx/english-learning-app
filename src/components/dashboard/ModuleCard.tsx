import { useNavigate } from 'react-router-dom'

export interface ModuleCardProps {
  icon: string
  name: string
  description: string
  progress: number // 0-100
  route: string
}

export default function ModuleCard({ icon, name, description, progress, route }: ModuleCardProps) {
  const navigate = useNavigate()

  return (
    <button
      type="button"
      onClick={() => navigate(route)}
      className="w-full text-left rounded-xl border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
      aria-label={`Buka modul ${name}`}
    >
      <div className="text-4xl mb-3">{icon}</div>
      <h2 className="text-xl font-semibold text-gray-900 mb-1">{name}</h2>
      <p className="text-sm text-gray-500 mb-4">{description}</p>
      <div className="w-full bg-gray-200 rounded-full h-2" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label={`Progress ${name}`}>
        <div
          className="bg-blue-600 h-2 rounded-full transition-all"
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </div>
      <p className="text-xs text-gray-400 mt-1">{progress}% selesai</p>
    </button>
  )
}
