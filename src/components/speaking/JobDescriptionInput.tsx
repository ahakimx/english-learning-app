import { useState } from 'react'
import type { JSX } from 'react'
import { JD_MIN_LENGTH, JD_MAX_LENGTH } from './jdConstants'

interface JobDescriptionInputProps {
  /** Previously submitted raw JD text, used when the user returns from the review phase. */
  initialValue?: string
  onSubmit: (jdRawText: string) => void
  onBack: () => void
  disabled?: boolean
}

export default function JobDescriptionInput({
  initialValue,
  onSubmit,
  onBack,
  disabled,
}: JobDescriptionInputProps): JSX.Element {
  const [jdRawText, setJdRawText] = useState<string>(initialValue ?? '')

  const length = jdRawText.length
  const isTooShort = length < JD_MIN_LENGTH
  const isTooLong = length > JD_MAX_LENGTH

  // Requirement 2.3 & 2.4: disable submit when length is out of range, or when parent says disabled.
  const submitDisabled = disabled || isTooShort || isTooLong

  function handleSubmit() {
    if (submitDisabled) return
    // Requirement 2.5: submit calls the API with the raw JD text.
    onSubmit(jdRawText)
  }

  function handleBack() {
    // Requirement 2.6: Back returns without calling the API.
    onBack()
  }

  return (
    <div>
      {/* Back button */}
      <div className="mb-10 flex items-center gap-2">
        <button
          type="button"
          onClick={handleBack}
          disabled={disabled}
          className="flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors text-sm font-medium group disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Kembali ke pilihan mode"
        >
          <span className="material-symbols-outlined text-sm group-hover:-translate-x-1 transition-transform">arrow_back</span>
          Kembali
        </button>
      </div>

      {/* Header */}
      <header className="mb-10 max-w-4xl">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary-container text-on-secondary-container text-xs font-bold font-headline mb-4">
          <span className="material-symbols-outlined text-sm">description</span>
          STEP 2: TEMPEL DESKRIPSI PEKERJAAN
        </div>
        <h2 className="text-3xl md:text-4xl font-extrabold font-headline text-primary tracking-tight mb-3">
          Tempel Deskripsi Pekerjaan (JD)
        </h2>
        <p className="text-on-surface-variant text-base md:text-lg max-w-2xl font-body leading-relaxed">
          Tempel deskripsi pekerjaan yang sedang Anda persiapkan. AI akan mengekstrak perusahaan, peran, teknologi,
          dan persyaratan untuk menyesuaikan sesi interview dengan peran tersebut.
        </p>
      </header>

      {/* Input card */}
      <section className="bg-surface-container-lowest rounded-xl border border-transparent shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6 md:p-8 max-w-5xl">
        <label
          htmlFor="jd-raw-text"
          className="block font-headline font-bold text-on-surface text-sm mb-3"
        >
          Deskripsi Pekerjaan
        </label>
        <textarea
          id="jd-raw-text"
          value={jdRawText}
          onChange={(e) => setJdRawText(e.target.value)}
          disabled={disabled}
          rows={14}
          placeholder="Tempel deskripsi pekerjaan (JD) di sini. Minimal 100 karakter, maksimal 10.000 karakter."
          aria-label="Deskripsi pekerjaan untuk dianalisis"
          aria-invalid={isTooLong}
          aria-describedby="jd-counter jd-error"
          className="w-full resize-y min-h-[280px] p-4 bg-surface-container-low rounded-lg border border-outline-variant/30 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 text-on-surface text-sm leading-relaxed font-body placeholder:text-on-surface-variant/60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        />

        {/* Counter + hint row */}
        <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <p className="text-xs text-on-surface-variant">
            {isTooShort
              ? `Tambahkan minimal ${JD_MIN_LENGTH - length} karakter lagi agar dapat dianalisis.`
              : 'JD siap untuk dianalisis.'}
          </p>
          <p
            id="jd-counter"
            aria-live="polite"
            className={`text-xs font-bold tabular-nums ${
              isTooLong ? 'text-error' : 'text-on-surface-variant'
            }`}
          >
            {length} / {JD_MAX_LENGTH}
          </p>
        </div>

        {/* Over-limit error message (Requirement 2.4) */}
        {isTooLong && (
          <div
            id="jd-error"
            role="alert"
            className="mt-4 flex items-start gap-3 p-4 rounded-lg bg-error-container text-on-error-container"
          >
            <span className="material-symbols-outlined text-base flex-shrink-0 mt-0.5">error</span>
            <p className="text-sm font-medium">JD melebihi batas 10.000 karakter</p>
          </div>
        )}
      </section>

      {/* Action row */}
      <div className="mt-8 flex flex-col-reverse sm:flex-row items-stretch sm:items-center sm:justify-between gap-4 max-w-5xl">
        <button
          type="button"
          onClick={handleBack}
          disabled={disabled}
          className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-surface-container text-on-surface font-headline font-bold text-sm uppercase tracking-wider hover:bg-surface-container-high transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Kembali ke pilihan mode tanpa menganalisis JD"
        >
          <span className="material-symbols-outlined text-base">arrow_back</span>
          Kembali
        </button>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitDisabled}
          aria-label="Analisis deskripsi pekerjaan"
          className="inline-flex items-center justify-center gap-2 px-8 py-3 rounded-full bg-primary text-on-primary font-headline font-bold text-sm uppercase tracking-wider shadow-[0_4px_20px_rgba(0,0,0,0.08)] hover:shadow-[0_8px_28px_rgba(0,0,0,0.12)] hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-[0_4px_20px_rgba(0,0,0,0.08)]"
        >
          Analisis
          <span className="material-symbols-outlined text-base">auto_awesome</span>
        </button>
      </div>
    </div>
  )
}
