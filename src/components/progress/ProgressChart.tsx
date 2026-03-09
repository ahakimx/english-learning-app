import { useMemo } from 'react'

export interface ProgressChartProps {
  title: string
  data: Array<{ date: string; score: number }>
  color: string
}

export default function ProgressChart({ title, data, color }: ProgressChartProps) {
  const maxScore = 100

  const formattedData = useMemo(
    () =>
      data.map((item) => ({
        ...item,
        label: new Date(item.date).toLocaleDateString('id-ID', {
          day: '2-digit',
          month: 'short',
        }),
      })),
    [data],
  )

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">{title}</h3>
        <p className="text-gray-500 text-center py-8">Belum ada data untuk ditampilkan</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">{title}</h3>
      <div className="flex items-end gap-2 h-48" role="img" aria-label={`Grafik ${title}`}>
        {formattedData.map((item, index) => {
          const heightPercent = (item.score / maxScore) * 100
          return (
            <div key={index} className="flex flex-col items-center flex-1 min-w-0">
              <span className="text-xs font-medium mb-1">{item.score}</span>
              <div
                className="w-full rounded-t-sm transition-all duration-300"
                style={{
                  height: `${heightPercent}%`,
                  backgroundColor: color,
                  minHeight: '4px',
                }}
                role="presentation"
              />
              <span className="text-xs text-gray-500 mt-1 truncate w-full text-center">
                {item.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
