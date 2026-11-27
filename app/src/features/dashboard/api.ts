import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { buildDashboard, type DashboardRaw } from './model'

export function useDashboard(tripId: string | undefined) {
  return useQuery({
    queryKey: ['dashboard', tripId],
    enabled: Boolean(tripId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('trip_dashboard', { p_trip: tripId })
      if (error) throw error
      return data as DashboardRaw
    },
    select: buildDashboard,
  })
}
