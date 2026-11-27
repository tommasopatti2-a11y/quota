// Tipi delle tabelle Supabase (vedi supabase/migrations).

export type Direction = 'outbound' | 'return'
export type SearchStatus = 'ok' | 'empty' | 'error'
export type Priority = 'risparmio' | 'equilibrio' | 'comodita'

export interface Trip {
  id: string
  name: string
  active: boolean
  origin: string
  destination: string
  outbound_date: string // YYYY-MM-DD
  return_date: string
  window_days: number
  passengers: number
  priority: Priority
  group_name: string | null
  created_at: string
  updated_at: string
}

export type TripInput = Pick<
  Trip,
  'name' | 'active' | 'origin' | 'destination' | 'outbound_date' | 'return_date' | 'window_days' | 'passengers' | 'priority' | 'group_name'
>

export interface Search {
  id: number
  trip_id: string
  run_at: string
  direction: Direction
  origin: string
  destination: string
  flight_date: string
  passengers: number
  status: SearchStatus
  results_count: number
  found_count: number | null
  error: string | null
  link: string | null
}

export interface FlightResult {
  id: number
  search_id: number
  trip_id: string
  run_at: string
  direction: Direction
  flight_date: string
  days_left: number
  rank: number
  price: number
  currency: string
  passengers: number
  airlines: string[]
  departure_time: string | null
  arrival_time: string | null
  arrival_day_offset: number
  duration_min: number | null
  flight_min: number | null
  stops: number | null
  via: string[]
}

export interface TripRun {
  trip_id: string
  run_at: string
  searches_total: number
  searches_ok: number
  searches_empty: number
  searches_error: number
  min_outbound: number | null
  min_return: number | null
}
