import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/auth/ProtectedRoute'

// Route-level code splitting: each page is loaded on demand so the initial
// bundle stays small. Heavy modules (Speaking pulls in socket.io-client and the
// audio pipeline; others pull in their own UI) become separate chunks fetched
// only when their route is visited.
const LoginForm = lazy(() => import('./components/auth/LoginForm'))
const RegisterForm = lazy(() => import('./components/auth/RegisterForm'))
const Dashboard = lazy(() => import('./components/dashboard/Dashboard'))
const SpeakingModule = lazy(() => import('./components/speaking/SpeakingModule'))
const GrammarModule = lazy(() => import('./components/grammar/GrammarModule'))
const WritingModule = lazy(() => import('./components/writing/WritingModule'))
const ProgressPage = lazy(() => import('./components/progress/ProgressPage'))

/** Full-screen fallback shown while a lazily-loaded route chunk is fetched. */
function RouteFallback() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center"
      role="status"
      aria-label="Memuat halaman"
    >
      <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary border-t-transparent" />
    </div>
  )
}

function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/login" element={<LoginForm />} />
        <Route path="/register" element={<RegisterForm />} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/speaking" element={<ProtectedRoute><SpeakingModule /></ProtectedRoute>} />
        <Route path="/grammar" element={<ProtectedRoute><GrammarModule /></ProtectedRoute>} />
        <Route path="/writing" element={<ProtectedRoute><WritingModule /></ProtectedRoute>} />
        <Route path="/progress" element={<ProtectedRoute><ProgressPage /></ProtectedRoute>} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  )
}

export default App
