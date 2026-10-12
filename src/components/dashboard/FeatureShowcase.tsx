import { useNavigate } from 'react-router-dom'

interface FeatureShowcaseProps {
  onStartPractice: () => void
  onRegister: () => void
}

/**
 * FeatureShowcase component displays AI-powered features to unauthenticated visitors.
 * Each feature card emphasizes the AI-powered nature of the functionality.
 * 
 * Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 10.1, 10.3
 */
export default function FeatureShowcase({ onStartPractice }: FeatureShowcaseProps) {
  const navigate = useNavigate()

  const features = [
    {
      id: 'speaking',
      icon: 'mic',
      iconBg: 'bg-blue-50',
      iconColor: 'text-primary',
      title: 'Speaking & Interview',
      description: 'Simulasi interview real-time dengan AI yang memberikan feedback instan tentang grammar, vocabulary, dan kelancaran berbicara Anda.',
      route: '/speaking',
    },
    {
      id: 'grammar',
      icon: 'spellcheck',
      iconBg: 'bg-emerald-50',
      iconColor: 'text-tertiary',
      title: 'Grammar Quiz',
      description: 'Quiz grammar interaktif dengan penjelasan AI yang detail untuk setiap jawaban, membantu Anda memahami aturan grammar dengan lebih baik.',
      route: '/grammar',
    },
    {
      id: 'writing',
      icon: 'history_edu',
      iconBg: 'bg-amber-50',
      iconColor: 'text-amber-700',
      title: 'Writing Review',
      description: 'Latihan menulis email dan esai profesional dengan AI review yang memberikan feedback komprehensif tentang grammar, struktur, dan vocabulary.',
      route: '/writing',
    },
  ]

  return (
    <section className="bg-surface-container-low p-6 md:p-10 rounded-2xl">
      <div className="flex items-center gap-2 mb-8">
        <span className="material-symbols-outlined text-tertiary">auto_awesome</span>
        <h2 className="font-headline font-bold text-xl md:text-2xl text-primary">Fitur Unggulan</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {features.map((feature) => (
          <div
            key={feature.id}
            className="bg-surface-container-lowest p-6 rounded-xl shadow-sm hover:shadow-md transition-shadow flex flex-col h-full border border-surface-container-highest/50"
          >
            <div className={`w-12 h-12 ${feature.iconBg} ${feature.iconColor} rounded-lg flex items-center justify-center mb-4`}>
              <span className="material-symbols-outlined">{feature.icon}</span>
            </div>
            <h3 className="text-lg font-bold text-primary mb-2">{feature.title}</h3>
            <p className="text-sm text-on-surface-variant flex-1">{feature.description}</p>
            <button
              type="button"
              onClick={() => navigate(feature.route)}
              className="mt-4 text-sm font-bold text-primary inline-flex items-center gap-1 hover:underline self-start"
            >
              Pelajari Lebih Lanjut
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </button>
          </div>
        ))}
      </div>

      {/* Bottom CTA */}
      <div className="text-center">
        <button
          type="button"
          onClick={onStartPractice}
          className="px-8 py-3 bg-tertiary text-white text-base font-semibold rounded-xl hover:bg-tertiary/90 transition-colors shadow-lg"
        >
          Mulai Perjalanan Belajarmu Sekarang
        </button>
      </div>
    </section>
  )
}
