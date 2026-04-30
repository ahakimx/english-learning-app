import { useState } from 'react'
import type { JSX } from 'react'
import type { SeniorityLevel, QuestionCategory } from '../../types'

const JOB_POSITIONS = [
  { id: 'software-engineer', title: 'Software Engineer', icon: 'code', description: 'Frontend, Backend, and Fullstack systems architecture.' },
  { id: 'product-manager', title: 'Product Manager', icon: 'analytics', description: 'Roadmapping, user stories, and cross-functional leadership.' },
  { id: 'data-analyst', title: 'Data Analyst', icon: 'monitoring', description: 'Statistical modeling, SQL, and data visualization strategies.' },
  { id: 'marketing-manager', title: 'Marketing Manager', icon: 'campaign', description: 'Brand strategy, digital growth, and campaign execution.' },
  { id: 'ui-ux-designer', title: 'UI/UX Designer', icon: 'palette', description: 'Human-centered design, prototyping, and accessibility.' },
  { id: 'devops-engineer', title: 'DevOps Engineer', icon: 'build', description: 'CI/CD pipelines, containerization, and infrastructure as code.' },
  { id: 'cloud-engineer', title: 'Cloud Engineer', icon: 'cloud', description: 'Cloud migration, serverless architecture, and security.' },
]

const SENIORITY_LABELS: Record<SeniorityLevel, string> = {
  junior: 'Junior',
  mid: 'Menengah',
  senior: 'Senior',
  lead: 'Lead',
}

const SENIORITY_META: Record<SeniorityLevel, { icon: string; description: string }> = {
  junior: { icon: 'school', description: 'Fokus pada fundamental teknis, kemauan belajar, dan potensi pertumbuhan awal karier (0-2 tahun pengalaman).' },
  mid: { icon: 'work', description: 'Fokus pada otonomi kerja, pemecahan masalah mandiri, dan kontribusi proyek menengah (2-5 tahun pengalaman).' },
  senior: { icon: 'workspace_premium', description: 'Fokus pada arsitektur sistem, mentoring, kepemimpinan teknis, dan strategi bisnis (5-8 tahun pengalaman).' },
  lead: { icon: 'groups', description: 'Fokus pada manajemen tim, visi organisasi, kolaborasi lintas departemen, dan dampak makro (8+ tahun pengalaman).' },
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

const CATEGORY_META: Record<QuestionCategory, { icon: string; iconBg: string; iconColor: string; hoverBg: string; hoverBorder: string; ctaColor: string; ctaLabel: string; fullDescription: string }> = {
  general: {
    icon: 'psychology',
    iconBg: 'bg-primary-fixed',
    iconColor: 'text-primary',
    hoverBg: 'bg-primary/5',
    hoverBorder: 'group-hover:border-primary-container/20',
    ctaColor: 'text-primary',
    ctaLabel: 'Get Started',
    fullDescription: 'Focus on soft skills, leadership scenarios, and behavioral questions. Ideal for general interview readiness and cultural fit assessment.',
  },
  technical: {
    icon: 'terminal',
    iconBg: 'bg-tertiary-fixed',
    iconColor: 'text-tertiary',
    hoverBg: 'bg-tertiary/5',
    hoverBorder: 'group-hover:border-tertiary-container/20',
    ctaColor: 'text-tertiary',
    ctaLabel: 'Deep Dive',
    fullDescription: 'Dive deep into role-specific knowledge, problem-solving techniques, and technical proficiency. Perfect for specialized career paths.',
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

  /* ── Step: seniority ── */
  if (step === 'seniority') {
    return (
      <div>
        {/* Back button */}
        <div className="mb-10 flex items-center gap-2">
          <button
            type="button"
            onClick={handleBackToPosition}
            className="flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors text-sm font-medium group"
            aria-label="Kembali ke pilihan posisi"
          >
            <span className="material-symbols-outlined text-sm group-hover:-translate-x-1 transition-transform">arrow_back</span>
            Kembali ke Pilihan Posisi
          </button>
        </div>

        {/* Header */}
        <div className="mb-12">
          <h2 className="text-4xl font-extrabold font-headline text-primary tracking-tight mb-3">Tentukan Level Pengalaman</h2>
          <p className="text-on-surface-variant text-lg max-w-2xl leading-relaxed">
            Kami akan menyesuaikan pertanyaan wawancara dan kompleksitas umpan balik berdasarkan tingkat senioritas yang Anda pilih.
          </p>
        </div>

        {/* Seniority Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {(Object.entries(SENIORITY_LABELS) as [SeniorityLevel, string][]).map(([value, label]) => {
            const meta = SENIORITY_META[value]
            return (
              <button
                key={value}
                type="button"
                disabled={disabled}
                onClick={() => handleSenioritySelect(value)}
                className="group relative flex flex-col text-left p-8 bg-surface-container-lowest rounded-xl border border-transparent hover:border-primary/20 hover:bg-surface-container transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label={`Pilih tingkat ${label}`}
              >
                <div className="w-12 h-12 bg-secondary-container rounded-lg flex items-center justify-center mb-6 text-primary group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined">{meta.icon}</span>
                </div>
                <h3 className="text-xl font-bold font-headline text-primary mb-2">{label}</h3>
                <p className="text-on-surface-variant text-sm mb-6 leading-relaxed">{meta.description}</p>
                <div className="mt-auto flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
                  Select Level <span className="material-symbols-outlined text-sm">chevron_right</span>
                </div>
              </button>
            )
          })}
        </div>

        {/* Footer Info */}
        <div className="mt-16 p-8 bg-surface-container-low rounded-xl border border-outline-variant/10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-tertiary/10 flex items-center justify-center text-tertiary">
              <span className="material-symbols-outlined">info</span>
            </div>
            <div>
              <p className="text-sm font-bold text-primary">Butuh bantuan memilih?</p>
              <p className="text-xs text-on-surface-variant">Tinjau panduan definisi level kami untuk detail lebih lanjut.</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  /* ── Step: category ── */
  if (step === 'category') {
    return (
      <div>
        {/* Back button */}
        <div className="mb-10 flex items-center gap-2">
          <button
            type="button"
            onClick={handleBackToSeniority}
            className="flex items-center text-on-surface-variant hover:text-primary transition-colors text-sm font-medium group"
            aria-label="Kembali ke pilihan tingkat pengalaman"
          >
            <span className="material-symbols-outlined text-sm mr-1 group-hover:-translate-x-1 transition-transform">arrow_back</span>
            Kembali ke Pilihan Level
          </button>
        </div>

        {/* Header */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-2">
            <span className="px-2 py-0.5 rounded bg-secondary-container text-on-secondary-container text-[10px] font-bold uppercase tracking-tighter">Step 3 of 5</span>
            <div className="flex-1 h-1 bg-surface-container rounded-full overflow-hidden max-w-[120px]">
              <div className="w-3/5 h-full bg-primary"></div>
            </div>
          </div>
          <h2 className="text-3xl md:text-4xl font-headline font-extrabold text-on-surface tracking-tight mb-4">Pilih Kategori Pertanyaan</h2>
          <p className="text-on-surface-variant max-w-2xl text-lg leading-relaxed">
            Pilih fokus latihan speaking Anda. Pertanyaan umum menilai soft skills, sementara pertanyaan teknis fokus pada keahlian spesifik posisi.
          </p>
        </div>

        {/* Category Cards */}
        <div className="grid md:grid-cols-2 gap-8 mb-16">
          {(Object.entries(CATEGORY_LABELS) as [QuestionCategory, { label: string; description: string }][]).map(([value, { label }]) => {
            const meta = CATEGORY_META[value]
            return (
              <button
                key={value}
                type="button"
                disabled={disabled}
                onClick={() => handleCategorySelect(value)}
                className="group relative flex flex-col text-left focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label={`Pilih kategori ${label}`}
              >
                <div className={`absolute inset-0 ${meta.hoverBg} rounded-xl scale-95 opacity-0 group-hover:scale-100 group-hover:opacity-100 transition-all duration-300`}></div>
                <div className={`relative bg-surface-container-lowest p-8 rounded-xl border border-transparent shadow-[0_4px_20px_rgba(0,0,0,0.03)] ${meta.hoverBorder} transition-all h-full flex flex-col`}>
                  <div className={`w-16 h-16 rounded-full ${meta.iconBg} flex items-center justify-center ${meta.iconColor} mb-8 group-hover:scale-110 transition-transform duration-300`}>
                    <span className="material-symbols-outlined text-3xl">{meta.icon}</span>
                  </div>
                  <h3 className="text-2xl font-headline font-bold text-on-surface mb-3">{label}</h3>
                  <p className="text-on-surface-variant leading-relaxed flex-1">{meta.fullDescription}</p>
                  <div className={`mt-8 flex items-center ${meta.ctaColor} font-bold text-sm`}>
                    <span>{meta.ctaLabel}</span>
                    <span className="material-symbols-outlined ml-2 group-hover:translate-x-2 transition-transform">chevron_right</span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {/* Expert Tip */}
        <div className="bg-surface-container-low p-8 rounded-none border-l-4 border-primary">
          <div className="flex items-start gap-6">
            <div className="text-primary pt-1">
              <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>info</span>
            </div>
            <div>
              <h4 className="font-headline font-bold text-on-surface mb-2">Expert Tip</h4>
              <p className="text-on-surface-variant text-sm leading-relaxed max-w-3xl">
                Kami merekomendasikan memulai dengan kategori <span className="font-bold text-on-surface">Umum</span> jika ini sesi pertama Anda hari ini. Ini membantu menghangatkan kejelasan komunikasi sebelum menghadapi tantangan <span className="font-bold text-on-surface">Teknis</span> yang kompleks.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  /* ── Step: position (default) ── */
  return (
    <div>
      {/* Header */}
      <header className="mb-12 max-w-4xl">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary-container text-on-secondary-container text-xs font-bold font-headline mb-4">
          <span className="material-symbols-outlined text-sm">rocket_launch</span>
          STEP 1: POSITION SELECT
        </div>
        <h2 className="text-3xl md:text-4xl font-extrabold font-headline text-primary tracking-tight mb-3">Pilih Posisi Pekerjaan</h2>
        <p className="text-on-surface-variant text-base md:text-lg max-w-2xl font-body leading-relaxed">
          Pilih posisi yang ingin Anda latih untuk simulasi interview. Kami akan menyesuaikan pertanyaan berdasarkan standar industri terbaru.
        </p>
      </header>

      {/* Position Cards Grid */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 max-w-7xl">
        {JOB_POSITIONS.map((pos) => (
          <button
            key={pos.id}
            type="button"
            disabled={disabled}
            onClick={() => handlePositionSelect(pos.title)}
            className="group flex flex-col items-start p-6 bg-surface-container-lowest rounded-xl shadow-[0_4px_24px_-4px_rgba(25,28,29,0.04)] hover:shadow-[0_8px_32px_-4px_rgba(25,28,29,0.08)] transition-all duration-300 border border-transparent hover:border-primary-container/20 text-left disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label={`Pilih posisi ${pos.title}`}
          >
            <div className="w-12 h-12 flex items-center justify-center rounded-lg bg-primary-fixed mb-6 group-hover:scale-110 transition-transform duration-300">
              <span className="material-symbols-outlined text-primary text-2xl">{pos.icon}</span>
            </div>
            <h3 className="font-headline font-bold text-lg text-primary mb-2">{pos.title}</h3>
            <p className="text-xs text-on-surface-variant font-medium leading-tight mb-4">{pos.description}</p>
            <div className="mt-auto flex items-center text-xs font-bold text-primary group-hover:gap-2 transition-all">
              PILIH POSISI <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </div>
          </button>
        ))}
      </section>

      {/* Info Section */}
      <section className="mt-16 bg-surface-container-low p-8 rounded-none md:rounded-xl">
        <div className="space-y-6">
          <h4 className="text-2xl font-bold font-headline text-primary tracking-tight">Kenapa memilih posisi secara spesifik?</h4>
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-tertiary text-tertiary-fixed flex items-center justify-center">
                <span className="material-symbols-outlined text-sm">check</span>
              </div>
              <div>
                <p className="font-headline font-bold text-on-surface text-sm">Pertanyaan Akurat</p>
                <p className="text-xs text-on-surface-variant">Database kami memiliki 5,000+ pertanyaan yang dikurasi oleh HR Expert dari perusahaan top-tier.</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-tertiary text-tertiary-fixed flex items-center justify-center">
                <span className="material-symbols-outlined text-sm">check</span>
              </div>
              <div>
                <p className="font-headline font-bold text-on-surface text-sm">Penilaian AI Real-time</p>
                <p className="text-xs text-on-surface-variant">AI kami menganalisis kosakata teknis sesuai dengan jabatan yang Anda pilih.</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export { JOB_POSITIONS, SENIORITY_LABELS, CATEGORY_LABELS }
