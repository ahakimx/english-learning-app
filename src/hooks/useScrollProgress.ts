import { useState, useEffect } from 'react';

/**
 * Custom hook to track page scroll progress.
 * Returns a number between 0 and 1 representing the scroll position percentage.
 *
 * Features:
 * - Uses passive scroll listener for optimal performance
 * - Handles edge cases (very short pages, SSR)
 * - Cleans up listener on unmount
 *
 * **Validates: Requirements 9.5**
 */
export function useScrollProgress(): number {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Handle SSR - window may not be available
    if (typeof window === 'undefined') {
      return;
    }

    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;

      // Handle edge case: very short pages where docHeight could be 0 or negative
      if (docHeight <= 0) {
        setProgress(0);
        return;
      }

      const scrollProgress = scrollTop / docHeight;
      // Clamp the value between 0 and 1
      setProgress(Math.min(1, Math.max(0, scrollProgress)));
    };

    // Calculate initial scroll position
    handleScroll();

    // Add passive scroll listener for performance
    window.addEventListener('scroll', handleScroll, { passive: true });

    // Cleanup listener on unmount
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  return progress;
}
