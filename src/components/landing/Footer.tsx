/**
 * Footer - Landing page footer with branding, navigation, social links, and legal
 * Responsive layout: single column on mobile, multi-column grid on desktop
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7
 */

import { Link } from 'react-router-dom';
import { SOCIAL_LINKS, LEGAL_LINKS, CONTACT_EMAIL } from './data';
import type { SocialLink, LegalLink } from './types';

/**
 * Returns the Material Symbol icon name for a social platform
 */
const getSocialIcon = (platform: SocialLink['platform']): string => {
  const icons: Record<SocialLink['platform'], string> = {
    linkedin: 'group',
    twitter: 'alternate_email',
    instagram: 'photo_camera',
  };
  return icons[platform];
};

const PRODUCT_LINKS = [
  { label: 'Contoh Feedback', href: '#feedback-demo' },
  { label: 'Fitur', href: '#features' },
  { label: 'Harga', href: '#pricing' },
  { label: 'FAQ', href: '#faq' },
];

interface FooterProps {
  socialLinks?: SocialLink[];
  legalLinks?: LegalLink[];
  contactEmail?: string;
}

/**
 * Footer component with branding, navigation links, social media, and copyright
 */
export function Footer({
  socialLinks = SOCIAL_LINKS,
  legalLinks = LEGAL_LINKS,
  contactEmail = CONTACT_EMAIL,
}: FooterProps) {
  const currentYear = new Date().getFullYear();
  const visibleSocialLinks = socialLinks.filter((link) => link.url && link.url !== '#');

  return (
    <footer className="bg-on-surface text-white py-12 md:py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Main footer content - responsive grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 md:gap-12">
          {/* Brand section */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-accent text-3xl" aria-hidden="true">
                record_voice_over
              </span>
              <span className="text-xl font-bold">SpeakReady</span>
            </div>
            <p className="text-white/70 text-sm leading-relaxed">
              Platform latihan interview bahasa Inggris berbasis AI untuk
              profesional Indonesia.
            </p>
          </div>

          {/* Product links section */}
          <div className="lg:col-span-1">
            <h3 className="font-semibold text-lg mb-4">Produk</h3>
            <ul className="space-y-3">
              {PRODUCT_LINKS.map((link) => (
                <li key={link.href}>
                  <a href={link.href} className="text-white/70 hover:text-white transition-colors duration-200">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal links section */}
          <div className="lg:col-span-1">
            <h3 className="font-semibold text-lg mb-4">Legal</h3>
            <ul className="space-y-3">
              {legalLinks.map((link) => (
                <li key={link.path}>
                  <Link
                    to={link.path}
                    className="text-white/70 hover:text-white transition-colors duration-200"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact section */}
          {contactEmail && (
          <div className="lg:col-span-1">
            <h3 className="font-semibold text-lg mb-4">Kontak</h3>
            <a
              href={`mailto:${contactEmail}`}
              className="text-white/70 hover:text-white transition-colors duration-200 flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-xl">email</span>
              {contactEmail}
            </a>
          </div>
          )}

          {/* Social links section */}
          {visibleSocialLinks.length > 0 && (
          <div className="lg:col-span-1">
            <h3 className="font-semibold text-lg mb-4">Ikuti Kami</h3>
            <div className="flex gap-4">
              {visibleSocialLinks.map((link) => (
                <a
                  key={link.platform}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={link.label}
                  className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-primary hover:text-on-primary transition-colors duration-200"
                >
                  <span className="material-symbols-outlined text-xl">
                    {getSocialIcon(link.platform)}
                  </span>
                </a>
              ))}
            </div>
          </div>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-white/10 mt-10 pt-8">
          {/* Copyright */}
          <p className="text-center text-white/60 text-sm">
            © {currentYear} SpeakReady. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
