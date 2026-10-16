ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS address TEXT NOT NULL DEFAULT '';

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'active'
  CHECK (subscription_status IN ('active', 'suspended', 'on-hold'));

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
      'inactivity_timeout_minutes', found.inactivity_timeout_minutes
    )
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION private.update_own_account(
  p_mobile TEXT,
  p_current_mpin TEXT,
  p_name TEXT,
  p_new_mpin TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, pg_temp
AS $fn$
DECLARE
  rec RECORD;
  found RECORD;
  match_count INTEGER := 0;
  clean_name TEXT;
BEGIN
  IF p_mobile !~ '^[0-9]{10}$' OR p_current_mpin !~ '^[0-9]{4}$' THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'invalid');
  END IF;

  IF private.is_locked(p_mobile) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'locked');
  END IF;

  clean_name := btrim(coalesce(p_name, ''));
  IF clean_name = '' OR char_length(clean_name) > 80 THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'validation');
  END IF;

  IF coalesce(p_new_mpin, '') <> '' AND p_new_mpin !~ '^[0-9]{4}$' THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'validation');
  END IF;

  FOR rec IN
    SELECT id, mpin_hash, is_active
    FROM public.users
    WHERE mobile_number = p_mobile
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
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'invalid');
  END IF;

  IF NOT found.is_active THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'invalid');
  END IF;

  UPDATE public.users
  SET
    name = clean_name,
    mpin_hash = CASE
      WHEN coalesce(p_new_mpin, '') = '' THEN mpin_hash
      ELSE crypt(p_new_mpin, gen_salt('bf', 10))
    END
  WHERE id = found.id;

  PERFORM private.record_attempt(p_mobile, TRUE);
  RETURN jsonb_build_object('ok', TRUE);
END;
$fn$;

CREATE OR REPLACE FUNCTION private.update_tenant_profile(
  p_mobile TEXT,
  p_current_mpin TEXT,
  p_business_name TEXT,
  p_address TEXT
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
  clean_name TEXT;
  clean_address TEXT;
BEGIN
  IF p_mobile !~ '^[0-9]{10}$' OR p_current_mpin !~ '^[0-9]{4}$' THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;

  IF private.is_locked(p_mobile) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'locked');
  END IF;

  clean_name := btrim(coalesce(p_business_name, ''));
  clean_address := btrim(coalesce(p_address, ''));
  IF clean_name = '' OR char_length(clean_name) > 80 OR char_length(clean_address) > 160 THEN
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
  SET business_name = clean_name, address = clean_address
  WHERE id = found.tenant_id;

  PERFORM private.record_attempt(p_mobile, TRUE);
  RETURN jsonb_build_object('ok', TRUE);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.update_own_account(
  p_mobile TEXT,
  p_current_mpin TEXT,
  p_name TEXT,
  p_new_mpin TEXT
)
RETURNS JSONB
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = public, private, pg_temp
AS $fn$
  SELECT private.update_own_account(p_mobile, p_current_mpin, p_name, p_new_mpin);
$fn$;

CREATE OR REPLACE FUNCTION public.update_tenant_profile(
  p_mobile TEXT,
  p_current_mpin TEXT,
  p_business_name TEXT,
  p_address TEXT
)
RETURNS JSONB
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = public, private, pg_temp
AS $fn$
  SELECT private.update_tenant_profile(p_mobile, p_current_mpin, p_business_name, p_address);
$fn$;

REVOKE ALL ON FUNCTION private.update_own_account(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.update_tenant_profile(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_own_account(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_tenant_profile(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION private.update_own_account(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION private.update_tenant_profile(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_own_account(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_tenant_profile(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
