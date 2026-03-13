import { describe, it, expect, vi, afterEach } from 'vitest'
import * as fc from 'fast-check'
import { render, screen, cleanup } from '@testing-library/react'
import type { SeniorityLevel, QuestionCategory } from '../../types'
import { JOB_POSITIONS, SENIORITY_LABELS, CATEGORY_LABELS } from './JobPositionSelector'

vi.mock('../../services/apiClient', () => ({
  speak: vi.fn().mockResolvedValue({ audioData: '' }),
  chat: vi.fn().mockResolvedValue({ sessionId: 'test', type: 'question', content: 'test' }),
  TimeoutError: class TimeoutError extends Error {},
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { userId: 'test-user' } }),
}))

// Mock Audio
window.HTMLAudioElement.prototype.play = vi.fn().mockResolvedValue(undefined)
window.HTMLAudioElement.prototype.pause = vi.fn()

import InterviewSession from './InterviewSession'

/**
 * Feature: interview-position-enhancement
 * Property 9: Session header displays full context
 *
 * Validates: Requirements 6.1, 6.2
 */
describe('Feature: interview-position-enhancement, Property 9: Session header displays full context', () => {
  afterEach(() => {
    cleanup()
  })

  it('should render position, Indonesian seniority label, and Indonesian category label in the header for any valid combination', async () => {
    const seniorityLevels: SeniorityLevel[] = ['junior', 'mid', 'senior', 'lead']
    const questionCategories: QuestionCategory[] = ['general', 'technical']

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...JOB_POSITIONS.map(p => p.title)),
        fc.constantFrom(...seniorityLevels),
        fc.constantFrom(...questionCategories),
        async (position, seniority, category) => {
          render(
            <InterviewSession
              sessionId="test-session-id"
              jobPosition={position}
              seniorityLevel={seniority}
              questionCategory={category}
              currentQuestion="What is your experience?"
              onEndSession={() => {}}
              onNextQuestion={() => {}}
            />,
          )

          // Verify position is displayed in the header
          expect(screen.getByText(new RegExp(position))).toBeTruthy()

          // Verify seniority Indonesian label is displayed
          const expectedSeniorityLabel = SENIORITY_LABELS[seniority]
          const seniorityEl = screen.getByTestId('session-seniority')
          expect(seniorityEl.textContent).toContain(expectedSeniorityLabel)

          // Verify category Indonesian label is displayed
          const expectedCategoryLabel = CATEGORY_LABELS[category].label
          const categoryEl = screen.getByTestId('session-category')
          expect(categoryEl.textContent).toContain(expectedCategoryLabel)

          cleanup()
        },
      ),
      { numRuns: 100 },
    )
  })
})
