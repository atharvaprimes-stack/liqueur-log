-- Guest QR requests may only land on tables with an OPEN tab.
-- Available / closed tables reject inserts at RLS.

DROP POLICY IF EXISTS table_requests_insert_pending ON public.table_requests;

CREATE POLICY table_requests_insert_pending
  ON public.table_requests
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    status = 'pending'
    AND EXISTS (
      SELECT 1
      FROM public.tenants AS t
      WHERE t.id = tenant_id
    )
    AND EXISTS (
      SELECT 1
      FROM public.orders AS o
      WHERE o.tenant_id = table_requests.tenant_id
        AND o.order_type = 'TABLE'
        AND o.status = 'OPEN'
        AND o.table_id = (NULLIF(regexp_replace(table_requests.table_id, '[^0-9]', '', 'g'), ''))::integer::text
    )
  );

-- Drop any leftover guest lines on tables that are no longer seated.
UPDATE public.table_requests AS r
SET status = 'closed',
    updated_at = (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint
WHERE r.status = 'pending'
  AND NOT EXISTS (
    SELECT 1
    FROM public.orders AS o
    WHERE o.tenant_id = r.tenant_id
      AND o.order_type = 'TABLE'
      AND o.status = 'OPEN'
      AND o.table_id = (NULLIF(regexp_replace(r.table_id, '[^0-9]', '', 'g'), ''))::integer::text
  );
