import { useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import clsx from 'clsx'

export type ChartPeriod = 'Week' | 'Month' | 'Year'

interface Point {
  label: string
  amount: number
  orderCount?: number
}

export function ProfileChart({
  title,
  points,
  period,
  onPeriodChange
}: {
  title: string
  points: Point[]
  period: ChartPeriod
  onPeriodChange: (p: ChartPeriod) => void
}) {
  const values = useMemo(() => points.map((p) => Number(p.amount) || 0), [points])
  const w = 360
  const h = 160
  const pad = 28
  const max = Math.max(...values, 1)

  const coords = values.map((v, i) => {
    const x = pad + (i * (w - pad * 2)) / Math.max(values.length - 1, 1)
    const y = h - pad - (v / max) * (h - pad * 2)
    return [x, y] as const
  })

  const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ')
  const area =
    coords.length > 0
      ? `${line} L${coords[coords.length - 1][0]},${h - pad} L${coords[0][0]},${h - pad} Z`
      : ''

  return (
    <div className="bg-white rounded-2xl border border-suzuki-line shadow-card p-4 h-full">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-suzuki-navy">{title}</h2>
        <div className="flex rounded-full bg-suzuki-mist p-0.5 text-xs font-semibold">
          {(['Week', 'Month', 'Year'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onPeriodChange(p)}
              className={clsx(
                'px-3 py-1 rounded-full transition-colors',
                period === p ? 'bg-suzuki-navy text-white' : 'text-suzuki-mute hover:text-suzuki-ink'
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {values.every((v) => v === 0) ? (
        <div className="h-44 flex items-center justify-center text-sm text-suzuki-mute">
          No sales data for this period.
        </div>
      ) : (
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-44" role="img" aria-label={title}>
          {[0.25, 0.5, 0.75, 1].map((t) => (
            <line
              key={t}
              x1={pad}
              x2={w - 8}
              y1={h - pad - t * (h - pad * 2)}
              y2={h - pad - t * (h - pad * 2)}
              stroke="#E2E8F0"
              strokeDasharray="4 4"
            />
          ))}
          <path d={area} fill="url(#profileSalesFill)" />
          <path d={line} fill="none" stroke="#005BAC" strokeWidth="2.5" strokeLinecap="round" />
          {coords.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="3.5" fill="#005BAC" />
          ))}
          {points.map((p, i) => (
            <text
              key={p.label + i}
              x={coords[i]?.[0] ?? 0}
              y={h - 8}
              textAnchor="middle"
              className="fill-suzuki-mute"
              style={{ fontSize: 9, fontWeight: 600 }}
            >
              {p.label}
            </text>
          ))}
          <defs>
            <linearGradient id="profileSalesFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7EB6E8" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#7EB6E8" stopOpacity="0.02" />
            </linearGradient>
          </defs>
        </svg>
      )}
    </div>
  )
}

export function useChartPeriod(initial: ChartPeriod = 'Month'): [ChartPeriod, Dispatch<SetStateAction<ChartPeriod>>] {
  return useState<ChartPeriod>(initial)
}
