import { useState } from 'react'
import type { JSX } from 'react'
import type { SeniorityLevel, QuestionCategory } from '../../types'

const JOB_POSITIONS = [
  { id: 'software-engineer', title: 'Software Engineer', icon: '💻' },
  { id: 'product-manager', title: 'Product Manager', icon: '📊' },
  { id: 'data-analyst', title: 'Data Analyst', icon: '📈' },
  { id: 'marketing-manager', title: 'Marketing Manager', icon: '📣' },
  { id: 'ui-ux-designer', title: 'UI/UX Designer', icon: '🎨' },
  { id: 'devops-engineer', title: 'DevOps Engineer', icon: '🔧' },
  { id: 'cloud-engineer', title: 'Cloud Engineer', icon: '☁️' },
]

const SENIORITY_LABELS: Record<SeniorityLevel, string> = {
  junior: 'Junior',
  mid: 'Menengah',
  senior: 'Senior',
  lead: 'Lead',
}

const CATEGORY_LABELS: Record<QuestionCategory, { label: string; description: string }> = {
  general: {
    label: 'Umum',
    description: 'Pertanyaan perilaku, soft skills, dan motivasi',
  },
  technical: {
    label: 'Teknis',
    description: 'Pertanyaan teknis sesuai posisi dan tingkat pengalaman',
  },
}

type Step = 'position' | 'seniority' | 'category'

interface JobPositionSelectorProps {
  onSelect: (position: string, seniorityLevel: SeniorityLevel, questionCategory: QuestionCategory) => void
  disabled?: boolean
}

export default function JobPositionSelector({ onSelect, disabled }: JobPositionSelectorProps): JSX.Element {
  const [step, setStep] = useState<Step>('position')
  const [selectedPosition, setSelectedPosition] = useState<string | null>(null)
  const [selectedSeniority, setSelectedSeniority] = useState<SeniorityLevel | null>(null)

  function handlePositionSelect(position: string) {
    setSelectedPosition(position)
    setStep('seniority')
  }

  function handleSenioritySelect(seniority: SeniorityLevel) {
    setSelectedSeniority(seniority)
    setStep('category')
  }

  function handleCategorySelect(category: QuestionCategory) {
    if (selectedPosition && selectedSeniority) {
      onSelect(selectedPosition, selectedSeniority, category)
    }
  }

  function handleBackToPosition() {
    setSelectedPosition(null)
    setSelectedSeniority(null)
    setStep('position')
  }

  function handleBackToSeniority() {
    setSelectedSeniority(null)
    setStep('seniority')
  }

  if (step === 'seniority') {
    return (
      <div>
        <button
          type="button"
          onClick={handleBackToPosition}
          className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 mb-4"
          aria-label="Kembali ke pilihan posisi"
        >
          ← Kembali
        </button>
        <h2 className="text-xl font-semibold text-gray-800 mb-2">Pilih Tingkat Pengalaman</h2>
        <p className="text-sm text-gray-500 mb-6">
          Pilih tingkat pengalaman untuk posisi {selectedPosition}.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {(Object.entries(SENIORITY_LABELS) as [SeniorityLevel, string][]).map(([value, label]) => (
            <button
              key={value}
              type="button"
              disabled={disabled}
              onClick={() => handleSenioritySelect(value)}
              className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm hover:border-blue-400 hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed text-center"
              aria-label={`Pilih tingkat ${label}`}
            >
              <span className="text-base font-medium text-gray-700">{label}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (step === 'category') {
    return (
      <div>
        <button
          type="button"
          onClick={handleBackToSeniority}
          className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 mb-4"
          aria-label="Kembali ke pilihan tingkat pengalaman"
        >
          ← Kembali
        </button>
        <h2 className="text-xl font-semibold text-gray-800 mb-2">Pilih Kategori Pertanyaan</h2>
        <p className="text-sm text-gray-500 mb-6">
          Pilih jenis pertanyaan interview untuk posisi {selectedPosition} ({SENIORITY_LABELS[selectedSeniority!]}).
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(Object.entries(CATEGORY_LABELS) as [QuestionCategory, { label: string; description: string }][]).map(([value, { label, description }]) => (
            <button
              key={value}
              type="button"
              disabled={disabled}
              onClick={() => handleCategorySelect(value)}
              className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm hover:border-blue-400 hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed text-left"
              aria-label={`Pilih kategori ${label}`}
            >
              <span className="text-lg font-semibold text-gray-800 block mb-1">{label}</span>
              <span className="text-sm text-gray-500">{description}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

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
            onClick={() => handlePositionSelect(pos.title)}
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

export { JOB_POSITIONS, SENIORITY_LABELS, CATEGORY_LABELS }
