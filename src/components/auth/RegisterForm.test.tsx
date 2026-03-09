import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import RegisterForm from './RegisterForm'
import { AuthProvider } from '../../hooks/useAuth'

const mockRegister = vi.fn()

vi.mock('../../services/authService', () => ({
  login: vi.fn(),
  register: (...args: unknown[]) => mockRegister(...args),
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

function renderRegisterForm() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <RegisterForm />
      </AuthProvider>
    </MemoryRouter>
  )
}

describe('RegisterForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders registration form with all fields', async () => {
    renderRegisterForm()
    expect(await screen.findByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.getByLabelText('Konfirmasi Password')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Daftar' })).toBeInTheDocument()
  })

  it('renders link to login page', async () => {
    renderRegisterForm()
    expect(await screen.findByText('Masuk')).toBeInTheDocument()
  })

  it('shows error when passwords do not match', async () => {
    renderRegisterForm()

    await screen.findByLabelText('Email')
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@test.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
    fireEvent.change(screen.getByLabelText('Konfirmasi Password'), { target: { value: 'different' } })
    fireEvent.click(screen.getByRole('button', { name: 'Daftar' }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Password tidak cocok')
    })
  })

  it('shows error when password is too short', async () => {
    renderRegisterForm()

    await screen.findByLabelText('Email')
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@test.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'short' } })
    fireEvent.change(screen.getByLabelText('Konfirmasi Password'), { target: { value: 'short' } })
    fireEvent.click(screen.getByRole('button', { name: 'Daftar' }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Password minimal 8 karakter')
    })
  })

  it('shows success message after successful registration', async () => {
    mockRegister.mockResolvedValue({ isSignUpComplete: false })
    renderRegisterForm()

    await screen.findByLabelText('Email')
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@test.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
    fireEvent.change(screen.getByLabelText('Konfirmasi Password'), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Daftar' }))

    await waitFor(() => {
      expect(screen.getByText('Registrasi Berhasil')).toBeInTheDocument()
    })
  })
})
