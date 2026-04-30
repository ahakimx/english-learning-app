import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { JOB_POSITIONS, SENIORITY_LABELS, CATEGORY_LABELS } from './JobPositionSelector'
import type { SeniorityLevel, QuestionCategory } from '../../types'

const mockChat = vi.fn()
vi.mock('../../services/apiClient', () => ({
  chat: (...args: unknown[]) => mockChat(...args),
  TimeoutError: class TimeoutError extends Error {},
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/speaking' }),
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { userId: 'test-user' }, isAuthenticated: true, loading: false }),
}))

// Mock the Nova Sonic hook — capture startSession calls
const mockConnect = vi.fn(() => Promise.resolve())
const mockStartSession = vi.fn()

vi.mock('../../hooks/useNovaSonic', () => ({
  default: () => ({
    connect: mockConnect,
    disconnect: vi.fn(),
    startSession: mockStartSession,
    sendAudioChunk: vi.fn(),
    endSession: vi.fn(),
    interrupt: vi.fn(),
    connectionState: 'disconnected' as const,
    currentTurn: 'idle' as const,
    sessionActive: false,
  }),
}))

vi.mock('../../hooks/useAudioCapture', () => ({
  useAudioCapture: () => ({
    isCapturing: false,
    start: vi.fn(() => Promise.resolve()),
    stop: vi.fn(),
    error: null,
  }),
}))

vi.mock('../../hooks/useAudioPlayback', () => ({
  useAudioPlayback: () => ({
    playChunk: vi.fn(),
    stop: vi.fn(),
    isPlaying: false,
    error: null,
  }),
}))

vi.mock('../../services/authService', () => ({
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  getCurrentAuthUser: vi.fn(() =>
    Promise.resolve({ userId: 'test-user', email: 'user@example.com' }),
  ),
  getAccessToken: vi.fn(() => Promise.resolve(null)),
  refreshSession: vi.fn(() => Promise.resolve(null)),
}))

vi.mock('aws-amplify/auth', () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  fetchAuthSession: vi.fn(),
  getCurrentUser: vi.fn(),
  confirmSignUp: vi.fn(),
}))

import SpeakingModule from './SpeakingModule'

/**
 * Feature: nova-sonic-speaking-migration
 * Property 5: Start session request includes all parameters
 *
 * Validates: Requirements 9.1, 9.2
 *
 * For any valid combination of jobPosition, seniorityLevel, and questionCategory,
 * the SpeakingModule SHALL call novaSonic.startSession with all parameters.
 */
describe('Feature: nova-sonic-speaking-migration, Property 5: Start session request includes all parameters', () => {
  beforeEach(() => {
    mockChat.mockImplementation((args: Record<string, unknown>) => {
      if (args.action === 'resume_session') {
        return Promise.resolve({ type: 'no_active_session', content: '', sessionId: '' })
      }
      return Promise.resolve({ sessionId: 'test-session', type: 'question', content: 'Test question?' })
    })
    mockConnect.mockImplementation(() => Promise.resolve())
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('should call novaSonic.startSession with jobPosition, seniorityLevel, and questionCategory for any valid combination', { timeout: 60000 }, async () => {
    const seniorityLevels: SeniorityLevel[] = ['junior', 'mid', 'senior', 'lead']
    const questionCategories: QuestionCategory[] = ['general', 'technical']

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...JOB_POSITIONS),
        fc.constantFrom(...seniorityLevels),
        fc.constantFrom(...questionCategories),
        async (position, seniority, category) => {
          render(<SpeakingModule />)

          // Wait for checking phase to complete (overview page appears)
          await screen.findByText('Start Practice')

          // Click Start Practice to show the JobPositionSelector
          fireEvent.click(screen.getByText('Start Practice'))
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

          // Wait for the WebSocket connection and session start
          await waitFor(() => {
            expect(mockStartSession).toHaveBeenCalled()
          })

          // Verify the startSession was called with correct parameters
          const lastCall = mockStartSession.mock.calls[mockStartSession.mock.calls.length - 1]
          const callArgs = lastCall[0]
          expect(callArgs.jobPosition).toBe(position.title)
          expect(callArgs.seniorityLevel).toBe(seniority)
          expect(callArgs.questionCategory).toBe(category)

          cleanup()
          vi.clearAllMocks()
          // Re-setup mocks for next iteration
          mockChat.mockImplementation((args: Record<string, unknown>) => {
            if (args.action === 'resume_session') {
              return Promise.resolve({ type: 'no_active_session', content: '', sessionId: '' })
            }
            return Promise.resolve({ sessionId: 'test-session', type: 'question', content: 'Test question?' })
          })
          mockConnect.mockImplementation(() => Promise.resolve())
        },
      ),
      { numRuns: 100 },
    )
  })
})
