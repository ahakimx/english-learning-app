import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import type { JobDescriptionContext } from '../../types'

// ---------- Module mocks (must be declared before importing SpeakingModule) ----------

const mockChat = vi.fn()
vi.mock('../../services/apiClient', () => ({
  chat: (...args: unknown[]) => mockChat(...args),
  getProgress: vi.fn(() => Promise.resolve({})),
  TimeoutError: class TimeoutError extends Error {},
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/speaking' }),
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { userId: 'test-user' },
    isAuthenticated: true,
    loading: false,
    logout: vi.fn(),
  }),
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
    Promise.resolve({ userId: 'u1', email: 'user@example.com' }),
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

// ---------- Test fixtures ----------

/** The five Phase values exercised by this property. */
type RenderedPhase = 'mode-select' | 'jd-input' | 'jd-analyzing' | 'jd-review' | 'select'

/** A valid JD context returned from the mocked analyze_job_description call. */
const VALID_JD_CONTEXT: JobDescriptionContext = {
  company: 'Acme Corp',
  role: 'Senior Backend Engineer',
  technologies: ['Node.js', 'AWS'],
  responsibilities: ['Design scalable APIs'],
  requirements: ['5+ years experience'],
  softSkills: ['Leadership'],
  suggestedSeniority: 'senior',
  suggestedCategory: 'technical',
  userNotes: '',
}

/** A JD raw-text payload that satisfies JD_MIN_LENGTH (100). */
const JD_VALID_TEXT = 'a'.repeat(200)

/**
 * Drive the SpeakingModule from its initial state into the given phase by
 * firing the same UI interactions the user would.
 *
 * Preconditions: `mockChat` is already wired up such that
 *   - action=resume_session → no_active_session
 *   - action=analyze_job_description → resolves with VALID_JD_CONTEXT for
 *     terminal phases, or never resolves for 'jd-analyzing' so the UI stays
 *     in that phase long enough to be observed.
 */
async function driveToPhase(phase: RenderedPhase): Promise<void> {
  // After `checking` resolves with no_active_session, SpeakingModule enters
  // the mode-select phase. ModeSelector's two targeted card buttons have
  // aria-labels starting with "Pilih Mode".
  await screen.findByRole('button', { name: /Pilih Mode Targeted/i })
  if (phase === 'mode-select') return

  if (phase === 'select') {
    // Quick flow: keep Quick (pre-selected), click Lanjutkan → phase 'select'.
    fireEvent.click(
      screen.getByRole('button', { name: /Lanjutkan dengan mode yang dipilih/i }),
    )
    // Phase 'select' renders the Speaking overview with a "Start Practice" CTA.
    await screen.findByText('Start Practice')
    return
  }

  // Targeted flow: select Mode Targeted then click Lanjutkan → phase 'jd-input'.
  fireEvent.click(screen.getByRole('button', { name: /Pilih Mode Targeted/i }))
  fireEvent.click(
    screen.getByRole('button', { name: /Lanjutkan dengan mode yang dipilih/i }),
  )
  await screen.findByLabelText(/Deskripsi pekerjaan untuk dianalisis/i)
  if (phase === 'jd-input') return

  // Fill textarea with a valid-length JD and submit to trigger analysis.
  const textarea = screen.getByLabelText(
    /Deskripsi pekerjaan untuk dianalisis/i,
  ) as HTMLTextAreaElement
  fireEvent.change(textarea, { target: { value: JD_VALID_TEXT } })
  fireEvent.click(
    screen.getByRole('button', { name: /Analisis deskripsi pekerjaan/i }),
  )

  if (phase === 'jd-analyzing') {
    // The analyze_job_description mock is wired to never resolve for this
    // case, so the component stays in the jd-analyzing phase until cleanup.
    await screen.findByTestId('jd-analyzing-indicator')
    return
  }

  // jd-review: analyze resolves with VALID_JD_CONTEXT.
  await screen.findByText('Tinjau Konteks Pekerjaan')
}

/**
 * Assert that the DOM shows **exactly** the step component corresponding to
 * `phase`, and none of the other JD-flow / Quick-flow step components.
 *
 * The "step components" we distinguish between are:
 *   - ModeSelector      — heading "Pilih Mode Latihan Interview"
 *   - JobDescriptionInput — textarea labelled "Deskripsi pekerjaan untuk dianalisis"
 *   - jd-analyzing indicator — testid "jd-analyzing-indicator"
 *   - JDAnalysisReview  — heading "Tinjau Konteks Pekerjaan"
 *   - Quick-flow overview (phase='select') — "Start Practice" button text
 *   - JobPositionSelector — heading "Pilih Posisi Pekerjaan" (opens only
 *     after Start Practice is clicked; must never be visible in any of the
 *     phases this property covers)
 */
function expectOnlyPhaseComponent(phase: RenderedPhase): void {
  const modeSelectorHeading = screen.queryByText('Pilih Mode Latihan Interview')
  const jdInputTextarea = screen.queryByLabelText(
    /Deskripsi pekerjaan untuk dianalisis/i,
  )
  const jdAnalyzingIndicator = screen.queryByTestId('jd-analyzing-indicator')
  const jdReviewHeading = screen.queryByText('Tinjau Konteks Pekerjaan')
  const quickOverviewCta = screen.queryByText('Start Practice')
  const positionSelectorHeading = screen.queryByText('Pilih Posisi Pekerjaan')

  // JobPositionSelector must never leak into these phases — it lives behind
  // a separate `showPositionSelector` toggle in the Quick flow.
  expect(positionSelectorHeading).toBeNull()

  switch (phase) {
    case 'mode-select':
      expect(modeSelectorHeading).not.toBeNull()
      expect(jdInputTextarea).toBeNull()
      expect(jdAnalyzingIndicator).toBeNull()
      expect(jdReviewHeading).toBeNull()
      expect(quickOverviewCta).toBeNull()
      break
    case 'jd-input':
      expect(modeSelectorHeading).toBeNull()
      expect(jdInputTextarea).not.toBeNull()
      expect(jdAnalyzingIndicator).toBeNull()
      expect(jdReviewHeading).toBeNull()
      expect(quickOverviewCta).toBeNull()
      break
    case 'jd-analyzing':
      expect(modeSelectorHeading).toBeNull()
      expect(jdInputTextarea).toBeNull()
      expect(jdAnalyzingIndicator).not.toBeNull()
      expect(jdReviewHeading).toBeNull()
      expect(quickOverviewCta).toBeNull()
      break
    case 'jd-review':
      expect(modeSelectorHeading).toBeNull()
      expect(jdInputTextarea).toBeNull()
      expect(jdAnalyzingIndicator).toBeNull()
      expect(jdReviewHeading).not.toBeNull()
      expect(quickOverviewCta).toBeNull()
      break
    case 'select':
      expect(modeSelectorHeading).toBeNull()
      expect(jdInputTextarea).toBeNull()
      expect(jdAnalyzingIndicator).toBeNull()
      expect(jdReviewHeading).toBeNull()
      expect(quickOverviewCta).not.toBeNull()
      break
  }
}

/** Wire `mockChat` for a run that drives `phase`. */
function setupChatForPhase(phase: RenderedPhase): void {
  mockChat.mockImplementation((args: Record<string, unknown>) => {
    if (args.action === 'resume_session') {
      return Promise.resolve({ type: 'no_active_session', content: '', sessionId: '' })
    }
    if (args.action === 'analyze_job_description') {
      if (phase === 'jd-analyzing') {
        // Keep the UI suspended in jd-analyzing — never resolves.
        return new Promise<never>(() => {})
      }
      return Promise.resolve({
        type: 'jd_analysis',
        sessionId: '',
        content: '',
        jdContext: VALID_JD_CONTEXT,
      })
    }
    return Promise.resolve({ sessionId: '', type: 'question', content: '' })
  })
}

/**
 * Feature: jd-targeting
 * Property 26: Mode-gated phase rendering
 *
 * **Validates: Requirements 13.2, 13.3, 13.5**
 *
 * For any phase in the targeted-flow state machine that the SpeakingModule
 * can enter, exactly the step component corresponding to that phase is
 * rendered, and no other JD-flow or Quick-flow step component is visible at
 * the same time. This property covers:
 *   - phase === 'mode-select'  → ModeSelector only       (Req 13.2)
 *   - phase === 'jd-input'     → JobDescriptionInput only (Req 13.3)
 *   - phase === 'jd-analyzing' → analysis indicator only
 *   - phase === 'jd-review'    → JDAnalysisReview only   (Req 13.5)
 *   - phase === 'select'       → Quick overview, no JD components
 */
describe('Feature: jd-targeting, Property 26: Mode-gated phase rendering', () => {
  beforeEach(() => {
    setupChatForPhase('mode-select')
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it(
    'renders exactly the step component for the current phase, for every phase the module can enter',
    { timeout: 60000 },
    async () => {
      const phases: RenderedPhase[] = [
        'mode-select',
        'jd-input',
        'jd-analyzing',
        'jd-review',
        'select',
      ]

      await fc.assert(
        fc.asyncProperty(fc.constantFrom(...phases), async (phase) => {
          setupChatForPhase(phase)

          render(<SpeakingModule />)
          try {
            await driveToPhase(phase)
            expectOnlyPhaseComponent(phase)
          } finally {
            cleanup()
            vi.clearAllMocks()
          }
        }),
        { numRuns: 25 },
      )
    },
  )
})
