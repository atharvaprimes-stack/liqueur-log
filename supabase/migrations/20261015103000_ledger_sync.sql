-- Shop ledger sync. Devices keep using SQLite for speed and push the same
-- primary keys here. Purchases, orders, and stock corrections apply once.

CREATE TABLE IF NOT EXISTS public.items (
  id TEXT PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  item_code TEXT NOT NULL,
  name_en TEXT NOT NULL,
  name_mr TEXT NOT NULL,
  brand TEXT NOT NULL,
  liquor_type TEXT NOT NULL,
  sub_type TEXT NOT NULL,
  volume_ml INTEGER NOT NULL CHECK (volume_ml > 0),
  purchase_price NUMERIC NOT NULL CHECK (purchase_price >= 0),
  selling_price NUMERIC NOT NULL CHECK (selling_price >= 0),
  current_stock INTEGER NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
  low_stock_threshold INTEGER NOT NULL DEFAULT 0 CHECK (low_stock_threshold >= 0),
  updated_at BIGINT NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS items_tenant_item_code_idx
  ON public.items (tenant_id, item_code);

CREATE INDEX IF NOT EXISTS items_tenant_id_idx ON public.items (tenant_id);

CREATE TABLE IF NOT EXISTS public.item_types (
  id TEXT PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  updated_at BIGINT NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS item_types_tenant_name_idx
  ON public.item_types (tenant_id, lower(name));

CREATE TABLE IF NOT EXISTS public.item_strengths (
  id TEXT PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  updated_at BIGINT NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS item_strengths_tenant_name_idx
  ON public.item_strengths (tenant_id, lower(name));

CREATE TABLE IF NOT EXISTS public.vendors (
  id TEXT PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  updated_at BIGINT NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS vendors_tenant_name_idx
  ON public.vendors (tenant_id, lower(name));

CREATE TABLE IF NOT EXISTS public.purchases (
  id TEXT PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  supplier_name TEXT NOT NULL,
  purchase_date BIGINT NOT NULL,
  total_amount NUMERIC NOT NULL CHECK (total_amount >= 0),
  paid_amount NUMERIC NOT NULL CHECK (paid_amount >= 0),
  payment_type TEXT NOT NULL CHECK (payment_type IN ('Cash', 'UPI', 'Credit')),
  created_by UUID NOT NULL REFERENCES public.users (id),
  CHECK (paid_amount <= total_amount)
);

CREATE UNIQUE INDEX IF NOT EXISTS purchases_tenant_supplier_invoice_idx
  ON public.purchases (tenant_id, lower(supplier_name), lower(invoice_number));

CREATE INDEX IF NOT EXISTS purchases_tenant_date_idx
  ON public.purchases (tenant_id, purchase_date DESC);

CREATE TABLE IF NOT EXISTS public.purchase_items (
  id TEXT PRIMARY KEY,
  purchase_id TEXT NOT NULL REFERENCES public.purchases (id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES public.items (id),
  quantity_received INTEGER NOT NULL CHECK (quantity_received > 0),
  unit_purchase_price NUMERIC NOT NULL CHECK (unit_purchase_price >= 0)
);

CREATE INDEX IF NOT EXISTS purchase_items_purchase_id_idx
  ON public.purchase_items (purchase_id);

CREATE INDEX IF NOT EXISTS purchase_items_item_id_idx
  ON public.purchase_items (item_id);

CREATE TABLE IF NOT EXISTS public.order_sequences (
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  sequence_date TEXT NOT NULL,
  last_value INTEGER NOT NULL CHECK (last_value >= 0),
  PRIMARY KEY (tenant_id, sequence_date)
);

CREATE TABLE IF NOT EXISTS public.orders (
  id TEXT PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  table_id TEXT,
  order_type TEXT NOT NULL CHECK (order_type IN ('TABLE', 'COUNTER')),
  status TEXT NOT NULL CHECK (status IN ('OPEN', 'PAID')),
  total_amount NUMERIC NOT NULL CHECK (total_amount >= 0),
  paid_amount NUMERIC NOT NULL CHECK (paid_amount >= 0),
  payment_method TEXT CHECK (payment_method IN ('Cash', 'UPI', 'Other')),
  is_credit BOOLEAN NOT NULL DEFAULT FALSE,
  order_sequence_string TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  closed_at BIGINT,
  created_by UUID NOT NULL REFERENCES public.users (id),
  updated_at BIGINT NOT NULL DEFAULT 0,
  CHECK (paid_amount <= total_amount),
  CHECK (
    (order_type = 'TABLE' AND table_id IS NOT NULL)
    OR (order_type = 'COUNTER' AND table_id IS NULL)
  ),
  CHECK (
    (
      status = 'OPEN'
      AND payment_method IS NULL
      AND paid_amount = 0
      AND closed_at IS NULL
      AND is_credit = FALSE
    )
    OR (
      status = 'PAID'
      AND payment_method IS NOT NULL
      AND closed_at IS NOT NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS orders_tenant_status_idx
  ON public.orders (tenant_id, status, closed_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS orders_one_open_table_idx
  ON public.orders (tenant_id, table_id)
  WHERE status = 'OPEN' AND order_type = 'TABLE';

CREATE UNIQUE INDEX IF NOT EXISTS orders_one_open_counter_idx
  ON public.orders (tenant_id)
  WHERE status = 'OPEN' AND order_type = 'COUNTER';

CREATE TABLE IF NOT EXISTS public.order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES public.orders (id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES public.items (id),
  item_code TEXT NOT NULL,
  name_en TEXT NOT NULL,
  name_mr TEXT NOT NULL,
  liquor_type TEXT NOT NULL,
  volume_ml INTEGER NOT NULL CHECK (volume_ml > 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC NOT NULL CHECK (unit_price >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS order_items_order_item_idx
  ON public.order_items (order_id, item_id);

CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON public.order_items (order_id);
CREATE INDEX IF NOT EXISTS order_items_item_id_idx ON public.order_items (item_id);

CREATE TABLE IF NOT EXISTS public.stock_movements (
  id TEXT PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES public.items (id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  source_id TEXT NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS stock_movements_item_idx
  ON public.stock_movements (tenant_id, item_id);

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id TEXT PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES public.users (id),
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS activity_logs_tenant_created_at_idx
  ON public.activity_logs (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.sync_tombstones (
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  deleted_at BIGINT NOT NULL,
  PRIMARY KEY (tenant_id, entity, entity_id)
);

ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_strengths ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_tombstones ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.item_types FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.item_strengths FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.vendors FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.purchases FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.purchase_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.order_sequences FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.orders FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.order_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.stock_movements FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.activity_logs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.sync_tombstones FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.item_types TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.item_strengths TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vendors TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.purchases TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.purchase_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.order_sequences TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.orders TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.order_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.stock_movements TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.activity_logs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sync_tombstones TO service_role;

CREATE OR REPLACE FUNCTION private.require_tenant(p_mobile TEXT, p_mpin TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $fn$
DECLARE
  rec RECORD;
  found UUID;
  match_count INTEGER := 0;
BEGIN
  IF p_mobile !~ '^[0-9]{10}$' OR p_mpin !~ '^[0-9]{4}$' THEN
    RETURN NULL;
  END IF;

  IF private.is_locked(p_mobile) THEN
    RETURN NULL;
  END IF;

  FOR rec IN
    SELECT tenant_id, mpin_hash
    FROM public.users
    WHERE mobile_number = p_mobile
      AND is_active = TRUE
  LOOP
    IF private.mpin_matches(p_mpin, rec.mpin_hash) THEN
      match_count := match_count + 1;
      found := rec.tenant_id;
    END IF;
  END LOOP;

  IF match_count <> 1 THEN
    IF match_count = 0 THEN
      PERFORM private.record_attempt(p_mobile, FALSE);
    END IF;
    RETURN NULL;
  END IF;

  RETURN found;
END;
$fn$;

CREATE OR REPLACE FUNCTION private.recompute_tenant_stock(p_tenant UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  UPDATE public.items AS i
  SET current_stock = GREATEST(
    0,
    (
      COALESCE((
        SELECT SUM(pi.quantity_received)
        FROM public.purchase_items AS pi
        JOIN public.purchases AS p ON p.id = pi.purchase_id
        WHERE pi.item_id = i.id
          AND p.tenant_id = i.tenant_id
      ), 0)
      - COALESCE((
        SELECT SUM(oi.quantity)
        FROM public.order_items AS oi
        JOIN public.orders AS o ON o.id = oi.order_id
        WHERE oi.item_id = i.id
          AND o.tenant_id = i.tenant_id
      ), 0)
      + COALESCE((
        SELECT SUM(sm.delta)
        FROM public.stock_movements AS sm
        WHERE sm.item_id = i.id
          AND sm.tenant_id = i.tenant_id
      ), 0)
    )::integer
  )
  WHERE i.tenant_id = p_tenant;
$fn$;

CREATE OR REPLACE FUNCTION private.forget_tombstone(p_tenant UUID, p_entity TEXT, p_id TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  DELETE FROM public.sync_tombstones
  WHERE tenant_id = p_tenant
    AND entity = p_entity
    AND entity_id = p_id;
$fn$;

CREATE OR REPLACE FUNCTION private.write_tombstone(p_tenant UUID, p_entity TEXT, p_id TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  INSERT INTO public.sync_tombstones (tenant_id, entity, entity_id, deleted_at)
  VALUES (p_tenant, p_entity, p_id, (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint)
  ON CONFLICT (tenant_id, entity, entity_id)
  DO UPDATE SET deleted_at = EXCLUDED.deleted_at;
$fn$;

CREATE OR REPLACE FUNCTION private.apply_sync_change(p_tenant UUID, p_change JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_entity TEXT := p_change->>'entity';
  v_operation TEXT := p_change->>'operation';
  v_record JSONB := p_change->'record';
  v_id TEXT := p_change->'record'->>'id';
  v_updated BIGINT := COALESCE((p_change->'record'->>'updated_at')::bigint, 0);
  v_existing_updated BIGINT := 0;
  v_existing_status TEXT := NULL;
  v_line JSONB;
BEGIN
  IF v_entity IS NULL OR v_operation NOT IN ('upsert', 'delete') THEN
    RETURN TRUE;
  END IF;

  IF v_operation = 'delete' THEN
    IF v_id IS NULL OR v_id = '' THEN
      RETURN TRUE;
    END IF;
    IF v_entity = 'items' THEN
      DELETE FROM public.items WHERE id = v_id AND tenant_id = p_tenant;
    ELSIF v_entity = 'item_types' THEN
      DELETE FROM public.item_types WHERE id = v_id AND tenant_id = p_tenant;
    ELSIF v_entity = 'item_strengths' THEN
      DELETE FROM public.item_strengths WHERE id = v_id AND tenant_id = p_tenant;
    ELSIF v_entity = 'vendors' THEN
      DELETE FROM public.vendors WHERE id = v_id AND tenant_id = p_tenant;
    ELSIF v_entity = 'orders' THEN
      DELETE FROM public.orders WHERE id = v_id AND tenant_id = p_tenant AND status = 'OPEN';
    ELSE
      RETURN TRUE;
    END IF;
    PERFORM private.write_tombstone(p_tenant, v_entity, v_id);
    RETURN TRUE;
  END IF;

  IF v_entity = 'items' THEN
    IF v_id IS NULL OR (v_record->>'tenant_id')::uuid IS DISTINCT FROM p_tenant THEN
      RETURN TRUE;
    END IF;
    PERFORM private.forget_tombstone(p_tenant, 'items', v_id);
    INSERT INTO public.items (
      id, tenant_id, item_code, name_en, name_mr, brand, liquor_type, sub_type,
      volume_ml, purchase_price, selling_price, current_stock, low_stock_threshold, updated_at
    ) VALUES (
      v_id, p_tenant, v_record->>'item_code', v_record->>'name_en', v_record->>'name_mr',
      v_record->>'brand', v_record->>'liquor_type', v_record->>'sub_type',
      (v_record->>'volume_ml')::integer, (v_record->>'purchase_price')::numeric,
      (v_record->>'selling_price')::numeric, 0, COALESCE((v_record->>'low_stock_threshold')::integer, 0), v_updated
    )
    ON CONFLICT (id) DO UPDATE SET
      item_code = EXCLUDED.item_code,
      name_en = EXCLUDED.name_en,
      name_mr = EXCLUDED.name_mr,
      brand = EXCLUDED.brand,
      liquor_type = EXCLUDED.liquor_type,
      sub_type = EXCLUDED.sub_type,
      volume_ml = EXCLUDED.volume_ml,
      purchase_price = EXCLUDED.purchase_price,
      selling_price = EXCLUDED.selling_price,
      low_stock_threshold = EXCLUDED.low_stock_threshold,
      updated_at = EXCLUDED.updated_at
    WHERE public.items.tenant_id = EXCLUDED.tenant_id
      AND EXCLUDED.updated_at >= public.items.updated_at;
    RETURN TRUE;
  END IF;

  IF v_entity = 'item_types' OR v_entity = 'item_strengths' THEN
    IF v_id IS NULL OR (v_record->>'tenant_id')::uuid IS DISTINCT FROM p_tenant THEN
      RETURN TRUE;
    END IF;
    PERFORM private.forget_tombstone(p_tenant, v_entity, v_id);
    IF v_entity = 'item_types' THEN
      INSERT INTO public.item_types (id, tenant_id, name, sort_order, updated_at)
      VALUES (v_id, p_tenant, v_record->>'name', COALESCE((v_record->>'sort_order')::integer, 0), v_updated)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        sort_order = EXCLUDED.sort_order,
        updated_at = EXCLUDED.updated_at
      WHERE public.item_types.tenant_id = EXCLUDED.tenant_id
        AND EXCLUDED.updated_at >= public.item_types.updated_at;
    ELSE
      INSERT INTO public.item_strengths (id, tenant_id, name, sort_order, updated_at)
      VALUES (v_id, p_tenant, v_record->>'name', COALESCE((v_record->>'sort_order')::integer, 0), v_updated)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        sort_order = EXCLUDED.sort_order,
        updated_at = EXCLUDED.updated_at
      WHERE public.item_strengths.tenant_id = EXCLUDED.tenant_id
        AND EXCLUDED.updated_at >= public.item_strengths.updated_at;
    END IF;
    RETURN TRUE;
  END IF;

  IF v_entity = 'vendors' THEN
    IF v_id IS NULL OR (v_record->>'tenant_id')::uuid IS DISTINCT FROM p_tenant THEN
      RETURN TRUE;
    END IF;
    PERFORM private.forget_tombstone(p_tenant, 'vendors', v_id);
    INSERT INTO public.vendors (id, tenant_id, name, phone, updated_at)
    VALUES (v_id, p_tenant, v_record->>'name', COALESCE(v_record->>'phone', ''), v_updated)
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      phone = EXCLUDED.phone,
      updated_at = EXCLUDED.updated_at
    WHERE public.vendors.tenant_id = EXCLUDED.tenant_id
      AND EXCLUDED.updated_at >= public.vendors.updated_at;
    RETURN TRUE;
  END IF;

  IF v_entity = 'stock_movements' THEN
    IF v_id IS NULL OR (v_record->>'tenant_id')::uuid IS DISTINCT FROM p_tenant THEN
      RETURN TRUE;
    END IF;
    INSERT INTO public.stock_movements (id, tenant_id, item_id, delta, reason, source_id, created_at)
    VALUES (
      v_id, p_tenant, v_record->>'item_id', (v_record->>'delta')::integer,
      COALESCE(v_record->>'reason', 'adjust'), COALESCE(v_record->>'source_id', ''),
      COALESCE((v_record->>'created_at')::bigint, 0)
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN TRUE;
  END IF;

  IF v_entity = 'order_sequences' THEN
    IF (v_record->>'tenant_id')::uuid IS DISTINCT FROM p_tenant OR v_record->>'sequence_date' IS NULL THEN
      RETURN TRUE;
    END IF;
    INSERT INTO public.order_sequences (tenant_id, sequence_date, last_value)
    VALUES (p_tenant, v_record->>'sequence_date', GREATEST(COALESCE((v_record->>'last_value')::integer, 0), 0))
    ON CONFLICT (tenant_id, sequence_date)
    DO UPDATE SET last_value = GREATEST(public.order_sequences.last_value, EXCLUDED.last_value);
    RETURN TRUE;
  END IF;

  IF v_entity = 'purchases' THEN
    IF v_id IS NULL OR (v_record->>'tenant_id')::uuid IS DISTINCT FROM p_tenant THEN
      RETURN TRUE;
    END IF;
    BEGIN
      INSERT INTO public.purchases (
        id, tenant_id, invoice_number, supplier_name, purchase_date,
        total_amount, paid_amount, payment_type, created_by
      ) VALUES (
        v_id, p_tenant, v_record->>'invoice_number', v_record->>'supplier_name',
        (v_record->>'purchase_date')::bigint, (v_record->>'total_amount')::numeric,
        (v_record->>'paid_amount')::numeric, v_record->>'payment_type', (v_record->>'created_by')::uuid
      )
      ON CONFLICT (id) DO NOTHING;
    EXCEPTION
      WHEN unique_violation THEN
        RETURN TRUE;
    END;
    IF EXISTS (SELECT 1 FROM public.purchases WHERE id = v_id AND tenant_id = p_tenant) THEN
      FOR v_line IN SELECT value FROM jsonb_array_elements(COALESCE(v_record->'lines', '[]'::jsonb))
      LOOP
        INSERT INTO public.purchase_items (id, purchase_id, item_id, quantity_received, unit_purchase_price)
        VALUES (
          v_line->>'id', v_id, v_line->>'item_id',
          (v_line->>'quantity_received')::integer, (v_line->>'unit_purchase_price')::numeric
        )
        ON CONFLICT (id) DO NOTHING;
      END LOOP;
    END IF;
    RETURN TRUE;
  END IF;

  IF v_entity = 'orders' THEN
    IF v_id IS NULL OR (v_record->>'tenant_id')::uuid IS DISTINCT FROM p_tenant THEN
      RETURN TRUE;
    END IF;
    PERFORM private.forget_tombstone(p_tenant, 'orders', v_id);
    SELECT status, updated_at
    INTO v_existing_status, v_existing_updated
    FROM public.orders
    WHERE id = v_id AND tenant_id = p_tenant;

    IF v_existing_status = 'PAID' THEN
      RETURN TRUE;
    END IF;
    IF v_existing_status = 'OPEN' AND v_updated < COALESCE(v_existing_updated, 0) THEN
      RETURN TRUE;
    END IF;

    IF v_existing_status IS NULL THEN
      INSERT INTO public.orders (
        id, tenant_id, table_id, order_type, status, total_amount, paid_amount,
        payment_method, is_credit, order_sequence_string, created_at, closed_at, created_by, updated_at
      ) VALUES (
        v_id,
        p_tenant,
        NULLIF(v_record->>'table_id', ''),
        v_record->>'order_type',
        v_record->>'status',
        (v_record->>'total_amount')::numeric,
        (v_record->>'paid_amount')::numeric,
        NULLIF(v_record->>'payment_method', ''),
        COALESCE(v_record->>'is_credit', '0') IN ('1', 'true', 't'),
        v_record->>'order_sequence_string',
        (v_record->>'created_at')::bigint,
        NULLIF(v_record->>'closed_at', '')::bigint,
        (v_record->>'created_by')::uuid,
        v_updated
      );
    ELSE
      UPDATE public.orders
      SET
        status = v_record->>'status',
        total_amount = (v_record->>'total_amount')::numeric,
        paid_amount = (v_record->>'paid_amount')::numeric,
        payment_method = NULLIF(v_record->>'payment_method', ''),
        is_credit = COALESCE(v_record->>'is_credit', '0') IN ('1', 'true', 't'),
        closed_at = NULLIF(v_record->>'closed_at', '')::bigint,
        updated_at = v_updated
      WHERE id = v_id
        AND tenant_id = p_tenant
        AND status = 'OPEN';
      DELETE FROM public.order_items WHERE order_id = v_id;
    END IF;

    FOR v_line IN SELECT value FROM jsonb_array_elements(COALESCE(v_record->'lines', '[]'::jsonb))
    LOOP
      INSERT INTO public.order_items (
        id, order_id, item_id, item_code, name_en, name_mr, liquor_type, volume_ml, quantity, unit_price
      ) VALUES (
        v_line->>'id', v_id, v_line->>'item_id', v_line->>'item_code', v_line->>'name_en',
        v_line->>'name_mr', v_line->>'liquor_type', (v_line->>'volume_ml')::integer,
        (v_line->>'quantity')::integer, (v_line->>'unit_price')::numeric
      )
      ON CONFLICT (id) DO NOTHING;
    END LOOP;
    RETURN TRUE;
  END IF;

  IF v_entity = 'activity_logs' THEN
    IF v_id IS NULL OR (v_record->>'tenant_id')::uuid IS DISTINCT FROM p_tenant THEN
      RETURN TRUE;
    END IF;
    INSERT INTO public.activity_logs (id, tenant_id, actor_id, action, entity, entity_id, detail, created_at)
    VALUES (
      v_id, p_tenant, (v_record->>'actor_id')::uuid, v_record->>'action', v_record->>'entity',
      v_record->>'entity_id', COALESCE(v_record->>'detail', '{}'), COALESCE((v_record->>'created_at')::bigint, 0)
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN TRUE;
  END IF;

  RETURN TRUE;
END;
$fn$;

CREATE OR REPLACE FUNCTION private.push_sync_batch(p_mobile TEXT, p_mpin TEXT, p_batch JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $fn$
DECLARE
  v_tenant UUID;
  v_change JSONB;
  v_acked JSONB := '[]'::jsonb;
BEGIN
  v_tenant := private.require_tenant(p_mobile, p_mpin);
  IF v_tenant IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;

  FOR v_change IN SELECT value FROM jsonb_array_elements(COALESCE(p_batch->'changes', '[]'::jsonb))
  LOOP
    BEGIN
      IF private.apply_sync_change(v_tenant, v_change) THEN
        v_acked := v_acked || jsonb_build_array(v_change->>'queue_id');
      END IF;
    EXCEPTION
      WHEN unique_violation THEN
        IF v_change->>'entity' IN ('items', 'item_types', 'item_strengths', 'vendors', 'purchases') THEN
          v_acked := v_acked || jsonb_build_array(v_change->>'queue_id');
        END IF;
      WHEN OTHERS THEN
        NULL;
    END;
  END LOOP;

  PERFORM private.recompute_tenant_stock(v_tenant);
  RETURN jsonb_build_object('ok', TRUE, 'acked', v_acked);
END;
$fn$;

CREATE OR REPLACE FUNCTION private.pull_sync_snapshot(p_mobile TEXT, p_mpin TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $fn$
DECLARE
  v_tenant UUID;
BEGIN
  v_tenant := private.require_tenant(p_mobile, p_mpin);
  IF v_tenant IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'tenant', (SELECT to_jsonb(t) FROM public.tenants AS t WHERE t.id = v_tenant),
    'users', COALESCE((SELECT jsonb_agg(to_jsonb(u)) FROM public.users AS u WHERE u.tenant_id = v_tenant), '[]'::jsonb),
    'items', COALESCE((SELECT jsonb_agg(to_jsonb(i)) FROM public.items AS i WHERE i.tenant_id = v_tenant), '[]'::jsonb),
    'item_types', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.item_types AS t WHERE t.tenant_id = v_tenant), '[]'::jsonb),
    'item_strengths', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.item_strengths AS t WHERE t.tenant_id = v_tenant), '[]'::jsonb),
    'vendors', COALESCE((SELECT jsonb_agg(to_jsonb(v)) FROM public.vendors AS v WHERE v.tenant_id = v_tenant), '[]'::jsonb),
    'sequences', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('tenant_id', s.tenant_id, 'sequence_date', s.sequence_date, 'last_value', s.last_value))
      FROM public.order_sequences AS s
      WHERE s.tenant_id = v_tenant
    ), '[]'::jsonb),
    'movements', COALESCE((SELECT jsonb_agg(to_jsonb(m)) FROM public.stock_movements AS m WHERE m.tenant_id = v_tenant), '[]'::jsonb),
    'purchases', COALESCE((
      SELECT jsonb_agg(
        to_jsonb(p) || jsonb_build_object(
          'lines', COALESCE((
            SELECT jsonb_agg(to_jsonb(pi))
            FROM public.purchase_items AS pi
            WHERE pi.purchase_id = p.id
          ), '[]'::jsonb)
        )
      )
      FROM public.purchases AS p
      WHERE p.tenant_id = v_tenant
    ), '[]'::jsonb),
    'orders', COALESCE((
      SELECT jsonb_agg(
        to_jsonb(o) || jsonb_build_object(
          'lines', COALESCE((
            SELECT jsonb_agg(to_jsonb(oi))
            FROM public.order_items AS oi
            WHERE oi.order_id = o.id
          ), '[]'::jsonb)
        )
      )
      FROM public.orders AS o
      WHERE o.tenant_id = v_tenant
    ), '[]'::jsonb),
    'activity', COALESCE((SELECT jsonb_agg(to_jsonb(a)) FROM public.activity_logs AS a WHERE a.tenant_id = v_tenant), '[]'::jsonb),
    'tombstones', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('entity', t.entity, 'entity_id', t.entity_id))
      FROM public.sync_tombstones AS t
      WHERE t.tenant_id = v_tenant
    ), '[]'::jsonb)
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.push_sync_batch(p_mobile TEXT, p_mpin TEXT, p_batch JSONB)
RETURNS JSONB
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = public, private, pg_temp
AS $fn$
  SELECT private.push_sync_batch(p_mobile, p_mpin, p_batch);
$fn$;

CREATE OR REPLACE FUNCTION public.pull_sync_snapshot(p_mobile TEXT, p_mpin TEXT)
RETURNS JSONB
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = public, private, pg_temp
AS $fn$
  SELECT private.pull_sync_snapshot(p_mobile, p_mpin);
$fn$;

REVOKE ALL ON FUNCTION private.require_tenant(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.recompute_tenant_stock(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.forget_tombstone(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.write_tombstone(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.apply_sync_change(UUID, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.push_sync_batch(TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.pull_sync_snapshot(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.push_sync_batch(TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pull_sync_snapshot(TEXT, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION private.push_sync_batch(TEXT, TEXT, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION private.pull_sync_snapshot(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.push_sync_batch(TEXT, TEXT, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pull_sync_snapshot(TEXT, TEXT) TO anon, authenticated;
