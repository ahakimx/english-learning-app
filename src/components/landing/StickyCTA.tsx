/**
 * StickyCTA Component
 *
 * Fixed-position CTA button at the bottom of the viewport for mobile users.
 * Appears after 50% scroll progress with smooth fade-in animation.
 *
 * Features:
 * - Fixed position at bottom of viewport
 * - High z-index above other content
 * - Smooth opacity transition for fade-in/out
 * - Optional slide-up animation
 * - Visibility controlled by parent component
 *
 * Note: This component does NOT check mobile viewport or scroll progress internally.
 * The parent component (Dashboard) manages visibility using useScrollProgress
 * and useMediaQuery hooks.
 *
 * Requirements: 9.5, 11.4
 */

interface StickyCTAProps {
  /** Controls visibility of the sticky CTA */
  visible: boolean;
  /** Callback when CTA button is clicked */
  onCTAClick: () => void;
  /** Button label text */
  label: string;
}

/**
 * Sticky CTA component for mobile conversion optimization
 */
export function StickyCTA({ visible, onCTAClick, label }: StickyCTAProps) {
  return (
    <div
      data-testid="sticky-cta"
      className={`fixed bottom-0 left-0 right-0 z-50 p-4 bg-gradient-to-t from-white via-white to-white/95 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] transition-all duration-300 ease-out ${
        visible
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 translate-y-full pointer-events-none'
      }`}
    >
      <div className="max-w-lg mx-auto">
        <button
          onClick={onCTAClick}
          className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-primary to-secondary text-white font-bold rounded-full hover:opacity-90 transition-opacity shadow-lg"
        >
          <span>{label}</span>
          <span className="material-symbols-outlined text-xl">
            arrow_forward
          </span>
        </button>
      </div>
    </div>
  );
}
