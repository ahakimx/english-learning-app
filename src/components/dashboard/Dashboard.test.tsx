import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Dashboard from './Dashboard'
import { AuthProvider } from '../../hooks/useAuth'
import type { ProgressData } from '../../types'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

const mockGetProgress = vi.fn()
vi.mock('../../services/apiClient', () => ({
  getProgress: () => mockGetProgress(),
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

const sampleProgress: ProgressData = {
  speaking: { totalSessions: 5, averageScore: 72, scoreHistory: [] },
  grammar: {
    totalQuizzes: 10,
    topicScores: { Tenses: { accuracy: 80 }, Articles: { accuracy: 60 } },
  },
  writing: { totalReviews: 3, averageScore: 65, scoreHistory: [] },
}

function renderDashboard() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Dashboard />
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetProgress.mockResolvedValue(sampleProgress)
  })

  it('renders three module cards', async () => {
    renderDashboard()
    expect(await screen.findByText('Speaking')).toBeInTheDocument()
    expect(screen.getByText('Grammar')).toBeInTheDocument()
    expect(screen.getByText('Writing')).toBeInTheDocument()
  })

  it('renders the dashboard heading', async () => {
    renderDashboard()
    expect(await screen.findByText('Dashboard')).toBeInTheDocument()
  })

  it('navigates to speaking module when card is clicked', async () => {
    renderDashboard()
    const speakingCard = await screen.findByLabelText('Buka modul Speaking')
    fireEvent.click(speakingCard)
    expect(mockNavigate).toHaveBeenCalledWith('/speaking')
  })

  it('navigates to grammar module when card is clicked', async () => {
    renderDashboard()
    const grammarCard = await screen.findByLabelText('Buka modul Grammar')
    fireEvent.click(grammarCard)
    expect(mockNavigate).toHaveBeenCalledWith('/grammar')
  })

  it('navigates to writing module when card is clicked', async () => {
    renderDashboard()
    const writingCard = await screen.findByLabelText('Buka modul Writing')
    fireEvent.click(writingCard)
    expect(mockNavigate).toHaveBeenCalledWith('/writing')
  })

  it('displays progress overview with fetched data', async () => {
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('5')).toBeInTheDocument() // speaking sessions
      expect(screen.getByText('10')).toBeInTheDocument() // grammar quizzes
      expect(screen.getByText('3')).toBeInTheDocument() // writing reviews
    })
    expect(screen.getByText('Ringkasan Progress')).toBeInTheDocument()
  })

  it('shows progress percentages on module cards', async () => {
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('72% selesai')).toBeInTheDocument() // speaking
      expect(screen.getByText('70% selesai')).toBeInTheDocument() // grammar avg(80,60)
      expect(screen.getByText('65% selesai')).toBeInTheDocument() // writing
    })
  })

  it('handles progress fetch failure gracefully', async () => {
    mockGetProgress.mockRejectedValue(new Error('Network error'))
    renderDashboard()
    // Should still render cards with 0% progress
    await waitFor(() => {
      expect(screen.getAllByText('0% selesai')).toHaveLength(3)
    })
  })

  it('displays user email in header', async () => {
    renderDashboard()
    expect(await screen.findByText('user@example.com')).toBeInTheDocument()
  })

  it('navigates to progress page when link is clicked', async () => {
    renderDashboard()
    const progressLink = await screen.findByText('Lihat Progress')
    fireEvent.click(progressLink)
    expect(mockNavigate).toHaveBeenCalledWith('/progress')
  })
})
