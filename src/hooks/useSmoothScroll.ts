import { useCallback } from 'react';

/**
 * Header offset in pixels for smooth scroll calculations.
 * This accounts for the fixed header height.
 */
const HEADER_OFFSET = 64;

/**
 * Custom hook for smooth scroll navigation on the landing page.
 * Provides functions to scroll to specific sections by ID and to scroll to the top.
 * 
 * @example
 * ```tsx
 * const { scrollToSection, scrollToTop } = useSmoothScroll();
 * 
 * // Scroll to a section by ID
 * scrollToSection('pricing');
 * 
 * // Scroll to top of page
 * scrollToTop();
 * ```
 * 
 * @returns Object containing scroll functions
 * - `scrollToSection`: Scrolls to an element by its ID with header offset
 * - `scrollToTop`: Scrolls to the top of the page
 */
export function useSmoothScroll() {
  /**
   * Scrolls to a section element by its ID.
   * Accounts for 64px fixed header offset.
   * 
   * @param sectionId - The ID of the element to scroll to (without #)
   */
  const scrollToSection = useCallback((sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      const top = element.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET;
      window.scrollTo({
        top,
        behavior: 'smooth',
      });
    }
  }, []);

  /**
   * Scrolls to the top of the page with smooth animation.
   */
  const scrollToTop = useCallback(() => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  }, []);

  return { scrollToSection, scrollToTop };
}
