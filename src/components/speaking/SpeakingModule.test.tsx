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
  speak: vi.fn(() => Promise.resolve({ audioData: '' })),
  getProgress: vi.fn(() => Promise.resolve({})),
  TimeoutError: class TimeoutError extends Error {},
}))

vi.mock('../../services/authService', () => ({
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  getCurrentAuthUser: vi.fn(() =>
    Promise.resolve({ userId: 'u1', email: 'user@example.com' }),
  ),
  getAccessToken: vi.fn(() => Promise.resolve(null)),
}))

vi.mock('aws-amplify/auth', () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  fetchAuthSession: vi.fn(),
  getCurrentUser: vi.fn(),
  confirmSignUp: vi.fn(),
}))

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
  })

  it('renders the heading and back button', () => {
    renderSpeakingModule()
    expect(screen.getByText('Speaking Module')).toBeInTheDocument()
    expect(screen.getByText('Kembali ke Dashboard')).toBeInTheDocument()
  })

  it('renders job position selector initially', () => {
    renderSpeakingModule()
    expect(screen.getByText('Pilih Posisi Pekerjaan')).toBeInTheDocument()
    expect(screen.getByLabelText('Pilih posisi Software Engineer')).toBeInTheDocument()
    expect(screen.getByLabelText('Pilih posisi Product Manager')).toBeInTheDocument()
    expect(screen.getByLabelText('Pilih posisi Data Analyst')).toBeInTheDocument()
    expect(screen.getByLabelText('Pilih posisi Marketing Manager')).toBeInTheDocument()
    expect(screen.getByLabelText('Pilih posisi UI/UX Designer')).toBeInTheDocument()
    expect(screen.getByLabelText('Pilih posisi DevOps Engineer')).toBeInTheDocument()
    expect(screen.getByLabelText('Pilih posisi Cloud Engineer')).toBeInTheDocument()
  })

  it('navigates to dashboard when back button is clicked', () => {
    renderSpeakingModule()
    fireEvent.click(screen.getByText('Kembali ke Dashboard'))
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
  })

  it('shows loading state after completing full selection flow', async () => {
    mockChat.mockReturnValue(new Promise(() => {})) // never resolves
    renderSpeakingModule()
    completeSelectionFlow('Software Engineer', 'Senior', 'Teknis')
    expect(await screen.findByRole('status')).toBeInTheDocument()
    expect(screen.getByText(/Memulai sesi interview untuk Software Engineer/)).toBeInTheDocument()
  })

  it('calls chat API with start_session including seniority and category', async () => {
    mockChat.mockResolvedValue({
      sessionId: 'sess-123',
      type: 'question',
      content: 'Tell me about yourself.',
    })
    renderSpeakingModule()
    completeSelectionFlow('Data Analyst', 'Junior', 'Umum')
    await waitFor(() => {
      expect(mockChat).toHaveBeenCalledWith({
        action: 'start_session',
        jobPosition: 'Data Analyst',
        seniorityLevel: 'junior',
        questionCategory: 'general',
      })
    })
  })

  it('displays the first interview question after API response', async () => {
    mockChat.mockResolvedValue({
      sessionId: 'sess-456',
      type: 'question',
      content: 'What experience do you have with data analysis?',
    })
    renderSpeakingModule()
    completeSelectionFlow('Data Analyst', 'Menengah', 'Teknis')
    expect(await screen.findByTestId('interview-question')).toHaveTextContent(
      'What experience do you have with data analysis?',
    )
    expect(screen.getByText(/Posisi: Data Analyst/)).toBeInTheDocument()
    expect(screen.getByTestId('session-id')).toHaveTextContent('Sesi: sess-456')
  })

  it('shows error message when API call fails', async () => {
    mockChat.mockRejectedValue(new Error('Network error'))
    renderSpeakingModule()
    completeSelectionFlow('Product Manager', 'Lead', 'Umum')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Gagal memulai sesi interview. Silakan coba lagi.',
    )
    // Should return to selection phase (position step)
    expect(screen.getByText('Pilih Posisi Pekerjaan')).toBeInTheDocument()
  })

  it('allows retrying after an error', async () => {
    mockChat.mockRejectedValueOnce(new Error('fail'))
    renderSpeakingModule()
    completeSelectionFlow('Software Engineer', 'Senior', 'Teknis')
    await screen.findByRole('alert')

    mockChat.mockResolvedValue({
      sessionId: 'sess-789',
      type: 'question',
      content: 'Describe your coding experience.',
    })
    completeSelectionFlow('Software Engineer', 'Senior', 'Teknis')
    expect(await screen.findByTestId('interview-question')).toHaveTextContent(
      'Describe your coding experience.',
    )
  })

  it('passes questionType to InterviewSession after start_session response', async () => {
    mockChat.mockResolvedValueOnce({
      sessionId: 'sess-qt',
      type: 'question',
      content: 'First question?',
      questionType: 'contextual',
    })
    renderSpeakingModule()
    completeSelectionFlow('Software Engineer', 'Menengah', 'Umum')

    await waitFor(() => {
      expect(screen.getByTestId('interview-question')).toHaveTextContent('First question?')
    })

    // Verify badge shows "Pertanyaan Lanjutan" for contextual questionType
    expect(screen.getByTestId('question-type-badge')).toHaveTextContent('Pertanyaan Lanjutan')
  })
})

describe('SpeakingModule questionType integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('passes questionType to InterviewSession after start_session response', async () => {
    mockChat.mockResolvedValueOnce({
      sessionId: 'sess-qt',
      type: 'question',
      content: 'First question?',
      questionType: 'contextual',
    })
    renderSpeakingModule()
    completeSelectionFlow('Software Engineer', 'Menengah', 'Umum')

    // Wait for interview phase
    await waitFor(() => {
      expect(screen.getByTestId('interview-question')).toHaveTextContent('First question?')
    })

    // Verify badge shows "Pertanyaan Lanjutan" for contextual questionType
    expect(screen.getByTestId('question-type-badge')).toHaveTextContent('Pertanyaan Lanjutan')
  })
})

