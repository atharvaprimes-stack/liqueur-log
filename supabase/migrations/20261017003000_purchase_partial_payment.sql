-- Allow partial cash payments on supplier purchases (keep legacy UPI values readable).
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT con.conname
  INTO constraint_name
  FROM pg_constraint AS con
  JOIN pg_class AS rel ON rel.oid = con.conrelid
  JOIN pg_namespace AS nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'purchases'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%payment_type%Cash%UPI%Credit%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.purchases DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE public.purchases
  ADD CONSTRAINT purchases_payment_type_check
  CHECK (payment_type IN ('Cash', 'Partial', 'Credit', 'UPI'));
