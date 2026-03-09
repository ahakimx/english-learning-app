interface Topic {
  id: string
  name: string
  icon: string
  description: string
}

const GRAMMAR_TOPICS: Topic[] = [
  {
    id: 'tenses',
    name: 'Tenses',
    icon: '⏰',
    description: 'Pelajari penggunaan waktu dalam kalimat bahasa Inggris',
  },
  {
    id: 'articles',
    name: 'Articles',
    icon: '📝',
    description: 'Pahami penggunaan a, an, dan the dengan benar',
  },
  {
    id: 'prepositions',
    name: 'Prepositions',
    icon: '📍',
    description: 'Kuasai kata depan seperti in, on, at, dan lainnya',
  },
  {
    id: 'conditionals',
    name: 'Conditionals',
    icon: '🔀',
    description: 'Latihan kalimat pengandaian (if clauses)',
  },
  {
    id: 'passive-voice',
    name: 'Passive Voice',
    icon: '🔄',
    description: 'Pelajari cara mengubah kalimat aktif menjadi pasif',
  },
]

interface TopicSelectorProps {
  onSelect: (topic: string) => void
}

export default function TopicSelector({ onSelect }: TopicSelectorProps) {
  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-800 mb-6">Pilih Topik Grammar</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {GRAMMAR_TOPICS.map((topic) => (
          <button
            key={topic.id}
            type="button"
            aria-label={`Pilih topik ${topic.name}`}
            onClick={() => onSelect(topic.id)}
            className="flex flex-col items-center p-6 bg-white border border-gray-200 rounded-lg shadow-sm hover:border-blue-400 hover:shadow-md transition-all text-center cursor-pointer"
          >
            <span className="text-3xl mb-3" role="img" aria-hidden="true">{topic.icon}</span>
            <span className="text-lg font-medium text-gray-900">{topic.name}</span>
            <span className="text-sm text-gray-500 mt-1">{topic.description}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
