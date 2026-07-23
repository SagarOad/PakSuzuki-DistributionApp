import { useId, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import clsx from 'clsx'

export type ChartPeriod = 'Week' | 'Month' | 'Year'
/** `small` = compact (dashboard column). `large` = taller/wider plot (orders page). */
export type StatsGraphSize = 'small' | 'large'

const WEEK_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const SIZE_CONFIG = {
  small: { w: 360, h: 160, pad: 28, svgClass: 'w-full h-44', emptyClass: 'h-44' },
  large: { w: 720, h: 220, pad: 28, svgClass: 'w-full h-64', emptyClass: 'h-64' }
} as const

function defaultLabels(count: number): string[] {
  if (count <= 7) return WEEK_LABELS.slice(0, count)
  return MONTH_LABELS.slice(0, count)
}

function smoothPath(coords: readonly (readonly [number, number])[]) {
  if (coords.length === 0) return ''
  if (coords.length === 1) return `M${coords[0][0]},${coords[0][1]}`
  let d = `M${coords[0][0]},${coords[0][1]}`
  for (let i = 0; i < coords.length - 1; i++) {
    const [x0, y0] = coords[i]
    const [x1, y1] = coords[i + 1]
    const cx = (x0 + x1) / 2
    d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`
  }
  return d
}

export function StatsGraph({
  title,
  points,
  labels,
  period,
  onPeriodChange,
  emptyMessage = 'No data for this period.',
  ariaLabel,
  className,
  size = 'small'
}: {
  title: string
  points: number[]
  labels?: string[]
  period?: ChartPeriod
  onPeriodChange?: (p: ChartPeriod) => void
  emptyMessage?: string
  ariaLabel?: string
  className?: string
  size?: StatsGraphSize
}) {
  const gradId = useId().replace(/:/g, '')
  const { w, h, pad, svgClass, emptyClass } = SIZE_CONFIG[size]
  const max = Math.max(...points, 1)
  const axisLabels = labels ?? defaultLabels(points.length)
  const isEmpty = points.length === 0 || points.every((v) => v === 0)

  const coords = useMemo(
    () =>
      points.map((v, i) => {
        const x = pad + (i * (w - pad * 2)) / Math.max(points.length - 1, 1)
        const y = h - pad - (v / max) * (h - pad * 2)
        return [x, y] as const
      }),
    [points, max, w, h, pad]
  )

  const line = smoothPath(coords)
  const area =
    coords.length > 0
      ? `${line} L${coords[coords.length - 1][0]},${h - pad} L${coords[0][0]},${h - pad} Z`
      : ''

  return (
    <div
      className={clsx(
        'w-full bg-white rounded-2xl border border-suzuki-line shadow-card p-4',
        className
      )}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3">
        <h2 className="text-base sm:text-lg font-bold text-suzuki-navy">{title}</h2>
        {period && onPeriodChange && (
          <div className="flex rounded-full bg-suzuki-mist p-0.5 text-xs font-semibold self-start sm:self-auto">
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
        )}
      </div>

      {isEmpty ? (
        <div className={clsx(emptyClass, 'flex items-center justify-center text-sm text-suzuki-mute')}>
          {emptyMessage}
        </div>
      ) : (
        <svg viewBox={`0 0 ${w} ${h}`} className={svgClass} role="img" aria-label={ariaLabel ?? title}>
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
          <path d={area} fill={`url(#${gradId})`} />
          <path d={line} fill="none" stroke="#005BAC" strokeWidth="2.5" strokeLinecap="round" />
          {axisLabels.map((label, i) => (
            <text
              key={label + i}
              x={coords[i]?.[0] ?? 0}
              y={h - 8}
              textAnchor="middle"
              className="fill-suzuki-mute"
              style={{ fontSize: size === 'large' ? 11 : 9, fontWeight: 600 }}
            >
              {label}
            </text>
          ))}
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
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
