import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import App from './App'
import { AuthProvider } from './hooks/useAuth'

// Mock aws-amplify/auth
vi.mock('aws-amplify/auth', () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  fetchAuthSession: vi.fn(),
  getCurrentUser: vi.fn(),
  confirmSignUp: vi.fn(),
}))

// Helper to control auth state in tests
let mockUser: { userId: string; email: string } | null = null

vi.mock('./services/authService', () => ({
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  getCurrentAuthUser: vi.fn(() => Promise.resolve(mockUser)),
  getAccessToken: vi.fn(() => Promise.resolve(null)),
}))

vi.mock('./services/apiClient', () => ({
  getProgress: vi.fn(() => Promise.resolve({
    speaking: { totalSessions: 0, averageScore: 0, scoreHistory: [] },
    grammar: { totalQuizzes: 0, topicScores: {} },
    writing: { totalReviews: 0, averageScore: 0, scoreHistory: [] },
  })),
}))

function renderWithAuth(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>
  )
}

describe('App Routing', () => {
  beforeEach(() => {
    mockUser = null
  })

  it('renders login page at /login', async () => {
    renderWithAuth('/login')
    expect(await screen.findByRole('heading', { name: 'Masuk' })).toBeInTheDocument()
  })

  it('renders register page at /register', async () => {
    renderWithAuth('/register')
    expect(await screen.findByRole('heading', { name: 'Daftar' })).toBeInTheDocument()
  })

  it('redirects unauthenticated users to login for protected routes', async () => {
    renderWithAuth('/dashboard')
    expect(await screen.findByRole('heading', { name: 'Masuk' })).toBeInTheDocument()
  })

  it('renders dashboard when authenticated', async () => {
    mockUser = { userId: 'user-1', email: 'test@example.com' }
    renderWithAuth('/dashboard')
    expect(await screen.findByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Speaking' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Grammar' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Writing' })).toBeInTheDocument()
  })

  it('renders module pages when authenticated', async () => {
    mockUser = { userId: 'user-1', email: 'test@example.com' }
    const routes = [
      { path: '/speaking', text: 'Speaking Module' },
      { path: '/grammar', text: 'Grammar Module' },
      { path: '/writing', text: 'Writing Module' },
      { path: '/progress', text: 'Progress Belajar' },
    ]
    for (const { path, text } of routes) {
      const { unmount } = renderWithAuth(path)
      expect(await screen.findByText(text)).toBeInTheDocument()
      unmount()
    }
  })

  it('redirects unknown routes to dashboard (then login if unauthenticated)', async () => {
    renderWithAuth('/unknown-route')
    expect(await screen.findByRole('heading', { name: 'Masuk' })).toBeInTheDocument()
  })
})
