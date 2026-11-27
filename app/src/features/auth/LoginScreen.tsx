import { useState, type FormEvent } from 'react'
import { useAuth } from './AuthProvider'
import { Logo } from '../../components/Logo'

function messaggioErrore(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (/invalid login credentials/i.test(msg)) return 'Email o password non corretti.'
  if (/fetch|network/i.test(msg)) return 'Connessione assente. Riprova quando sei online.'
  return 'Accesso non riuscito. Riprova tra poco.'
}

export function LoginScreen() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn(email, password)
    } catch (err) {
      setError(messaggioErrore(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login">
      <div className="login__brand">
        <Logo size={56} />
        <h1>Quota</h1>
        <p className="muted">Il prezzo giusto, al momento giusto.</p>
      </div>

      <form className="card stack" onSubmit={onSubmit} noValidate>
        <label className="field">
          <span className="field__label">Email</span>
          <input
            type="email"
            inputMode="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="field">
          <span className="field__label">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn btn--primary btn--block" disabled={busy || !email || !password}>
          {busy ? 'Accesso in corso…' : 'Accedi'}
        </button>
      </form>
    </main>
  )
}
