-- Customer QR self-ordering requests.
-- Guests insert pending rows from the public web menu (anon).
-- Staff devices list/update via MPIN RPCs and subscribe to Realtime changes.

CREATE TABLE IF NOT EXISTS public.table_requests (
  id TEXT PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  table_id TEXT NOT NULL CHECK (table_id ~ '^[0-9]{1,3}$'),
  item_id TEXT NOT NULL,
  item_code TEXT NOT NULL DEFAULT '',
  name_en TEXT NOT NULL DEFAULT '',
  name_mr TEXT NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL CHECK (quantity > 0 AND quantity <= 9999),
  unit_price NUMERIC NOT NULL CHECK (unit_price >= 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected', 'closed')),
  created_at BIGINT NOT NULL DEFAULT ((EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint),
  updated_at BIGINT NOT NULL DEFAULT ((EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint)
);

CREATE INDEX IF NOT EXISTS table_requests_tenant_status_idx
  ON public.table_requests (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS table_requests_tenant_table_status_idx
  ON public.table_requests (tenant_id, table_id, status);

ALTER TABLE public.table_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.table_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.table_requests TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.table_requests TO service_role;

-- Realtime needs SELECT. Closed rows drop out so settled sessions stop broadcasting.
CREATE POLICY table_requests_select_active
  ON public.table_requests
  FOR SELECT
  TO anon, authenticated
  USING (status IN ('pending', 'accepted', 'rejected'));

-- Public web menu may insert pending lines for an existing tenant/table.
CREATE POLICY table_requests_insert_pending
  ON public.table_requests
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    status = 'pending'
    AND EXISTS (SELECT 1 FROM public.tenants AS t WHERE t.id = tenant_id)
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.table_requests;

CREATE OR REPLACE FUNCTION private.list_table_requests(p_mobile TEXT, p_mpin TEXT)
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
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'requests', COALESCE((
      SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at ASC)
      FROM public.table_requests AS r
      WHERE r.tenant_id = v_tenant
        AND r.status IN ('pending', 'accepted', 'rejected')
    ), '[]'::jsonb)
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION private.update_table_request_status(
  p_mobile TEXT,
  p_mpin TEXT,
  p_request_id TEXT,
  p_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $fn$
DECLARE
  v_tenant UUID;
  v_now BIGINT := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint;
BEGIN
  IF p_status NOT IN ('accepted', 'rejected', 'closed') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  v_tenant := private.require_tenant(p_mobile, p_mpin);
  IF v_tenant IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized');
  END IF;

  UPDATE public.table_requests
  SET status = p_status,
      updated_at = v_now
  WHERE id = p_request_id
    AND tenant_id = v_tenant
    AND status = 'pending';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$fn$;

CREATE OR REPLACE FUNCTION private.update_table_requests_status_bulk(
  p_mobile TEXT,
  p_mpin TEXT,
  p_request_ids TEXT[],
  p_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $fn$
DECLARE
  v_tenant UUID;
  v_now BIGINT := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint;
  v_updated INTEGER := 0;
BEGIN
  IF p_status NOT IN ('accepted', 'rejected', 'closed') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  IF p_request_ids IS NULL OR cardinality(p_request_ids) = 0 THEN
    RETURN jsonb_build_object('ok', true, 'updated', 0);
  END IF;

  v_tenant := private.require_tenant(p_mobile, p_mpin);
  IF v_tenant IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized');
  END IF;

  UPDATE public.table_requests
  SET status = p_status,
      updated_at = v_now
  WHERE tenant_id = v_tenant
    AND status = 'pending'
    AND id = ANY (p_request_ids);

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'updated', v_updated);
END;
$fn$;

CREATE OR REPLACE FUNCTION private.close_table_requests(
  p_mobile TEXT,
  p_mpin TEXT,
  p_table_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $fn$
DECLARE
  v_tenant UUID;
  v_table TEXT;
  v_now BIGINT := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint;
  v_updated INTEGER := 0;
BEGIN
  IF p_table_id !~ '^[0-9]{1,3}$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  v_table := (p_table_id::integer)::text;

  v_tenant := private.require_tenant(p_mobile, p_mpin);
  IF v_tenant IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized');
  END IF;

  UPDATE public.table_requests
  SET status = 'closed',
      updated_at = v_now
  WHERE tenant_id = v_tenant
    AND table_id = v_table
    AND status <> 'closed';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'updated', v_updated);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.list_table_requests(p_mobile TEXT, p_mpin TEXT)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $fn$
  SELECT private.list_table_requests(p_mobile, p_mpin);
$fn$;

CREATE OR REPLACE FUNCTION public.update_table_request_status(
  p_mobile TEXT,
  p_mpin TEXT,
  p_request_id TEXT,
  p_status TEXT
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $fn$
  SELECT private.update_table_request_status(p_mobile, p_mpin, p_request_id, p_status);
$fn$;

CREATE OR REPLACE FUNCTION public.update_table_requests_status_bulk(
  p_mobile TEXT,
  p_mpin TEXT,
  p_request_ids TEXT[],
  p_status TEXT
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $fn$
  SELECT private.update_table_requests_status_bulk(p_mobile, p_mpin, p_request_ids, p_status);
$fn$;

CREATE OR REPLACE FUNCTION public.close_table_requests(
  p_mobile TEXT,
  p_mpin TEXT,
  p_table_id TEXT
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $fn$
  SELECT private.close_table_requests(p_mobile, p_mpin, p_table_id);
$fn$;

REVOKE ALL ON FUNCTION private.list_table_requests(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.update_table_request_status(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.update_table_requests_status_bulk(TEXT, TEXT, TEXT[], TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.close_table_requests(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION private.list_table_requests(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION private.update_table_request_status(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION private.update_table_requests_status_bulk(TEXT, TEXT, TEXT[], TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION private.close_table_requests(TEXT, TEXT, TEXT) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.list_table_requests(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_table_request_status(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_table_requests_status_bulk(TEXT, TEXT, TEXT[], TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_table_requests(TEXT, TEXT, TEXT) TO anon, authenticated;
