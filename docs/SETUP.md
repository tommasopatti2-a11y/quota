# Configurazione di Quota

Tutto gira su piani gratuiti: Supabase (database e login), GitHub Actions (scraper), Cloudflare Pages (app).
Tempo stimato: 20–30 minuti, una volta sola.

## 1. Supabase

1. Crea un account su <https://supabase.com> e un nuovo progetto (regione consigliata: *Central EU (Frankfurt)*). Annota la password del database in un posto sicuro.
2. **SQL editor → New query**: esegui (*Run*) uno alla volta, in ordine, i file di `supabase/migrations/` (`0001_schema.sql`, `0002_grants.sql`, …).
3. **Authentication → Users → Add user → Create new user**: inserisci la tua email e una password robusta, spunta *Auto confirm user*.
4. Copia lo **User UID** dell'utente appena creato ed esegui nel SQL editor:
   ```sql
   insert into public.allowed_users (user_id) values ('INCOLLA-QUI-LO-USER-UID');
   ```
5. **Authentication → Sign In / Providers**: disattiva *Allow new users to sign up*. Così nessun altro può registrarsi (e anche se ci riuscisse, non vedrebbe nulla: non è in `allowed_users`).
6. **Project Settings → API Keys**: annota
   - *Project URL* (es. `https://abcd1234.supabase.co`);
   - la **publishable key** (`sb_publishable_…`) → va nell'app, è pubblica per design;
   - la **secret key** (`sb_secret_…`) → **solo** nei secret di GitHub. Non metterla mai nell'app né in un file del repository.

> I progetti gratuiti inattivi per 7 giorni vengono messi in pausa: le due rilevazioni giornaliere lo mantengono attivo.

## 2. GitHub Actions (scraper)

Nel repository: **Settings → Secrets and variables → Actions → New repository secret**:

| Nome | Valore |
|---|---|
| `SUPABASE_URL` | Project URL |
| `SUPABASE_SECRET_KEY` | secret key |

I vecchi secret `GCP_SA_KEY` e `SHEET_ID` non servono più e possono essere eliminati.
Per una prima prova: **Actions → Monitoraggio voli → Run workflow** (dopo aver creato almeno un viaggio).

**Consumo minuti:** su repository privati GitHub offre 2.000 minuti/mese. Lo scraper apre Google Voli con un browser:
ogni data cercata richiede circa 6–7 secondi (pausa inclusa), più circa 1–2 minuti a esecuzione per preparare il browser.
Un viaggio con finestra ±2 (10 date) costa circa 1,1 minuti a rilevazione, cioè ~65 minuti/mese con due rilevazioni
al giorno: si sta nel limite fino a circa 25 viaggi attivi con ±2 (di più con finestre più strette).

## 3. Cloudflare Pages (app)

1. Crea un account su <https://dash.cloudflare.com> → **Workers & Pages → Create → Pages → Connect to Git** e autorizza il repository `flight-monitor`.
2. Impostazioni di build:
   - *Production branch*: `main`
   - *Framework preset*: `None`
   - *Build command*: `npm ci && npm run build`
   - *Build output directory*: `dist`
   - *Root directory (advanced)*: `app`
3. *Environment variables* (Production e Preview):
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = publishable key
   - `NODE_VERSION` = `22`
4. Salva e avvia il deploy. Otterrai un indirizzo `https://<nome>.pages.dev`. Ogni push su `main` aggiorna l'app; ogni pull request riceve un'anteprima.

## 4. Installazione su Android

1. Apri l'indirizzo `…pages.dev` con **Chrome**.
2. Accedi con email e password.
3. Menu ⋮ → **Installa app** (o *Aggiungi a schermata Home*).

Quota si apre a schermo intero come un'app. Quando pubblichi una nuova versione compare l'avviso *È disponibile una nuova versione* → *Aggiorna*.

## Sicurezza in breve

- Nel pacchetto dell'app ci sono solo URL e publishable key: senza login non danno accesso a nessun dato (RLS).
- I dati sono visibili e modificabili solo dall'utente presente in `allowed_users`.
- La secret key, che ignora le regole RLS, vive solo nei secret di GitHub Actions.
