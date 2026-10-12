import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useMediaQuery, MOBILE_BREAKPOINT, TABLET_BREAKPOINT, DESKTOP_BREAKPOINT } from './useMediaQuery';

describe('useMediaQuery', () => {
  let matchMediaMock: ReturnType<typeof vi.fn>;
  let listeners: Map<string, ((event: MediaQueryListEvent) => void)[]>;

  beforeEach(() => {
    listeners = new Map();
    
    matchMediaMock = vi.fn((query: string) => {
      const mediaQueryList = {
        matches: false,
        media: query,
        addEventListener: vi.fn((event: string, callback: (event: MediaQueryListEvent) => void) => {
          if (event === 'change') {
            if (!listeners.has(query)) {
              listeners.set(query, []);
            }
            listeners.get(query)!.push(callback);
          }
        }),
        removeEventListener: vi.fn((event: string, callback: (event: MediaQueryListEvent) => void) => {
          if (event === 'change' && listeners.has(query)) {
            const queryListeners = listeners.get(query)!;
            const index = queryListeners.indexOf(callback);
            if (index > -1) {
              queryListeners.splice(index, 1);
            }
          }
        }),
      };
      return mediaQueryList;
    });

    vi.stubGlobal('matchMedia', matchMediaMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns false by default for SSR/initial render', () => {
    const { result } = renderHook(() => useMediaQuery('(max-width: 768px)'));
    // After useEffect runs, it should reflect the mocked value (false)
    expect(result.current).toBe(false);
  });

  it('returns true when media query matches', () => {
    matchMediaMock.mockImplementation((query: string) => ({
      matches: true,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));

    const { result } = renderHook(() => useMediaQuery('(max-width: 768px)'));
    expect(result.current).toBe(true);
  });

  it('returns false when media query does not match', () => {
    matchMediaMock.mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));

    const { result } = renderHook(() => useMediaQuery('(max-width: 768px)'));
    expect(result.current).toBe(false);
  });

  it('updates when media query changes', () => {
    let changeCallback: ((event: MediaQueryListEvent) => void) | null = null;
    
    matchMediaMock.mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn((_event: string, callback: (event: MediaQueryListEvent) => void) => {
        changeCallback = callback;
      }),
      removeEventListener: vi.fn(),
    }));

    const { result } = renderHook(() => useMediaQuery('(max-width: 768px)'));
    expect(result.current).toBe(false);

    // Simulate media query change
    act(() => {
      if (changeCallback) {
        changeCallback({ matches: true } as MediaQueryListEvent);
      }
    });

    expect(result.current).toBe(true);
  });

  it('cleans up listener on unmount', () => {
    const removeEventListenerMock = vi.fn();
    
    matchMediaMock.mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: removeEventListenerMock,
    }));

    const { unmount } = renderHook(() => useMediaQuery('(max-width: 768px)'));
    
    unmount();
    
    expect(removeEventListenerMock).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('re-subscribes when query parameter changes', () => {
    const addEventListenerMock = vi.fn();
    const removeEventListenerMock = vi.fn();
    
    matchMediaMock.mockImplementation((query: string) => ({
      matches: query === '(max-width: 768px)',
      media: query,
      addEventListener: addEventListenerMock,
      removeEventListener: removeEventListenerMock,
    }));

    const { result, rerender } = renderHook(
      ({ query }) => useMediaQuery(query),
      { initialProps: { query: '(max-width: 768px)' } }
    );

    expect(result.current).toBe(true);
    expect(addEventListenerMock).toHaveBeenCalledTimes(1);

    // Change the query
    rerender({ query: '(min-width: 1024px)' });

    // Should have cleaned up the old listener and added a new one
    expect(removeEventListenerMock).toHaveBeenCalled();
    expect(addEventListenerMock).toHaveBeenCalledTimes(2);
  });
});

describe('Breakpoint constants', () => {
  it('exports MOBILE_BREAKPOINT', () => {
    expect(MOBILE_BREAKPOINT).toBe('(max-width: 767px)');
  });

  it('exports TABLET_BREAKPOINT', () => {
    expect(TABLET_BREAKPOINT).toBe('(min-width: 768px) and (max-width: 1023px)');
  });

  it('exports DESKTOP_BREAKPOINT', () => {
    expect(DESKTOP_BREAKPOINT).toBe('(min-width: 1024px)');
  });
});
