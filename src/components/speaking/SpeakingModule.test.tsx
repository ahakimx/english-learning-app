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
  })

  it('navigates to dashboard when back button is clicked', () => {
    renderSpeakingModule()
    fireEvent.click(screen.getByText('Kembali ke Dashboard'))
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
  })

  it('shows loading state when a position is selected', async () => {
    mockChat.mockReturnValue(new Promise(() => {})) // never resolves
    renderSpeakingModule()
    fireEvent.click(screen.getByLabelText('Pilih posisi Software Engineer'))
    expect(await screen.findByRole('status')).toBeInTheDocument()
    expect(screen.getByText(/Memulai sesi interview untuk Software Engineer/)).toBeInTheDocument()
  })

  it('calls chat API with start_session when position is selected', async () => {
    mockChat.mockResolvedValue({
      sessionId: 'sess-123',
      type: 'question',
      content: 'Tell me about yourself.',
    })
    renderSpeakingModule()
    fireEvent.click(screen.getByLabelText('Pilih posisi Data Analyst'))
    await waitFor(() => {
      expect(mockChat).toHaveBeenCalledWith({
        action: 'start_session',
        jobPosition: 'Data Analyst',
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
    fireEvent.click(screen.getByLabelText('Pilih posisi Data Analyst'))
    expect(await screen.findByTestId('interview-question')).toHaveTextContent(
      'What experience do you have with data analysis?',
    )
    expect(screen.getByText('Posisi: Data Analyst')).toBeInTheDocument()
    expect(screen.getByTestId('session-id')).toHaveTextContent('Sesi: sess-456')
  })

  it('shows error message when API call fails', async () => {
    mockChat.mockRejectedValue(new Error('Network error'))
    renderSpeakingModule()
    fireEvent.click(screen.getByLabelText('Pilih posisi Product Manager'))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Gagal memulai sesi interview. Silakan coba lagi.',
    )
    // Should return to selection phase
    expect(screen.getByText('Pilih Posisi Pekerjaan')).toBeInTheDocument()
  })

  it('allows retrying after an error', async () => {
    mockChat.mockRejectedValueOnce(new Error('fail'))
    renderSpeakingModule()
    fireEvent.click(screen.getByLabelText('Pilih posisi Software Engineer'))
    await screen.findByRole('alert')

    mockChat.mockResolvedValue({
      sessionId: 'sess-789',
      type: 'question',
      content: 'Describe your coding experience.',
    })
    fireEvent.click(screen.getByLabelText('Pilih posisi Software Engineer'))
    expect(await screen.findByTestId('interview-question')).toHaveTextContent(
      'Describe your coding experience.',
    )
  })
})
