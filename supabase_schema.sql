-- Liqueur Log tenant directory.
-- App-provider provisioning uses the service role, which bypasses RLS.
-- Devices never receive table grants. Login and staff sync go through the
-- public RPCs below; credential checks live in the unexposed private schema.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO anon, authenticated;

CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name TEXT NOT NULL,
  license_number TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  subscription_status TEXT NOT NULL DEFAULT 'active'
    CHECK (subscription_status IN ('active', 'suspended', 'on-hold')),
  table_count INTEGER NOT NULL DEFAULT 10 CHECK (table_count BETWEEN 1 AND 200),
  inactivity_timeout_minutes INTEGER NOT NULL DEFAULT 60 CHECK (inactivity_timeout_minutes > 0)
);

CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  mobile_number TEXT NOT NULL CHECK (mobile_number ~ '^[0-9]{10}$'),
  mpin_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'STAFF')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE UNIQUE INDEX IF NOT EXISTS users_tenant_id_mobile_number_idx
  ON public.users (tenant_id, mobile_number);

CREATE INDEX IF NOT EXISTS users_mobile_number_idx
  ON public.users (mobile_number);

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.tenants FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.users FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tenants TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.users TO service_role;

CREATE TABLE IF NOT EXISTS private.auth_attempts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mobile_number TEXT NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  succeeded BOOLEAN NOT NULL
);

CREATE INDEX IF NOT EXISTS auth_attempts_mobile_attempted_at_idx
  ON private.auth_attempts (mobile_number, attempted_at DESC);

REVOKE ALL ON TABLE private.auth_attempts FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.mpin_matches(p_mpin TEXT, p_hash TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, public, pg_temp
AS $fn$
BEGIN
  IF p_hash IS NULL OR length(p_hash) < 20 THEN
    RETURN FALSE;
  END IF;

  RETURN crypt(p_mpin, p_hash) = p_hash;
EXCEPTION
  WHEN OTHERS THEN
    RETURN FALSE;
END;
$fn$;

CREATE OR REPLACE FUNCTION private.is_locked(p_mobile TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = private, pg_temp
AS $fn$
  SELECT count(*) >= 5
  FROM private.auth_attempts
  WHERE mobile_number = p_mobile
    AND succeeded = FALSE
    AND attempted_at > now() - INTERVAL '15 minutes';
$fn$;

CREATE OR REPLACE FUNCTION private.record_attempt(p_mobile TEXT, p_succeeded BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, pg_temp
AS $fn$
BEGIN
  DELETE FROM private.auth_attempts
  WHERE attempted_at < now() - INTERVAL '1 day';

  INSERT INTO private.auth_attempts (mobile_number, succeeded)
  VALUES (p_mobile, p_succeeded);
END;
$fn$;

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

CREATE OR REPLACE FUNCTION private.sync_staff_member(
  p_admin_mobile TEXT,
  p_admin_mpin TEXT,
  p_id UUID,
  p_tenant_id UUID,
  p_mobile TEXT,
  p_mpin_hash TEXT,
  p_name TEXT,
  p_is_active BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $fn$
DECLARE
  candidate RECORD;
  existing_record RECORD;
  admin_tenant UUID;
  admin_count INTEGER := 0;
  clean_name TEXT;
  saved RECORD;
BEGIN
  IF p_admin_mobile !~ '^[0-9]{10}$' OR p_admin_mpin !~ '^[0-9]{4}$' THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;

  IF private.is_locked(p_admin_mobile) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'locked');
  END IF;

  FOR candidate IN
    SELECT id, tenant_id, mpin_hash
    FROM public.users
    WHERE mobile_number = p_admin_mobile
      AND role = 'ADMIN'
      AND is_active = TRUE
  LOOP
    IF private.mpin_matches(p_admin_mpin, candidate.mpin_hash) THEN
      admin_count := admin_count + 1;
      admin_tenant := candidate.tenant_id;
    END IF;
  END LOOP;

  IF admin_count <> 1 THEN
    IF admin_count = 0 THEN
      PERFORM private.record_attempt(p_admin_mobile, FALSE);
    END IF;
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;

  PERFORM private.record_attempt(p_admin_mobile, TRUE);

  IF p_tenant_id IS DISTINCT FROM admin_tenant THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
  END IF;

  clean_name := btrim(coalesce(p_name, ''));

  IF clean_name = '' OR char_length(clean_name) > 80 OR p_mobile !~ '^[0-9]{10}$' THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'validation');
  END IF;

  IF p_mpin_hash IS NOT NULL AND p_mpin_hash <> '' AND p_mpin_hash !~ '^\$2[ab]\$' THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'validation');
  END IF;

  SELECT id, tenant_id, role
  INTO existing_record
  FROM public.users
  WHERE id = p_id;

  IF FOUND THEN
    IF existing_record.tenant_id IS DISTINCT FROM admin_tenant OR existing_record.role <> 'STAFF' THEN
      RETURN jsonb_build_object('ok', FALSE, 'reason', 'forbidden');
    END IF;

    UPDATE public.users
    SET
      mobile_number = p_mobile,
      name = clean_name,
      is_active = coalesce(p_is_active, TRUE),
      mpin_hash = coalesce(nullif(p_mpin_hash, ''), mpin_hash)
    WHERE id = p_id
      AND tenant_id = admin_tenant
      AND role = 'STAFF'
    RETURNING id, tenant_id, mobile_number, name, role, is_active
    INTO saved;
  ELSE
    IF p_mpin_hash IS NULL OR p_mpin_hash = '' THEN
      RETURN jsonb_build_object('ok', FALSE, 'reason', 'validation');
    END IF;

    INSERT INTO public.users (id, tenant_id, mobile_number, mpin_hash, name, role, is_active)
    VALUES (p_id, admin_tenant, p_mobile, p_mpin_hash, clean_name, 'STAFF', coalesce(p_is_active, TRUE))
    RETURNING id, tenant_id, mobile_number, name, role, is_active
    INTO saved;
  END IF;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'user', jsonb_build_object(
      'id', saved.id,
      'tenant_id', saved.tenant_id,
      'mobile_number', saved.mobile_number,
      'name', saved.name,
      'role', saved.role,
      'is_active', saved.is_active
    )
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'duplicate');
END;
$fn$;

CREATE OR REPLACE FUNCTION public.login_with_mpin(p_mobile TEXT, p_mpin TEXT)
RETURNS JSONB
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = public, private, pg_temp
AS $fn$
  SELECT private.verify_login(p_mobile, p_mpin);
$fn$;

CREATE OR REPLACE FUNCTION public.sync_staff_member(
  p_admin_mobile TEXT,
  p_admin_mpin TEXT,
  p_id UUID,
  p_tenant_id UUID,
  p_mobile TEXT,
  p_mpin_hash TEXT,
  p_name TEXT,
  p_is_active BOOLEAN
)
RETURNS JSONB
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = public, private, pg_temp
AS $fn$
  SELECT private.sync_staff_member(
    p_admin_mobile,
    p_admin_mpin,
    p_id,
    p_tenant_id,
    p_mobile,
    p_mpin_hash,
    p_name,
    p_is_active
  );
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

  IF match_count <> 1 OR NOT found.is_active THEN
    IF match_count = 0 THEN
      PERFORM private.record_attempt(p_mobile, FALSE);
    END IF;
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

REVOKE ALL ON FUNCTION private.mpin_matches(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.is_locked(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.record_attempt(TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.verify_login(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.sync_staff_member(TEXT, TEXT, UUID, UUID, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.login_with_mpin(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_staff_member(TEXT, TEXT, UUID, UUID, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION private.verify_login(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION private.sync_staff_member(TEXT, TEXT, UUID, UUID, TEXT, TEXT, TEXT, BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.login_with_mpin(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_staff_member(TEXT, TEXT, UUID, UUID, TEXT, TEXT, TEXT, BOOLEAN) TO anon, authenticated;

REVOKE ALL ON FUNCTION private.update_own_account(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.update_tenant_profile(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_own_account(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_tenant_profile(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION private.update_own_account(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION private.update_tenant_profile(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_own_account(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_tenant_profile(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

-- Provision a tenant and its admin with the service role, for example:
-- INSERT INTO public.tenants (business_name, license_number)
-- VALUES ('Harbour Bar', 'LIC-1001')
-- RETURNING id;
--
-- INSERT INTO public.users (tenant_id, mobile_number, mpin_hash, name, role)
-- VALUES (
--   '<tenant uuid>',
--   '9876543210',
--   crypt('1234', gen_salt('bf', 10)),
--   'Primary Admin',
--   'ADMIN'
-- );
