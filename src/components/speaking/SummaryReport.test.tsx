import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import SummaryReport from './SummaryReport'
import type { SummaryReport as SummaryReportType } from '../../types'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

const mockUpdateProgress = vi.fn()
vi.mock('../../services/apiClient', () => ({
  updateProgress: (...args: unknown[]) => mockUpdateProgress(...args),
}))

const baseSummary: SummaryReportType = {
  overallScore: 75,
  criteriaScores: {
    grammar: 80,
    vocabulary: 70,
    relevance: 85,
    fillerWords: 60,
    coherence: 78,
  },
  performanceTrend: [
    { questionNumber: 1, score: 65 },
    { questionNumber: 2, score: 72 },
    { questionNumber: 3, score: 80 },
  ],
  topImprovementAreas: [
    'Reduce filler words usage',
    'Expand vocabulary range',
    'Improve grammar accuracy',
  ],
  recommendations: [
    'Practice speaking without pauses',
    'Read English articles daily',
  ],
}

function renderSummaryReport(
  props?: Partial<{ summaryReport: SummaryReportType; sessionId: string; onNewSession: () => void }>,
) {
  const defaultProps = {
    summaryReport: baseSummary,
    sessionId: 'sess-abc',
    onNewSession: vi.fn(),
    ...props,
  }
  return render(
    <MemoryRouter>
      <SummaryReport {...defaultProps} />
    </MemoryRouter>,
  )
}

describe('SummaryReport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateProgress.mockResolvedValue(undefined)
  })

  it('renders the overall score prominently', () => {
    renderSummaryReport()
    const scoreEl = screen.getByTestId('overall-score')
    expect(scoreEl).toHaveTextContent('75')
    expect(screen.getByText('Skor Keseluruhan')).toBeInTheDocument()
  })

  it('renders criteria scores as progress bars', () => {
    renderSummaryReport()
    const labels = ['Grammar', 'Vocabulary', 'Relevance', 'Filler Words', 'Coherence']
    labels.forEach((label) => {
      expect(screen.getByLabelText(`${label} score`)).toBeInTheDocument()
    })
    // Check specific score values are displayed (some may appear in trend too)
    expect(screen.getAllByText('80').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('70')).toBeInTheDocument()
    expect(screen.getByText('85')).toBeInTheDocument()
    expect(screen.getByText('60')).toBeInTheDocument()
    expect(screen.getByText('78')).toBeInTheDocument()
  })

  it('renders performance trend bars', () => {
    renderSummaryReport()
    const trend = screen.getByTestId('performance-trend')
    expect(trend).toBeInTheDocument()
    expect(screen.getByTestId('trend-bar-1')).toBeInTheDocument()
    expect(screen.getByTestId('trend-bar-2')).toBeInTheDocument()
    expect(screen.getByTestId('trend-bar-3')).toBeInTheDocument()
    // Check question labels
    expect(screen.getByText('Q1')).toBeInTheDocument()
    expect(screen.getByText('Q2')).toBeInTheDocument()
    expect(screen.getByText('Q3')).toBeInTheDocument()
  })

  it('renders top improvement areas', () => {
    renderSummaryReport()
    const list = screen.getByTestId('improvement-areas')
    expect(list).toBeInTheDocument()
    expect(screen.getByText('Reduce filler words usage')).toBeInTheDocument()
    expect(screen.getByText('Expand vocabulary range')).toBeInTheDocument()
    expect(screen.getByText('Improve grammar accuracy')).toBeInTheDocument()
  })

  it('renders recommendations', () => {
    renderSummaryReport()
    const list = screen.getByTestId('recommendations')
    expect(list).toBeInTheDocument()
    expect(screen.getByText('Practice speaking without pauses')).toBeInTheDocument()
    expect(screen.getByText('Read English articles daily')).toBeInTheDocument()
  })

  it('calls onNewSession when "Mulai Sesi Baru" is clicked', () => {
    const onNewSession = vi.fn()
    renderSummaryReport({ onNewSession })
    fireEvent.click(screen.getByTestId('new-session-button'))
    expect(onNewSession).toHaveBeenCalledOnce()
  })

  it('navigates to dashboard when "Kembali ke Dashboard" is clicked', () => {
    renderSummaryReport()
    fireEvent.click(screen.getByTestId('back-to-dashboard-button'))
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
  })

  it('calls updateProgress on mount with correct data', () => {
    renderSummaryReport()
    expect(mockUpdateProgress).toHaveBeenCalledWith({
      moduleType: 'speaking',
      score: 75,
      sessionId: 'sess-abc',
    })
  })

  it('calls updateProgress only once even on re-render', () => {
    const { rerender } = render(
      <MemoryRouter>
        <SummaryReport summaryReport={baseSummary} sessionId="sess-abc" onNewSession={vi.fn()} />
      </MemoryRouter>,
    )
    rerender(
      <MemoryRouter>
        <SummaryReport summaryReport={baseSummary} sessionId="sess-abc" onNewSession={vi.fn()} />
      </MemoryRouter>,
    )
    expect(mockUpdateProgress).toHaveBeenCalledTimes(1)
  })

  it('does not crash when updateProgress fails', () => {
    mockUpdateProgress.mockRejectedValue(new Error('Network error'))
    expect(() => renderSummaryReport()).not.toThrow()
  })

  it('hides performance trend when empty', () => {
    const summary = { ...baseSummary, performanceTrend: [] }
    renderSummaryReport({ summaryReport: summary })
    expect(screen.queryByTestId('performance-trend')).not.toBeInTheDocument()
  })

  it('hides improvement areas when empty', () => {
    const summary = { ...baseSummary, topImprovementAreas: [] }
    renderSummaryReport({ summaryReport: summary })
    expect(screen.queryByTestId('improvement-areas')).not.toBeInTheDocument()
  })

  it('hides recommendations when empty', () => {
    const summary = { ...baseSummary, recommendations: [] }
    renderSummaryReport({ summaryReport: summary })
    expect(screen.queryByTestId('recommendations')).not.toBeInTheDocument()
  })
})
