import { useState, useEffect } from 'react';

/**
 * Common breakpoint media queries
 * Following Tailwind CSS conventions
 */
export const MOBILE_BREAKPOINT = '(max-width: 767px)';
export const TABLET_BREAKPOINT = '(min-width: 768px) and (max-width: 1023px)';
export const DESKTOP_BREAKPOINT = '(min-width: 1024px)';

/**
 * Custom hook for responsive media query matching.
 * 
 * @param query - Media query string (e.g., "(max-width: 768px)")
 * @returns boolean indicating if the query matches
 * 
 * @example
 * ```tsx
 * const isMobile = useMediaQuery('(max-width: 767px)');
 * const isDesktop = useMediaQuery('(min-width: 1024px)');
 * 
 * // Or use predefined breakpoints
 * import { useMediaQuery, MOBILE_BREAKPOINT } from '../hooks/useMediaQuery';
 * const isMobile = useMediaQuery(MOBILE_BREAKPOINT);
 * ```
 */
export function useMediaQuery(query: string): boolean {
  // Default to false for SSR/initial render
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    // Check if window is available (handles SSR)
    if (typeof window === 'undefined') {
      return;
    }

    const mediaQuery = window.matchMedia(query);

    // Set initial value
    setMatches(mediaQuery.matches);

    // Handler for media query changes
    const handler = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    // Add event listener for changes
    mediaQuery.addEventListener('change', handler);

    // Cleanup listener on unmount or query change
    return () => {
      mediaQuery.removeEventListener('change', handler);
    };
  }, [query]);

  return matches;
}
