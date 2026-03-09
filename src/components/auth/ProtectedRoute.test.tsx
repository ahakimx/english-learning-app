import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import ProtectedRoute from './ProtectedRoute'
import { AuthProvider } from '../../hooks/useAuth'

let mockUser: { userId: string; email: string } | null = null

vi.mock('../../services/authService', () => ({
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  getCurrentAuthUser: vi.fn(() => Promise.resolve(mockUser)),
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

function renderProtectedRoute() {
  return render(
    <MemoryRouter initialEntries={['/protected']}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route
            path="/protected"
            element={
              <ProtectedRoute>
                <div>Protected Content</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  )
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    mockUser = null
  })

  it('redirects to login when not authenticated', async () => {
    renderProtectedRoute()
    expect(await screen.findByText('Login Page')).toBeInTheDocument()
  })

  it('renders children when authenticated', async () => {
    mockUser = { userId: 'u-1', email: 'test@test.com' }
    renderProtectedRoute()
    expect(await screen.findByText('Protected Content')).toBeInTheDocument()
  })

  it('shows loading state while checking auth', () => {
    // The loading state is shown briefly before auth check resolves
    renderProtectedRoute()
    expect(screen.getByText('Memuat...')).toBeInTheDocument()
  })
})
