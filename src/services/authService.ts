import {
  signIn,
  signUp,
  signOut,
  fetchAuthSession,
  getCurrentUser,
  confirmSignUp,
  type SignInOutput,
  type SignUpOutput,
} from 'aws-amplify/auth';

export interface AuthUser {
  userId: string;
  email: string;
}

const GENERIC_AUTH_ERROR = 'Email atau password salah';

export async function login(email: string, password: string): Promise<SignInOutput> {
  try {
    // Clear any stuck sign-in state from a previous failed attempt
    try {
      await signOut();
    } catch {
      // Ignore — no active session to clear
    }
    const result = await signIn({ username: email, password });
    return result;
  } catch (err) {
    console.error('[auth] login error:', err);
    throw new Error(GENERIC_AUTH_ERROR);
  }
}

export async function register(email: string, password: string): Promise<SignUpOutput> {
  const result = await signUp({
    username: email,
    password,
    options: {
      userAttributes: { email },
    },
  });
  return result;
}

export async function confirmRegistration(email: string, code: string): Promise<void> {
  await confirmSignUp({ username: email, confirmationCode: code });
}

export async function logout(): Promise<void> {
  await signOut();
}

export async function refreshSession(): Promise<string | null> {
  const session = await fetchAuthSession({ forceRefresh: true });
  return session.tokens?.idToken?.toString() ?? null;
}

export async function getCurrentAuthUser(): Promise<AuthUser | null> {
  try {
    const user = await getCurrentUser();
    const session = await fetchAuthSession();
    const email =
      session.tokens?.idToken?.payload?.['email'] as string | undefined;
    return {
      userId: user.userId,
      email: email ?? user.username,
    };
  } catch {
    return null;
  }
}

export async function getAccessToken(): Promise<string | null> {
  try {
    const session = await fetchAuthSession();
    return session.tokens?.idToken?.toString() ?? null;
  } catch {
    return null;
  }
}
