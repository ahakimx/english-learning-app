import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { JD_MIN_LENGTH } from './jdConstants'

// ---------- Module mocks (declared before importing SpeakingModule) ----------

const mockChat = vi.fn()
vi.mock('../../services/apiClient', () => ({
  chat: (...args: unknown[]) => mockChat(...args),
  getProgress: vi.fn(() => Promise.resolve({})),
  TimeoutError: class TimeoutError extends Error {},
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useLocation: () => ({ pathname: '/speaking' }),
  }
})

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { userId: 'test-user' },
    isAuthenticated: true,
    loading: false,
    logout: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('../../hooks/useNovaSonic', () => ({
  default: () => ({
    connect: vi.fn(() => Promise.resolve()),
    disconnect: vi.fn(),
    startSession: vi.fn(() => Promise.resolve()),
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

// ---------- Test helpers ----------

/**
 * Wire `mockChat` so that:
 *   - `resume_session` resolves with `no_active_session` (sends us to `mode-select`)
 *   - `analyze_job_description` returns a promise that NEVER resolves, keeping
 *     the component stuck in the `jd-analyzing` phase so we can observe the
 *     in-progress invariants.
 *   - any other action resolves with a trivial `question` payload.
 */
function setupPendingAnalyzeChat(): void {
  mockChat.mockImplementation((args: Record<string, unknown>) => {
    if (args.action === 'resume_session') {
      return Promise.resolve({ type: 'no_active_session', content: '', sessionId: '' })
    }
    if (args.action === 'analyze_job_description') {
      // Never resolves — keeps `phase` at 'jd-analyzing' for the duration of the run.
      return new Promise<never>(() => {})
    }
    return Promise.resolve({ sessionId: '', type: 'question', content: '' })
  })
}

/**
 * Drive the module from its initial `checking` phase to `jd-input`, then type
 * `jdText` into the textarea and click "Analisis" once. After this returns,
 * the component is in `jd-analyzing` (the indicator is present) because the
 * `analyze_job_description` call is pending.
 */
async function submitJdOnce(jdText: string): Promise<void> {
  // Wait for mode-select to render (Mode Targeted card is unique to that phase).
  await screen.findByRole('button', { name: /Pilih Mode Targeted/i })

  fireEvent.click(screen.getByRole('button', { name: /Pilih Mode Targeted/i }))
  fireEvent.click(
    screen.getByRole('button', { name: /Lanjutkan dengan mode yang dipilih/i }),
  )

  // jd-input phase: textarea is rendered.
  const textarea = (await screen.findByLabelText(
    /Deskripsi pekerjaan untuk dianalisis/i,
  )) as HTMLTextAreaElement

  fireEvent.change(textarea, { target: { value: jdText } })
  fireEvent.click(
    screen.getByRole('button', { name: /Analisis deskripsi pekerjaan/i }),
  )

  // jd-analyzing phase: indicator appears.
  await screen.findByTestId('jd-analyzing-indicator')
}

/**
 * Count `chat` calls whose first argument has `action === 'analyze_job_description'`.
 */
function countAnalyzeCalls(): number {
  return mockChat.mock.calls.filter(
    (call) => (call[0] as { action?: string })?.action === 'analyze_job_description',
  ).length
}

// ---------- Property test ----------

/**
 * Feature: jd-targeting
 * Property 27: jd-analyzing phase is exclusive and idempotent
 *
 * **Validates: Requirement 13.4**
 *
 * For any number `k ≥ 0` of repeated submit attempts issued while
 * `phase === 'jd-analyzing'` with the same or different inputs, exactly one
 * `chat({ action: 'analyze_job_description', ... })` call SHALL be in flight
 * at a time, and the pending call's `jdRawText` SHALL match the first
 * submitted value. The `JDAnalysisReview` component SHALL NOT be rendered
 * during this phase.
 *
 * Test strategy:
 *   1. Mock `chat` so `analyze_job_description` returns a perpetually pending
 *      promise — the component stays in `jd-analyzing` for the whole run.
 *   2. Navigate to `jd-input`, type a valid JD, click "Analisis" once. This
 *      is the single "first submitted value" the property references.
 *   3. Simulate `k` additional submit attempts. Because the JD_Input
 *      component is unmounted in `jd-analyzing` (only the indicator is
 *      rendered), these additional attempts have no clickable affordance;
 *      the absence of that affordance is exactly how exclusivity is enforced
 *      in the UI.
 *   4. Assert:
 *        - the JD textarea and Analisis button are gone from the DOM;
 *        - the `jd-analyzing-indicator` is present;
 *        - `JDAnalysisReview` (heading "Tinjau Konteks Pekerjaan") is NOT
 *          rendered;
 *        - exactly one `analyze_job_description` call was made to `chat`;
 *        - that call's payload carries `jdRawText` equal to the first (and
 *          only) submitted value.
 *
 *  `k` is generated by fast-check over [0, 10]. DOM rendering is expensive,
 *  so `numRuns` is kept small.
 */
describe('Feature: jd-targeting, Property 27: jd-analyzing phase is exclusive and idempotent', () => {
  beforeEach(() => {
    setupPendingAnalyzeChat()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it(
    'for any k ≥ 0 submit attempts while jd-analyzing, exactly one analyze_job_description call is made and JDAnalysisReview is not rendered',
    { timeout: 60000 },
    async () => {
      await fc.assert(
        fc.asyncProperty(
          // `k` — number of additional submit attempts beyond the first.
          fc.nat({ max: 10 }),
          // First (and only) JD text the user submits. Length is constrained
          // to the valid range so the "Analisis" button is enabled.
          fc.string({ minLength: JD_MIN_LENGTH, maxLength: JD_MIN_LENGTH + 50 }),
          async (k, firstJd) => {
            setupPendingAnalyzeChat()

            render(
              <MemoryRouter>
                <SpeakingModule />
              </MemoryRouter>,
            )

            try {
              await submitJdOnce(firstJd)

              // --- Exclusivity invariants held once we are in jd-analyzing ---
              // 1. The JD input component is gone (so additional submit
              //    affordances are absent — this is the UI-level enforcement
              //    of "ignore further submits while analyzing").
              expect(
                screen.queryByLabelText(/Deskripsi pekerjaan untuk dianalisis/i),
              ).toBeNull()
              expect(
                screen.queryByRole('button', { name: /Analisis deskripsi pekerjaan/i }),
              ).toBeNull()

              // 2. JDAnalysisReview is not rendered during jd-analyzing.
              expect(screen.queryByText('Tinjau Konteks Pekerjaan')).toBeNull()

              // 3. The in-progress indicator is present.
              expect(screen.getByTestId('jd-analyzing-indicator')).toBeInTheDocument()

              // --- Simulate `k` additional submit attempts ---
              // The Analisis button is no longer in the DOM, so any direct
              // re-click is impossible. We iterate `k` times asserting the
              // state is unchanged on each iteration: the submit affordance
              // remains absent and no additional chat call materializes.
              for (let i = 0; i < k; i++) {
                expect(
                  screen.queryByRole('button', {
                    name: /Analisis deskripsi pekerjaan/i,
                  }),
                ).toBeNull()
                expect(screen.queryByText('Tinjau Konteks Pekerjaan')).toBeNull()
                expect(
                  screen.getByTestId('jd-analyzing-indicator'),
                ).toBeInTheDocument()
              }

              // 4. Exactly one analyze_job_description call was made.
              expect(countAnalyzeCalls()).toBe(1)

              // 5. That call's jdRawText matches the first submitted value.
              const analyzeCall = mockChat.mock.calls.find(
                (call) =>
                  (call[0] as { action?: string })?.action === 'analyze_job_description',
              )
              expect(analyzeCall).toBeDefined()
              const payload = analyzeCall![0] as {
                action: string
                mode?: string
                jdRawText?: string
              }
              expect(payload.action).toBe('analyze_job_description')
              expect(payload.mode).toBe('targeted')
              expect(payload.jdRawText).toBe(firstJd)
            } finally {
              cleanup()
              vi.clearAllMocks()
            }
          },
        ),
        { numRuns: 15 },
      )
    },
  )
})
