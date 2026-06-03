import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { JobDescriptionContext, SessionConfig, SessionData } from '../../types'

/**
 * Feature: jd-targeting
 * Property 18: Resume fallback for missing mode
 *
 * Validates: Requirement 9.3
 *
 * For any resume response payload where `sessionData.jdContext` is a non-empty
 * `JobDescriptionContext` (i.e. a trimmed, non-empty `role`) and
 * `sessionData.mode` is absent / undefined, SpeakingModule SHALL treat the
 * session as `'targeted'` for the remainder of the interview.
 *
 * This test drives the full resume flow:
 *   checking → (resume_session returns session_resumed with mode:undefined + jdContext)
 *           → resume-prompt → (click "Lanjutkan Sesi") → loading → interview
 *
 * The observable effect of "treated as targeted" is that `novaSonic.startSession`
 * is called with `mode: 'targeted'` and the same `jdContext` that came back in
 * the resume payload — matching the explicit targeted branch in
 * `handleResumeSession`. The backend is NOT re-invoked for JD analysis during
 * resume (Requirement 9.4, checked as a companion assertion).
 */

const mockChat = vi.fn()
vi.mock('../../services/apiClient', () => ({
  chat: (...args: unknown[]) => mockChat(...args),
  getProgress: vi.fn(() => Promise.resolve({})),
  TimeoutError: class TimeoutError extends Error {},
}))

// react-router-dom — provide useNavigate / useLocation stubs while keeping MemoryRouter real
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useLocation: () => ({ pathname: '/speaking' }),
  }
})

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { userId: 'test-user' }, isAuthenticated: true, loading: false }),
}))

const mockConnect = vi.fn(() => Promise.resolve())
const mockStartSession = vi.fn((_config: SessionConfig) => Promise.resolve())

vi.mock('../../hooks/useNovaSonic', () => ({
  default: () => ({
    connect: mockConnect,
    disconnect: vi.fn(),
    startSession: mockStartSession,
    sendAudioChunk: vi.fn(),
    endSession: vi.fn(() => Promise.resolve()),
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

function renderModule() {
  return render(
    <MemoryRouter>
      <SpeakingModule />
    </MemoryRouter>,
  )
}

/**
 * Arbitrary for a JobDescriptionContext where `role` is guaranteed to be a
 * trimmed, non-empty string — i.e. the "non-empty jdContext" precondition of
 * Property 18.
 */
const jdContextArb: fc.Arbitrary<JobDescriptionContext> = fc.record({
  company: fc.string({ maxLength: 40 }),
  role: fc
    .string({ minLength: 1, maxLength: 60 })
    .filter((s) => s.trim().length > 0),
  technologies: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 6 }),
  responsibilities: fc.array(fc.string({ minLength: 1, maxLength: 40 }), { maxLength: 6 }),
  requirements: fc.array(fc.string({ minLength: 1, maxLength: 40 }), { maxLength: 6 }),
  softSkills: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 6 }),
  suggestedSeniority: fc.constantFrom('junior', 'mid', 'senior', 'lead') as fc.Arbitrary<
    JobDescriptionContext['suggestedSeniority']
  >,
  suggestedCategory: fc.constantFrom('general', 'technical') as fc.Arbitrary<
    JobDescriptionContext['suggestedCategory']
  >,
  userNotes: fc.constant(''),
})

/**
 * Build a SessionData payload whose `mode` field is explicitly absent
 * (`undefined`) and whose `jdContext` is the generated non-empty context.
 * The `questions` list has at least one entry so `handleResumeSession`
 * proceeds to call `novaSonic.startSession` (when `questions.length === 0`
 * the handler short-circuits to the `select` phase instead).
 */
function buildResumeSessionData(jdContext: JobDescriptionContext): SessionData {
  const now = Date.now()
  return {
    sessionId: 'sess-resume-fallback',
    jobPosition: jdContext.role,
    seniorityLevel: jdContext.suggestedSeniority,
    questionCategory: jdContext.suggestedCategory,
    questions: [
      {
        questionId: 'q1',
        questionText: 'Tell me about yourself.',
      },
    ],
    createdAt: new Date(now - 3_600_000).toISOString(),
    updatedAt: new Date(now - 600_000).toISOString(),
    // `mode` is intentionally omitted — this is the precondition of Property 18.
    jdContext,
  }
}

describe('Feature: jd-targeting, Property 18: Resume fallback for missing mode', () => {
  beforeEach(() => {
    mockChat.mockReset()
    mockStartSession.mockClear()
    mockConnect.mockClear()
  })

  afterEach(() => {
    cleanup()
  })

  it(
    'treats the resumed session as targeted when sessionData.mode is absent but jdContext is non-empty',
    { timeout: 60_000 },
    async () => {
      await fc.assert(
        fc.asyncProperty(jdContextArb, async (jdContext) => {
          const sessionData = buildResumeSessionData(jdContext)

          mockChat.mockImplementation((args: Record<string, unknown>) => {
            if (args.action === 'resume_session') {
              return Promise.resolve({
                type: 'session_resumed',
                content: '',
                sessionId: sessionData.sessionId,
                sessionData,
                // jdContextExpired intentionally absent — this is the fresh-context
                // fallback branch, not the retention-expired branch.
              })
            }
            // Any other action — return a benign response to keep the test focused
            // on the resume path.
            return Promise.resolve({
              sessionId: sessionData.sessionId,
              type: 'question',
              content: '',
            })
          })

          renderModule()

          // Wait for the resume prompt to appear (ResumePrompt mounts once
          // `checking` resolves with session_resumed).
          await waitFor(() =>
            expect(screen.getByTestId('resume-prompt')).toBeInTheDocument(),
          )

          // Click the Resume button — identifier from ResumePrompt component.
          fireEvent.click(screen.getByTestId('resume-button'))

          // The observable effect of "treated as targeted" is that
          // novaSonic.startSession receives mode: 'targeted' and the jdContext
          // that came back in the resume payload.
          await waitFor(() => {
            expect(mockStartSession).toHaveBeenCalled()
          })

          const lastCall = mockStartSession.mock.calls.at(-1)
          expect(lastCall).toBeDefined()
          const startArg = lastCall![0] as {
            jobPosition: string
            seniorityLevel: string
            questionCategory: string
            resumeSessionId?: string
            mode?: string
            jdContext?: JobDescriptionContext
          }

          expect(startArg.mode).toBe('targeted')
          expect(startArg.jdContext).toEqual(jdContext)
          expect(startArg.resumeSessionId).toBe(sessionData.sessionId)
          expect(startArg.jobPosition).toBe(sessionData.jobPosition)
          expect(startArg.seniorityLevel).toBe(sessionData.seniorityLevel)
          expect(startArg.questionCategory).toBe(sessionData.questionCategory)

          // Requirement 9.4 sanity check: resume must NOT trigger a fresh
          // JD analysis API call.
          const analyzeCalls = mockChat.mock.calls.filter(
            (call) =>
              (call[0] as { action?: string } | undefined)?.action ===
              'analyze_job_description',
          )
          expect(analyzeCalls).toHaveLength(0)

          cleanup()
          mockChat.mockReset()
          mockStartSession.mockClear()
        }),
        { numRuns: 8 },
      )
    },
  )
})
