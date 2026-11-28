-- Viaggi tra città: una ricerca per città (es. ROM → LON) copre tutti i suoi aeroporti.
-- Per ogni volo si salvano gli aeroporti effettivi di partenza e arrivo,
-- e la dashboard riceve le statistiche per coppia di aeroporti (by_route).

alter table public.results
  add column if not exists origin_airport text,
  add column if not exists destination_airport text;

create or replace function public.trip_dashboard(p_trip uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with
  t as (select priority from public.trips where id = p_trip),
  w as (select hour_eur, stop_eur from public.priority_weights((select priority from t))),
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
    select
      res.*,
      round(res.price / res.passengers, 2)                 as pp,
      coalesce(res.duration_min, res.flight_min)           as dur,
      case when coalesce(res.duration_min, res.flight_min) is not null and res.stops is not null then
        round(res.price / res.passengers
              + (select hour_eur from w) * coalesce(res.duration_min, res.flight_min) / 60.0
              + (select stop_eur from w) * res.stops, 2)
      end                                                  as score
    from public.results res
    where res.trip_id = p_trip
  ),
  series as (
    -- per rilevazione, direzione e data: più economico, consigliato, più veloce, diretto
    select
      runs.idx, r.direction, r.flight_date,
      min(r.pp)                                                              as cheap_pp,
      (array_agg(r.pp    order by r.score, r.pp) filter (where r.score is not null))[1] as best_pp,
      min(r.score)                                                           as best_score,
      (array_agg(r.pp    order by r.dur, r.pp)   filter (where r.dur is not null))[1]   as fast_pp,
      min(r.dur)                                                             as fast_dur,
      min(r.pp) filter (where r.stops = 0)                                   as direct_pp
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
    select s.direction, s.flight_date, s.status
    from public.searches s
    where s.trip_id = p_trip and s.run_at = (select run_at from last_run)
  ),
  by_airline as (
    select r.direction, a as airline, min(r.pp) as min_pp, round(avg(r.pp), 2) as avg_pp, count(*) as n
    from r, unnest(r.airlines) as a
    group by r.direction, a
  ),
  by_route as (
    -- prezzi per coppia di aeroporti effettivi (utile per i viaggi tra città)
    select r.direction, r.origin_airport || '-' || r.destination_airport as route,
           min(r.pp) as min_pp, round(avg(r.pp), 2) as avg_pp, count(*) as n
    from r
    where r.origin_airport is not null and r.destination_airport is not null
    group by r.direction, route
  ),
  by_stops as (
    select r.direction, r.stops, min(r.pp) as min_pp, round(avg(r.pp), 2) as avg_pp, count(*) as n
    from r
    where r.stops is not null
    group by r.direction, r.stops
  )
  select jsonb_build_object(
    'priority', (select priority from t),
    'weights', (select jsonb_build_object('hour', hour_eur, 'stop', stop_eur) from w),
    'runs', coalesce((
      select jsonb_agg(jsonb_build_array(run_at, total, ok, empty, error) order by idx) from runs), '[]'::jsonb),
    'series', coalesce((
      select jsonb_agg(jsonb_build_array(idx, direction, flight_date, cheap_pp, best_pp, best_score, fast_pp, fast_dur, direct_pp)
                       order by idx, direction, flight_date) from series), '[]'::jsonb),
    'latest', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id, 'direction', direction, 'flight_date', flight_date, 'rank', rank, 'pp', pp, 'score', score,
        'airlines', airlines, 'departure_time', to_char(departure_time, 'HH24:MI'),
        'arrival_time', to_char(arrival_time, 'HH24:MI'), 'arrival_day_offset', arrival_day_offset,
        'duration_min', duration_min, 'flight_min', flight_min, 'stops', stops, 'via', via, 'link', link,
        'origin_airport', origin_airport, 'destination_airport', destination_airport
      ) order by pp) from latest), '[]'::jsonb),
    'latest_searches', coalesce((
      select jsonb_agg(jsonb_build_array(direction, flight_date, status) order by direction, flight_date)
      from latest_searches), '[]'::jsonb),
    'by_airline', coalesce((
      select jsonb_agg(jsonb_build_array(direction, airline, min_pp, avg_pp, n) order by direction, min_pp) from by_airline), '[]'::jsonb),
    'by_route', coalesce((
      select jsonb_agg(jsonb_build_array(direction, route, min_pp, avg_pp, n) order by direction, min_pp) from by_route), '[]'::jsonb),
    'by_stops', coalesce((
      select jsonb_agg(jsonb_build_array(direction, stops, min_pp, avg_pp, n) order by direction, stops) from by_stops), '[]'::jsonb)
  );
$$;

revoke all on function public.trip_dashboard(uuid) from public, anon;
grant execute on function public.trip_dashboard(uuid) to authenticated, service_role;
