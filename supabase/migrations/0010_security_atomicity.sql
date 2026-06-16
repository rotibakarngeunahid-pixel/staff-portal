-- Migration 0010: security hardening, atomic shift claim, and payroll guard indexes

CREATE TABLE IF NOT EXISTS staff_login_attempts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  staff_id UUID REFERENCES staff(id),
  login_key TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  device_fingerprint TEXT NOT NULL,
  success BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_staff_login_attempts_scope
  ON staff_login_attempts(login_key, ip_address, device_fingerprint, attempt_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_ip_time
  ON admin_login_attempts(ip_address, attempt_at DESC);

CREATE INDEX IF NOT EXISTS idx_attendance_staff_paid_date
  ON attendance(staff_id, paid_status, date, shift);

CREATE INDEX IF NOT EXISTS idx_attendance_outlet_date_shift_paid
  ON attendance(outlet_id, date, shift)
  WHERE checkin_time IS NOT NULL AND NOT COALESCE(is_duplicate, false);

CREATE INDEX IF NOT EXISTS idx_payments_staff_paid_at
  ON payments(staff_id, paid_at DESC);

ALTER TABLE staff_login_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_anon ON staff_login_attempts;
CREATE POLICY deny_anon ON staff_login_attempts FOR ALL TO anon USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION claim_shift_atomic(
  p_outlet_id UUID,
  p_date DATE,
  p_shift INTEGER,
  p_staff_id UUID,
  p_staff_name TEXT,
  p_created_by TEXT DEFAULT 'staff'
)
RETURNS shift_schedule
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schedule shift_schedule;
BEGIN
  IF p_shift NOT IN (1, 2) THEN
    RAISE EXCEPTION 'INVALID_SHIFT';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM shift_dayoff
     WHERE outlet_id = p_outlet_id
       AND date = p_date
       AND shift = p_shift
  ) THEN
    RAISE EXCEPTION 'SHIFT_OFF';
  END IF;

  INSERT INTO shift_schedule (
    outlet_id,
    date,
    shift,
    staff_id,
    staff_name,
    status,
    requested_at,
    cancelled_at,
    cancel_reason,
    created_by
  )
  VALUES (
    p_outlet_id,
    p_date,
    p_shift,
    p_staff_id,
    p_staff_name,
    'claimed',
    now(),
    NULL,
    NULL,
    p_created_by
  )
  ON CONFLICT (outlet_id, date, shift)
  DO UPDATE SET
    staff_id = EXCLUDED.staff_id,
    staff_name = EXCLUDED.staff_name,
    status = 'claimed',
    requested_at = now(),
    cancelled_at = NULL,
    cancel_reason = NULL,
    created_by = EXCLUDED.created_by
  WHERE shift_schedule.status <> 'off'
    AND (
      shift_schedule.staff_id IS NULL
      OR shift_schedule.staff_id = EXCLUDED.staff_id
      OR shift_schedule.status IN ('open', 'cancelled')
    )
  RETURNING * INTO v_schedule;

  IF v_schedule.id IS NULL THEN
    SELECT * INTO v_schedule
      FROM shift_schedule
     WHERE outlet_id = p_outlet_id
       AND date = p_date
       AND shift = p_shift;

    IF v_schedule.status = 'off' THEN
      RAISE EXCEPTION 'SHIFT_OFF';
    END IF;
    RAISE EXCEPTION 'SHIFT_TAKEN';
  END IF;

  RETURN v_schedule;
END;
$$;

CREATE OR REPLACE FUNCTION trg_attendance_prevent_slot_overlap()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.checkin_time IS NULL
     OR COALESCE(NEW.is_duplicate, false)
     OR NEW.shift NOT IN (0, 1, 2) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM attendance a
     WHERE a.outlet_id = NEW.outlet_id
       AND a.date = NEW.date
       AND a.checkin_time IS NOT NULL
       AND NOT COALESCE(a.is_duplicate, false)
       AND a.id IS DISTINCT FROM NEW.id
       AND (
         NEW.shift = 0
         OR a.shift = 0
         OR a.shift = NEW.shift
       )
  ) THEN
    RAISE EXCEPTION 'SHIFT_ALREADY_TAKEN' USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_attendance_prevent_slot_overlap ON attendance;
CREATE TRIGGER trg_attendance_prevent_slot_overlap
  BEFORE INSERT OR UPDATE OF outlet_id, date, shift, checkin_time, is_duplicate
  ON attendance
  FOR EACH ROW
  EXECUTE FUNCTION trg_attendance_prevent_slot_overlap();
