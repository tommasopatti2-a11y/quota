import { useEffect, useRef, useState, type ReactNode } from 'react'

const THRESHOLD = 70
const MAX = 110

/**
 * Trascina verso il basso dall'inizio della pagina per aggiornare.
 * Funziona sul documento (lo scroll è quello della pagina).
 */
export function PullToRefresh({ onRefresh, children }: { onRefresh: () => Promise<unknown>; children: ReactNode }) {
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const start = useRef<number | null>(null)
  const pullRef = useRef(0)
  const busy = useRef(false)

  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      if (busy.current || window.scrollY > 0 || e.touches.length !== 1) return
      start.current = e.touches[0].clientY
    }
    const onMove = (e: TouchEvent) => {
      if (start.current == null) return
      const dy = e.touches[0].clientY - start.current
      if (dy <= 0 || window.scrollY > 0) {
        pullRef.current = 0
        setPull(0)
        return
      }
      const v = Math.min(MAX, dy * 0.5)
      pullRef.current = v
      setPull(v)
      if (e.cancelable) e.preventDefault()
    }
    const onEnd = async () => {
      if (start.current == null) return
      start.current = null
      const reached = pullRef.current >= THRESHOLD
      pullRef.current = 0
      if (!reached) {
        setPull(0)
        return
      }
      busy.current = true
      setRefreshing(true)
      setPull(THRESHOLD * 0.7)
      try {
        await onRefresh()
      } finally {
        busy.current = false
        setRefreshing(false)
        setPull(0)
      }
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onEnd)
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [onRefresh])

  const progress = Math.min(1, pull / THRESHOLD)
  return (
    <>
      <div className="ptr" style={{ height: pull }} aria-hidden={!refreshing}>
        {(pull > 4 || refreshing) && (
          <span className={`ptr__icon${refreshing ? ' is-spinning' : ''}`} style={{ opacity: progress, transform: `rotate(${progress * 270}deg)` }}>
            ↻
          </span>
        )}
        {refreshing && <span className="sr-only">Aggiornamento in corso</span>}
      </div>
      {children}
    </>
  )
}
