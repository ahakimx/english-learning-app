import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { JobDescriptionContext } from '../../types'
import { JD_MIN_LENGTH, JD_MAX_LENGTH } from './jdConstants'

/**
 * Feature: jd-targeting
 * Property 28: Analyze outcome drives phase transition
 *
 * Validates: Requirements 13.6, 13.7
 *
 * - On success (`chat({action: 'analyze_job_description', ...})` resolves with
 *   `{ type: 'jd_analysis', jdContext }`), the component transitions
 *   `jd-analyzing → jd-review`.
 * - On rejection or an invalid response, the component transitions
 *   `jd-analyzing → jd-input` AND displays an Indonesian error message. The
 *   specific message is derived from the backend error code (JD_TOO_SHORT,
 *   JD_RATE_LIMIT_EXCEEDED, ...) or falls back to a generic Indonesian message.
 *
 * This test drives the full SpeakingModule: mode selection → jd-input →
 * submit → jd-analyzing → (jd-review | jd-input+error). It exercises the
 * success path and three error paths (generic, JD_TOO_SHORT, JD_RATE_LIMIT_EXCEEDED),
 * each using a property generator (fast-check) over valid-length JD strings
 * and, for the success case, over a space of JobDescriptionContext values.
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
const mockStartSession = vi.fn(() => Promise.resolve())

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
 * Walk the UI from the initial "checking" phase up to the jd-input phase:
 * checking → mode-select → (click Mode Targeted) → (click Lanjutkan) → jd-input.
 * The caller is then responsible for typing the JD and clicking Analisis.
 */
async function navigateToJdInput(): Promise<void> {
  // Wait for the ModeSelector heading to appear (signals we've left the checking phase)
  await screen.findByText('Pilih Mode Latihan Interview')

  // Select Targeted mode
  fireEvent.click(screen.getByLabelText('Pilih Mode Targeted'))

  // Advance to jd-input
  fireEvent.click(screen.getByLabelText('Lanjutkan dengan mode yang dipilih'))

  // Confirm we're now on the JD input screen
  await screen.findByLabelText(/deskripsi pekerjaan untuk dianalisis/i)
}

async function submitJd(jd: string): Promise<void> {
  const textarea = screen.getByLabelText(
    /deskripsi pekerjaan untuk dianalisis/i,
  ) as HTMLTextAreaElement
  fireEvent.change(textarea, { target: { value: jd } })
  fireEvent.click(
    screen.getByRole('button', { name: /analisis deskripsi pekerjaan/i }),
  )
}

/**
 * Shared mock implementation factory: returns a chat mock that always resolves
 * `resume_session` with no active session, then delegates `analyze_job_description`
 * to the caller-provided response function.
 */
function makeChatMock(
  analyzeResponse: () => Promise<unknown>,
): (args: Record<string, unknown>) => Promise<unknown> {
  return (args: Record<string, unknown>) => {
    if (args.action === 'resume_session') {
      return Promise.resolve({ type: 'no_active_session', content: '', sessionId: '' })
    }
    if (args.action === 'analyze_job_description') {
      return analyzeResponse()
    }
    // Any other action — return a benign response to keep the test focused on JD flow
    return Promise.resolve({ sessionId: 'test-session', type: 'question', content: '' })
  }
}

// Arbitrary for a JobDescriptionContext where `role` is always a non-empty string.
const jdContextArb: fc.Arbitrary<JobDescriptionContext> = fc.record({
  company: fc.string(),
  role: fc.string({ minLength: 1, maxLength: 60 }).filter((s) => s.trim().length > 0),
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

// JD text must be within the accepted length window to reach the analyzing phase.
const validJdArb = fc.string({ minLength: JD_MIN_LENGTH, maxLength: JD_MIN_LENGTH + 200 })

describe('Feature: jd-targeting, Property 28: Analyze outcome drives phase transition', () => {
  beforeEach(() => {
    mockChat.mockReset()
    mockStartSession.mockClear()
    mockConnect.mockClear()
  })

  afterEach(() => {
    cleanup()
  })

  // --- SUCCESS CASE (Requirement 13.6) ---
  it(
    'transitions jd-analyzing → jd-review when chat resolves with { type: "jd_analysis", jdContext }',
    { timeout: 60000 },
    async () => {
      await fc.assert(
        fc.asyncProperty(validJdArb, jdContextArb, async (jd, jdContext) => {
          mockChat.mockImplementation(
            makeChatMock(() =>
              Promise.resolve({
                sessionId: '',
                type: 'jd_analysis',
                content: '',
                jdContext,
              }),
            ),
          )

          renderModule()
          await navigateToJdInput()
          await submitJd(jd)

          // Success: JDAnalysisReview renders ("Tinjau Konteks Pekerjaan" heading)
          expect(await screen.findByText('Tinjau Konteks Pekerjaan')).toBeInTheDocument()

          cleanup()
          mockChat.mockReset()
        }),
        { numRuns: 6 },
      )
    },
  )

  // --- ERROR CASE (generic / network) (Requirement 13.7) ---
  it(
    'transitions jd-analyzing → jd-input with a fallback Indonesian error when chat rejects with a generic error',
    { timeout: 60000 },
    async () => {
      await fc.assert(
        fc.asyncProperty(validJdArb, async (jd) => {
          mockChat.mockImplementation(
            makeChatMock(() => Promise.reject(new Error('Network failure'))),
          )

          renderModule()
          await navigateToJdInput()
          await submitJd(jd)

          // Back to jd-input: the textarea becomes visible again
          const textarea = await screen.findByLabelText(
            /deskripsi pekerjaan untuk dianalisis/i,
          )
          expect(textarea).toBeInTheDocument()

          // Indonesian fallback error message surfaces in the alert
          const alert = await screen.findByRole('alert')
          expect(alert.textContent).toContain(
            'Gagal menganalisis deskripsi pekerjaan. Silakan coba lagi.',
          )

          cleanup()
          mockChat.mockReset()
        }),
        { numRuns: 6 },
      )
    },
  )

  // --- ERROR CASE (JD_TOO_SHORT) (Requirement 13.7) ---
  it(
    'maps JD_TOO_SHORT rejection to the specific Indonesian message and returns to jd-input',
    { timeout: 60000 },
    async () => {
      await fc.assert(
        fc.asyncProperty(validJdArb, async (jd) => {
          mockChat.mockImplementation(
            makeChatMock(() => Promise.reject(new Error('JD_TOO_SHORT: input is too short'))),
          )

          renderModule()
          await navigateToJdInput()
          await submitJd(jd)

          // Back to jd-input
          expect(
            await screen.findByLabelText(/deskripsi pekerjaan untuk dianalisis/i),
          ).toBeInTheDocument()

          // Specific Indonesian message for JD_TOO_SHORT
          const alert = await screen.findByRole('alert')
          expect(alert.textContent).toContain(
            'Deskripsi pekerjaan terlalu pendek. Minimal 100 karakter.',
          )

          cleanup()
          mockChat.mockReset()
        }),
        { numRuns: 4 },
      )
    },
  )

  // --- ERROR CASE (JD_RATE_LIMIT_EXCEEDED) (Requirement 13.7) ---
  it(
    'maps JD_RATE_LIMIT_EXCEEDED rejection to the specific Indonesian rate-limit message and returns to jd-input',
    { timeout: 60000 },
    async () => {
      await fc.assert(
        fc.asyncProperty(validJdArb, async (jd) => {
          mockChat.mockImplementation(
            makeChatMock(() =>
              Promise.reject(
                new Error('JD_RATE_LIMIT_EXCEEDED: daily limit reached'),
              ),
            ),
          )

          renderModule()
          await navigateToJdInput()
          await submitJd(jd)

          // Back to jd-input
          expect(
            await screen.findByLabelText(/deskripsi pekerjaan untuk dianalisis/i),
          ).toBeInTheDocument()

          // Specific Indonesian message for the rate-limit case
          const alert = await screen.findByRole('alert')
          expect(alert.textContent).toContain(
            'Anda telah mencapai batas harian analisis JD (5 per hari). Coba lagi besok.',
          )

          cleanup()
          mockChat.mockReset()
        }),
        { numRuns: 4 },
      )
    },
  )

  // --- Invalid response is treated as an error (Requirement 13.7) ---
  it(
    'transitions jd-analyzing → jd-input with the fallback Indonesian error when chat resolves with an invalid response',
    { timeout: 60000 },
    async () => {
      await fc.assert(
        fc.asyncProperty(validJdArb, async (jd) => {
          // Resolve with an unexpected type / missing jdContext
          mockChat.mockImplementation(
            makeChatMock(() =>
              Promise.resolve({ sessionId: '', type: 'question', content: '' }),
            ),
          )

          renderModule()
          await navigateToJdInput()
          await submitJd(jd)

          // Back to jd-input
          expect(
            await screen.findByLabelText(/deskripsi pekerjaan untuk dianalisis/i),
          ).toBeInTheDocument()

          // Falls back to the generic Indonesian analyze-failed message
          await waitFor(() => {
            const alert = screen.queryByRole('alert')
            expect(alert).not.toBeNull()
            expect(alert!.textContent).toContain(
              'Gagal menganalisis deskripsi pekerjaan. Silakan coba lagi.',
            )
          })

          cleanup()
          mockChat.mockReset()
        }),
        { numRuns: 4 },
      )
    },
  )
})

// `JD_MAX_LENGTH` is imported for parity with companion tests; keep the reference alive
// so tree-shaking / unused-import lints don't complain in strict configurations.
void JD_MAX_LENGTH
