-- Dual-station catalog visibility with shared stock tracking.

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS show_in_bar BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS show_in_kitchen BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tracks_stock BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE public.items
SET
  show_in_bar = FALSE,
  show_in_kitchen = TRUE,
  tracks_stock = FALSE
WHERE service_station = 'kitchen';

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'items_station_visibility_check'
  ) THEN
    ALTER TABLE public.items
      ADD CONSTRAINT items_station_visibility_check
      CHECK (show_in_bar OR show_in_kitchen);
  END IF;
END
$guard$;

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
  v_existing_id TEXT := NULL;
  v_line JSONB;
  v_station TEXT;
  v_show_bar BOOLEAN;
  v_show_kitchen BOOLEAN;
  v_tracks_stock BOOLEAN;
  v_code TEXT;
  v_name TEXT;
  v_serial INTEGER;
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

    v_code := NULLIF(btrim(COALESCE(v_record->>'item_code', '')), '');
    IF v_code IS NULL THEN
      RETURN FALSE;
    END IF;

    v_station := CASE
      WHEN lower(COALESCE(v_record->>'service_station', '')) = 'kitchen' THEN 'kitchen'
      WHEN lower(COALESCE(v_record->>'liquor_type', '')) = 'snacks' THEN 'kitchen'
      ELSE 'bar'
    END;

    IF v_record ? 'show_in_bar' OR v_record ? 'show_in_kitchen' THEN
      v_show_bar := COALESCE(v_record->>'show_in_bar', '0') IN ('1', 'true', 't');
      v_show_kitchen := COALESCE(v_record->>'show_in_kitchen', '0') IN ('1', 'true', 't');
      IF NOT v_show_bar AND NOT v_show_kitchen THEN
        v_show_bar := v_station = 'bar';
        v_show_kitchen := v_station = 'kitchen';
      END IF;
    ELSE
      v_show_bar := v_station = 'bar';
      v_show_kitchen := v_station = 'kitchen';
    END IF;

    IF v_record ? 'tracks_stock' THEN
      v_tracks_stock := COALESCE(v_record->>'tracks_stock', '0') IN ('1', 'true', 't');
    ELSE
      v_tracks_stock := NOT (v_show_kitchen AND NOT v_show_bar);
    END IF;

    v_station := CASE
      WHEN v_show_kitchen AND NOT v_show_bar THEN 'kitchen'
      ELSE 'bar'
    END;

    -- Natural key already owned by a different id: merge onto that row (keeps FKs stable).
    SELECT id INTO v_existing_id
    FROM public.items
    WHERE tenant_id = p_tenant
      AND item_code = v_code
      AND id IS DISTINCT FROM v_id
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      PERFORM private.forget_tombstone(p_tenant, 'items', v_existing_id);
      UPDATE public.items
      SET
        name_en = COALESCE(v_record->>'name_en', name_en),
        name_mr = COALESCE(v_record->>'name_mr', name_mr),
        brand = COALESCE(v_record->>'brand', brand),
        liquor_type = COALESCE(v_record->>'liquor_type', liquor_type),
        sub_type = COALESCE(v_record->>'sub_type', sub_type),
        service_station = v_station,
        show_in_bar = v_show_bar,
        show_in_kitchen = v_show_kitchen,
        tracks_stock = v_tracks_stock,
        volume_ml = COALESCE((v_record->>'volume_ml')::integer, volume_ml),
        purchase_price = COALESCE((v_record->>'purchase_price')::numeric, purchase_price),
        selling_price = COALESCE((v_record->>'selling_price')::numeric, selling_price),
        low_stock_threshold = COALESCE((v_record->>'low_stock_threshold')::integer, low_stock_threshold),
        updated_at = v_updated
      WHERE id = v_existing_id
        AND tenant_id = p_tenant
        AND v_updated >= updated_at;
      RETURN TRUE;
    END IF;

    v_serial := COALESCE(NULLIF((v_record->>'serial_no')::integer, 0), 0);
    IF v_serial > 0 AND EXISTS (
      SELECT 1 FROM public.items
      WHERE tenant_id = p_tenant AND serial_no = v_serial AND id IS DISTINCT FROM v_id
    ) THEN
      v_serial := 0;
    END IF;
    IF v_serial <= 0 THEN
      SELECT COALESCE(MAX(serial_no), 0) + 1 INTO v_serial
      FROM public.items
      WHERE tenant_id = p_tenant;
    END IF;

    PERFORM private.forget_tombstone(p_tenant, 'items', v_id);
    INSERT INTO public.items (
      id, tenant_id, serial_no, item_code, name_en, name_mr, brand, liquor_type, sub_type,
      service_station, show_in_bar, show_in_kitchen, tracks_stock,
      volume_ml, purchase_price, selling_price, current_stock, low_stock_threshold, updated_at
    ) VALUES (
      v_id, p_tenant, v_serial,
      v_code, v_record->>'name_en', v_record->>'name_mr',
      v_record->>'brand', v_record->>'liquor_type', v_record->>'sub_type',
      v_station, v_show_bar, v_show_kitchen, v_tracks_stock,
      (v_record->>'volume_ml')::integer, (v_record->>'purchase_price')::numeric,
      (v_record->>'selling_price')::numeric, 0, COALESCE((v_record->>'low_stock_threshold')::integer, 0), v_updated
    )
    ON CONFLICT (id) DO UPDATE SET
      serial_no = CASE
        WHEN EXCLUDED.serial_no > 0 THEN EXCLUDED.serial_no
        ELSE public.items.serial_no
      END,
      item_code = EXCLUDED.item_code,
      name_en = EXCLUDED.name_en,
      name_mr = EXCLUDED.name_mr,
      brand = EXCLUDED.brand,
      liquor_type = EXCLUDED.liquor_type,
      sub_type = EXCLUDED.sub_type,
      service_station = EXCLUDED.service_station,
      show_in_bar = EXCLUDED.show_in_bar,
      show_in_kitchen = EXCLUDED.show_in_kitchen,
      tracks_stock = EXCLUDED.tracks_stock,
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
    v_name := NULLIF(btrim(COALESCE(v_record->>'name', '')), '');
    IF v_name IS NULL THEN
      RETURN FALSE;
    END IF;

    IF v_entity = 'item_types' THEN
      SELECT id INTO v_existing_id
      FROM public.item_types
      WHERE tenant_id = p_tenant AND lower(name) = lower(v_name) AND id IS DISTINCT FROM v_id
      LIMIT 1;
      IF v_existing_id IS NOT NULL THEN
        PERFORM private.forget_tombstone(p_tenant, 'item_types', v_existing_id);
        UPDATE public.item_types
        SET sort_order = COALESCE((v_record->>'sort_order')::integer, sort_order),
            updated_at = v_updated
        WHERE id = v_existing_id AND tenant_id = p_tenant AND v_updated >= updated_at;
        RETURN TRUE;
      END IF;
      PERFORM private.forget_tombstone(p_tenant, 'item_types', v_id);
      INSERT INTO public.item_types (id, tenant_id, name, sort_order, updated_at)
      VALUES (v_id, p_tenant, v_name, COALESCE((v_record->>'sort_order')::integer, 0), v_updated)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        sort_order = EXCLUDED.sort_order,
        updated_at = EXCLUDED.updated_at
      WHERE public.item_types.tenant_id = EXCLUDED.tenant_id
        AND EXCLUDED.updated_at >= public.item_types.updated_at;
    ELSE
      SELECT id INTO v_existing_id
      FROM public.item_strengths
      WHERE tenant_id = p_tenant AND lower(name) = lower(v_name) AND id IS DISTINCT FROM v_id
      LIMIT 1;
      IF v_existing_id IS NOT NULL THEN
        PERFORM private.forget_tombstone(p_tenant, 'item_strengths', v_existing_id);
        UPDATE public.item_strengths
        SET sort_order = COALESCE((v_record->>'sort_order')::integer, sort_order),
            updated_at = v_updated
        WHERE id = v_existing_id AND tenant_id = p_tenant AND v_updated >= updated_at;
        RETURN TRUE;
      END IF;
      PERFORM private.forget_tombstone(p_tenant, 'item_strengths', v_id);
      INSERT INTO public.item_strengths (id, tenant_id, name, sort_order, updated_at)
      VALUES (v_id, p_tenant, v_name, COALESCE((v_record->>'sort_order')::integer, 0), v_updated)
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
    v_name := NULLIF(btrim(COALESCE(v_record->>'name', '')), '');
    IF v_name IS NULL THEN
      RETURN FALSE;
    END IF;

    SELECT id INTO v_existing_id
    FROM public.vendors
    WHERE tenant_id = p_tenant AND lower(name) = lower(v_name) AND id IS DISTINCT FROM v_id
    LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      PERFORM private.forget_tombstone(p_tenant, 'vendors', v_existing_id);
      UPDATE public.vendors
      SET phone = COALESCE(v_record->>'phone', phone),
          updated_at = v_updated
      WHERE id = v_existing_id AND tenant_id = p_tenant AND v_updated >= updated_at;
      RETURN TRUE;
    END IF;

    PERFORM private.forget_tombstone(p_tenant, 'vendors', v_id);
    INSERT INTO public.vendors (id, tenant_id, name, phone, updated_at)
    VALUES (v_id, p_tenant, v_name, COALESCE(v_record->>'phone', ''), v_updated)
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
      v_station := CASE
        WHEN lower(COALESCE(v_line->>'service_station', '')) = 'kitchen' THEN 'kitchen'
        WHEN lower(COALESCE(v_line->>'liquor_type', '')) = 'snacks' THEN 'kitchen'
        ELSE 'bar'
      END;
      INSERT INTO public.order_items (
        id, order_id, item_id, item_code, name_en, name_mr, liquor_type, service_station,
        volume_ml, quantity, unit_price
      ) VALUES (
        v_line->>'id', v_id, v_line->>'item_id', v_line->>'item_code', v_line->>'name_en',
        v_line->>'name_mr', v_line->>'liquor_type', v_station, (v_line->>'volume_ml')::integer,
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
