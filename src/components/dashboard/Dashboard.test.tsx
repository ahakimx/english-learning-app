import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Dashboard from './Dashboard'
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

// Mock useAuth to control authentication state
const mockUseAuth = vi.fn()
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
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
      <Dashboard />
    </MemoryRouter>,
  )
}

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetProgress.mockResolvedValue(sampleProgress)
    // Default to authenticated state
    mockUseAuth.mockReturnValue({
      user: { userId: 'u1', email: 'user@example.com' },
      isAuthenticated: true,
      loading: false,
    })
  })

  describe('when authenticated', () => {
    it('renders the app title', async () => {
      renderDashboard()
      expect(await screen.findByText('InterviewPrep Pro')).toBeInTheDocument()
    })

    it('renders three module cards in sidebar', async () => {
      renderDashboard()
      // Sidebar navigation items
      expect(await screen.findByText('Speaking')).toBeInTheDocument()
      expect(screen.getByText('Grammar')).toBeInTheDocument()
      expect(screen.getByText('Writing')).toBeInTheDocument()
    })

    it('displays user avatar with email initial when authenticated', async () => {
      renderDashboard()
      // Should show 'U' as first character of 'user@example.com' uppercase
      await waitFor(() => {
        const avatars = screen.getAllByText('U')
        expect(avatars.length).toBeGreaterThan(0)
      })
    })

    it('does not show Login button when authenticated', async () => {
      renderDashboard()
      await waitFor(() => {
        expect(screen.queryByRole('button', { name: 'Login' })).not.toBeInTheDocument()
      })
    })

    it('fetches progress data when authenticated', async () => {
      renderDashboard()
      await waitFor(() => {
        expect(mockGetProgress).toHaveBeenCalled()
      })
    })

    it('displays progress data after fetch', async () => {
      renderDashboard()
      await waitFor(() => {
        // Check for total practice count (5 + 10 + 3 = 18)
        expect(screen.getByText('18')).toBeInTheDocument()
      })
    })

    it('navigates to speaking module when Continue button is clicked', async () => {
      renderDashboard()
      const continueButtons = await screen.findAllByText('Continue')
      fireEvent.click(continueButtons[0]) // First Continue button is for Speaking
      expect(mockNavigate).toHaveBeenCalledWith('/speaking')
    })

    it('navigates to grammar module when Continue button is clicked', async () => {
      renderDashboard()
      const continueButtons = await screen.findAllByText('Continue')
      fireEvent.click(continueButtons[1]) // Second Continue button is for Grammar
      expect(mockNavigate).toHaveBeenCalledWith('/grammar')
    })

    it('navigates to writing module when Continue button is clicked', async () => {
      renderDashboard()
      const continueButtons = await screen.findAllByText('Continue')
      fireEvent.click(continueButtons[2]) // Third Continue button is for Writing
      expect(mockNavigate).toHaveBeenCalledWith('/writing')
    })

    it('handles progress fetch failure gracefully with default values', async () => {
      mockGetProgress.mockRejectedValue(new Error('Network error'))
      renderDashboard()
      // Should still render with zero progress
      await waitFor(() => {
        // Total practice should be 0 (multiple 0s may exist)
        const zeros = screen.getAllByText('0')
        expect(zeros.length).toBeGreaterThan(0)
      })
    })

    it('navigates to progress page when arrow button is clicked', async () => {
      renderDashboard()
      const arrowButton = await screen.findByText('→')
      fireEvent.click(arrowButton)
      expect(mockNavigate).toHaveBeenCalledWith('/progress')
    })

    it('navigates to speaking when FAB is clicked', async () => {
      renderDashboard()
      const fab = await screen.findByLabelText('Mulai interview baru')
      fireEvent.click(fab)
      expect(mockNavigate).toHaveBeenCalledWith('/speaking')
    })

    it('displays avatar with default character when email is unavailable', async () => {
      mockUseAuth.mockReturnValue({
        user: { userId: 'u1', email: '' },
        isAuthenticated: true,
        loading: false,
      })
      renderDashboard()
      // When email is empty, avatar should show 'U' as fallback
      // The avatar is inside a div with specific classes
      await waitFor(() => {
        // Look for avatar container with 'U' text
        const avatar = screen.getByText('U')
        expect(avatar).toBeInTheDocument()
        expect(avatar.className).toContain('rounded-full')
      })
    })
  })

  describe('when not authenticated (public access)', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        user: null,
        isAuthenticated: false,
        loading: false,
      })
    })

    it('renders dashboard without redirecting', async () => {
      renderDashboard()
      expect(await screen.findByText('InterviewPrep Pro')).toBeInTheDocument()
    })

    it('displays Login button instead of avatar', async () => {
      renderDashboard()
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument()
      })
    })

    it('does not call getProgress API when unauthenticated', async () => {
      renderDashboard()
      await waitFor(() => {
        expect(screen.getByText('InterviewPrep Pro')).toBeInTheDocument()
      })
      expect(mockGetProgress).not.toHaveBeenCalled()
    })

    it('displays default zero progress values', async () => {
      renderDashboard()
      await waitFor(() => {
        // Overall score should be 0%
        expect(screen.getByText('0%')).toBeInTheDocument()
        // Multiple zeros exist (totalPractice, totalSessions, etc.)
        const zeros = screen.getAllByText('0')
        expect(zeros.length).toBeGreaterThan(0)
      })
    })

    it('navigates to /login when Login button is clicked', async () => {
      renderDashboard()
      const loginButton = await screen.findByRole('button', { name: 'Login' })
      fireEvent.click(loginButton)
      expect(mockNavigate).toHaveBeenCalledWith('/login')
    })

    it('still allows navigation to module routes (will be caught by ProtectedRoute)', async () => {
      renderDashboard()
      const continueButtons = await screen.findAllByText('Continue')
      fireEvent.click(continueButtons[0])
      expect(mockNavigate).toHaveBeenCalledWith('/speaking')
    })

    it('FAB still navigates to speaking (will be caught by ProtectedRoute)', async () => {
      renderDashboard()
      const fab = await screen.findByLabelText('Mulai interview baru')
      fireEvent.click(fab)
      expect(mockNavigate).toHaveBeenCalledWith('/speaking')
    })

    it('renders module cards with zero progress', async () => {
      renderDashboard()
      await waitFor(() => {
        // All module cards should show 0% Done
        const doneLabels = screen.getAllByText('0% Done')
        expect(doneLabels.length).toBe(3)
      })
    })
  })
})
