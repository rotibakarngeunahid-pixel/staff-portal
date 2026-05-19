-- Migration 0002: Constraints for report_cfg labels and shift_dayoff integrity
-- Run this AFTER verifying no existing dirty data (see cleanup queries below).

-- ── Cleanup queries (run manually to audit before applying constraints) ──
-- Find report_cfg rows with blank labels:
--   SELECT id, outlet_id, type, label FROM report_cfg WHERE trim(label) = '';
-- Find shift_dayoff conflicts (both shifts off same outlet+date):
--   SELECT outlet_id, date, count(*) FROM shift_dayoff GROUP BY outlet_id, date HAVING count(*) > 1;

-- ── 1. report_cfg: label must not be blank after trim ──
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_report_cfg_label_not_blank'
  ) THEN
    ALTER TABLE report_cfg
      ADD CONSTRAINT chk_report_cfg_label_not_blank
      CHECK (trim(label) <> '');
  END IF;
END $$;

-- ── 2. report_cfg: normalized unique label per outlet + type ──
CREATE UNIQUE INDEX IF NOT EXISTS idx_report_cfg_normalized_label
  ON report_cfg (outlet_id, type, lower(trim(label)));

-- ── 3. shift_dayoff: prevent both shifts off on same outlet+date ──
-- Implemented as application-level validation in API (adminSchedule, adminDayoff, checkin).
-- Optionally enforce with a trigger:
CREATE OR REPLACE FUNCTION trg_shift_dayoff_no_both_off()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  other_shift INTEGER;
  other_count INTEGER;
BEGIN
  other_shift := CASE WHEN NEW.shift = 1 THEN 2 ELSE 1 END;
  SELECT count(*) INTO other_count
    FROM shift_dayoff
   WHERE outlet_id = NEW.outlet_id
     AND date = NEW.date
     AND shift = other_shift;
  IF other_count > 0 THEN
    RAISE EXCEPTION 'Tidak bisa meliburkan kedua shift pada tanggal yang sama (outlet_id=%, date=%, shift=%)',
      NEW.outlet_id, NEW.date, NEW.shift;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_shift_dayoff_no_both_off ON shift_dayoff;
CREATE TRIGGER trg_shift_dayoff_no_both_off
  BEFORE INSERT OR UPDATE ON shift_dayoff
  FOR EACH ROW EXECUTE FUNCTION trg_shift_dayoff_no_both_off();
