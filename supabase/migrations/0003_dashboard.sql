-- Dati aggregati per la dashboard di un viaggio, in un'unica chiamata RPC.
-- I prezzi sono normalizzati a persona (price / passengers): l'app li moltiplica
-- per i passeggeri attuali del viaggio, così lo storico resta confrontabile anche
-- se il numero di passeggeri cambia.
-- security invoker: valgono le stesse policy RLS dell'utente che chiama.

create or replace function public.trip_dashboard(p_trip uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with
  runs as (
    select
      run_at,
      count(*)                                   as total,
      count(*) filter (where status = 'ok')      as ok,
      count(*) filter (where status = 'empty')   as empty,
      count(*) filter (where status = 'error')   as error,
      row_number() over (order by run_at) - 1    as idx
    from public.searches
    where trip_id = p_trip
    group by run_at
  ),
  r as (
    select res.*, round(res.price / res.passengers, 2) as pp
    from public.results res
    where res.trip_id = p_trip
  ),
  series as (
    -- prezzo minimo a persona per rilevazione, direzione e data volo
    select runs.idx, r.direction, r.flight_date, min(r.pp) as pp
    from r join runs using (run_at)
    group by runs.idx, r.direction, r.flight_date
  ),
  last_run as (select max(run_at) as run_at from runs),
  latest as (
    select r.*, s.link
    from r
    join public.searches s on s.id = r.search_id
    where r.run_at = (select run_at from last_run)
  ),
  latest_searches as (
    select s.direction, s.flight_date, s.status, s.link
    from public.searches s
    where s.trip_id = p_trip and s.run_at = (select run_at from last_run)
  ),
  by_airline as (
    select r.direction, a as airline, min(r.pp) as min_pp, round(avg(r.pp), 2) as avg_pp, count(*) as n
    from r, unnest(r.airlines) as a
    group by r.direction, a
  ),
  by_stops as (
    select r.direction, r.stops, min(r.pp) as min_pp, round(avg(r.pp), 2) as avg_pp, count(*) as n
    from r
    where r.stops is not null
    group by r.direction, r.stops
  )
  select jsonb_build_object(
    'runs', coalesce((
      select jsonb_agg(jsonb_build_array(run_at, total, ok, empty, error) order by idx) from runs), '[]'::jsonb),
    'series', coalesce((
      select jsonb_agg(jsonb_build_array(idx, direction, flight_date, pp) order by idx, direction, flight_date) from series), '[]'::jsonb),
    'latest', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id, 'direction', direction, 'flight_date', flight_date, 'rank', rank, 'pp', pp,
        'airlines', airlines, 'departure_time', to_char(departure_time, 'HH24:MI'),
        'arrival_time', to_char(arrival_time, 'HH24:MI'), 'arrival_day_offset', arrival_day_offset,
        'duration_min', duration_min, 'flight_min', flight_min, 'stops', stops, 'via', via, 'link', link
      ) order by pp) from latest), '[]'::jsonb),
    'latest_searches', coalesce((
      select jsonb_agg(jsonb_build_array(direction, flight_date, status) order by direction, flight_date)
      from latest_searches), '[]'::jsonb),
    'by_airline', coalesce((
      select jsonb_agg(jsonb_build_array(direction, airline, min_pp, avg_pp, n) order by direction, min_pp) from by_airline), '[]'::jsonb),
    'by_stops', coalesce((
      select jsonb_agg(jsonb_build_array(direction, stops, min_pp, avg_pp, n) order by direction, stops) from by_stops), '[]'::jsonb)
  );
$$;

revoke all on function public.trip_dashboard(uuid) from public, anon;
grant execute on function public.trip_dashboard(uuid) to authenticated, service_role;
