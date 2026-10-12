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
      expect(await screen.findByText('SpeakReady')).toBeInTheDocument()
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

  describe('when not authenticated (landing page view)', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        user: null,
        isAuthenticated: false,
        loading: false,
      })
    })

    it('renders landing page without redirecting', async () => {
      renderDashboard()
      // Check for header brand name (first one)
      const brands = await screen.findAllByText('SpeakReady')
      expect(brands.length).toBeGreaterThan(0)
    })

    it('displays Login button in header', async () => {
      renderDashboard()
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument()
      })
    })

    it('does not call getProgress API when unauthenticated', async () => {
      renderDashboard()
      // Just wait for render to complete
      await waitFor(() => {
        expect(document.getElementById('hero')).toBeInTheDocument()
      })
      expect(mockGetProgress).not.toHaveBeenCalled()
    })

    it('navigates to /login when Login button is clicked', async () => {
      renderDashboard()
      const loginButton = await screen.findByRole('button', { name: 'Login' })
      fireEvent.click(loginButton)
      expect(mockNavigate).toHaveBeenCalledWith('/login')
    })

    it('renders HeroSection with headline and CTA buttons', async () => {
      renderDashboard()
      await waitFor(() => {
        // HeroSection headline
        expect(screen.getByText(/Latihan Interview Bahasa Inggris dengan/)).toBeInTheDocument()
        // Multiple "Mulai Latihan Gratis" buttons exist (hero, final CTA, sticky CTA)
        const ctaButtons = screen.getAllByText('Mulai Latihan Gratis')
        expect(ctaButtons.length).toBeGreaterThan(0)
      })
    })

    it('renders all landing page sections', async () => {
      renderDashboard()
      await waitFor(() => {
        // Check for key section elements by their IDs
        expect(document.getElementById('hero')).toBeInTheDocument()
        expect(document.getElementById('social-proof')).toBeInTheDocument()
        expect(document.getElementById('how-it-works')).toBeInTheDocument()
        expect(document.getElementById('features')).toBeInTheDocument()
        expect(document.getElementById('stats')).toBeInTheDocument()
        expect(document.getElementById('tech-stack')).toBeInTheDocument()
        expect(document.getElementById('comparison')).toBeInTheDocument()
        expect(document.getElementById('pricing')).toBeInTheDocument()
        expect(document.getElementById('about')).toBeInTheDocument()
        expect(document.getElementById('faq')).toBeInTheDocument()
        expect(document.getElementById('final-cta')).toBeInTheDocument()
      })
    })

    it('navigates to /register when hero CTA is clicked', async () => {
      renderDashboard()
      // Get the first "Mulai Latihan Gratis" button (in hero section)
      const ctaButtons = await screen.findAllByText('Mulai Latihan Gratis')
      fireEvent.click(ctaButtons[0])
      expect(mockNavigate).toHaveBeenCalledWith('/register')
    })

    it('does not render sidebar for unauthenticated users', async () => {
      renderDashboard()
      await waitFor(() => {
        expect(document.getElementById('hero')).toBeInTheDocument()
      })
      // Sidebar element (aside) should not be present
      expect(document.querySelector('aside')).not.toBeInTheDocument()
    })

    it('does not render FAB for unauthenticated users', async () => {
      renderDashboard()
      await waitFor(() => {
        expect(document.getElementById('hero')).toBeInTheDocument()
      })
      expect(screen.queryByLabelText('Mulai interview baru')).not.toBeInTheDocument()
    })

    it('renders StickyCTA component (initially hidden)', async () => {
      renderDashboard()
      await waitFor(() => {
        // StickyCTA is rendered but not visible (opacity-0, translate-y-full)
        const stickyCTA = screen.getByTestId('sticky-cta')
        expect(stickyCTA).toBeInTheDocument()
        expect(stickyCTA).toHaveClass('opacity-0')
      })
    })
  })
})
