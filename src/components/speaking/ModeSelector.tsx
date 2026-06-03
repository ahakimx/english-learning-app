import { useState } from 'react'
import type { JSX } from 'react'
import type { SessionMode } from '../../types'

interface ModeOption {
  value: SessionMode
  title: string
  description: string
  icon: string
  iconBg: string
  iconColor: string
  hoverBg: string
  hoverBorder: string
  ctaColor: string
  ctaLabel: string
}

const MODE_OPTIONS: ModeOption[] = [
  {
    value: 'quick',
    title: 'Mode Cepat',
    description: 'Pilih posisi dan mulai interview dengan pertanyaan generik',
    icon: 'bolt',
    iconBg: 'bg-primary-fixed',
    iconColor: 'text-primary',
    hoverBg: 'bg-primary/5',
    hoverBorder: 'group-hover:border-primary-container/20',
    ctaColor: 'text-primary',
    ctaLabel: 'Mulai Cepat',
  },
  {
    value: 'targeted',
    title: 'Mode Targeted',
    description: 'Tempel deskripsi pekerjaan untuk interview yang disesuaikan',
    icon: 'my_location',
    iconBg: 'bg-tertiary-fixed',
    iconColor: 'text-tertiary',
    hoverBg: 'bg-tertiary/5',
    hoverBorder: 'group-hover:border-tertiary-container/20',
    ctaColor: 'text-tertiary',
    ctaLabel: 'Mulai Targeted',
  },
]

interface ModeSelectorProps {
  onSelect: (mode: SessionMode) => void
  disabled?: boolean
}

export default function ModeSelector({ onSelect, disabled }: ModeSelectorProps): JSX.Element {
  // Requirement 1.5: Quick Mode pre-selected as the default so no mode-less state is reachable.
  const [selectedMode, setSelectedMode] = useState<SessionMode>('quick')

  function handleContinue() {
    // Requirement 1.6 (literal): advance only when a mode is selected.
    if (!selectedMode) return
    onSelect(selectedMode)
  }

  // Requirement 1.6: button disabled while no mode is selected.
  // Since we default to 'quick', this effectively disables only when the parent passes `disabled`.
  const continueDisabled = disabled || !selectedMode

  return (
    <div>
      {/* Header */}
      <header className="mb-12 max-w-4xl">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary-container text-on-secondary-container text-xs font-bold font-headline mb-4">
          <span className="material-symbols-outlined text-sm">tune</span>
          STEP 1: PILIH MODE LATIHAN
        </div>
        <h2 className="text-3xl md:text-4xl font-extrabold font-headline text-primary tracking-tight mb-3">
          Pilih Mode Latihan Interview
        </h2>
        <p className="text-on-surface-variant text-base md:text-lg max-w-2xl font-body leading-relaxed">
          Tentukan bagaimana sesi latihan Anda akan berjalan. Mode Cepat menggunakan pertanyaan generik berdasarkan posisi,
          sementara Mode Targeted menyesuaikan interview dengan deskripsi pekerjaan yang Anda berikan.
        </p>
      </header>

      {/* Mode Cards */}
      <section className="grid md:grid-cols-2 gap-8 mb-12 max-w-5xl">
        {MODE_OPTIONS.map((option) => {
          const isSelected = selectedMode === option.value
          return (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              onClick={() => setSelectedMode(option.value)}
              aria-pressed={isSelected}
              aria-label={`Pilih ${option.title}`}
              className="group relative flex flex-col text-left focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div
                className={`absolute inset-0 ${option.hoverBg} rounded-xl scale-95 opacity-0 group-hover:scale-100 group-hover:opacity-100 transition-all duration-300 ${
                  isSelected ? 'scale-100 opacity-100' : ''
                }`}
              ></div>
              <div
                className={`relative bg-surface-container-lowest p-8 rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.03)] transition-all h-full flex flex-col ${
                  isSelected
                    ? 'border-2 border-primary'
                    : `border border-transparent ${option.hoverBorder}`
                }`}
              >
                {isSelected && (
                  <div className="absolute top-4 right-4 w-7 h-7 rounded-full bg-primary text-on-primary flex items-center justify-center">
                    <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>
                      check
                    </span>
                  </div>
                )}
                <div
                  className={`w-16 h-16 rounded-full ${option.iconBg} flex items-center justify-center ${option.iconColor} mb-8 group-hover:scale-110 transition-transform duration-300`}
                >
                  <span className="material-symbols-outlined text-3xl">{option.icon}</span>
                </div>
                <h3 className="text-2xl font-headline font-bold text-on-surface mb-3">{option.title}</h3>
                <p className="text-on-surface-variant leading-relaxed flex-1">{option.description}</p>
                <div className={`mt-8 flex items-center ${option.ctaColor} font-bold text-sm`}>
                  <span>{option.ctaLabel}</span>
                  <span className="material-symbols-outlined ml-2 group-hover:translate-x-2 transition-transform">chevron_right</span>
                </div>
              </div>
            </button>
          )
        })}
      </section>

      {/* Continue Button */}
      <div className="flex items-center justify-end max-w-5xl">
        <button
          type="button"
          disabled={continueDisabled}
          onClick={handleContinue}
          aria-label="Lanjutkan dengan mode yang dipilih"
          className="inline-flex items-center gap-2 px-8 py-3 rounded-full bg-primary text-on-primary font-headline font-bold text-sm uppercase tracking-wider shadow-[0_4px_20px_rgba(0,0,0,0.08)] hover:shadow-[0_8px_28px_rgba(0,0,0,0.12)] hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-[0_4px_20px_rgba(0,0,0,0.08)]"
        >
          Lanjutkan
          <span className="material-symbols-outlined text-base">arrow_forward</span>
        </button>
      </div>
    </div>
  )
}

export { MODE_OPTIONS }
