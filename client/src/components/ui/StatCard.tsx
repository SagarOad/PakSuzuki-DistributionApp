import { CircleArrowRight } from 'lucide-react'
import clsx from 'clsx'

export type StatCardTone =
  | 'navy'
  | 'sky'
  | 'request-red'
  | 'request-blue'
  | 'order-blue'
  | 'order-red'
  | 'order-green'
  | 'order-gray'
  | 'order-orange'
  | 'light-blue'

const tones: Record<StatCardTone, string> = {
  navy: 'bg-[#00386F] text-white',
  sky: 'bg-suzuki-ice text-suzuki-navy',
  'request-red': 'bg-white text-suzuki-red border border-suzuki-line',
  'request-blue': 'bg-white text-suzuki-navy border border-suzuki-line',
  'order-blue': 'bg-white text-[#00386F] border border-suzuki-line',
  'order-red': 'bg-white text-[#DE0039] border border-suzuki-line',
  'order-green': 'bg-white text-[#0DAB1D] border border-suzuki-line',
  'order-gray': 'bg-white text-[#64748B] border border-suzuki-line',
  'order-orange': 'bg-white text-[#DE6B00] border border-suzuki-line',
  'light-blue' : 'bg-[#BED4FC] text-[#00386F] border border-suzuki-line'
}

/** Flex row for loose card strips (list pages / distributor dashboard). */
export function StatCardRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-3 items-stretch [&>*]:w-[min(100%,220px)] [&>*]:min-w-[180px]">
      {children}
    </div>
  )
}

export function StatCard({
  tone,
  icon,
  value,
  label,
  onClick,
  className
}: {
  tone: StatCardTone
  icon: React.ReactNode
  value: string | number
  label: string
  onClick?: () => void
  className?: string
}) {
  const mutedLabel = tone === 'sky' || tone.startsWith('request') || tone.startsWith('order')

  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'rounded-2xl p-4 text-left shadow-card transition-transform hover:-translate-y-0.5',
        tones[tone],
        className
      )}
    >
      <div className="opacity-90">{icon}</div>
      <div className="mt-3 text-3xl font-extrabold tracking-tight">{value}</div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <div className={clsx('text-xs font-semibold', mutedLabel ? 'opacity-80' : 'opacity-90')}>
          {label}
        </div>
        <span
          className={clsx(
            'inline-flex h-[30px] w-[30px] items-center justify-center rounded-full shrink-0',
            tone === 'navy' ? 'bg-white/20' : 'bg-black/5'
          )}
        >
          <CircleArrowRight size={30} />
        </span>
      </div>
    </button>
  )
}
