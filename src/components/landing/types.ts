/**
 * Landing page TypeScript interfaces
 * Defines data models for all landing page sections
 */

// ============================================================
// Base Section Props
// ============================================================

/**
 * Base props for all landing page sections
 * Provides consistent structure for scroll navigation and styling
 */
export interface SectionProps {
  /** Section ID for scroll navigation (e.g., "social-proof") */
  id: string;
  /** Additional CSS classes for styling */
  className?: string;
}

// ============================================================
// Social Proof Section
// ============================================================

/**
 * Testimonial data for social proof section
 */
export interface Testimonial {
  /** Unique identifier */
  id: string;
  /** User's display name */
  name: string;
  /** User's job title */
  jobTitle: string;
  /** User's company name */
  company: string;
  /** Testimonial quote text */
  quote: string;
  /** Optional avatar image URL - uses initials placeholder if not provided */
  avatarUrl?: string;
}

// ============================================================
// How It Works Section
// ============================================================

/**
 * Step in the "How It Works" flow
 */
export interface HowItWorksStep {
  /** Unique identifier */
  id: string;
  /** Step number (1, 2, 3, 4) */
  stepNumber: number;
  /** Material Symbol icon name */
  icon: string;
  /** Step title */
  title: string;
  /** Step description */
  description: string;
}

// ============================================================
// Stats Section
// ============================================================

/**
 * Platform metric for stats section
 */
export interface PlatformStat {
  /** Unique identifier */
  id: string;
  /** Formatted value string (e.g., "10,000+", "98%") */
  value: string;
  /** Metric label in Indonesian */
  label: string;
  /** Material Symbol icon name */
  icon: string;
}

// ============================================================
// Tech Stack Section
// ============================================================

/**
 * Technology item for tech stack section
 */
export interface TechItem {
  /** Unique identifier */
  id: string;
  /** Technology name */
  name: string;
  /** Brief description of the technology's purpose */
  description: string;
  /** Optional external logo URL */
  logoUrl?: string;
  /** Material Symbol icon name as fallback */
  icon?: string;
  /** Technology category for grouping */
  category: 'ai' | 'speech' | 'infrastructure' | 'database';
}

// ============================================================
// Comparison Section
// ============================================================

/**
 * Differentiating feature for comparison section
 */
export interface Differentiator {
  /** Unique identifier */
  id: string;
  /** Feature title */
  title: string;
  /** Feature description */
  description: string;
  /** Material Symbol icon name */
  icon: string;
  /** Whether to emphasize this differentiator visually */
  highlight?: boolean;
}

// ============================================================
// Pricing Section
// ============================================================

/**
 * Feature within a pricing tier
 */
export interface PricingFeature {
  /** Feature description text */
  text: string;
  /** Whether this feature is included in the tier */
  included: boolean;
}

/**
 * Pricing tier configuration
 */
export interface PricingTier {
  /** Unique identifier */
  id: string;
  /** Tier name (e.g., "Gratis", "Premium") */
  name: string;
  /** Price in IDR (0 for free tier) */
  price: number;
  /** Formatted price string (e.g., "Gratis", "Rp 99.000/bulan") */
  priceDisplay: string;
  /** Tier description */
  description: string;
  /** List of features in this tier */
  features: PricingFeature[];
  /** Whether this is the recommended tier */
  recommended?: boolean;
  /** CTA button label */
  ctaLabel: string;
  /** Monthly session limit (undefined = unlimited) */
  sessionLimit?: number;
}

// ============================================================
// FAQ Section
// ============================================================

/**
 * FAQ item for accordion
 */
export interface FAQItem {
  /** Unique identifier */
  id: string;
  /** Question text */
  question: string;
  /** Answer text */
  answer: string;
  /** Optional category for filtering/grouping */
  category?: 'pricing' | 'features' | 'privacy' | 'technical';
}

// ============================================================
// About Section
// ============================================================

/**
 * Founder information for about section
 */
export interface FounderInfo {
  /** Founder's name */
  name: string;
  /** Founder's title/role */
  title: string;
  /** Brief biography */
  bio: string;
  /** Optional photo URL */
  photoUrl?: string;
  /** Optional LinkedIn profile URL */
  linkedInUrl?: string;
}

// ============================================================
// Footer Section
// ============================================================

/**
 * Social media link
 */
export interface SocialLink {
  /** Social media platform */
  platform: 'linkedin' | 'twitter' | 'instagram';
  /** Profile/page URL */
  url: string;
  /** Accessible label for the link */
  label: string;
}

/**
 * Legal page link
 */
export interface LegalLink {
  /** Link display text */
  label: string;
  /** Internal route path */
  path: string;
}

// ============================================================
// Feedback Demo Section
// ============================================================

/**
 * A grammar/vocabulary correction shown in the sample feedback
 */
export interface FeedbackCorrection {
  /** Phrase as the learner said it */
  original: string;
  /** Corrected phrase */
  correction: string;
  /** Short explanation in Indonesian */
  rule: string;
}

/**
 * Pre-written example of the feedback a learner receives after one answer
 */
export interface FeedbackExample {
  /** Unique identifier */
  id: string;
  /** Short tab label */
  label: string;
  /** Interview question asked by the AI interviewer */
  question: string;
  /** Learner's original (transcribed) answer */
  answer: string;
  /** Scores 0-100 matching the app's FeedbackReport criteria */
  scores: {
    grammar: number;
    vocabulary: number;
    relevance: number;
    coherence: number;
  };
  /** Corrections found in the answer */
  corrections: FeedbackCorrection[];
  /** Filler words detected */
  fillerWords: { word: string; count: number }[];
  /** Improved version of the answer */
  improvedAnswer: string;
  /** Actionable tips in Indonesian */
  tips: string[];
}

// ============================================================
// Features Section
// ============================================================

/**
 * Product feature card
 */
export interface Feature {
  /** Unique identifier */
  id: string;
  /** Material Symbol icon name */
  icon: string;
  /** Feature title */
  title: string;
  /** Feature description */
  description: string;
  /** Bullet points of what the learner gets */
  points: string[];
}
