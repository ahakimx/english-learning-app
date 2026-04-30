import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import SpeakingModule from './SpeakingModule'
import { AuthProvider } from '../../hooks/useAuth'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

const mockChat = vi.fn()
vi.mock('../../services/apiClient', () => ({
  chat: (...args: unknown[]) => mockChat(...args),
  getProgress: vi.fn(() => Promise.resolve({})),
  TimeoutError: class TimeoutError extends Error {},
}))

// Mock the Nova Sonic hook
const mockConnect = vi.fn(() => Promise.resolve())
const mockDisconnect = vi.fn()
const mockStartSession = vi.fn(() => Promise.resolve())
const mockSendAudioChunk = vi.fn()
const mockEndSession = vi.fn(() => Promise.resolve())
const mockInterrupt = vi.fn()

vi.mock('../../hooks/useNovaSonic', () => ({
  default: () => ({
    connect: mockConnect,
    disconnect: mockDisconnect,
    startSession: mockStartSession,
    sendAudioChunk: mockSendAudioChunk,
    endSession: mockEndSession,
    interrupt: mockInterrupt,
    connectionState: 'disconnected' as const,
    currentTurn: 'idle' as const,
    sessionActive: false,
  }),
}))

// Mock audio capture hook
const mockAudioStart = vi.fn(() => Promise.resolve())
const mockAudioStop = vi.fn()
vi.mock('../../hooks/useAudioCapture', () => ({
  useAudioCapture: () => ({
    isCapturing: false,
    start: mockAudioStart,
    stop: mockAudioStop,
    error: null,
  }),
}))

// Mock audio playback hook
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

/** Wait for the checking phase to complete and navigate to the position selector */
async function waitForSelector() {
  // After checking, the overview page appears first
  await screen.findByText('Start Practice')
  // Click "Start Practice" to show the JobPositionSelector
  fireEvent.click(screen.getByText('Start Practice'))
  await screen.findByText('Pilih Posisi Pekerjaan')
}

/**
 * Helper: complete the full multi-step selection flow
 * (position → seniority → category)
 */
function completeSelectionFlow(
  positionLabel = 'Software Engineer',
  seniorityLabel = 'Menengah',
  categoryLabel = 'Umum',
) {
  fireEvent.click(screen.getByLabelText(`Pilih posisi ${positionLabel}`))
  fireEvent.click(screen.getByLabelText(`Pilih tingkat ${seniorityLabel}`))
  fireEvent.click(screen.getByLabelText(`Pilih kategori ${categoryLabel}`))
}

function renderSpeakingModule() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <SpeakingModule />
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('SpeakingModule', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset mock implementations
    mockStartSession.mockImplementation(() => Promise.resolve())
    // Default: resume_session returns no active session so component transitions to 'select'
    mockChat.mockImplementation((args: Record<string, unknown>) => {
      if (args.action === 'resume_session') {
        return Promise.resolve({ type: 'no_active_session', content: '', sessionId: '' })
      }
      return Promise.resolve({ sessionId: 'default', type: 'question', content: 'Default question' })
    })
  })

  it('renders the heading and back button', async () => {
    renderSpeakingModule()
    await waitForSelector()
    // After clicking Start Practice, the JobPositionSelector is shown with a back button
    expect(screen.getByText('Back to Overview')).toBeInTheDocument()
  })

  it('renders job position selector initially', async () => {
    renderSpeakingModule()
    await waitForSelector()
    expect(screen.getByText('Pilih Posisi Pekerjaan')).toBeInTheDocument()
    expect(screen.getByLabelText('Pilih posisi Software Engineer')).toBeInTheDocument()
    expect(screen.getByLabelText('Pilih posisi Product Manager')).toBeInTheDocument()
    expect(screen.getByLabelText('Pilih posisi Data Analyst')).toBeInTheDocument()
    expect(screen.getByLabelText('Pilih posisi Marketing Manager')).toBeInTheDocument()
    expect(screen.getByLabelText('Pilih posisi UI/UX Designer')).toBeInTheDocument()
    expect(screen.getByLabelText('Pilih posisi DevOps Engineer')).toBeInTheDocument()
    expect(screen.getByLabelText('Pilih posisi Cloud Engineer')).toBeInTheDocument()
  })

  it('navigates to dashboard when back button is clicked', async () => {
    renderSpeakingModule()
    // Wait for the overview page to load
    await screen.findByText('Speaking Performance')
    // Click the "Overview" nav link in the header which navigates to /dashboard
    const overviewButtons = screen.getAllByText('Overview')
    // The header nav button is the one we want (not the sidebar one)
    fireEvent.click(overviewButtons[0])
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
  })

  it('shows loading state after completing full selection flow', async () => {
    // Make startSession hang so we stay in loading
    mockStartSession.mockReturnValue(new Promise(() => {}))
    renderSpeakingModule()
    await waitForSelector()
    completeSelectionFlow('Software Engineer', 'Senior', 'Teknis')
    expect(await screen.findByRole('status')).toBeInTheDocument()
    expect(screen.getByText(/Memulai sesi interview untuk Software Engineer/)).toBeInTheDocument()
  })

  it('connects to Bedrock and starts session after completing selection flow', async () => {
    renderSpeakingModule()
    await waitForSelector()
    completeSelectionFlow('Data Analyst', 'Junior', 'Umum')

    await waitFor(() => {
      expect(mockStartSession).toHaveBeenCalledWith({
        jobPosition: 'Data Analyst',
        seniorityLevel: 'junior',
        questionCategory: 'general',
      })
    })
  })

  it('displays the real-time interview layout after session starts', async () => {
    renderSpeakingModule()
    await waitForSelector()
    completeSelectionFlow('Data Analyst', 'Junior', 'Umum')

    // After WebSocket connects and session starts, the interview layout should appear
    expect(await screen.findByTestId('interview-realtime')).toBeInTheDocument()
    expect(screen.getByTestId('transcript-panel-container')).toBeInTheDocument()
    expect(screen.getByTestId('session-info-container')).toBeInTheDocument()
    expect(screen.getByTestId('end-session-button')).toBeInTheDocument()
  })

  it('shows error message when session start fails', async () => {
    mockStartSession.mockRejectedValue(new Error('Connection failed'))
    renderSpeakingModule()
    await waitForSelector()
    completeSelectionFlow('Product Manager', 'Lead', 'Umum')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Gagal memulai sesi interview. Silakan coba lagi.',
    )
    // Should return to select phase (overview page)
    expect(screen.getByText('Speaking Performance')).toBeInTheDocument()
  })

  it('allows retrying after an error', async () => {
    let callCount = 0
    mockStartSession.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return Promise.reject(new Error('fail'))
      }
      return Promise.resolve()
    })
    renderSpeakingModule()
    await waitForSelector()
    completeSelectionFlow('Software Engineer', 'Senior', 'Teknis')
    await screen.findByRole('alert')

    // After error, we're back at overview. Click Start Practice again.
    fireEvent.click(screen.getByText('Start Practice'))
    await screen.findByText('Pilih Posisi Pekerjaan')
    completeSelectionFlow('Software Engineer', 'Senior', 'Teknis')
    expect(await screen.findByTestId('interview-realtime')).toBeInTheDocument()
  })

  it('displays session info in the interview layout', async () => {
    renderSpeakingModule()
    await waitForSelector()
    completeSelectionFlow('Software Engineer', 'Menengah', 'Umum')

    await waitFor(() => {
      expect(screen.getByTestId('interview-realtime')).toBeInTheDocument()
    })

    // Verify session info panel is displayed
    expect(screen.getByTestId('session-info-panel')).toBeInTheDocument()
    expect(screen.getByTestId('session-timer')).toBeInTheDocument()
  })
})
