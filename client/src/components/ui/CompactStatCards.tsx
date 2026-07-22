import { ChevronRight } from 'lucide-react'
import clsx from 'clsx'

/** Compact summary cards — sit left, not full-width (matches Figma ~30% row). */
export function CompactStatRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-3 items-stretch">
      {children}
    </div>
  )
}

export function CompactStatCard({
  tone,
  icon,
  value,
  label,
  onClick
}: {
  tone: 'navy' | 'sky' | 'request-red' | 'request-blue' | 'order-blue' | 'order-red' | 'order-green' | 'order-gray' | 'order-orange'
  icon: React.ReactNode
  value: string | number
  label: string
  onClick?: () => void
}) {
  const tones: Record<string, string> = {
    navy: 'bg-suzuki-navy text-white',
    sky: 'bg-suzuki-ice text-suzuki-navy',
    'request-red': 'bg-white text-suzuki-red border border-suzuki-line',
    'request-blue': 'bg-white text-suzuki-navy border border-suzuki-line',
    'order-blue': 'bg-white text-suzuki-blue border border-suzuki-line',
    'order-red': 'bg-white text-suzuki-red border border-suzuki-line',
    'order-green': 'bg-white text-suzuki-ok border border-suzuki-line',
    'order-gray': 'bg-white text-suzuki-mute border border-suzuki-line',
    'order-orange': 'bg-white text-amber-600 border border-suzuki-line'
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'rounded-2xl p-4 text-left shadow-card transition-transform hover:-translate-y-0.5',
        'w-[min(100%,220px)] min-w-[180px]',
        tones[tone]
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="opacity-90">{icon}</div>
        <span
          className={clsx(
            'inline-flex h-7 w-7 items-center justify-center rounded-full shrink-0',
            tone === 'navy' ? 'bg-white/20' : 'bg-black/5'
          )}
        >
          <ChevronRight size={14} />
        </span>
      </div>
      <div className="mt-3 text-3xl font-extrabold tracking-tight leading-none">{value}</div>
      <div className="mt-1.5 text-xs font-semibold opacity-85">{label}</div>
    </button>
  )
}
