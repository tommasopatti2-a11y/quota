# flight-monitor · Quota

Monitoraggio automatico dei prezzi dei voli con un'app mobile personale per consultarli.

| Parte | Dove | Cosa fa |
|---|---|---|
| Scraper | `flight_monitor.py`, `google_voli.py` + `.github/workflows/monitor.yml` | Due volte al giorno apre Google Voli con un browser (Chromium) per ogni data dei viaggi attivi e salva i prezzi su Supabase |
| Database | `supabase/migrations/` | Postgres su Supabase (piano gratuito), con login e regole di accesso (RLS) |
| App | `app/` | **Quota**, PWA installabile su Android: gestione viaggi e dashboard prezzi |

La configurazione passo passo (Supabase, secret di GitHub, Cloudflare Pages, installazione sul telefono) è in [`docs/SETUP.md`](docs/SETUP.md).

## Modello dati

- `trips` — viaggi monitorati (ID stabile: il nome si può cambiare senza perdere lo storico).
- `searches` — una riga per ogni data cercata in ogni rilevazione, con esito `ok` / `empty` / `error`:
  così una data mancante per errore dello scraper non viene confusa con "nessun volo".
- `results` — per ogni ricerca riuscita le alternative utili (fino a 10): i 3 più economici, il diretto e l'1 scalo più economici, i 2 più veloci e i migliori compromessi per ogni priorità. `price` è il **totale per tutti i passeggeri** del viaggio.

### Scelta del volo consigliato

Ogni viaggio ha una **priorità** (`risparmio`, `equilibrio`, `comodita`) che pesa prezzo, tempo e scali:

    costo percepito a persona = prezzo a persona + €/ora × ore di viaggio + € per scalo × scali

| Priorità | €/ora | € per scalo |
|---|---|---|
| Risparmio | 5 | 10 |
| Equilibrio | 20 | 30 |
| Comodità | 50 | 75 |

Il volo **consigliato** di una data è quello con il costo percepito più basso. I pesi sono definiti in `public.priority_weights` (SQL) e replicati in `PESI_PRIORITA` (`flight_monitor.py`, usati solo per scegliere quali voli salvare).
- Viste `trip_runs` e `min_by_flight_date`, e la funzione `trip_dashboard(trip)` che restituisce in un'unica chiamata tutti i dati aggregati della dashboard (prezzi normalizzati a persona).

L'elenco aeroporti dell'app (`app/src/data/airports.json`) si rigenera con `python scripts/build_airports.py`.

## Come lo scraper legge Google Voli

La pagina che Google invia subito contiene spesso pochi voli o nessuno: il resto arriva poco dopo con una richiesta `GetShoppingResults` fatta dagli script della pagina. Per questo `google_voli.py` apre la pagina con Chromium (Playwright), aspetta quella risposta e la legge, includendo sia i "voli migliori" sia gli "altri voli". `searches.found_count` registra quanti voli ha restituito Google; nell'app la schermata *Dati grezzi* mostra l'esito di ogni ricerca.

Prova di una singola ricerca, senza database:

```bash
python -m playwright install chromium
python flight_monitor.py --prova FCO GLA 2027-08-10 4
```

## Sviluppo locale

```bash
pip install -r requirements.txt
DRY_RUN=1 SUPABASE_URL=... SUPABASE_SECRET_KEY=... python flight_monitor.py   # cerca ma non scrive
```

```bash
cd app && npm install && cp .env.example .env.local && npm run dev
```
