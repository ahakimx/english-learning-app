import { describe, it, expect, vi, afterEach } from 'vitest'
import * as fc from 'fast-check'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { chat } from '../../services/apiClient'
import { JOB_POSITIONS, SENIORITY_LABELS, CATEGORY_LABELS } from './JobPositionSelector'
import type { SeniorityLevel, QuestionCategory } from '../../types'

vi.mock('../../services/apiClient', () => ({
  chat: vi.fn().mockImplementation((args: Record<string, unknown>) => {
    if (args.action === 'resume_session') {
      return Promise.resolve({ type: 'no_active_session', content: '', sessionId: '' })
    }
    return Promise.resolve({ sessionId: 'test-session', type: 'question', content: 'Test question?' })
  }),
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

          // Wait for checking phase to complete
          await screen.findByText('Pilih Posisi Pekerjaan')

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

          // Wait for the async chat call (start_session, not resume_session)
          await waitFor(() => {
            const startCalls = vi.mocked(chat).mock.calls.filter(
              (c) => (c[0] as Record<string, unknown>).action === 'start_session'
            )
            expect(startCalls.length).toBeGreaterThan(0)
          })

          // Verify the ChatRequest contains all parameters
          const startCall = vi.mocked(chat).mock.calls.find(
            (c) => (c[0] as Record<string, unknown>).action === 'start_session'
          )!
          const callArgs = startCall[0]
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
