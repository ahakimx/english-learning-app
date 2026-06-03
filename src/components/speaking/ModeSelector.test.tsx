import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import ModeSelector from './ModeSelector'

describe('ModeSelector', () => {
  // Requirement 1.2: Mode Selector displays exactly two mode options.
  it('renders exactly 2 mode option buttons', () => {
    const onSelect = vi.fn()
    render(<ModeSelector onSelect={onSelect} />)

    // The two mode cards have aria-labels starting with "Pilih Mode".
    const modeButtons = screen.getAllByRole('button', { name: /^Pilih Mode / })
    expect(modeButtons).toHaveLength(2)

    // Both named options are present.
    expect(screen.getByRole('button', { name: /Pilih Mode Cepat/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Pilih Mode Targeted/i })).toBeInTheDocument()
  })

  // Requirement 1.5: Quick Mode is pre-selected as the default on mount.
  it('pre-selects Quick Mode on mount (aria-pressed)', () => {
    const onSelect = vi.fn()
    render(<ModeSelector onSelect={onSelect} />)

    const quickButton = screen.getByRole('button', { name: /Pilih Mode Cepat/i })
    const targetedButton = screen.getByRole('button', { name: /Pilih Mode Targeted/i })

    expect(quickButton).toHaveAttribute('aria-pressed', 'true')
    expect(targetedButton).toHaveAttribute('aria-pressed', 'false')
  })

  // Requirement 1.3, 1.4, 1.9: Labels and descriptions rendered in Indonesian.
  it('renders Indonesian labels and descriptions for both modes', () => {
    const onSelect = vi.fn()
    render(<ModeSelector onSelect={onSelect} />)

    // Titles
    expect(screen.getByText('Mode Cepat')).toBeInTheDocument()
    expect(screen.getByText('Mode Targeted')).toBeInTheDocument()

    // Descriptions
    expect(
      screen.getByText('Pilih posisi dan mulai interview dengan pertanyaan generik'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Tempel deskripsi pekerjaan untuk interview yang disesuaikan'),
    ).toBeInTheDocument()
  })

  // Requirement 1.9: Advance callback receives the default selected mode ('quick').
  it('calls onSelect with "quick" when Lanjutkan is clicked on default state', () => {
    const onSelect = vi.fn()
    render(<ModeSelector onSelect={onSelect} />)

    fireEvent.click(screen.getByRole('button', { name: /Lanjutkan dengan mode yang dipilih/i }))

    expect(onSelect).toHaveBeenCalledOnce()
    expect(onSelect).toHaveBeenCalledWith('quick')
  })

  // Requirement 1.9: Advance callback receives the selected mode after switching to Targeted.
  it('calls onSelect with "targeted" after selecting Mode Targeted then clicking Lanjutkan', () => {
    const onSelect = vi.fn()
    render(<ModeSelector onSelect={onSelect} />)

    // Select Mode Targeted card
    fireEvent.click(screen.getByRole('button', { name: /Pilih Mode Targeted/i }))

    // aria-pressed should now reflect the new selection
    expect(screen.getByRole('button', { name: /Pilih Mode Targeted/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: /Pilih Mode Cepat/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    )

    fireEvent.click(screen.getByRole('button', { name: /Lanjutkan dengan mode yang dipilih/i }))

    expect(onSelect).toHaveBeenCalledOnce()
    expect(onSelect).toHaveBeenCalledWith('targeted')
  })

  // Disabled prop disables the advance control.
  it('disables the Lanjutkan button when disabled=true is passed', () => {
    const onSelect = vi.fn()
    render(<ModeSelector onSelect={onSelect} disabled={true} />)

    const continueButton = screen.getByRole('button', {
      name: /Lanjutkan dengan mode yang dipilih/i,
    })
    expect(continueButton).toBeDisabled()
  })
})
