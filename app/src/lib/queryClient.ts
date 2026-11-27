import { QueryClient } from '@tanstack/react-query'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { del, get, set } from 'idb-keyval'

const WEEK = 1000 * 60 * 60 * 24 * 7

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // I dati cambiano al massimo due volte al giorno: si mostrano subito quelli in cache
      // e si aggiornano in background dopo 5 minuti o con pull-to-refresh.
      staleTime: 1000 * 60 * 5,
      gcTime: WEEK,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
})

export const persister = createAsyncStoragePersister({
  storage: {
    getItem: (k) => get<string>(k).then((v) => v ?? null),
    setItem: (k, v) => set(k, v),
    removeItem: (k) => del(k),
  },
  key: 'quota-cache',
  throttleTime: 1000,
})

export const persistOptions = { persister, maxAge: WEEK, buster: 'v1' }
