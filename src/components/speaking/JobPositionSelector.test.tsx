import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import JobPositionSelector from './JobPositionSelector'
import { JOB_POSITIONS } from './JobPositionSelector'

describe('JobPositionSelector', () => {
  // Requirement 1.1: Verify exactly 7 positions rendered
  it('renders exactly 7 position buttons', () => {
    const onSelect = vi.fn()
    render(<JobPositionSelector onSelect={onSelect} />)

    const positionButtons = JOB_POSITIONS.map((pos) =>
      screen.getByLabelText(`Pilih posisi ${pos.title}`)
    )
    expect(positionButtons).toHaveLength(7)
  })

  // Requirement 1.1, 1.3: DevOps Engineer with correct icon
  it('renders DevOps Engineer button with 🔧 icon', () => {
    const onSelect = vi.fn()
    render(<JobPositionSelector onSelect={onSelect} />)

    const button = screen.getByLabelText('Pilih posisi DevOps Engineer')
    expect(button).toBeInTheDocument()
    expect(button.textContent).toContain('🔧')
    expect(button.textContent).toContain('DevOps Engineer')
  })

  // Requirement 1.1, 1.3: Cloud Engineer with correct icon
  it('renders Cloud Engineer button with ☁️ icon', () => {
    const onSelect = vi.fn()
    render(<JobPositionSelector onSelect={onSelect} />)

    const button = screen.getByLabelText('Pilih posisi Cloud Engineer')
    expect(button).toBeInTheDocument()
    expect(button.textContent).toContain('☁️')
    expect(button.textContent).toContain('Cloud Engineer')
  })

  // Requirement 3.2: Back button from seniority step returns to position step
  it('back button from seniority step returns to position step', () => {
    const onSelect = vi.fn()
    render(<JobPositionSelector onSelect={onSelect} />)

    // Select a position to go to seniority step
    fireEvent.click(screen.getByLabelText('Pilih posisi Software Engineer'))
    expect(screen.getByText('Pilih Tingkat Pengalaman')).toBeInTheDocument()

    // Click back button
    fireEvent.click(screen.getByLabelText('Kembali ke pilihan posisi'))

    // Should be back at position step
    expect(screen.getByText('Pilih Posisi Pekerjaan')).toBeInTheDocument()
    expect(screen.queryByText('Pilih Tingkat Pengalaman')).not.toBeInTheDocument()
  })

  // Back button from category step returns to seniority step
  it('back button from category step returns to seniority step', () => {
    const onSelect = vi.fn()
    render(<JobPositionSelector onSelect={onSelect} />)

    // Navigate to category step
    fireEvent.click(screen.getByLabelText('Pilih posisi Data Analyst'))
    fireEvent.click(screen.getByLabelText('Pilih tingkat Senior'))
    expect(screen.getByText('Pilih Kategori Pertanyaan')).toBeInTheDocument()

    // Click back button
    fireEvent.click(screen.getByLabelText('Kembali ke pilihan tingkat pengalaman'))

    // Should be back at seniority step
    expect(screen.getByText('Pilih Tingkat Pengalaman')).toBeInTheDocument()
    expect(screen.queryByText('Pilih Kategori Pertanyaan')).not.toBeInTheDocument()
  })

  // Requirement 3.2: General category shows behavioral/soft skills description
  it('General category shows description about behavioral and soft skills', () => {
    const onSelect = vi.fn()
    render(<JobPositionSelector onSelect={onSelect} />)

    // Navigate to category step
    fireEvent.click(screen.getByLabelText('Pilih posisi Product Manager'))
    fireEvent.click(screen.getByLabelText('Pilih tingkat Menengah'))

    expect(screen.getByText('Pertanyaan perilaku, soft skills, dan motivasi')).toBeInTheDocument()
  })

  // Requirement 3.3: Technical category shows role-specific description
  it('Technical category shows description about role-specific technical questions', () => {
    const onSelect = vi.fn()
    render(<JobPositionSelector onSelect={onSelect} />)

    // Navigate to category step
    fireEvent.click(screen.getByLabelText('Pilih posisi UI/UX Designer'))
    fireEvent.click(screen.getByLabelText('Pilih tingkat Lead'))

    expect(screen.getByText('Pertanyaan teknis sesuai posisi dan tingkat pengalaman')).toBeInTheDocument()
  })

  // Full flow: position → seniority → category calls onSelect with correct arguments
  it('completing full flow calls onSelect with correct arguments', () => {
    const onSelect = vi.fn()
    render(<JobPositionSelector onSelect={onSelect} />)

    // Step 1: Select position
    fireEvent.click(screen.getByLabelText('Pilih posisi DevOps Engineer'))

    // Step 2: Select seniority
    fireEvent.click(screen.getByLabelText('Pilih tingkat Senior'))

    // Step 3: Select category
    fireEvent.click(screen.getByLabelText('Pilih kategori Teknis'))

    expect(onSelect).toHaveBeenCalledOnce()
    expect(onSelect).toHaveBeenCalledWith('DevOps Engineer', 'senior', 'technical')
  })
})
