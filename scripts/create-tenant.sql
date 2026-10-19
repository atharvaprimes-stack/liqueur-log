-- Create a new tenant + ADMIN only (insert-only).
-- Existing tenants are never updated or deleted.
--
-- How to run:
--   1. Apply migrations so private.provision_tenant exists.
--   2. Open Supabase SQL Editor (service role / postgres).
--   3. Edit the values below, then run this file.
--
-- Required: unique license_number and unique admin mobile.

SELECT private.provision_tenant(
  'Test Bar',           -- business_name (1-80 chars)
  'LIC-TEST-001',       -- license_number (must be unique)
  '9876543210',         -- admin mobile (10 digits, must be unique)
  '1234',               -- admin MPIN (4 digits)
  'Primary Admin',      -- admin name
  '',                   -- address (optional)
  10                    -- table_count (1-200, optional; default 10)
);
