import { useState } from 'react'
import type { JSX } from 'react'
import type { JobDescriptionContext, SeniorityLevel, QuestionCategory } from '../../types'

interface JDAnalysisReviewProps {
  initialContext: JobDescriptionContext
  onStart: (context: JobDescriptionContext) => void
  onBack: () => void
  disabled?: boolean
}

type ListField = 'technologies' | 'responsibilities' | 'requirements' | 'softSkills'

const LIST_FIELD_META: Record<ListField, { label: string; icon: string; placeholder: string }> = {
  technologies: {
    label: 'Teknologi',
    icon: 'code',
    placeholder: 'Contoh: React, Node.js, AWS',
  },
  responsibilities: {
    label: 'Tanggung Jawab',
    icon: 'assignment',
    placeholder: 'Contoh: Mendesain API yang scalable',
  },
  requirements: {
    label: 'Persyaratan',
    icon: 'checklist',
    placeholder: 'Contoh: Pengalaman 5+ tahun',
  },
  softSkills: {
    label: 'Soft Skills',
    icon: 'psychology',
    placeholder: 'Contoh: Komunikasi, Kepemimpinan',
  },
}

const SENIORITY_OPTIONS: Array<{ value: SeniorityLevel; label: string; description: string }> = [
  { value: 'junior', label: 'Junior', description: '0-2 tahun pengalaman' },
  { value: 'mid', label: 'Menengah', description: '2-5 tahun pengalaman' },
  { value: 'senior', label: 'Senior', description: '5-8 tahun pengalaman' },
  { value: 'lead', label: 'Lead', description: '8+ tahun pengalaman' },
]

const CATEGORY_OPTIONS: Array<{ value: QuestionCategory; label: string; description: string }> = [
  { value: 'general', label: 'Umum', description: 'Perilaku, soft skills, motivasi' },
  { value: 'technical', label: 'Teknis', description: 'Keahlian teknis sesuai posisi' },
]

export default function JDAnalysisReview({
  initialContext,
  onStart,
  onBack,
  disabled,
}: JDAnalysisReviewProps): JSX.Element {
  // Requirement 5.7: edited context is the source of truth — initialize state from the
  // initial context, then emit the current state (not the initial) when starting.
  const [context, setContext] = useState<JobDescriptionContext>(initialContext)

  function updateField<K extends keyof JobDescriptionContext>(
    key: K,
    value: JobDescriptionContext[K],
  ): void {
    setContext((prev) => ({ ...prev, [key]: value }))
  }

  function updateListItem(field: ListField, index: number, value: string): void {
    setContext((prev) => {
      const next = [...prev[field]]
      next[index] = value
      return { ...prev, [field]: next }
    })
  }

  function addListItem(field: ListField): void {
    setContext((prev) => ({ ...prev, [field]: [...prev[field], ''] }))
  }

  function removeListItem(field: ListField, index: number): void {
    setContext((prev) => {
      const next = prev[field].filter((_, i) => i !== index)
      return { ...prev, [field]: next }
    })
  }

  function handleStart(): void {
    // Requirement 5.6: Start disabled while role is empty after trim.
    if (context.role.trim() === '') return
    // Requirement 5.7: pass the edited context (current state), not the initial.
    onStart(context)
  }

  // Requirement 5.6: Start button disabled while role.trim() === ''.
  const startDisabled = disabled || context.role.trim() === ''

  return (
    <div>
      {/* Back button — Requirement 5.8 */}
      <div className="mb-10 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          disabled={disabled}
          className="flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors text-sm font-medium group disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Kembali ke input deskripsi pekerjaan"
        >
          <span className="material-symbols-outlined text-sm group-hover:-translate-x-1 transition-transform">
            arrow_back
          </span>
          Kembali ke Input JD
        </button>
      </div>

      {/* Header */}
      <header className="mb-12 max-w-4xl">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary-container text-on-secondary-container text-xs font-bold font-headline mb-4">
          <span className="material-symbols-outlined text-sm">fact_check</span>
          STEP 3: TINJAU HASIL ANALISIS
        </div>
        <h2 className="text-3xl md:text-4xl font-extrabold font-headline text-primary tracking-tight mb-3">
          Tinjau Konteks Pekerjaan
        </h2>
        <p className="text-on-surface-variant text-base md:text-lg max-w-2xl font-body leading-relaxed">
          AI sudah mengekstrak detail dari deskripsi pekerjaan Anda. Periksa dan sesuaikan setiap
          bagian sebelum memulai interview — semua perubahan yang Anda lakukan akan dipakai.
        </p>
      </header>

      <div className="max-w-5xl space-y-8">
        {/* Company + Role */}
        <section className="bg-surface-container-lowest p-8 rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-primary-fixed flex items-center justify-center text-primary">
              <span className="material-symbols-outlined">business</span>
            </div>
            <h3 className="text-xl font-headline font-bold text-on-surface">Informasi Dasar</h3>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label
                htmlFor="jd-company"
                className="block text-sm font-bold font-headline text-on-surface mb-2"
              >
                Perusahaan
              </label>
              <input
                id="jd-company"
                type="text"
                value={context.company}
                onChange={(e) => updateField('company', e.target.value)}
                disabled={disabled}
                placeholder="Nama perusahaan"
                className="w-full px-4 py-3 bg-surface-container-low rounded-lg border border-outline-variant/20 text-on-surface focus:outline-none focus:border-primary transition-colors disabled:opacity-50"
              />
            </div>

            <div>
              <label
                htmlFor="jd-role"
                className="block text-sm font-bold font-headline text-on-surface mb-2"
              >
                Posisi <span className="text-error">*</span>
              </label>
              <input
                id="jd-role"
                type="text"
                value={context.role}
                onChange={(e) => updateField('role', e.target.value)}
                disabled={disabled}
                placeholder="Contoh: Senior Backend Engineer"
                aria-required="true"
                className="w-full px-4 py-3 bg-surface-container-low rounded-lg border border-outline-variant/20 text-on-surface focus:outline-none focus:border-primary transition-colors disabled:opacity-50"
              />
              {context.role.trim() === '' && (
                <p className="mt-2 text-xs text-error">Posisi wajib diisi untuk memulai interview.</p>
              )}
            </div>
          </div>
        </section>

        {/* List fields: technologies, responsibilities, requirements, softSkills */}
        {(Object.keys(LIST_FIELD_META) as ListField[]).map((field) => {
          const meta = LIST_FIELD_META[field]
          const items = context[field]
          return (
            <section
              key={field}
              className="bg-surface-container-lowest p-8 rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.03)]"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary-fixed flex items-center justify-center text-primary">
                    <span className="material-symbols-outlined">{meta.icon}</span>
                  </div>
                  <h3 className="text-xl font-headline font-bold text-on-surface">{meta.label}</h3>
                  <span className="text-xs text-on-surface-variant font-medium">
                    ({items.length})
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                {items.length === 0 && (
                  <p className="text-sm text-on-surface-variant italic">
                    Belum ada entri. Klik "Tambah" untuk menambahkan.
                  </p>
                )}
                {items.map((item, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <input
                      type="text"
                      value={item}
                      onChange={(e) => updateListItem(field, index, e.target.value)}
                      disabled={disabled}
                      placeholder={meta.placeholder}
                      aria-label={`${meta.label} entri ${index + 1}`}
                      className="flex-1 px-4 py-3 bg-surface-container-low rounded-lg border border-outline-variant/20 text-on-surface focus:outline-none focus:border-primary transition-colors disabled:opacity-50"
                    />
                    <button
                      type="button"
                      onClick={() => removeListItem(field, index)}
                      disabled={disabled}
                      aria-label={`Hapus ${meta.label} entri ${index + 1}`}
                      className="w-11 h-11 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-error-container hover:text-on-error-container transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="material-symbols-outlined text-xl">delete</span>
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => addListItem(field)}
                disabled={disabled}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary-container text-on-secondary-container font-headline font-bold text-xs uppercase tracking-wider hover:shadow-[0_4px_14px_rgba(0,0,0,0.08)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label={`Tambah ${meta.label}`}
              >
                <span className="material-symbols-outlined text-base">add</span>
                Tambah
              </button>
            </section>
          )
        })}

        {/* Seniority — radio of 4 */}
        <section className="bg-surface-container-lowest p-8 rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-primary-fixed flex items-center justify-center text-primary">
              <span className="material-symbols-outlined">workspace_premium</span>
            </div>
            <h3 className="text-xl font-headline font-bold text-on-surface">Tingkat Senioritas</h3>
          </div>

          <fieldset>
            <legend className="sr-only">Pilih tingkat senioritas</legend>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {SENIORITY_OPTIONS.map((option) => {
                const isSelected = context.suggestedSeniority === option.value
                return (
                  <label
                    key={option.value}
                    className={`relative flex flex-col p-4 rounded-lg border cursor-pointer transition-all ${
                      isSelected
                        ? 'border-primary bg-primary/5'
                        : 'border-outline-variant/20 bg-surface-container-low hover:border-primary/30'
                    } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <input
                      type="radio"
                      name="suggestedSeniority"
                      value={option.value}
                      checked={isSelected}
                      onChange={() => updateField('suggestedSeniority', option.value)}
                      disabled={disabled}
                      className="sr-only"
                    />
                    <span className="font-headline font-bold text-on-surface text-sm mb-1">
                      {option.label}
                    </span>
                    <span className="text-xs text-on-surface-variant">{option.description}</span>
                    {isSelected && (
                      <span
                        className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary text-on-primary flex items-center justify-center"
                        aria-hidden="true"
                      >
                        <span
                          className="material-symbols-outlined text-xs"
                          style={{ fontVariationSettings: "'FILL' 1" }}
                        >
                          check
                        </span>
                      </span>
                    )}
                  </label>
                )
              })}
            </div>
          </fieldset>
        </section>

        {/* Category — radio of 2 */}
        <section className="bg-surface-container-lowest p-8 rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-primary-fixed flex items-center justify-center text-primary">
              <span className="material-symbols-outlined">category</span>
            </div>
            <h3 className="text-xl font-headline font-bold text-on-surface">Kategori Pertanyaan</h3>
          </div>

          <fieldset>
            <legend className="sr-only">Pilih kategori pertanyaan</legend>
            <div className="grid md:grid-cols-2 gap-4">
              {CATEGORY_OPTIONS.map((option) => {
                const isSelected = context.suggestedCategory === option.value
                return (
                  <label
                    key={option.value}
                    className={`relative flex flex-col p-4 rounded-lg border cursor-pointer transition-all ${
                      isSelected
                        ? 'border-primary bg-primary/5'
                        : 'border-outline-variant/20 bg-surface-container-low hover:border-primary/30'
                    } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <input
                      type="radio"
                      name="suggestedCategory"
                      value={option.value}
                      checked={isSelected}
                      onChange={() => updateField('suggestedCategory', option.value)}
                      disabled={disabled}
                      className="sr-only"
                    />
                    <span className="font-headline font-bold text-on-surface text-sm mb-1">
                      {option.label}
                    </span>
                    <span className="text-xs text-on-surface-variant">{option.description}</span>
                    {isSelected && (
                      <span
                        className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary text-on-primary flex items-center justify-center"
                        aria-hidden="true"
                      >
                        <span
                          className="material-symbols-outlined text-xs"
                          style={{ fontVariationSettings: "'FILL' 1" }}
                        >
                          check
                        </span>
                      </span>
                    )}
                  </label>
                )
              })}
            </div>
          </fieldset>
        </section>

        {/* User notes */}
        <section className="bg-surface-container-lowest p-8 rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-primary-fixed flex items-center justify-center text-primary">
              <span className="material-symbols-outlined">edit_note</span>
            </div>
            <h3 className="text-xl font-headline font-bold text-on-surface">Catatan Anda</h3>
            <span className="text-xs text-on-surface-variant font-medium">(opsional)</span>
          </div>

          <label htmlFor="jd-user-notes" className="sr-only">
            Catatan tentang diri Anda
          </label>
          <textarea
            id="jd-user-notes"
            value={context.userNotes}
            onChange={(e) => updateField('userNotes', e.target.value)}
            disabled={disabled}
            rows={4}
            placeholder="Tambahkan catatan tentang diri Anda..."
            className="w-full px-4 py-3 bg-surface-container-low rounded-lg border border-outline-variant/20 text-on-surface focus:outline-none focus:border-primary transition-colors disabled:opacity-50 resize-y"
          />
          <p className="mt-2 text-xs text-on-surface-variant">
            AI akan menggunakan catatan ini untuk menyesuaikan pertanyaan dengan latar belakang Anda.
          </p>
        </section>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pt-4">
          <button
            type="button"
            onClick={onBack}
            disabled={disabled}
            aria-label="Kembali ke input deskripsi pekerjaan"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-surface-container text-on-surface font-headline font-bold text-sm uppercase tracking-wider hover:bg-surface-container-high transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-base">arrow_back</span>
            Kembali
          </button>
          <button
            type="button"
            onClick={handleStart}
            disabled={startDisabled}
            aria-label="Mulai interview dengan konteks pekerjaan yang sudah ditinjau"
            className="inline-flex items-center justify-center gap-2 px-8 py-3 rounded-full bg-primary text-on-primary font-headline font-bold text-sm uppercase tracking-wider shadow-[0_4px_20px_rgba(0,0,0,0.08)] hover:shadow-[0_8px_28px_rgba(0,0,0,0.12)] hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-[0_4px_20px_rgba(0,0,0,0.08)]"
          >
            Mulai Interview
            <span className="material-symbols-outlined text-base">play_arrow</span>
          </button>
        </div>
      </div>
    </div>
  )
}

export { SENIORITY_OPTIONS, CATEGORY_OPTIONS, LIST_FIELD_META }
