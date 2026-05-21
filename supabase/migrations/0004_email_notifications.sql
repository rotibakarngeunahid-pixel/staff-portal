-- Migration 0004: Email notification logs and test email configuration
-- Additive only. Keeps existing notification_email config intact.

CREATE TABLE IF NOT EXISTS email_logs (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  notification_type   TEXT NOT NULL,
  recipient           TEXT NOT NULL,
  subject             TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','skipped')),
  activity_type       TEXT,
  activity_id         TEXT,
  idempotency_key     TEXT,
  provider_message_id TEXT,
  error_message       TEXT,
  payload_json        JSONB,
  staff_id            UUID REFERENCES staff(id),
  staff_name          TEXT,
  outlet_id           UUID REFERENCES outlets(id),
  outlet_name         TEXT,
  sent_at             TIMESTAMPTZ,
  retry_count         INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_email_logs_idempotency
  ON email_logs(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_logs_created_at ON email_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs(status);
CREATE INDEX IF NOT EXISTS idx_email_logs_activity ON email_logs(activity_type, activity_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_staff ON email_logs(staff_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_logs_outlet ON email_logs(outlet_id, created_at DESC);

INSERT INTO config (key, value) VALUES
  ('test_notification_email', 'rotibakarngeunahid@gmail.com')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_anon ON email_logs;
CREATE POLICY deny_anon ON email_logs FOR ALL TO anon USING (false) WITH CHECK (false);
