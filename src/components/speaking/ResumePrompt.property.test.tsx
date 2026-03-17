import { describe, it, expect, vi, afterEach } from 'vitest'
import * as fc from 'fast-check'
import { render, screen, cleanup } from '@testing-library/react'
import ResumePrompt from './ResumePrompt'
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

const questionArbitrary = fc.record({
  questionId: fc.uuid(),
  questionText: fc.string({ minLength: 1, maxLength: 100 }),
  transcription: fc.boolean().chain((hasTranscription) =>
    hasTranscription ? fc.string({ minLength: 1, maxLength: 200 }).map((s) => s as string | undefined) : fc.constant(undefined),
  ),
})

const sessionDataArbitrary: fc.Arbitrary<SessionData> = fc.record({
  sessionId: fc.uuid(),
  jobPosition: fc.constantFrom('Software Engineer', 'Product Manager', 'Data Analyst'),
  seniorityLevel: fc.constantFrom<SeniorityLevel>('junior', 'mid', 'senior', 'lead'),
  questionCategory: fc.constantFrom<QuestionCategory>('general', 'technical'),
  questions: fc.array(questionArbitrary, { minLength: 0, maxLength: 5 }),
  createdAt: fc.date({ min: new Date(Date.now() - 48 * 60 * 60 * 1000), max: new Date(Date.now() - 2 * 60 * 60 * 1000) }).map((d) => d.toISOString()),
  updatedAt: fc.date({ min: new Date(Date.now() - 47 * 60 * 60 * 1000), max: new Date(Date.now() - 60 * 1000) }).map((d) => d.toISOString()),
})

/**
 * Feature: speaking-session-resume
 * Property 4: ResumePrompt displays all session information
 *
 * Validates: Requirements 3.3
 */
describe('Feature: speaking-session-resume, Property 4: ResumePrompt displays all session information', () => {
  afterEach(() => {
    cleanup()
  })

  it('should display job position, seniority, category, answered count, and elapsed time for any valid SessionData', () => {
    fc.assert(
      fc.property(sessionDataArbitrary, (sessionData) => {
        render(
          <ResumePrompt
            sessionData={sessionData}
            onResume={vi.fn()}
            onStartNew={vi.fn()}
            isAbandoning={false}
          />,
        )

        // Verify job position is displayed
        const positionEl = screen.getByTestId('session-position')
        expect(positionEl.textContent).toContain(sessionData.jobPosition)

        // Verify seniority label is displayed in Indonesian
        const seniorityEl = screen.getByTestId('session-seniority')
        expect(seniorityEl.textContent).toContain(SENIORITY_LABELS[sessionData.seniorityLevel])

        // Verify category label is displayed in Indonesian
        const categoryEl = screen.getByTestId('session-category')
        expect(categoryEl.textContent).toContain(CATEGORY_LABELS[sessionData.questionCategory])

        // Verify answered count shows questions with transcription
        const answeredCount = sessionData.questions.filter((q) => q.transcription).length
        const answeredEl = screen.getByTestId('answered-count')
        expect(answeredEl.textContent).toContain(String(answeredCount))

        // Verify elapsed time has non-empty text
        const elapsedEl = screen.getByTestId('elapsed-time')
        expect(elapsedEl.textContent!.trim().length).toBeGreaterThan(0)

        // Verify both buttons are present
        expect(screen.getByTestId('resume-button')).toBeDefined()
        expect(screen.getByTestId('start-new-button')).toBeDefined()

        cleanup()
      }),
      { numRuns: 100 },
    )
  })
})
