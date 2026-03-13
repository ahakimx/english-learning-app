import { describe, it, expect, vi, afterEach } from 'vitest'
import * as fc from 'fast-check'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { chat } from '../../services/apiClient'
import { JOB_POSITIONS, SENIORITY_LABELS, CATEGORY_LABELS } from './JobPositionSelector'
import type { SeniorityLevel, QuestionCategory } from '../../types'

vi.mock('../../services/apiClient', () => ({
  chat: vi.fn().mockResolvedValue({ sessionId: 'test-session', type: 'question', content: 'Test question?' }),
  speak: vi.fn().mockResolvedValue({ audioData: '' }),
  transcribe: vi.fn(),
  TimeoutError: class TimeoutError extends Error {},
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { userId: 'test-user' }, isAuthenticated: true, loading: false }),
}))

import SpeakingModule from './SpeakingModule'

/**
 * Feature: interview-position-enhancement
 * Property 5: Start session request includes all parameters
 *
 * Validates: Requirements 2.3, 3.5
 */
describe('Feature: interview-position-enhancement, Property 5: Start session request includes all parameters', () => {
  afterEach(() => {
    cleanup()
    vi.mocked(chat).mockClear()
  })

  it('should send ChatRequest with action, jobPosition, seniorityLevel, and questionCategory for any valid combination', async () => {
    const seniorityLevels: SeniorityLevel[] = ['junior', 'mid', 'senior', 'lead']
    const questionCategories: QuestionCategory[] = ['general', 'technical']

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...JOB_POSITIONS),
        fc.constantFrom(...seniorityLevels),
        fc.constantFrom(...questionCategories),
        async (position, seniority, category) => {
          render(<SpeakingModule />)

          // Step 1: Select position
          const positionButton = screen.getByLabelText(`Pilih posisi ${position.title}`)
          fireEvent.click(positionButton)

          // Step 2: Select seniority
          const seniorityLabel = SENIORITY_LABELS[seniority]
          const seniorityButton = screen.getByLabelText(`Pilih tingkat ${seniorityLabel}`)
          fireEvent.click(seniorityButton)

          // Step 3: Select category
          const categoryLabel = CATEGORY_LABELS[category].label
          const categoryButton = screen.getByLabelText(`Pilih kategori ${categoryLabel}`)
          fireEvent.click(categoryButton)

          // Wait for the async chat call
          await waitFor(() => {
            expect(chat).toHaveBeenCalled()
          })

          // Verify the ChatRequest contains all parameters
          const callArgs = vi.mocked(chat).mock.calls[0][0]
          expect(callArgs.action).toBe('start_session')
          expect(callArgs.jobPosition).toBe(position.title)
          expect(callArgs.seniorityLevel).toBe(seniority)
          expect(callArgs.questionCategory).toBe(category)

          cleanup()
          vi.mocked(chat).mockClear()
        },
      ),
      { numRuns: 100 },
    )
  })
})
