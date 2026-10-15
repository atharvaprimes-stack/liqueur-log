ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS table_count INTEGER NOT NULL DEFAULT 10
  CHECK (table_count BETWEEN 1 AND 200);

CREATE OR REPLACE FUNCTION private.verify_login(p_mobile TEXT, p_mpin TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $fn$
DECLARE
  rec RECORD;
  found RECORD;
  match_count INTEGER := 0;
BEGIN
  IF p_mobile !~ '^[0-9]{10}$' OR p_mpin !~ '^[0-9]{4}$' THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'invalid');
  END IF;

  IF private.is_locked(p_mobile) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'locked');
  END IF;

  FOR rec IN
    SELECT
      u.id,
      u.tenant_id,
      u.mobile_number,
      u.name,
      u.role,
      u.is_active,
      u.mpin_hash,
      t.business_name,
      t.license_number,
      t.address,
      t.subscription_status,
      t.table_count,
      t.inactivity_timeout_minutes
    FROM public.users AS u
    JOIN public.tenants AS t ON t.id = u.tenant_id
    WHERE u.mobile_number = p_mobile
  LOOP
    IF private.mpin_matches(p_mpin, rec.mpin_hash) THEN
      match_count := match_count + 1;
      found := rec;
    END IF;
  END LOOP;

  IF match_count = 0 THEN
    PERFORM private.record_attempt(p_mobile, FALSE);
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'invalid');
  END IF;

  IF match_count > 1 THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'ambiguous');
  END IF;

  PERFORM private.record_attempt(p_mobile, TRUE);

  IF NOT found.is_active THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'reason', 'inactive',
      'user_id', found.id,
      'tenant_id', found.tenant_id
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'user', jsonb_build_object(
      'id', found.id,
      'tenant_id', found.tenant_id,
      'mobile_number', found.mobile_number,
      'name', found.name,
      'role', found.role,
      'is_active', found.is_active
    ),
    'tenant', jsonb_build_object(
      'id', found.tenant_id,
      'business_name', found.business_name,
      'license_number', found.license_number,
      'address', found.address,
      'subscription_status', found.subscription_status,
      'table_count', found.table_count,
      'inactivity_timeout_minutes', found.inactivity_timeout_minutes
    )
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION private.update_table_count(
  p_mobile TEXT,
  p_current_mpin TEXT,
  p_table_count INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $fn$
DECLARE
  rec RECORD;
  found RECORD;
  match_count INTEGER := 0;
BEGIN
  IF p_mobile !~ '^[0-9]{10}$' OR p_current_mpin !~ '^[0-9]{4}$' THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;

  IF private.is_locked(p_mobile) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'locked');
  END IF;

  IF p_table_count IS NULL OR p_table_count < 1 OR p_table_count > 200 THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'validation');
  END IF;

  FOR rec IN
    SELECT id, tenant_id, mpin_hash
    FROM public.users
    WHERE mobile_number = p_mobile
      AND role = 'ADMIN'
      AND is_active = TRUE
  LOOP
    IF private.mpin_matches(p_current_mpin, rec.mpin_hash) THEN
      match_count := match_count + 1;
      found := rec;
    END IF;
  END LOOP;

  IF match_count <> 1 THEN
    IF match_count = 0 THEN
      PERFORM private.record_attempt(p_mobile, FALSE);
    END IF;
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;

  UPDATE public.tenants
  SET table_count = p_table_count
  WHERE id = found.tenant_id;

  PERFORM private.record_attempt(p_mobile, TRUE);
  RETURN jsonb_build_object('ok', TRUE);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.update_table_count(
  p_mobile TEXT,
  p_current_mpin TEXT,
  p_table_count INTEGER
)
RETURNS JSONB
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = public, private, pg_temp
AS $fn$
  SELECT private.update_table_count(p_mobile, p_current_mpin, p_table_count);
$fn$;

REVOKE ALL ON FUNCTION private.update_table_count(TEXT, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_table_count(TEXT, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.update_table_count(TEXT, TEXT, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_table_count(TEXT, TEXT, INTEGER) TO anon, authenticated;
