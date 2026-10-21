-- Allow POS devices to accept/reject/close requests without an in-memory MPIN.
-- Also register Expo push tokens and notify staff on new pending guest requests.

GRANT UPDATE ON TABLE public.table_requests TO anon, authenticated;

DROP POLICY IF EXISTS table_requests_update_status ON public.table_requests;

CREATE POLICY table_requests_update_status
  ON public.table_requests
  FOR UPDATE
  TO anon, authenticated
  USING (status IN ('pending', 'accepted', 'rejected'))
  WITH CHECK (status IN ('accepted', 'rejected', 'closed'));

CREATE TABLE IF NOT EXISTS public.device_push_tokens (
  token TEXT PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  platform TEXT NOT NULL DEFAULT 'unknown',
  updated_at BIGINT NOT NULL DEFAULT ((EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint)
);

CREATE INDEX IF NOT EXISTS device_push_tokens_tenant_id_idx
  ON public.device_push_tokens (tenant_id);

ALTER TABLE public.device_push_tokens ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.device_push_tokens FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.device_push_tokens TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.device_push_tokens TO service_role;

CREATE POLICY device_push_tokens_select
  ON public.device_push_tokens
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY device_push_tokens_insert
  ON public.device_push_tokens
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.tenants AS t WHERE t.id = tenant_id));

CREATE POLICY device_push_tokens_update
  ON public.device_push_tokens
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (EXISTS (SELECT 1 FROM public.tenants AS t WHERE t.id = tenant_id));

CREATE POLICY device_push_tokens_delete
  ON public.device_push_tokens
  FOR DELETE
  TO anon, authenticated
  USING (true);

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION private.notify_table_request_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE
  messages jsonb := '[]'::jsonb;
  token_row RECORD;
  title text;
  body text;
BEGIN
  IF TG_OP <> 'INSERT' OR NEW.status <> 'pending' THEN
    RETURN NEW;
  END IF;

  title := format('Table %s request', NEW.table_id);
  body := format(
    '%s × %s',
    GREATEST(NEW.quantity, 1),
    NULLIF(trim(NEW.name_en), '')
  );
  IF body IS NULL THEN
    body := 'New customer order request';
  END IF;

  FOR token_row IN
    SELECT token
    FROM public.device_push_tokens
    WHERE tenant_id = NEW.tenant_id
  LOOP
    messages := messages || jsonb_build_array(
      jsonb_build_object(
        'to', token_row.token,
        'title', title,
        'body', body,
        'sound', 'default',
        'priority', 'high',
        'channelId', 'table-requests',
        'data', jsonb_build_object(
          'type', 'table_request',
          'tableId', NEW.table_id,
          'requestId', NEW.id
        )
      )
    );
  END LOOP;

  IF jsonb_array_length(messages) = 0 THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Accept', 'application/json'
    ),
    body := messages
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Never block guest inserts if push delivery fails.
    RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS table_requests_notify_push ON public.table_requests;

CREATE TRIGGER table_requests_notify_push
  AFTER INSERT ON public.table_requests
  FOR EACH ROW
  EXECUTE FUNCTION private.notify_table_request_push();
