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
