-- Gruppi di viaggi: un'etichetta libera e facoltativa per ordinare l'elenco.
alter table public.trips
  add column if not exists group_name text
  check (group_name is null or char_length(btrim(group_name)) between 1 and 40);
