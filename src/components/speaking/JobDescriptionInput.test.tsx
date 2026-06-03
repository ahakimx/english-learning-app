import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import JobDescriptionInput from './JobDescriptionInput';
import { JD_MIN_LENGTH, JD_MAX_LENGTH } from './jdConstants';

/**
 * Unit tests for JobDescriptionInput.
 *
 * Covers:
 * - Requirement 2.2: visible character counter showing current length and JD_Max_Length
 * - Requirement 2.4: over-limit disables submit and shows an error message
 * - Requirement 2.6: Back control returns without calling the Analyze_JD_Action
 * - Supporting coverage for 2.3 (under-min disables submit) and 2.5 (valid submit path)
 */

function renderComponent(
  overrides: Partial<{
    initialValue: string;
    onSubmit: (text: string) => void;
    onBack: () => void;
    disabled: boolean;
  }> = {},
) {
  const onSubmit = overrides.onSubmit ?? vi.fn();
  const onBack = overrides.onBack ?? vi.fn();
  const utils = render(
    <JobDescriptionInput
      initialValue={overrides.initialValue}
      onSubmit={onSubmit}
      onBack={onBack}
      disabled={overrides.disabled}
    />,
  );
  return { ...utils, onSubmit, onBack };
}

function getTextarea(): HTMLTextAreaElement {
  return screen.getByLabelText(/deskripsi pekerjaan untuk dianalisis/i) as HTMLTextAreaElement;
}

function getSubmitButton(): HTMLButtonElement {
  return screen.getByRole('button', {
    name: /analisis deskripsi pekerjaan/i,
  }) as HTMLButtonElement;
}

describe('JobDescriptionInput - counter formatting (Requirement 2.2)', () => {
  it('shows "0 / 10000" when the input is initially empty', () => {
    renderComponent();
    expect(screen.getByText(`0 / ${JD_MAX_LENGTH}`)).toBeInTheDocument();
  });

  it('updates the counter to match the current length after typing', () => {
    renderComponent();
    const textarea = getTextarea();
    const text = 'a'.repeat(123);

    fireEvent.change(textarea, { target: { value: text } });

    expect(screen.getByText(`123 / ${JD_MAX_LENGTH}`)).toBeInTheDocument();
  });

  it('displays the counter using the "<length> / <max>" format at the max boundary', () => {
    renderComponent();
    const textarea = getTextarea();
    fireEvent.change(textarea, { target: { value: 'a'.repeat(JD_MAX_LENGTH) } });

    expect(
      screen.getByText(`${JD_MAX_LENGTH} / ${JD_MAX_LENGTH}`),
    ).toBeInTheDocument();
  });
});

describe('JobDescriptionInput - Back control (Requirement 2.6)', () => {
  it('does not call onSubmit and calls onBack exactly once when the top Back link is clicked', () => {
    const onSubmit = vi.fn();
    const onBack = vi.fn();
    renderComponent({ onSubmit, onBack });

    const backLink = screen.getByRole('button', {
      name: /kembali ke pilihan mode$/i,
    });
    fireEvent.click(backLink);

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does not call onSubmit and calls onBack exactly once when the action-row Back button is clicked', () => {
    const onSubmit = vi.fn();
    const onBack = vi.fn();
    renderComponent({ onSubmit, onBack });

    const backButton = screen.getByRole('button', {
      name: /kembali ke pilihan mode tanpa menganalisis jd/i,
    });
    fireEvent.click(backButton);

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('JobDescriptionInput - over-limit message (Requirement 2.4)', () => {
  it('shows the over-limit alert when the text exceeds JD_Max_Length', () => {
    renderComponent();
    const textarea = getTextarea();

    // Initially, the alert should not be present.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    fireEvent.change(textarea, { target: { value: 'a'.repeat(JD_MAX_LENGTH + 1) } });

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(/JD melebihi batas 10\.000 karakter/i);
  });

  it('marks the textarea as invalid when over the limit', () => {
    renderComponent();
    const textarea = getTextarea();
    fireEvent.change(textarea, { target: { value: 'a'.repeat(JD_MAX_LENGTH + 1) } });

    expect(textarea).toHaveAttribute('aria-invalid', 'true');
  });

  it('hides the over-limit alert once the text returns within the allowed range', () => {
    renderComponent();
    const textarea = getTextarea();

    fireEvent.change(textarea, { target: { value: 'a'.repeat(JD_MAX_LENGTH + 5) } });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    fireEvent.change(textarea, { target: { value: 'a'.repeat(JD_MAX_LENGTH) } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('JobDescriptionInput - submit button enablement', () => {
  it('disables the submit button when the length is below JD_Min_Length', () => {
    renderComponent();
    const textarea = getTextarea();
    fireEvent.change(textarea, { target: { value: 'a'.repeat(50) } });

    expect(getSubmitButton()).toBeDisabled();
  });

  it('enables the submit button when the length equals JD_Min_Length exactly', () => {
    renderComponent();
    const textarea = getTextarea();
    fireEvent.change(textarea, { target: { value: 'a'.repeat(JD_MIN_LENGTH) } });

    expect(getSubmitButton()).toBeEnabled();
  });

  it('disables the submit button when the length exceeds JD_Max_Length', () => {
    renderComponent();
    const textarea = getTextarea();
    fireEvent.change(textarea, { target: { value: 'a'.repeat(JD_MAX_LENGTH + 1) } });

    expect(getSubmitButton()).toBeDisabled();
  });
});

describe('JobDescriptionInput - valid submit', () => {
  it('calls onSubmit with the entered text when Analisis is clicked with valid length', () => {
    const onSubmit = vi.fn();
    const onBack = vi.fn();
    renderComponent({ onSubmit, onBack });

    const textarea = getTextarea();
    const text = 'a'.repeat(200);
    fireEvent.change(textarea, { target: { value: text } });

    fireEvent.click(getSubmitButton());

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(text);
    expect(onBack).not.toHaveBeenCalled();
  });
});

describe('JobDescriptionInput - initialValue round-trip', () => {
  it('pre-fills the textarea and counter from initialValue', () => {
    renderComponent({ initialValue: 'hello' });

    const textarea = getTextarea();
    expect(textarea.value).toBe('hello');
    expect(screen.getByText(`5 / ${JD_MAX_LENGTH}`)).toBeInTheDocument();
  });
});
