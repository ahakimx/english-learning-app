import { describe, it, expect, vi, beforeEach } from 'vitest'
import fc from 'fast-check'
import { login, register, logout, getCurrentAuthUser, getAccessToken } from './authService'

const mockSignIn = vi.fn()
const mockSignUp = vi.fn()
const mockSignOut = vi.fn()
const mockFetchAuthSession = vi.fn()
const mockGetCurrentUser = vi.fn()

vi.mock('aws-amplify/auth', () => ({
  signIn: (...args: unknown[]) => mockSignIn(...args),
  signUp: (...args: unknown[]) => mockSignUp(...args),
  signOut: (...args: unknown[]) => mockSignOut(...args),
  fetchAuthSession: (...args: unknown[]) => mockFetchAuthSession(...args),
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
  confirmSignUp: vi.fn(),
}))

describe('authService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('login', () => {
    it('calls signIn with email and password', async () => {
      mockSignIn.mockResolvedValue({ isSignedIn: true })
      const result = await login('user@test.com', 'password123')
      expect(mockSignIn).toHaveBeenCalledWith({ username: 'user@test.com', password: 'password123' })
      expect(result).toEqual({ isSignedIn: true })
    })

    it('throws generic error message on failure', async () => {
      mockSignIn.mockRejectedValue(new Error('NotAuthorizedException'))
      await expect(login('user@test.com', 'wrong')).rejects.toThrow('Email atau password salah')
    })

    it('throws generic error for UserNotFoundException', async () => {
      mockSignIn.mockRejectedValue(new Error('UserNotFoundException'))
      await expect(login('nouser@test.com', 'pass')).rejects.toThrow('Email atau password salah')
    })
  })

  describe('register', () => {
    it('calls signUp with email and password', async () => {
      mockSignUp.mockResolvedValue({ isSignUpComplete: false })
      const result = await register('new@test.com', 'password123')
      expect(mockSignUp).toHaveBeenCalledWith({
        username: 'new@test.com',
        password: 'password123',
        options: { userAttributes: { email: 'new@test.com' } },
      })
      expect(result).toEqual({ isSignUpComplete: false })
    })
  })

  describe('logout', () => {
    it('calls signOut', async () => {
      mockSignOut.mockResolvedValue(undefined)
      await logout()
      expect(mockSignOut).toHaveBeenCalled()
    })
  })

  describe('getCurrentAuthUser', () => {
    it('returns user when authenticated', async () => {
      mockGetCurrentUser.mockResolvedValue({ userId: 'u-1', username: 'user@test.com' })
      mockFetchAuthSession.mockResolvedValue({
        tokens: { idToken: { payload: { email: 'user@test.com' } } },
      })
      const user = await getCurrentAuthUser()
      expect(user).toEqual({ userId: 'u-1', email: 'user@test.com' })
    })

    it('returns null when not authenticated', async () => {
      mockGetCurrentUser.mockRejectedValue(new Error('not authenticated'))
      const user = await getCurrentAuthUser()
      expect(user).toBeNull()
    })
  })

  describe('getAccessToken', () => {
    it('returns token string when session exists', async () => {
      mockFetchAuthSession.mockResolvedValue({
        tokens: { accessToken: { toString: () => 'mock-token-123' } },
      })
      const token = await getAccessToken()
      expect(token).toBe('mock-token-123')
    })

    it('returns null when no session', async () => {
      mockFetchAuthSession.mockRejectedValue(new Error('no session'))
      const token = await getAccessToken()
      expect(token).toBeNull()
    })
  })
})

// Feature: english-learning-app, Property 1: Pesan error autentikasi tidak membocorkan informasi kredensial
// **Validates: Requirements 1.3**
describe('Property: Pesan error autentikasi tidak membocorkan informasi kredensial', () => {
  const GENERIC_ERROR_MESSAGE = 'Email atau password salah';

  // Cognito error types that can occur during authentication
  const cognitoErrorTypes = [
    'UserNotFoundException',
    'NotAuthorizedException',
    'UserNotConfirmedException',
    'PasswordResetRequiredException',
    'TooManyRequestsException',
    'InternalErrorException',
    'InvalidParameterException',
    'NetworkError',
    'UnknownError',
  ] as const;

  it('should always return the same generic error message regardless of credential combination or error type', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.emailAddress(),
        fc.string({ minLength: 1, maxLength: 64 }),
        fc.constantFrom(...cognitoErrorTypes),
        async (email, password, errorType) => {
          mockSignIn.mockRejectedValue(new Error(errorType));

          let caught: Error | null = null;
          try {
            await login(email, password);
          } catch (error: unknown) {
            caught = error as Error;
          }

          // login must throw when signIn rejects
          expect(caught).not.toBeNull();

          // The error message must always be the exact same generic message —
          // this guarantees no credential-specific info (email, password, or
          // underlying error type) can leak, because the message is a fixed string.
          expect(caught!.message).toBe(GENERIC_ERROR_MESSAGE);
        }
      ),
      { numRuns: 100 }
    );
  });
});


// Feature: english-learning-app, Property 2: Token logout menjadi tidak valid
// **Validates: Requirements 1.4**
describe('Property: Token logout menjadi tidak valid', () => {
  it('should invalidate token after logout — signOut is called and subsequent token/user retrieval returns null', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),                                          // random userId
        fc.string({ minLength: 10, maxLength: 128 }),       // random access token
        fc.emailAddress(),                                  // random email
        async (userId, accessToken, email) => {
          // --- Phase 1: Simulate a valid authenticated state ---
          mockFetchAuthSession.mockResolvedValue({
            tokens: {
              accessToken: { toString: () => accessToken },
              idToken: { payload: { email } },
            },
          })
          mockGetCurrentUser.mockResolvedValue({ userId, username: email })

          // Verify the token is available before logout
          const tokenBefore = await getAccessToken()
          expect(tokenBefore).toBe(accessToken)

          const userBefore = await getCurrentAuthUser()
          expect(userBefore).not.toBeNull()
          expect(userBefore!.userId).toBe(userId)

          // --- Phase 2: Perform logout ---
          mockSignOut.mockResolvedValue(undefined)

          // After logout, Cognito session is destroyed — simulate that
          // fetchAuthSession and getCurrentUser now fail / return no tokens
          mockSignOut.mockImplementation(async () => {
            mockFetchAuthSession.mockRejectedValue(new Error('No current session'))
            mockGetCurrentUser.mockRejectedValue(new Error('No current user'))
          })

          await logout()

          // signOut must have been called
          expect(mockSignOut).toHaveBeenCalled()

          // --- Phase 3: Verify token is invalidated ---
          const tokenAfter = await getAccessToken()
          expect(tokenAfter).toBeNull()

          const userAfter = await getCurrentAuthUser()
          expect(userAfter).toBeNull()
        }
      ),
      { numRuns: 100 }
    )
  })
})
