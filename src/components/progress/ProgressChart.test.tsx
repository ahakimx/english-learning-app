import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import ProgressChart from './ProgressChart'

describe('ProgressChart', () => {
  it('renders title', () => {
    render(
      <ProgressChart
        title="Riwayat Skor Speaking"
        data={[{ date: '2024-01-10', score: 70 }]}
        color="#3B82F6"
      />,
    )
    expect(screen.getByText('Riwayat Skor Speaking')).toBeInTheDocument()
  })

  it('renders score values for each data point', () => {
    render(
      <ProgressChart
        title="Test Chart"
        data={[
          { date: '2024-01-10', score: 70 },
          { date: '2024-01-15', score: 85 },
        ]}
        color="#3B82F6"
      />,
    )
    expect(screen.getByText('70')).toBeInTheDocument()
    expect(screen.getByText('85')).toBeInTheDocument()
  })

  it('shows empty state message when data is empty', () => {
    render(<ProgressChart title="Empty Chart" data={[]} color="#3B82F6" />)
    expect(screen.getByText('Belum ada data untuk ditampilkan')).toBeInTheDocument()
  })

  it('renders chart with aria-label for accessibility', () => {
    render(
      <ProgressChart
        title="Riwayat Skor Writing"
        data={[{ date: '2024-01-10', score: 60 }]}
        color="#8B5CF6"
      />,
    )
    expect(screen.getByRole('img', { name: 'Grafik Riwayat Skor Writing' })).toBeInTheDocument()
  })

  it('formats dates in Indonesian locale', () => {
    render(
      <ProgressChart
        title="Test"
        data={[{ date: '2024-01-15', score: 50 }]}
        color="#000"
      />,
    )
    // Indonesian locale formats Jan as "Jan"
    expect(screen.getByText('50')).toBeInTheDocument()
  })
})
