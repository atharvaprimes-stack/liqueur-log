-- Allow multiple order lines for the same catalog item on one bill
-- (each serve is a separate row; receipts still aggregate by item).
DROP INDEX IF EXISTS public.order_items_order_item_idx;

CREATE INDEX IF NOT EXISTS order_items_order_item_idx
  ON public.order_items (order_id, item_id);
