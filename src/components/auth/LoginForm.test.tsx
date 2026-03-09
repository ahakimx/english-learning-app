import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import LoginForm from './LoginForm'
import { AuthProvider } from '../../hooks/useAuth'

const mockLogin = vi.fn()

vi.mock('../../services/authService', () => ({
  login: (...args: unknown[]) => mockLogin(...args),
  register: vi.fn(),
  logout: vi.fn(),
  getCurrentAuthUser: vi.fn(() => Promise.resolve(null)),
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

function renderLoginForm() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <LoginForm />
      </AuthProvider>
    </MemoryRouter>
  )
}

describe('LoginForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders login form with email and password fields', async () => {
    renderLoginForm()
    expect(await screen.findByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Masuk' })).toBeInTheDocument()
  })

  it('renders link to register page', async () => {
    renderLoginForm()
    expect(await screen.findByText('Daftar')).toBeInTheDocument()
  })

  it('shows generic error message on login failure', async () => {
    mockLogin.mockRejectedValue(new Error('Email atau password salah'))
    renderLoginForm()

    await screen.findByLabelText('Email')
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@test.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrongpass' } })
    fireEvent.click(screen.getByRole('button', { name: 'Masuk' }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Email atau password salah')
    })
  })

  it('disables form while loading', async () => {
    mockLogin.mockImplementation(() => new Promise(() => {})) // never resolves
    renderLoginForm()

    await screen.findByLabelText('Email')
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@test.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Masuk' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Memproses...' })).toBeDisabled()
    })
  })
})
