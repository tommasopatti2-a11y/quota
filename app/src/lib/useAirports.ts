import { useEffect, useState } from 'react'
import { loadAirports, type Airport } from './airports'

/** Mappa IATA → aeroporto, caricata in modo pigro (null finché non è pronta). */
export function useAirports(): Map<string, Airport> | null {
  const [map, setMap] = useState<Map<string, Airport> | null>(null)
  useEffect(() => {
    let alive = true
    loadAirports().then((m) => alive && setMap(m))
    return () => {
      alive = false
    }
  }, [])
  return map
}
