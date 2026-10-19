-- Insert-only tenant + admin provisioning for the app provider.
-- Never updates or deletes existing tenants/users. Not granted to anon/authenticated.

CREATE UNIQUE INDEX IF NOT EXISTS tenants_license_number_idx
  ON public.tenants (license_number);

CREATE OR REPLACE FUNCTION private.provision_tenant(
  p_business_name TEXT,
  p_license_number TEXT,
  p_admin_mobile TEXT,
  p_admin_mpin TEXT,
  p_admin_name TEXT,
  p_address TEXT DEFAULT '',
  p_table_count INTEGER DEFAULT 10
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE
  v_tenant_id UUID;
  v_user_id UUID;
  v_business_name TEXT := btrim(coalesce(p_business_name, ''));
  v_license_number TEXT := btrim(coalesce(p_license_number, ''));
  v_admin_name TEXT := btrim(coalesce(p_admin_name, ''));
  v_address TEXT := btrim(coalesce(p_address, ''));
BEGIN
  IF v_business_name = '' OR char_length(v_business_name) > 80 THEN
    RAISE EXCEPTION 'invalid business_name';
  END IF;

  IF v_license_number = '' OR char_length(v_license_number) > 80 THEN
    RAISE EXCEPTION 'invalid license_number';
  END IF;

  IF p_admin_mobile !~ '^[0-9]{10}$' THEN
    RAISE EXCEPTION 'admin mobile must be 10 digits';
  END IF;

  IF p_admin_mpin !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'admin mpin must be 4 digits';
  END IF;

  IF v_admin_name = '' OR char_length(v_admin_name) > 80 THEN
    RAISE EXCEPTION 'invalid admin name';
  END IF;

  IF char_length(v_address) > 160 THEN
    RAISE EXCEPTION 'address too long';
  END IF;

  IF p_table_count IS NULL OR p_table_count < 1 OR p_table_count > 200 THEN
    RAISE EXCEPTION 'table_count must be between 1 and 200';
  END IF;

  -- Refuse duplicates without modifying any existing row.
  IF EXISTS (
    SELECT 1
    FROM public.tenants
    WHERE license_number = v_license_number
  ) THEN
    RAISE EXCEPTION 'tenant with this license_number already exists';
  END IF;

  -- Same mobile across tenants makes login ambiguous (match_count > 1).
  IF EXISTS (
    SELECT 1
    FROM public.users
    WHERE mobile_number = p_admin_mobile
  ) THEN
    RAISE EXCEPTION 'admin mobile is already in use by another user';
  END IF;

  INSERT INTO public.tenants (
    business_name,
    license_number,
    address,
    table_count
  )
  VALUES (
    v_business_name,
    v_license_number,
    v_address,
    p_table_count
  )
  RETURNING id INTO v_tenant_id;

  INSERT INTO public.users (
    tenant_id,
    mobile_number,
    mpin_hash,
    name,
    role
  )
  VALUES (
    v_tenant_id,
    p_admin_mobile,
    crypt(p_admin_mpin, gen_salt('bf', 10)),
    v_admin_name,
    'ADMIN'
  )
  RETURNING id INTO v_user_id;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'tenant_id', v_tenant_id,
    'admin_user_id', v_user_id,
    'business_name', v_business_name,
    'license_number', v_license_number,
    'admin_mobile', p_admin_mobile
  );
END;
$fn$;

REVOKE ALL ON FUNCTION private.provision_tenant(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
