"""Monitoraggio prezzi voli → Supabase.

Legge i viaggi attivi dalla tabella `trips`, cerca su Google Voli i voli di sola
andata per ogni data della finestra ±gg (aprendo la pagina con un browser vero,
vedi google_voli.py) e salva:
  - una riga in `searches` per ogni data tentata (ok / empty / error);
  - in `results`, per ogni ricerca riuscita, le alternative utili: i più economici,
    il diretto e l'1 scalo più economici, i più veloci e i migliori compromessi
    prezzo/tempo per ciascuna priorità (al massimo MAX_RISULTATI_PER_DATA voli).

Variabili d'ambiente:
  SUPABASE_URL         es. https://xxxx.supabase.co
  SUPABASE_SECRET_KEY  secret key (o service_role key legacy): ignora RLS,
                       va tenuta SOLO nei secret di GitHub Actions.
  DRY_RUN=1            facoltativo: cerca i voli ma stampa invece di scrivere.
  CHROMIUM_PATH        facoltativo: percorso di un Chromium già installato.

Prova di una singola ricerca, senza database (utile per il debug):
  python flight_monitor.py --prova FCO GLA 2027-08-10 [passeggeri]
"""

from __future__ import annotations

import os
import re
import sys
import time
import traceback
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import airportsdata
import requests
from fast_flights import FlightQuery, Passengers, create_query

from google_voli import GoogleBloccato, GoogleVoli

PAUSA_SECONDI = 5.0
MAX_TENTATIVI = 3
ATTESE_RIPROVA = (15, 45)  # secondi prima del 2° e del 3° tentativo
MAX_RISULTATI_PER_DATA = 10
# Pesi delle priorità (€/ora, € per scalo, a persona): devono coincidere con
# public.priority_weights in supabase/migrations/0004_priority.sql.
PESI_PRIORITA = {"equilibrio": (20, 30), "comodita": (50, 75), "risparmio": (5, 10)}
VALUTA = "EUR"
FUSO_ORARIO = ZoneInfo("Europe/Rome")
HTTP_TIMEOUT = 30

AEROPORTI = airportsdata.load("IATA")


# ---------------------------------------------------------------------------
# Supabase (PostgREST) — client minimale, nessuna dipendenza extra
# ---------------------------------------------------------------------------
class Supabase:
    def __init__(self, url: str, key: str):
        self.base = url.rstrip("/") + "/rest/v1"
        self.session = requests.Session()
        self.session.headers.update({"apikey": key, "Content-Type": "application/json"})
        # Le chiavi legacy (JWT) vanno anche in Authorization; le nuove sb_secret_ no.
        if key.startswith("eyJ"):
            self.session.headers["Authorization"] = f"Bearer {key}"

    def _check(self, resp: requests.Response) -> requests.Response:
        if resp.status_code >= 400:
            # Solo codice e messaggio: i "details" possono contenere i dati della riga.
            try:
                corpo = resp.json()
                info = f"{corpo.get('code')}: {corpo.get('message')}"
            except ValueError:
                info = resp.text[:200]
            tabella = resp.request.path_url.split("?")[0].rsplit("/", 1)[-1]
            raise RuntimeError(f"Supabase {resp.request.method} {tabella} → {resp.status_code} {info}")
        return resp

    def select(self, table: str, params: dict) -> list[dict]:
        return self._check(self.session.get(f"{self.base}/{table}", params=params, timeout=HTTP_TIMEOUT)).json()

    def insert(self, table: str, rows: list[dict], returning: bool = False) -> list[dict]:
        if not rows:
            return []
        headers = {"Prefer": "return=representation" if returning else "return=minimal"}
        resp = self._check(self.session.post(f"{self.base}/{table}", json=rows, headers=headers, timeout=HTTP_TIMEOUT))
        return resp.json() if returning else []

    def update(self, table: str, filters: dict, values: dict) -> None:
        self._check(self.session.patch(f"{self.base}/{table}", params=filters, json=values,
                                       headers={"Prefer": "return=minimal"}, timeout=HTTP_TIMEOUT))


class DryRun:
    """Sostituto di Supabase che stampa le scritture (DRY_RUN=1)."""

    def __init__(self, real: Supabase | None):
        self.real = real
        self._id = 0

    def select(self, table, params):
        if self.real is None:
            raise RuntimeError("DRY_RUN senza credenziali: impossibile leggere i viaggi")
        return self.real.select(table, params)

    def insert(self, table, rows, returning=False):
        print(f"[dry-run] insert {table}: {len(rows)} righe")
        for r in rows[:5]:
            print("   ", r)
        out = []
        for r in rows:
            self._id += 1
            out.append({**r, "id": self._id})
        return out if returning else []

    def update(self, table, filters, values):
        print(f"[dry-run] update {table} {filters} → {values}")


# ---------------------------------------------------------------------------
# Utilità
# ---------------------------------------------------------------------------
def oggi_locale() -> date:
    return datetime.now(FUSO_ORARIO).date()


def genera_date(base: date, delta: int, da: date) -> list[date]:
    """Date base±delta, escluse quelle già passate rispetto a `da`."""
    return [d for d in (base + timedelta(days=i) for i in range(-delta, delta + 1)) if d >= da]


def prezzo_numerico(valore) -> float | None:
    if isinstance(valore, (int, float)):
        return float(valore) if valore > 0 else None
    if not valore:
        return None
    testo = re.sub(r"[^\d.,]", "", str(valore))
    if not testo:
        return None
    if "." in testo and "," in testo:
        if testo.rfind(",") > testo.rfind("."):
            testo = testo.replace(".", "").replace(",", ".")
        else:
            testo = testo.replace(",", "")
    elif re.search(r"[.,]\d{1,2}$", testo):
        testo = testo.replace(",", ".")
    else:
        testo = testo.replace(".", "").replace(",", "")
    try:
        v = float(testo)
    except ValueError:
        return None
    return v if v > 0 else None


def _hhmm(t) -> str | None:
    if isinstance(t, (tuple, list)) and len(t) >= 2:
        return f"{int(t[0] or 0):02d}:{int(t[1] or 0):02d}"
    return None


def _local_dt(sdt) -> datetime | None:
    """SimpleDatetime (date=(y,m,d), time=(h,m)) → datetime naive."""
    try:
        y, m, d = (int(x) for x in sdt.date[:3])
        h, mi = (int(x or 0) for x in sdt.time[:2])
        return datetime(y, m, d, h, mi)
    except Exception:
        return None


def _tz(codice: str) -> ZoneInfo | None:
    info = AEROPORTI.get(codice or "")
    try:
        return ZoneInfo(info["tz"]) if info and info.get("tz") else None
    except Exception:
        return None


@dataclass
class Volo:
    prezzo: float
    compagnie: list[str]
    partenza: str | None
    arrivo: str | None
    giorni_offset: int
    durata_min: int | None
    volo_min: int | None
    scali: int | None
    via: list[str]


def estrai_volo(volo) -> Volo | None:
    prezzo = prezzo_numerico(getattr(volo, "price", None))
    if prezzo is None:
        return None

    airlines = getattr(volo, "airlines", None) or []
    compagnie = [str(a).strip() for a in airlines if str(a).strip()] if isinstance(airlines, (list, tuple)) else [str(airlines)]

    segmenti = list(getattr(volo, "flights", None) or [])
    if not segmenti:
        return Volo(prezzo, compagnie, None, None, 0, None, None, None, [])

    primo, ultimo = segmenti[0], segmenti[-1]
    dep_local = _local_dt(primo.departure)
    arr_local = _local_dt(ultimo.arrival)

    volo_min = sum(s.duration for s in segmenti if isinstance(getattr(s, "duration", None), int)) or None

    durata_min = None
    tz_dep, tz_arr = _tz(primo.from_airport.code), _tz(ultimo.to_airport.code)
    if dep_local and arr_local and tz_dep and tz_arr:
        delta = arr_local.replace(tzinfo=tz_arr) - dep_local.replace(tzinfo=tz_dep)
        minuti = int(delta.total_seconds() // 60)
        if minuti > 0:
            durata_min = minuti

    giorni_offset = (arr_local.date() - dep_local.date()).days if dep_local and arr_local else 0

    return Volo(
        prezzo=prezzo,
        compagnie=compagnie,
        partenza=_hhmm(primo.departure.time),
        arrivo=_hhmm(ultimo.arrival.time),
        giorni_offset=max(giorni_offset, 0),
        durata_min=durata_min,
        volo_min=volo_min,
        scali=len(segmenti) - 1,
        via=[s.to_airport.code for s in segmenti[:-1]],
    )


# ---------------------------------------------------------------------------
# Selezione delle alternative da salvare
# ---------------------------------------------------------------------------
def _durata(v: Volo) -> int | None:
    return v.durata_min or v.volo_min


def punteggio(v: Volo, passeggeri: int, ora_eur: float, scalo_eur: float) -> float | None:
    """Costo percepito a persona: prezzo + valore del tempo + penalità per scalo."""
    durata = _durata(v)
    if durata is None or v.scali is None:
        return None
    return v.prezzo / passeggeri + ora_eur * durata / 60 + scalo_eur * v.scali


def seleziona_alternative(voli: list[Volo], passeggeri: int) -> list[Volo]:
    """Sceglie i voli da salvare per una data, senza doppioni, ordinati per prezzo.

    Se i voli sono al massimo MAX_RISULTATI_PER_DATA si tengono tutti; altrimenti, in
    ordine di precedenza (se si supera il limite restano i primi):
    3 più economici, diretto più economico, 1 scalo più economico, 2 più veloci,
    i 3 migliori compromessi per ciascuna priorità, poi i più economici rimasti.
    """
    unici: dict[tuple, Volo] = {}
    for v in voli:  # Google a volte ripete lo stesso volo
        unici.setdefault((v.prezzo, v.partenza, v.arrivo, tuple(v.compagnie), v.scali), v)
    voli = list(unici.values())
    if len(voli) <= MAX_RISULTATI_PER_DATA:  # pochi voli: si tengono tutti
        return sorted(voli, key=lambda v: (v.prezzo, _durata(v) or 0))
    per_prezzo = sorted(voli, key=lambda v: v.prezzo)
    candidati: list[Volo] = per_prezzo[:3]
    for scali in (0, 1):
        candidati += [v for v in per_prezzo if v.scali == scali][:1]
    candidati += sorted((v for v in voli if _durata(v) is not None), key=lambda v: (_durata(v), v.prezzo))[:2]
    for ora_eur, scalo_eur in PESI_PRIORITA.values():
        con_punteggio = [(punteggio(v, passeggeri, ora_eur, scalo_eur), v) for v in voli]
        candidati += [v for p, v in sorted((x for x in con_punteggio if x[0] is not None), key=lambda x: (x[0], x[1].prezzo))[:3]]
    # Posti rimasti liberi: i successivi più economici.
    candidati += per_prezzo

    scelti, visti = [], set()
    for v in candidati:
        chiave = (v.prezzo, v.partenza, v.arrivo, tuple(v.compagnie), v.scali)
        if chiave in visti:
            continue
        visti.add(chiave)
        scelti.append(v)
        if len(scelti) == MAX_RISULTATI_PER_DATA:
            break
    return sorted(scelti, key=lambda v: (v.prezzo, _durata(v) or 0))


# ---------------------------------------------------------------------------
# Ricerca
# ---------------------------------------------------------------------------
def crea_query(origine: str, destinazione: str, data_volo: date, passeggeri: int):
    return create_query(
        flights=[FlightQuery(date=data_volo.isoformat(), from_airport=origine, to_airport=destinazione)],
        trip="one-way",
        seat="economy",
        passengers=Passengers(adults=passeggeri),
        currency=VALUTA,
        language="it",
    )


def cerca_data(gv: GoogleVoli, origine: str, destinazione: str, data_volo: date, passeggeri: int):
    """Ritorna (status, voli scelti, voli trovati da Google, errore, link)."""
    link = crea_query(origine, destinazione, data_volo, passeggeri).url()
    ultimo_errore = None
    for tentativo in range(1, MAX_TENTATIVI + 1):
        try:
            trovati = [v for v in (estrai_volo(x) for x in gv.cerca(link, accetta_parziale=tentativo == MAX_TENTATIVI)) if v is not None]
            voli = seleziona_alternative(trovati, passeggeri)
            return ("ok" if voli else "empty"), voli, len(trovati), None, link
        except Exception as e:  # noqa: BLE001
            ultimo_errore = f"{type(e).__name__}: {e}"[:500]
            print(f"  tentativo {tentativo}/{MAX_TENTATIVI} fallito: {ultimo_errore}")
            if not isinstance(e, GoogleBloccato) and tentativo == 1:
                traceback.print_exc()
            if tentativo < MAX_TENTATIVI:
                time.sleep(ATTESE_RIPROVA[tentativo - 1])
    return "error", [], 0, ultimo_errore, link


def etichetta(viaggio: dict) -> str:
    """Identificativo breve del viaggio per i log pubblici (senza nome, tratta o date)."""
    return f"viaggio {str(viaggio['id'])[:8]}"


def monitora_viaggio(db, gv: GoogleVoli, viaggio: dict, run_at: str, oggi: date) -> dict:
    origine, destinazione = viaggio["origin"], viaggio["destination"]
    passeggeri = int(viaggio.get("passengers") or 1)
    finestra = int(viaggio.get("window_days") or 0)
    andata = date.fromisoformat(viaggio["outbound_date"])
    ritorno = date.fromisoformat(viaggio["return_date"])

    piano = [("outbound", origine, destinazione, d, andata) for d in genera_date(andata, finestra, oggi)] + [
        ("return", destinazione, origine, d, ritorno) for d in genera_date(ritorno, finestra, oggi)
    ]

    searches, voli_per_ricerca = [], {}
    conteggio = {"ok": 0, "empty": 0, "error": 0}
    for direzione, da, a, data_volo, centro in piano:
        # Log anonimi (il repository è pubblico): niente tratte né date.
        print(f"{'Andata' if direzione == 'outbound' else 'Ritorno'}, giorno {(data_volo - centro).days:+d}")
        t0 = time.time()
        status, voli, trovati, errore, link = cerca_data(gv, da, a, data_volo, passeggeri)
        conteggio[status] += 1
        print(f"  {status}: {trovati} voli trovati, {len(voli)} salvati ({time.time() - t0:.1f}s; {gv.diagnosi})")
        searches.append({
            "trip_id": viaggio["id"],
            "run_at": run_at,
            "direction": direzione,
            "origin": da,
            "destination": a,
            "flight_date": data_volo.isoformat(),
            "passengers": passeggeri,
            "status": status,
            "results_count": len(voli),
            "found_count": trovati,
            "error": errore,
            "link": link,
        })
        voli_per_ricerca[(direzione, data_volo.isoformat())] = voli
        time.sleep(PAUSA_SECONDI)

    inserite = db.insert("searches", searches, returning=True)
    results = []
    for s in inserite:
        data_volo = date.fromisoformat(s["flight_date"])
        for rank, v in enumerate(voli_per_ricerca.get((s["direction"], s["flight_date"]), []), start=1):
            results.append({
                "search_id": s["id"],
                "trip_id": viaggio["id"],
                "run_at": run_at,
                "direction": s["direction"],
                "flight_date": s["flight_date"],
                "days_left": (data_volo - oggi).days,
                "rank": rank,
                "price": round(v.prezzo, 2),
                "currency": VALUTA,
                "passengers": passeggeri,
                "airlines": v.compagnie,
                "departure_time": v.partenza,
                "arrival_time": v.arrivo,
                "arrival_day_offset": v.giorni_offset,
                "duration_min": v.durata_min,
                "flight_min": v.volo_min,
                "stops": v.scali,
                "via": v.via,
            })
    db.insert("results", results)
    print(f"Salvate {len(searches)} ricerche e {len(results)} voli per {etichetta(viaggio)} {conteggio}.")
    return conteggio


def esegui_monitoraggio() -> int:
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SECRET_KEY")
    real = Supabase(url, key) if url and key else None
    db = DryRun(real) if os.environ.get("DRY_RUN") == "1" else real
    if db is None:
        print("Mancano SUPABASE_URL e/o SUPABASE_SECRET_KEY.")
        return 2

    oggi = oggi_locale()
    run_at = datetime.now(timezone.utc).replace(second=0, microsecond=0).isoformat()
    viaggi = db.select("trips", {"active": "eq.true", "select": "*", "order": "created_at"})
    print(f"Rilevazione {run_at} — {len(viaggi)} viaggi attivi.")

    totale = {"ok": 0, "empty": 0, "error": 0}
    da_cercare = []
    for viaggio in viaggi:
        if date.fromisoformat(viaggio["outbound_date"]) < oggi:
            print(f"{etichetta(viaggio)}: data di andata passata, disattivo il viaggio.")
            db.update("trips", {"id": f"eq.{viaggio['id']}"}, {"active": False})
            continue
        da_cercare.append(viaggio)

    if da_cercare:
        with GoogleVoli() as gv:
            for viaggio in da_cercare:
                print(f"\n--- {etichetta(viaggio)} ---")
                try:
                    esito = monitora_viaggio(db, gv, viaggio, run_at, oggi)
                except Exception:  # un viaggio non deve bloccare gli altri
                    traceback.print_exc()
                    esito = {"error": 1}
                for k, v in esito.items():
                    totale[k] = totale.get(k, 0) + v

    print(f"\nRiepilogo: {totale}")
    # Fallisce il job (notifica di GitHub) solo se non è riuscita nessuna ricerca.
    if totale["error"] and not (totale["ok"] or totale["empty"]):
        return 1
    return 0


def prova(origine: str, destinazione: str, data_str: str, passeggeri: int = 1) -> int:
    """Una ricerca singola con stampa di tutti i voli trovati, senza database."""
    data_volo = date.fromisoformat(data_str)
    with GoogleVoli() as gv:
        t0 = time.time()
        status, voli, trovati, errore, link = cerca_data(gv, origine.upper(), destinazione.upper(), data_volo, passeggeri)
        diagnosi = gv.diagnosi
    print(f"{status}: {trovati} voli trovati in {time.time() - t0:.1f}s, {len(voli)} da salvare ({diagnosi})")
    print(link)
    if errore:
        print("Errore:", errore)
    for v in voli:
        print(f"  {v.prezzo:>8.0f} €  {v.partenza}-{v.arrivo}  {v.scali} scali {','.join(v.via):<9} "
              f"{(v.durata_min or 0) // 60}h{(v.durata_min or 0) % 60:02d}  {', '.join(v.compagnie)}")
    return 0 if status != "error" else 1


if __name__ == "__main__":
    if len(sys.argv) >= 5 and sys.argv[1] == "--prova":
        sys.exit(prova(sys.argv[2], sys.argv[3], sys.argv[4], int(sys.argv[5]) if len(sys.argv) > 5 else 1))
    sys.exit(esegui_monitoraggio())
