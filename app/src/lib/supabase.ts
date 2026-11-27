import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

/** true se le variabili d'ambiente di Supabase sono configurate. */
export const isConfigured = Boolean(url && key)

// La publishable key è pubblica per design: i dati sono protetti da login + RLS.
export const supabase = createClient(url ?? 'http://localhost', key ?? 'missing-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
})
