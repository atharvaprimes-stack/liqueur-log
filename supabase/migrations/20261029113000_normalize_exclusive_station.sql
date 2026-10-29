-- Collapse legacy dual-visibility rows to exclusive prep station.
-- Does not delete any catalog items.

UPDATE public.items
SET
  show_in_bar = (service_station <> 'kitchen'),
  show_in_kitchen = (service_station = 'kitchen')
WHERE show_in_bar IS TRUE AND show_in_kitchen IS TRUE;
