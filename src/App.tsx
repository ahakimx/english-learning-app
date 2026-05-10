import { Routes, Route, Navigate } from 'react-router-dom'
import LoginForm from './components/auth/LoginForm'
import RegisterForm from './components/auth/RegisterForm'
import ProtectedRoute from './components/auth/ProtectedRoute'
import Dashboard from './components/dashboard/Dashboard'
import SpeakingModule from './components/speaking/SpeakingModule'
import GrammarModule from './components/grammar/GrammarModule'
import WritingModule from './components/writing/WritingModule'
import ProgressPage from './components/progress/ProgressPage'

function App() {
  return (
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
  )
}

export default App
// cache bust 1777604264
