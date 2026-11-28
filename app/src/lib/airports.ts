// Ricerca aeroporti per l'inserimento dei viaggi.
// L'elenco (~120 KB compressi) viene caricato solo quando serve.

export interface Airport {
  code: string
  name: string
  city: string
  country: string // ISO2
  /** Presente solo per le città: codici degli aeroporti inclusi (es. ROM → CIA, FCO). */
  airports?: string[]
}

type Row = [string, string, string, string]
type CityRow = [string, string, string, string[]]

let cache: Promise<Map<string, Airport>> | null = null

/** Aeroporti e città (codici metropolitani) indicizzati per codice. */
export function loadAirports(): Promise<Map<string, Airport>> {
  cache ??= import('../data/airports.json').then((m) => {
    const data = m.default as unknown as { airports: Row[]; cities: CityRow[] }
    const map = new Map<string, Airport>(data.airports.map(([code, name, city, country]) => [code, { code, name, city, country }]))
    for (const [code, city, country, airports] of data.cities) {
      map.set(code, { code, name: 'Tutti gli aeroporti', city, country, airports })
    }
    return map
  })
  return cache
}

export const isCity = (a: Airport | undefined | null) => Boolean(a?.airports?.length)

/** Etichetta breve di un codice: "Roma (tutti)", "FCO". */
export const placeLabel = (code: string, map: Map<string, Airport> | null) =>
  map && isCity(map.get(code)) ? `${map.get(code)!.city} (tutti)` : code

const regionNames = new Intl.DisplayNames(['it'], { type: 'region' })
export const countryName = (iso2: string) => {
  try {
    return regionNames.of(iso2) ?? iso2
  } catch {
    return iso2
  }
}

// Nomi italiani delle città più comuni → nome inglese usato nell'elenco.
const ALIAS: Record<string, string> = {
  roma: 'rome', milano: 'milan', venezia: 'venice', napoli: 'naples', firenze: 'florence', torino: 'turin',
  genova: 'genoa', londra: 'london', parigi: 'paris', monaco: 'munich', 'monaco di baviera': 'munich',
  mosca: 'moscow', atene: 'athens', lisbona: 'lisbon', siviglia: 'seville', bruxelles: 'brussels',
  copenaghen: 'copenhagen', varsavia: 'warsaw', praga: 'prague', vienna: 'vienna', ginevra: 'geneva',
  zurigo: 'zurich', francoforte: 'frankfurt', berlino: 'berlin', amburgo: 'hamburg', colonia: 'cologne',
  edimburgo: 'edinburgh', dublino: 'dublin', stoccolma: 'stockholm', 'città del messico': 'mexico city',
  'città del capo': 'cape town', pechino: 'beijing', 'nuova delhi': 'new delhi', 'new york': 'new york',
  'il cairo': 'cairo', cairo: 'cairo', tokio: 'tokyo', seul: 'seoul', 'san paolo': 'sao paulo',
  'rio de janeiro': 'rio de janeiro', istanbul: 'istanbul', barcellona: 'barcelona', marsiglia: 'marseille',
  nizza: 'nice', lione: 'lyon', anversa: 'antwerp', cracovia: 'krakow', bucarest: 'bucharest',
  belgrado: 'belgrade', 'tel aviv': 'tel aviv', gerusalemme: 'jerusalem', 'la valletta': 'luqa', malta: 'luqa',
  cagliari: 'cagliari', palermo: 'palermo', catania: 'catania', bari: 'bari', bologna: 'bologna',
  'san francisco': 'san francisco', 'los angeles': 'los angeles', singapore: 'singapore', sydney: 'sydney',
}

// Grandi hub: a parità di corrispondenza compaiono per primi.
const HUBS = new Set(
  ('FCO MXP LIN BGY VCE NAP FLR BLQ TRN CTA PMO BRI CAG PSA ' +
    'LHR LGW STN CDG ORY AMS FRA MUC MAD BCN LIS DUB ZRH VIE BRU CPH ARN OSL HEL ATH IST WAW PRG BUD ' +
    'JFK EWR LGA LAX SFO ORD MIA BOS IAD YYZ YUL MEX GRU EZE ' +
    'DXB DOH AUH CAI TLV JNB CPT ' +
    'SIN HKG BKK KUL NRT HND ICN PEK PVG DEL BOM SYD MEL BNE PER AKL').split(' '),
)

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()

export function searchAirports(all: Map<string, Airport>, query: string, limit = 8): Airport[] {
  const q = norm(query)
  if (!q) return []
  const alias = ALIAS[q] ? norm(ALIAS[q]) : null
  const scored: { a: Airport; s: number }[] = []

  for (const a of all.values()) {
    const code = a.code.toLowerCase()
    const city = norm(a.city)
    const name = norm(a.name)
    let s = 0
    if (code === q) s = 100
    else if (alias && city === alias) s = 80
    else if (city === q) s = 75
    else if (alias && city.startsWith(alias)) s = 60
    else if (city.startsWith(q)) s = 55
    else if (q.length >= 3 && name.includes(q)) s = 40
    else if (code.startsWith(q)) s = 30
    if (!s) continue
    if (HUBS.has(a.code)) s += 30
    if (isCity(a)) s += 40 // la città intera prima dei suoi aeroporti
    scored.push({ a, s })
  }
  const ranked = scored.sort((x, y) => y.s - x.s || x.a.city.localeCompare(y.a.city)).map((x) => x.a)

  // Ogni città è seguita subito dai suoi aeroporti.
  const out: Airport[] = []
  const seen = new Set<string>()
  const push = (a: Airport | undefined) => {
    if (a && !seen.has(a.code)) {
      seen.add(a.code)
      out.push(a)
    }
  }
  for (const a of ranked) {
    if (seen.has(a.code)) continue
    push(a)
    if (isCity(a)) a.airports!.forEach((c) => push(all.get(c)))
    if (out.length >= limit) break
  }
  return out.slice(0, Math.max(limit, out.length))
}
