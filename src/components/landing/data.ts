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
  FeedbackExample,
  Feature,
} from './types';

// ============================================================
// Primary CTA label - use the same wording everywhere
// ============================================================

export const PRIMARY_CTA_LABEL = 'Mulai Latihan Gratis';

// ============================================================
// Social Proof Section - Testimonials
// ============================================================

// Only add testimonials from real users (with their permission).
// The section is hidden automatically while this list is empty.
export const TESTIMONIALS: Testimonial[] = [];

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
    description: 'Pilih posisi dan level yang Anda incar agar pertanyaannya relevan.',
  },
  {
    id: 'step-3',
    stepNumber: 3,
    icon: 'mic',
    title: 'Jawab dengan Suara',
    description: 'AI interviewer bertanya, Anda menjawab langsung seperti interview sungguhan.',
  },
  {
    id: 'step-4',
    stepNumber: 4,
    icon: 'insights',
    title: 'Dapat Feedback',
    description: 'Lihat koreksi grammar, skor, dan contoh jawaban yang lebih baik.',
  },
];

// ============================================================
// Stats Section - Platform Metrics
// ============================================================

// Only show real numbers from production data, e.g.
//   { id: 'stat-sessions', value: '120+', label: 'Sesi latihan selama beta', icon: 'record_voice_over' }
// The section is hidden automatically while this list is empty.
export const PLATFORM_STATS: PlatformStat[] = [];

// ============================================================
// Tech Stack - shown as a compact "Dibangun dengan" strip
// ============================================================

// Keep this list accurate: only name services the deployed app actually uses.
export const TECH_STACK: TechItem[] = [
  {
    id: 'tech-claude',
    name: 'Claude by Anthropic',
    description: 'Analisis jawaban dan feedback',
    icon: 'psychology',
    category: 'ai',
  },
  {
    id: 'tech-bedrock',
    name: 'Amazon Bedrock',
    description: 'Akses model AI yang aman',
    icon: 'hub',
    category: 'ai',
  },
  {
    id: 'tech-nova-sonic',
    name: 'Amazon Nova Sonic',
    description: 'Percakapan suara real-time',
    icon: 'graphic_eq',
    category: 'speech',
  },
  {
    id: 'tech-aws',
    name: 'AWS',
    description: 'Infrastruktur serverless',
    icon: 'cloud',
    category: 'infrastructure',
  },
];

// ============================================================
// Features Section - Modules
// ============================================================

export const FEATURES: Feature[] = [
  {
    id: 'speaking',
    icon: 'mic',
    title: 'Simulasi Interview Suara',
    description: 'Ngobrol langsung dengan AI interviewer yang menyesuaikan pertanyaan dengan posisi dan level Anda.',
    points: [
      'Pertanyaan sesuai posisi & seniority',
      'Deteksi filler words (um, like, basically)',
      'Skor grammar, vocabulary, relevansi, koherensi',
    ],
  },
  {
    id: 'grammar',
    icon: 'spellcheck',
    title: 'Grammar Quiz',
    description: 'Latih pola grammar yang paling sering salah saat interview, lengkap dengan penjelasan.',
    points: [
      'Penjelasan untuk setiap jawaban',
      'Skor per topik untuk melihat kelemahan',
      'Tanpa batas, bahkan di paket Gratis',
    ],
  },
  {
    id: 'writing',
    icon: 'edit_note',
    title: 'Writing Review',
    description: 'Review email lamaran, cover letter, dan tulisan profesional Anda.',
    points: [
      'Koreksi grammar & struktur kalimat',
      'Saran kosakata yang lebih profesional',
      'Skor untuk melacak perkembangan',
    ],
  },
];

// ============================================================
// Why SpeakReady - Differentiators
// ============================================================

export const DIFFERENTIATORS: Differentiator[] = [
  {
    id: 'diff-ai',
    title: 'Feedback Personal',
    description: 'Bukan template. Setiap feedback dibuat khusus untuk jawaban Anda.',
    icon: 'psychology',
  },
  {
    id: 'diff-indonesian',
    title: 'Dijelaskan dalam Bahasa Indonesia',
    description: 'Aturan grammar dan tips dijelaskan dalam bahasa yang Anda pahami.',
    icon: 'translate',
  },
  {
    id: 'diff-realtime',
    title: 'Langsung Setelah Menjawab',
    description: 'Tidak perlu menunggu jadwal tutor. Feedback muncul setelah setiap jawaban.',
    icon: 'bolt',
  },
  {
    id: 'diff-private',
    title: 'Latihan Tanpa Malu',
    description: 'Salah berkali-kali tidak masalah. Ulangi sampai Anda percaya diri.',
    icon: 'self_improvement',
  },
];

// ============================================================
// Feedback Demo Section - Sample feedback
// ============================================================

// Illustrative examples shaped like the app's FeedbackReport. Clearly labelled as
// examples in the UI - they are not real user data.
export const FEEDBACK_EXAMPLES: FeedbackExample[] = [
  {
    id: 'about-yourself',
    label: 'Tell me about yourself',
    question: 'Can you tell me a little bit about yourself?',
    answer:
      'Hmm, so my name is Rizky and I am graduated from Universitas Indonesia on 2022. Currently I am work as backend developer in fintech company since two years. Basically I am very passionate with building scalable system.',
    scores: { grammar: 62, vocabulary: 70, relevance: 84, coherence: 72 },
    corrections: [
      { original: 'I am graduated', correction: 'I graduated', rule: 'Pakai past simple, bukan bentuk pasif.' },
      { original: 'on 2022', correction: 'in 2022', rule: 'Tahun memakai preposisi "in".' },
      {
        original: 'I am work ... since two years',
        correction: "I've been working ... for two years",
        rule: 'Durasi yang masih berlangsung: present perfect continuous + "for".',
      },
      { original: 'passionate with', correction: 'passionate about', rule: 'Kolokasi yang benar: "passionate about".' },
    ],
    fillerWords: [
      { word: 'hmm', count: 1 },
      { word: 'so', count: 1 },
      { word: 'basically', count: 1 },
    ],
    improvedAnswer:
      "I'm a backend developer with two years of experience at a fintech company. I graduated from Universitas Indonesia in 2022, and since then I've been building payment services that need to stay fast under heavy traffic. I'm really passionate about designing scalable systems, which is why this role caught my attention.",
    tips: [
      'Buka dengan peran dan pengalaman Anda, bukan nama. Nama sudah ada di CV.',
      'Tambahkan satu pencapaian konkret, idealnya dengan angka.',
      'Tutup dengan alasan kenapa posisi ini relevan untuk Anda.',
    ],
  },
  {
    id: 'weakness',
    label: 'Greatest weakness',
    question: 'What would you say is your greatest weakness?',
    answer:
      'My weakness is I am too perfectionist. Sometimes I spend too much time for small detail, so the deadline is become late. But now I already try to make priority list everyday.',
    scores: { grammar: 55, vocabulary: 63, relevance: 76, coherence: 68 },
    corrections: [
      { original: 'I am too perfectionist', correction: "I'm a perfectionist", rule: '"Perfectionist" adalah kata benda, perlu artikel "a".' },
      { original: 'spend too much time for small detail', correction: 'spend too much time on small details', rule: '"Spend time on" + bentuk jamak.' },
      { original: 'the deadline is become late', correction: 'I fall behind schedule', rule: 'Jangan gabungkan "is" + verb dasar. Gunakan frasa yang natural.' },
      { original: 'everyday', correction: 'every day', rule: '"Every day" = setiap hari; "everyday" = kata sifat (sehari-hari).' },
    ],
    fillerWords: [],
    improvedAnswer:
      "I tend to spend too much time polishing small details. On one project, that caused me to fall behind schedule on a minor feature. Since then, I start each day with a priority list, set a time limit for each task, and check with my lead about which details really matter. It's helped me deliver on time without lowering the quality of my work.",
    tips: [
      'Jawaban "perfeksionis" terdengar klise. Pilih kelemahan nyata yang tidak krusial untuk posisi.',
      'Gunakan pola: kelemahan → dampak → langkah perbaikan → hasil.',
    ],
  },
  {
    id: 'why-company',
    label: 'Why our company?',
    question: 'Why do you want to work for our company?',
    answer:
      'Because your company is very famous and have good salary. And also I want to learn many things about the e-commerce, because I think e-commerce is growing very fast in Indonesia.',
    scores: { grammar: 68, vocabulary: 60, relevance: 55, coherence: 64 },
    corrections: [
      { original: 'your company ... have', correction: 'your company ... has', rule: 'Subjek tunggal memakai "has".' },
      { original: 'learn many things about the e-commerce', correction: 'learn a lot about e-commerce', rule: 'Konsep umum tidak memakai "the".' },
    ],
    fillerWords: [{ word: 'and also', count: 1 }],
    improvedAnswer:
      "I've been following how your team expanded same-day delivery to smaller cities, and I'd love to work on problems at that scale. E-commerce is growing quickly in Indonesia, and I want to grow my career at a company that's shaping how people shop here. My experience with high-traffic APIs is a good fit for what this role needs.",
    tips: [
      'Hindari menyebut gaji atau popularitas sebagai alasan utama.',
      'Riset satu hal spesifik tentang perusahaan, lalu sebutkan.',
      'Hubungkan dengan pengalaman Anda: kenapa Anda cocok, bukan hanya kenapa Anda mau.',
    ],
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
    description: 'Untuk mencoba dan latihan rutin ringan',
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
    ctaLabel: PRIMARY_CTA_LABEL,
    sessionLimit: 5,
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 99000,
    priceDisplay: 'Rp 99rb',
    description: 'Untuk persiapan interview yang serius',
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
    answer: 'Ya! Paket Gratis memberikan 5 sesi interview, grammar quiz tanpa batas, dan 3 writing review per bulan. Tidak perlu kartu kredit untuk mendaftar.',
    category: 'pricing',
  },
  {
    id: 'faq-ai',
    question: 'Bagaimana AI memberikan feedback?',
    answer: 'Jawaban Anda dianalisis oleh model AI (Claude dari Anthropic, melalui Amazon Bedrock). AI menilai grammar, vocabulary, relevansi jawaban, penggunaan filler words, dan koherensi, lalu memberikan contoh jawaban yang lebih baik. Setiap feedback dibuat khusus untuk jawaban Anda.',
    category: 'technical',
  },
  {
    id: 'faq-level',
    question: 'Bahasa Inggris saya masih pemula. Apakah cocok?',
    answer: 'Cocok. Feedback dan penjelasan grammar ditulis dalam Bahasa Indonesia, dan Anda bisa memilih level posisi agar pertanyaannya sesuai. Mulai dari Grammar Quiz jika ingin pemanasan dulu.',
    category: 'features',
  },
  {
    id: 'faq-privacy',
    question: 'Apakah data saya aman?',
    answer: 'Data disimpan di AWS dengan enkripsi, dan kami tidak menjual atau membagikan data Anda ke pihak ketiga untuk iklan.',
    category: 'privacy',
  },
  {
    id: 'faq-positions',
    question: 'Posisi pekerjaan apa saja yang tersedia?',
    answer: 'Berbagai posisi seperti Software Engineer, Product Manager, Data Analyst, dan lainnya. Paket Premium memberikan akses ke semua posisi.',
    category: 'features',
  },
  {
    id: 'faq-cancel',
    question: 'Bagaimana cara berhenti berlangganan?',
    answer: 'Anda bisa berhenti kapan saja dari halaman Settings. Tidak ada kontrak jangka panjang atau biaya pembatalan.',
    category: 'pricing',
  },
];

// ============================================================
// About Section - Founder Information
// ============================================================

// Add photoUrl (e.g. '/founder.jpg' in /public) and linkedInUrl - founder credibility matters.
export const FOUNDER_INFO: FounderInfo = {
  name: 'Hakim',
  title: 'Founder & Developer',
  bio: 'Software engineer yang ingin membantu profesional Indonesia sukses di karir internasional. Percaya bahwa dengan latihan yang tepat, siapa pun bisa percaya diri saat interview bahasa Inggris.',
  photoUrl: '',
  linkedInUrl: '',
};

// ============================================================
// Footer Section - Social and Legal Links
// ============================================================

// Links with an empty url are hidden.
export const SOCIAL_LINKS: SocialLink[] = [
  { platform: 'linkedin', url: '', label: 'LinkedIn' },
  { platform: 'twitter', url: '', label: 'Twitter' },
  { platform: 'instagram', url: '', label: 'Instagram' },
];

export const LEGAL_LINKS: LegalLink[] = [
  { label: 'Syarat & Ketentuan', path: '/terms' },
  { label: 'Kebijakan Privasi', path: '/privacy' },
];

// Contact links are hidden while this is empty. Use an address on a domain you own.
export const CONTACT_EMAIL = '';
