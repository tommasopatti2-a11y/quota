-- Diagnostica: quanti voli ha restituito Google per ogni ricerca
-- (results_count resta il numero di voli effettivamente salvati).
alter table public.searches add column if not exists found_count smallint;
