interface WritingTypeSelectorProps {
  onSelect: (type: 'essay' | 'email') => void;
}

const writingTypes = [
  {
    type: 'essay' as const,
    icon: '📄',
    title: 'Essay',
    description: 'Latihan menulis essay dalam bahasa Inggris untuk meningkatkan kemampuan menulis formal.',
  },
  {
    type: 'email' as const,
    icon: '✉️',
    title: 'Email',
    description: 'Latihan menulis email profesional dalam bahasa Inggris untuk komunikasi bisnis.',
  },
];

export default function WritingTypeSelector({ onSelect }: WritingTypeSelectorProps) {
  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-800 mb-2">Pilih Tipe Tulisan</h2>
      <p className="text-gray-500 text-sm mb-6">Pilih jenis tulisan yang ingin Anda latih.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {writingTypes.map((wt) => (
          <button
            key={wt.type}
            type="button"
            onClick={() => onSelect(wt.type)}
            className="flex flex-col items-center text-center p-6 bg-white rounded-lg shadow-sm border border-gray-200 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer"
            data-testid={`writing-type-${wt.type}`}
          >
            <span className="text-4xl mb-3">{wt.icon}</span>
            <span className="text-lg font-semibold text-gray-900 mb-1">{wt.title}</span>
            <span className="text-sm text-gray-500">{wt.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
