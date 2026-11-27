-- Quota / flight-monitor — schema iniziale
-- Da eseguire una sola volta nel SQL editor di Supabase (o con `supabase db push`).

-- ---------------------------------------------------------------------------
-- Accesso: un'unica utenza personale, autorizzata esplicitamente.
-- Anche se per errore le registrazioni venissero riattivate, un nuovo utente
-- non vedrebbe nulla finché il suo id non è presente in allowed_users.
-- ---------------------------------------------------------------------------
create table public.allowed_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_allowed_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.allowed_users where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_allowed_user() from public;
grant execute on function public.is_allowed_user() to authenticated;

-- ---------------------------------------------------------------------------
-- Viaggi monitorati
-- ---------------------------------------------------------------------------
create table public.trips (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(btrim(name)) between 1 and 80),
  active        boolean not null default true,
  origin        text not null check (origin ~ '^[A-Z]{3}$'),
  destination   text not null check (destination ~ '^[A-Z]{3}$'),
  outbound_date date not null,
  return_date   date not null,
  window_days   smallint not null default 0 check (window_days between 0 and 7),
  passengers    smallint not null default 1 check (passengers between 1 and 9),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint trips_return_after_outbound check (return_date > outbound_date),
  constraint trips_distinct_airports check (origin <> destination)
);

-- Nome univoco senza distinzione tra maiuscole/minuscole e spazi ai bordi.
create unique index trips_name_unique on public.trips (lower(btrim(name)));

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trips_touch_updated_at
before update on public.trips
for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Ricerche: una riga per ogni (rilevazione, direzione, data volo) tentata.
-- Permette di distinguere una data mancante per errore dello scraper
-- ('error') da una data senza voli ('empty').
-- ---------------------------------------------------------------------------
create table public.searches (
  id            bigint generated always as identity primary key,
  trip_id       uuid not null references public.trips (id) on delete cascade,
  run_at        timestamptz not null,
  direction     text not null check (direction in ('outbound', 'return')),
  origin        text not null,
  destination   text not null,
  flight_date   date not null,
  passengers    smallint not null,
  status        text not null check (status in ('ok', 'empty', 'error')),
  results_count smallint not null default 0,
  error         text,
  link          text,
  unique (trip_id, run_at, direction, flight_date)
);

create index searches_trip_run on public.searches (trip_id, run_at desc);

-- ---------------------------------------------------------------------------
-- Risultati: fino ai N voli più economici per ogni ricerca riuscita.
-- ---------------------------------------------------------------------------
create table public.results (
  id                 bigint generated always as identity primary key,
  search_id          bigint not null references public.searches (id) on delete cascade,
  trip_id            uuid not null references public.trips (id) on delete cascade,
  run_at             timestamptz not null,
  direction          text not null check (direction in ('outbound', 'return')),
  flight_date        date not null,
  days_left          integer not null,
  rank               smallint not null check (rank >= 1),
  price              numeric(10, 2) not null check (price > 0), -- totale per tutti i passeggeri
  currency           text not null default 'EUR',
  passengers         smallint not null,
  airlines           text[] not null default '{}',
  departure_time     time,
  arrival_time       time,
  arrival_day_offset smallint not null default 0,  -- +1 se arriva il giorno dopo
  duration_min       integer,                      -- durata totale porta a porta, scali inclusi
  flight_min         integer,                      -- solo tempo in volo
  stops              smallint,
  via                text[] not null default '{}', -- aeroporti di scalo
  unique (search_id, rank)
);

create index results_trip_run on public.results (trip_id, run_at desc);
create index results_trip_dir_date on public.results (trip_id, direction, flight_date, run_at);

-- ---------------------------------------------------------------------------
-- Viste di supporto (rispettano le policy RLS di chi le interroga)
-- ---------------------------------------------------------------------------

-- Prezzo minimo per rilevazione, direzione e data volo.
create view public.min_by_flight_date
with (security_invoker = true)
as
select
  trip_id,
  run_at,
  direction,
  flight_date,
  min(price)                          as min_price,
  round(min(price / passengers), 2)   as min_price_pp,
  min(days_left)                      as days_left
from public.results
group by trip_id, run_at, direction, flight_date;

-- Riepilogo di ogni rilevazione di un viaggio.
create view public.trip_runs
with (security_invoker = true)
as
select
  s.trip_id,
  s.run_at,
  count(*)                                       as searches_total,
  count(*) filter (where s.status = 'ok')        as searches_ok,
  count(*) filter (where s.status = 'empty')     as searches_empty,
  count(*) filter (where s.status = 'error')     as searches_error,
  (select min(r.price) from public.results r
    where r.trip_id = s.trip_id and r.run_at = s.run_at and r.direction = 'outbound') as min_outbound,
  (select min(r.price) from public.results r
    where r.trip_id = s.trip_id and r.run_at = s.run_at and r.direction = 'return')   as min_return
from public.searches s
group by s.trip_id, s.run_at;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Lo scraper usa la secret key (service role) che ignora RLS.
-- L'app usa la publishable key + login: vede solo se l'utente è autorizzato.
-- ---------------------------------------------------------------------------
alter table public.allowed_users enable row level security;
alter table public.trips         enable row level security;
alter table public.searches      enable row level security;
alter table public.results       enable row level security;

create policy "utente autorizzato legge la propria autorizzazione"
  on public.allowed_users for select to authenticated
  using (user_id = (select auth.uid()));

create policy "utente autorizzato gestisce i viaggi"
  on public.trips for all to authenticated
  using ((select public.is_allowed_user()))
  with check ((select public.is_allowed_user()));

create policy "utente autorizzato legge le ricerche"
  on public.searches for select to authenticated
  using ((select public.is_allowed_user()));

create policy "utente autorizzato legge i risultati"
  on public.results for select to authenticated
  using ((select public.is_allowed_user()));

-- Nessun accesso per utenti anonimi.
revoke all on public.allowed_users, public.trips, public.searches, public.results from anon;
revoke all on public.min_by_flight_date, public.trip_runs from anon;
