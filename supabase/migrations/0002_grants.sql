-- Permessi espliciti per i ruoli dell'API di Supabase.
-- Nei progetti recenti le tabelle create da SQL non ricevono più permessi
-- automatici: senza queste GRANT sia lo scraper (service_role) sia l'app
-- (authenticated) ricevono "permission denied". La RLS resta comunque attiva.

grant usage on schema public to authenticated, service_role;

-- Scraper (secret key → service_role, ignora RLS)
grant select, insert, update, delete on public.trips, public.searches, public.results, public.allowed_users to service_role;
grant select on public.min_by_flight_date, public.trip_runs to service_role;
grant usage, select on all sequences in schema public to service_role;

-- App (utente autenticato; cosa vede davvero lo decidono le policy RLS)
grant select, insert, update, delete on public.trips to authenticated;
grant select on public.searches, public.results, public.allowed_users to authenticated;
grant select on public.min_by_flight_date, public.trip_runs to authenticated;
grant execute on function public.is_allowed_user() to authenticated;
