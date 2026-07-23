import { useMemo } from 'react'
import {
  StatsGraph,
  useChartPeriod,
  type ChartPeriod,
  type StatsGraphSize
} from '@/components/ui/StatsGraph'

export type { ChartPeriod }
export { useChartPeriod }

interface Point {
  label: string
  amount: number
  orderCount?: number
}

/** Profile sales chart — thin wrapper around StatsGraph with labeled points. */
export function ProfileChart({
  title,
  points,
  period,
  onPeriodChange,
  size = 'small'
}: {
  title: string
  points: Point[]
  period: ChartPeriod
  onPeriodChange: (p: ChartPeriod) => void
  size?: StatsGraphSize
}) {
  const values = useMemo(() => points.map((p) => Number(p.amount) || 0), [points])
  const labels = useMemo(() => points.map((p) => p.label), [points])

  return (
    <StatsGraph
      title={title}
      points={values}
      labels={labels}
      period={period}
      onPeriodChange={onPeriodChange}
      emptyMessage="No sales data for this period."
      size={size}
      className="h-full"
    />
  )
}
