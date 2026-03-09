import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import ProgressPage from './ProgressPage'
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

const sampleProgress: ProgressData = {
  speaking: {
    totalSessions: 8,
    averageScore: 75,
    scoreHistory: [
      { date: '2024-01-10', score: 70 },
      { date: '2024-01-15', score: 80 },
    ],
  },
  grammar: {
    totalQuizzes: 12,
    topicScores: {
      Tenses: { accuracy: 85 },
      Articles: { accuracy: 60 },
    },
  },
  writing: {
    totalReviews: 5,
    averageScore: 68,
    scoreHistory: [
      { date: '2024-01-12', score: 65 },
      { date: '2024-01-18', score: 71 },
    ],
  },
}

function renderProgressPage() {
  return render(
    <MemoryRouter>
      <ProgressPage />
    </MemoryRouter>,
  )
}

describe('ProgressPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetProgress.mockResolvedValue(sampleProgress)
  })

  it('shows loading state initially', () => {
    mockGetProgress.mockReturnValue(new Promise(() => {})) // never resolves
    renderProgressPage()
    expect(screen.getByText('Memuat data progress...')).toBeInTheDocument()
  })

  it('displays summary statistics after loading', async () => {
    renderProgressPage()
    await waitFor(() => {
      expect(screen.getByText('8')).toBeInTheDocument()
    })
    expect(screen.getByText('75')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('displays stat labels in Indonesian', async () => {
    renderProgressPage()
    await waitFor(() => {
      expect(screen.getByText('Total Sesi Interview')).toBeInTheDocument()
    })
    expect(screen.getByText('Rata-rata Skor Speaking')).toBeInTheDocument()
    expect(screen.getByText('Jumlah Quiz Grammar')).toBeInTheDocument()
    expect(screen.getByText('Tulisan Di-review')).toBeInTheDocument()
    expect(screen.getByText('Rata-rata Skor Writing')).toBeInTheDocument()
  })

  it('displays grammar topic scores breakdown', async () => {
    renderProgressPage()
    await waitFor(() => {
      expect(screen.getByText('Skor per Topik Grammar')).toBeInTheDocument()
    })
    expect(screen.getByText('Tenses')).toBeInTheDocument()
    expect(screen.getByText('85%')).toBeInTheDocument()
    expect(screen.getByText('Articles')).toBeInTheDocument()
    expect(screen.getByText('60%')).toBeInTheDocument()
  })

  it('displays score history charts', async () => {
    renderProgressPage()
    await waitFor(() => {
      expect(screen.getByText('Riwayat Skor Speaking')).toBeInTheDocument()
    })
    expect(screen.getByText('Riwayat Skor Writing')).toBeInTheDocument()
  })

  it('displays writing average score', async () => {
    renderProgressPage()
    await waitFor(() => {
      expect(screen.getByText('68')).toBeInTheDocument()
    })
  })

  it('navigates to dashboard when button is clicked', async () => {
    renderProgressPage()
    const button = await screen.findByText('Kembali ke Dashboard')
    fireEvent.click(button)
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
  })

  it('shows error state when API fails', async () => {
    mockGetProgress.mockRejectedValue(new Error('Network error'))
    renderProgressPage()
    await waitFor(() => {
      expect(screen.getByText('Gagal memuat data progress. Silakan coba lagi.')).toBeInTheDocument()
    })
  })

  it('shows dashboard button on error state', async () => {
    mockGetProgress.mockRejectedValue(new Error('fail'))
    renderProgressPage()
    const button = await screen.findByText('Kembali ke Dashboard')
    fireEvent.click(button)
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
  })
})
