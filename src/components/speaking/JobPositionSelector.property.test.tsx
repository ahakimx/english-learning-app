import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { JOB_POSITIONS } from './JobPositionSelector';

/**
 * Feature: interview-position-enhancement
 * Property 1: All positions have distinct icons
 *
 * Validates: Requirements 1.3
 */
describe('Feature: interview-position-enhancement, Property 1: All positions have distinct icons', () => {
  it('should have a non-empty icon for every position', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...JOB_POSITIONS),
        (position) => {
          expect(position.icon).toBeDefined();
          expect(typeof position.icon).toBe('string');
          expect(position.icon.trim().length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should have distinct icons for any two different positions', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...JOB_POSITIONS),
        fc.constantFrom(...JOB_POSITIONS),
        (posA, posB) => {
          if (posA.id !== posB.id) {
            expect(posA.icon).not.toBe(posB.icon);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { vi } from 'vitest';
import JobPositionSelector from './JobPositionSelector';

/**
 * Feature: interview-position-enhancement
 * Property 2: Any position triggers the same interview flow
 *
 * Validates: Requirements 1.2
 */
describe('Feature: interview-position-enhancement, Property 2: Any position triggers the same interview flow', () => {
  it('should transition to seniority step when any position is selected', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...JOB_POSITIONS),
        (position) => {
          const onSelect = vi.fn();
          render(<JobPositionSelector onSelect={onSelect} />);

          const positionButton = screen.getByLabelText(`Pilih posisi ${position.title}`);
          fireEvent.click(positionButton);

          // Seniority step heading should be visible
          expect(screen.getByText('Pilih Tingkat Pengalaman')).toBeDefined();

          // Position step heading should no longer be visible
          expect(screen.queryByText('Pilih Posisi Pekerjaan')).toBeNull();

          cleanup();
        },
      ),
      { numRuns: 100 },
    );
  });
});

import { SENIORITY_LABELS, CATEGORY_LABELS } from './JobPositionSelector';
import type { SeniorityLevel, QuestionCategory } from '../../types';

/**
 * Feature: interview-position-enhancement
 * Property 3: Selection flow step progression
 *
 * Validates: Requirements 2.1, 3.1
 */
describe('Feature: interview-position-enhancement, Property 3: Selection flow step progression', () => {
  it('should show exactly 4 seniority options for any selected position', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...JOB_POSITIONS),
        (position) => {
          const onSelect = vi.fn();
          render(<JobPositionSelector onSelect={onSelect} />);

          const positionButton = screen.getByLabelText(`Pilih posisi ${position.title}`);
          fireEvent.click(positionButton);

          const seniorityButtons = [
            screen.queryByLabelText('Pilih tingkat Junior'),
            screen.queryByLabelText('Pilih tingkat Menengah'),
            screen.queryByLabelText('Pilih tingkat Senior'),
            screen.queryByLabelText('Pilih tingkat Lead'),
          ].filter(Boolean);

          expect(seniorityButtons).toHaveLength(4);

          cleanup();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should show exactly 2 category options for any position and seniority combination', () => {
    const seniorityLevels = Object.keys(SENIORITY_LABELS) as SeniorityLevel[];

    fc.assert(
      fc.property(
        fc.constantFrom(...JOB_POSITIONS),
        fc.constantFrom(...seniorityLevels),
        (position, seniority) => {
          const onSelect = vi.fn();
          render(<JobPositionSelector onSelect={onSelect} />);

          // Select position
          const positionButton = screen.getByLabelText(`Pilih posisi ${position.title}`);
          fireEvent.click(positionButton);

          // Select seniority
          const seniorityLabel = SENIORITY_LABELS[seniority];
          const seniorityButton = screen.getByLabelText(`Pilih tingkat ${seniorityLabel}`);
          fireEvent.click(seniorityButton);

          const categoryButtons = [
            screen.queryByLabelText('Pilih kategori Umum'),
            screen.queryByLabelText('Pilih kategori Teknis'),
          ].filter(Boolean);

          expect(categoryButtons).toHaveLength(2);

          cleanup();
        },
      ),
      { numRuns: 100 },
    );
  });
});


/**
 * Feature: interview-position-enhancement
 * Property 4: Selection gating prevents premature start
 *
 * Validates: Requirements 2.2, 2.5, 3.4
 */
describe('Feature: interview-position-enhancement, Property 4: Selection gating prevents premature start', () => {
  it('should not invoke onSelect when only a position is selected (no seniority or category)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...JOB_POSITIONS),
        (position) => {
          const onSelect = vi.fn();
          render(<JobPositionSelector onSelect={onSelect} />);

          // Select only a position
          const positionButton = screen.getByLabelText(`Pilih posisi ${position.title}`);
          fireEvent.click(positionButton);

          // onSelect must NOT have been called with only position selected
          expect(onSelect).not.toHaveBeenCalled();

          cleanup();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should not invoke onSelect when position and seniority are selected but no category', () => {
    const seniorityLevels = Object.keys(SENIORITY_LABELS) as SeniorityLevel[];

    fc.assert(
      fc.property(
        fc.constantFrom(...JOB_POSITIONS),
        fc.constantFrom(...seniorityLevels),
        (position, seniority) => {
          const onSelect = vi.fn();
          render(<JobPositionSelector onSelect={onSelect} />);

          // Select position
          const positionButton = screen.getByLabelText(`Pilih posisi ${position.title}`);
          fireEvent.click(positionButton);

          // Select seniority
          const seniorityLabel = SENIORITY_LABELS[seniority];
          const seniorityButton = screen.getByLabelText(`Pilih tingkat ${seniorityLabel}`);
          fireEvent.click(seniorityButton);

          // onSelect must NOT have been called with only position + seniority selected
          expect(onSelect).not.toHaveBeenCalled();

          cleanup();
        },
      ),
      { numRuns: 100 },
    );
  });
});


/**
 * Feature: interview-position-enhancement
 * Property 8: Indonesian label mapping completeness
 *
 * Validates: Requirements 2.4, 6.3
 */
describe('Feature: interview-position-enhancement, Property 8: Indonesian label mapping completeness', () => {
  it('should return a non-empty string for any SeniorityLevel value', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<SeniorityLevel>('junior', 'mid', 'senior', 'lead'),
        (level) => {
          const label = SENIORITY_LABELS[level];
          expect(label).toBeDefined();
          expect(typeof label).toBe('string');
          expect(label.trim().length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should return a non-empty label and description for any QuestionCategory value', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<QuestionCategory>('general', 'technical'),
        (category) => {
          const entry = CATEGORY_LABELS[category];
          expect(entry).toBeDefined();
          expect(typeof entry.label).toBe('string');
          expect(entry.label.trim().length).toBeGreaterThan(0);
          expect(typeof entry.description).toBe('string');
          expect(entry.description.trim().length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
