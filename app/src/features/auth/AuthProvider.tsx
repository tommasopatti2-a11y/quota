import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { persister, queryClient } from '../../lib/queryClient'

type AuthState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'unauthorized'; session: Session }
  | { status: 'signed-in'; session: Session }

interface AuthContextValue {
  state: AuthState
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/** Verifica che l'utente sia presente in allowed_users (vedi RLS). */
async function isAllowed(session: Session): Promise<boolean> {
  const { data, error } = await supabase
    .from('allowed_users')
    .select('user_id')
    .eq('user_id', session.user.id)
    .maybeSingle()
  if (error) throw error
  return data != null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false

    const resolve = async (session: Session | null) => {
      if (!session) {
        if (!cancelled) setState({ status: 'signed-out' })
        return
      }
      try {
        const ok = await isAllowed(session)
        if (!cancelled) setState({ status: ok ? 'signed-in' : 'unauthorized', session })
      } catch {
        // Offline: si entra comunque con la sessione salvata e i dati in cache.
        if (!cancelled) setState({ status: 'signed-in', session })
      }
    }

    supabase.auth.getSession().then(({ data }) => resolve(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') resolve(session)
    })
    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) throw error
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    queryClient.clear()
    await persister.removeClient()
  }

  return <AuthContext.Provider value={{ state, signIn, signOut }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth fuori da AuthProvider')
  return ctx
}
