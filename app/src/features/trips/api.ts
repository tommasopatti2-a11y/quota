import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import type { Trip, TripInput } from '../../lib/types'

export const tripKeys = {
  all: ['trips'] as const,
}

export function useTrips() {
  return useQuery({
    queryKey: tripKeys.all,
    queryFn: async (): Promise<Trip[]> => {
      const { data, error } = await supabase.from('trips').select('*').order('outbound_date').order('name')
      if (error) throw error
      return data as Trip[]
    },
  })
}

export function useTrip(id: string | undefined) {
  const q = useTrips()
  return { ...q, trip: q.data?.find((t) => t.id === id) }
}

/** Messaggio in italiano per gli errori di Supabase/Postgres. */
export function tripErrorMessage(e: unknown): string {
  const err = e as Partial<PostgrestError> & { message?: string }
  if (err?.code === '23505') return 'Esiste già un viaggio con questo nome.'
  if (err?.code === '23514') return 'Alcuni valori non sono validi. Controlla date, aeroporti e finestra.'
  if (err?.code === '42501') return 'Non hai i permessi per questa operazione.'
  if (/fetch|network|Failed to fetch/i.test(err?.message ?? '')) return 'Connessione assente: modifica non salvata.'
  return 'Operazione non riuscita. Riprova.'
}

const sortTrips = (xs: Trip[]) =>
  [...xs].sort((a, b) => a.outbound_date.localeCompare(b.outbound_date) || a.name.localeCompare(b.name))

export function useToggleTrip() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from('trips').update({ active }).eq('id', id)
      if (error) throw error
    },
    // Aggiornamento ottimistico: l'interruttore cambia subito, si ripristina in caso di errore.
    onMutate: async ({ id, active }) => {
      await qc.cancelQueries({ queryKey: tripKeys.all })
      const previous = qc.getQueryData<Trip[]>(tripKeys.all)
      qc.setQueryData<Trip[]>(tripKeys.all, (xs) => xs?.map((t) => (t.id === id ? { ...t, active } : t)))
      return { previous }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(tripKeys.all, ctx.previous)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: tripKeys.all }),
  })
}

export function useSaveTrip() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: TripInput }): Promise<Trip> => {
      const query = id
        ? supabase.from('trips').update(input).eq('id', id).select().single()
        : supabase.from('trips').insert(input).select().single()
      const { data, error } = await query
      if (error) throw error
      return data as Trip
    },
    onSuccess: (trip) => {
      qc.setQueryData<Trip[]>(tripKeys.all, (xs) => sortTrips([...(xs ?? []).filter((t) => t.id !== trip.id), trip]))
      qc.invalidateQueries({ queryKey: tripKeys.all })
    },
  })
}

export function useDeleteTrip() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('trips').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, id) => {
      qc.setQueryData<Trip[]>(tripKeys.all, (xs) => xs?.filter((t) => t.id !== id))
      qc.invalidateQueries()
    },
  })
}
