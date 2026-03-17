import type { JSX } from 'react'
import type { SessionData, SeniorityLevel, QuestionCategory } from '../../types'

const SENIORITY_LABELS: Record<SeniorityLevel, string> = {
  junior: 'Junior',
  mid: 'Menengah',
  senior: 'Senior',
  lead: 'Lead',
}

const CATEGORY_LABELS: Record<QuestionCategory, string> = {
  general: 'Umum',
  technical: 'Teknis',
}

export function getRelativeTime(updatedAt: string): string {
  const now = Date.now()
  const updated = new Date(updatedAt).getTime()
  const diffMs = now - updated
  const diffMinutes = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMinutes < 1) return 'baru saja'
  if (diffMinutes < 60) return `${diffMinutes} menit yang lalu`
  if (diffHours < 24) return `${diffHours} jam yang lalu`
  if (diffHours < 48) return 'kemarin'
  return `${diffDays} hari yang lalu`
}

interface ResumePromptProps {
  sessionData: SessionData
  onResume: () => void
  onStartNew: () => void
  isAbandoning: boolean
}

export default function ResumePrompt({ sessionData, onResume, onStartNew, isAbandoning }: ResumePromptProps): JSX.Element {
  const answeredCount = sessionData.questions.filter((q) => q.transcription).length
  const totalCount = sessionData.questions.length
  const elapsedTime = getRelativeTime(sessionData.updatedAt)

  return (
    <div data-testid="resume-prompt" className="max-w-lg mx-auto">
      <h2 className="text-xl font-semibold text-gray-800 mb-2">Sesi Interview Aktif</h2>
      <p className="text-sm text-gray-500 mb-6">
        Anda memiliki sesi interview yang belum selesai. Ingin melanjutkan?
      </p>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 mb-6">
        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-sm text-gray-500">Posisi</span>
            <span data-testid="session-position" className="text-sm font-medium text-gray-800">
              {sessionData.jobPosition}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-500">Tingkat</span>
            <span data-testid="session-seniority" className="text-sm font-medium text-gray-800">
              {SENIORITY_LABELS[sessionData.seniorityLevel]}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-500">Kategori</span>
            <span data-testid="session-category" className="text-sm font-medium text-gray-800">
              {CATEGORY_LABELS[sessionData.questionCategory]}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-500">Pertanyaan dijawab</span>
            <span data-testid="answered-count" className="text-sm font-medium text-gray-800">
              {answeredCount} / {totalCount}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-500">Terakhir aktif</span>
            <span data-testid="elapsed-time" className="text-sm font-medium text-gray-800">
              {elapsedTime}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          data-testid="resume-button"
          onClick={onResume}
          disabled={isAbandoning}
          className="flex-1 px-4 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Lanjutkan Sesi
        </button>
        <button
          type="button"
          data-testid="start-new-button"
          onClick={onStartNew}
          disabled={isAbandoning}
          className="flex-1 px-4 py-3 bg-white text-gray-700 font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isAbandoning && (
            <svg className="animate-spin h-4 w-4 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          Mulai Sesi Baru
        </button>
      </div>
    </div>
  )
}
