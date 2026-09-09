import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/axiosClient'

/** System-wide WHT % and amount estimated from cart/order subtotal. */
export function useOrderWhtEstimate(subTotal: number) {
  const query = useQuery({
    queryKey: ['wht-percent'],
    queryFn: async () => (await api.get<{ key: string; value: string }>('/settings/wht-percent')).data,
    staleTime: 60_000
  })

  return useMemo(() => {
    const percent = Number(query.data?.value ?? 0)
    const safePercent = Number.isFinite(percent) && percent > 0 ? percent : 0
    const amount = Math.round(((subTotal * safePercent) / 100) * 100) / 100
    return {
      whtPercent: safePercent,
      whtAmount: amount,
      estimatedTotal: Math.round((subTotal + amount) * 100) / 100,
      isLoading: query.isLoading
    }
  }, [query.data?.value, query.isLoading, subTotal])
}
