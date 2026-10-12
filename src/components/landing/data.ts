/**
 * Static data constants for landing page sections
 * All text content is in Indonesian (Bahasa Indonesia)
 */

import type {
  Testimonial,
  HowItWorksStep,
  PlatformStat,
  TechItem,
  Differentiator,
  PricingTier,
  FAQItem,
  FounderInfo,
  SocialLink,
  LegalLink,
} from './types';

// ============================================================
// Social Proof Section - Testimonials
// ============================================================

export const TESTIMONIALS: Testimonial[] = [
  {
    id: 'testimonial-1',
    name: 'Rina Wijaya',
    jobTitle: 'Software Engineer',
    company: 'Tech Startup Jakarta',
    quote: 'Berkat latihan di SpeakReady, saya berhasil lolos interview di perusahaan multinasional. Feedback AI-nya sangat detail dan membantu!',
  },
  {
    id: 'testimonial-2',
    name: 'Budi Santoso',
    jobTitle: 'Product Manager',
    company: 'E-commerce Company',
    quote: 'Platform ini membantu saya meningkatkan confidence dalam berbicara bahasa Inggris. Sekarang saya tidak takut lagi interview dengan expatriate.',
  },
  {
    id: 'testimonial-3',
    name: 'Maya Putri',
    jobTitle: 'Data Analyst',
    company: 'Financial Services',
    quote: 'Fitur grammar quiz dan writing review sangat membantu memperbaiki kesalahan yang sering saya buat. Highly recommended!',
  },
];

// ============================================================
// How It Works Section - Steps
// ============================================================

export const HOW_IT_WORKS_STEPS: HowItWorksStep[] = [
  {
    id: 'step-1',
    stepNumber: 1,
    icon: 'person_add',
    title: 'Daftar Gratis',
    description: 'Buat akun dalam hitungan detik. Tidak perlu kartu kredit.',
  },
  {
    id: 'step-2',
    stepNumber: 2,
    icon: 'work',
    title: 'Pilih Posisi',
    description: 'Pilih posisi pekerjaan yang Anda incar untuk latihan yang relevan.',
  },
  {
    id: 'step-3',
    stepNumber: 3,
    icon: 'mic',
    title: 'Mulai Latihan',
    description: 'Latihan interview dengan AI interviewer yang responsif dan natural.',
  },
  {
    id: 'step-4',
    stepNumber: 4,
    icon: 'insights',
    title: 'Dapat Feedback',
    description: 'Terima feedback detail tentang grammar, vocabulary, dan tips improvement.',
  },
];

// ============================================================
// Stats Section - Platform Metrics
// ============================================================

export const PLATFORM_STATS: PlatformStat[] = [
  {
    id: 'stat-sessions',
    value: '10,000+',
    label: 'Sesi Latihan',
    icon: 'record_voice_over',
  },
  {
    id: 'stat-feedback',
    value: '50,000+',
    label: 'Feedback AI Generated',
    icon: 'smart_toy',
  },
  {
    id: 'stat-learners',
    value: '1,000+',
    label: 'Learners Aktif',
    icon: 'group',
  },
  {
    id: 'stat-satisfaction',
    value: '98%',
    label: 'Tingkat Kepuasan',
    icon: 'thumb_up',
  },
];

// ============================================================
// Tech Stack Section - Technologies
// ============================================================

export const TECH_STACK: TechItem[] = [
  {
    id: 'tech-claude',
    name: 'Claude by Anthropic',
    description: 'AI terdepan untuk analisis bahasa dan feedback yang human-like',
    category: 'ai',
  },
  {
    id: 'tech-bedrock',
    name: 'Amazon Bedrock',
    description: 'Platform AI enterprise-grade untuk keamanan dan skalabilitas',
    category: 'ai',
  },
  {
    id: 'tech-transcribe',
    name: 'Amazon Transcribe',
    description: 'Speech-to-text akurat untuk transkripsi jawaban Anda',
    category: 'speech',
  },
  {
    id: 'tech-polly',
    name: 'Amazon Polly Neural',
    description: 'Text-to-speech natural untuk pertanyaan interviewer',
    category: 'speech',
  },
  {
    id: 'tech-lambda',
    name: 'AWS Lambda',
    description: 'Serverless computing untuk respons cepat dan efisien',
    category: 'infrastructure',
  },
  {
    id: 'tech-dynamodb',
    name: 'Amazon DynamoDB',
    description: 'Database NoSQL untuk tracking progress real-time',
    category: 'database',
  },
];

// ============================================================
// Comparison Section - Differentiators
// ============================================================

export const DIFFERENTIATORS: Differentiator[] = [
  {
    id: 'diff-ai',
    title: 'AI-Powered Feedback',
    description: 'Bukan template feedback generik. Setiap feedback di-generate khusus untuk jawaban Anda.',
    icon: 'psychology',
    highlight: true,
  },
  {
    id: 'diff-indonesian',
    title: 'Untuk Profesional Indonesia',
    description: 'Interface dalam Bahasa Indonesia, konteks lokal, dan tips spesifik untuk interview internasional.',
    icon: 'language',
    highlight: true,
  },
  {
    id: 'diff-realtime',
    title: 'Feedback Real-time',
    description: 'Tidak perlu menunggu. Dapatkan feedback langsung setelah setiap jawaban.',
    icon: 'bolt',
  },
  {
    id: 'diff-comprehensive',
    title: 'Latihan Komprehensif',
    description: 'Speaking, Grammar, dan Writing dalam satu platform terintegrasi.',
    icon: 'school',
  },
];

// ============================================================
// Pricing Section - Tiers
// ============================================================

export const PRICING_TIERS: PricingTier[] = [
  {
    id: 'free',
    name: 'Gratis',
    price: 0,
    priceDisplay: 'Rp 0',
    description: 'Mulai latihan tanpa komitmen',
    features: [
      { text: '5 sesi interview per bulan', included: true },
      { text: 'Grammar quiz tanpa batas', included: true },
      { text: 'Writing review (3x/bulan)', included: true },
      { text: 'Feedback AI dasar', included: true },
      { text: 'Progress tracking', included: true },
      { text: 'Akses semua posisi pekerjaan', included: false },
      { text: 'Feedback AI mendalam', included: false },
      { text: 'Priority support', included: false },
    ],
    ctaLabel: 'Mulai Gratis',
    sessionLimit: 5,
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 99000,
    priceDisplay: 'Rp 99.000/bulan',
    description: 'Untuk persiapan interview serius',
    features: [
      { text: 'Sesi interview tanpa batas', included: true },
      { text: 'Grammar quiz tanpa batas', included: true },
      { text: 'Writing review tanpa batas', included: true },
      { text: 'Feedback AI mendalam', included: true },
      { text: 'Progress tracking', included: true },
      { text: 'Akses semua posisi pekerjaan', included: true },
      { text: 'Analisis trend performa', included: true },
      { text: 'Priority support', included: true },
    ],
    recommended: true,
    ctaLabel: 'Upgrade ke Premium',
  },
];

// ============================================================
// FAQ Section - Questions and Answers
// ============================================================

export const FAQ_ITEMS: FAQItem[] = [
  {
    id: 'faq-free',
    question: 'Apakah benar-benar gratis?',
    answer: 'Ya! Tier Gratis memberikan 5 sesi interview, grammar quiz tanpa batas, dan 3 writing review per bulan. Tidak perlu kartu kredit untuk mendaftar.',
    category: 'pricing',
  },
  {
    id: 'faq-ai',
    question: 'Bagaimana AI memberikan feedback?',
    answer: 'Kami menggunakan Claude dari Anthropic melalui Amazon Bedrock untuk menganalisis jawaban Anda. AI menilai grammar, vocabulary, relevansi jawaban, penggunaan filler words, dan koherensi. Setiap feedback dibuat khusus untuk jawaban Anda.',
    category: 'technical',
  },
  {
    id: 'faq-privacy',
    question: 'Apakah data saya aman?',
    answer: 'Keamanan data adalah prioritas kami. Semua data dienkripsi dan disimpan di AWS dengan standar keamanan enterprise. Kami tidak pernah membagikan data Anda ke pihak ketiga.',
    category: 'privacy',
  },
  {
    id: 'faq-language',
    question: 'Bahasa apa yang didukung?',
    answer: 'Platform ini fokus pada latihan interview bahasa Inggris. Interface menggunakan Bahasa Indonesia agar mudah dipahami, namun konten pembelajaran dan latihan dalam bahasa Inggris.',
    category: 'features',
  },
  {
    id: 'faq-positions',
    question: 'Posisi pekerjaan apa saja yang tersedia?',
    answer: 'Kami menyediakan berbagai posisi seperti Software Engineer, Product Manager, Data Analyst, dan lainnya. Tier Premium memberikan akses ke semua posisi tanpa batasan.',
    category: 'features',
  },
  {
    id: 'faq-cancel',
    question: 'Bagaimana cara cancel subscription?',
    answer: 'Anda dapat cancel subscription kapan saja dari halaman Settings. Tidak ada commitment jangka panjang atau biaya pembatalan.',
    category: 'pricing',
  },
];

// ============================================================
// About Section - Founder Information
// ============================================================

export const FOUNDER_INFO: FounderInfo = {
  name: 'Hakim',
  title: 'Founder & Developer',
  bio: 'Software engineer dengan passion membantu profesional Indonesia sukses di karir internasional. Percaya bahwa dengan tools yang tepat, siapapun bisa menguasai interview bahasa Inggris.',
  linkedInUrl: '',
};

// ============================================================
// Footer Section - Social and Legal Links
// ============================================================

export const SOCIAL_LINKS: SocialLink[] = [
  { platform: 'linkedin', url: '#', label: 'LinkedIn' },
  { platform: 'twitter', url: '#', label: 'Twitter' },
  { platform: 'instagram', url: '#', label: 'Instagram' },
];

export const LEGAL_LINKS: LegalLink[] = [
  { label: 'Syarat & Ketentuan', path: '/terms' },
  { label: 'Kebijakan Privasi', path: '/privacy' },
];

export const CONTACT_EMAIL = 'hello@interviewprep.pro';
