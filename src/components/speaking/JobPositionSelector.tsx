import type { JSX } from 'react'

const JOB_POSITIONS = [
  { id: 'software-engineer', title: 'Software Engineer', icon: '💻' },
  { id: 'product-manager', title: 'Product Manager', icon: '📊' },
  { id: 'data-analyst', title: 'Data Analyst', icon: '📈' },
  { id: 'marketing-manager', title: 'Marketing Manager', icon: '📣' },
  { id: 'ui-ux-designer', title: 'UI/UX Designer', icon: '🎨' },
]

interface JobPositionSelectorProps {
  onSelect: (position: string) => void
  disabled?: boolean
}

export default function JobPositionSelector({ onSelect, disabled }: JobPositionSelectorProps): JSX.Element {
  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-800 mb-2">Pilih Posisi Pekerjaan</h2>
      <p className="text-sm text-gray-500 mb-6">
        Pilih posisi yang ingin Anda latih untuk simulasi interview.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {JOB_POSITIONS.map((pos) => (
          <button
            key={pos.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(pos.title)}
            className="flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-lg shadow-sm hover:border-blue-400 hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label={`Pilih posisi ${pos.title}`}
          >
            <span className="text-2xl" role="img" aria-hidden="true">{pos.icon}</span>
            <span className="text-base font-medium text-gray-700">{pos.title}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export { JOB_POSITIONS }
