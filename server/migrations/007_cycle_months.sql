ALTER TABLE cycles ADD COLUMN starts_on date, ADD COLUMN ends_on date;
UPDATE cycles c SET
  starts_on = COALESCE((SELECT date_trunc('month', min(s.meeting))::date FROM meeting_slots s WHERE s.cycle_id=c.id), (date_trunc('month', c.deadline) + interval '1 month')::date),
  ends_on = COALESCE((SELECT (date_trunc('month', max(s.meeting)) + interval '1 month - 1 day')::date FROM meeting_slots s WHERE s.cycle_id=c.id), (date_trunc('month', c.deadline) + interval '12 months - 1 day')::date);
ALTER TABLE cycles ALTER COLUMN starts_on SET NOT NULL, ALTER COLUMN ends_on SET NOT NULL,
  ADD CONSTRAINT cycles_range_check CHECK (starts_on <= ends_on);
ALTER TABLE meeting_slots ADD COLUMN month text;
-- Keep the earliest meeting per club and month. Extra meetings in the same month are removed with their assignments.
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY cycle_id,club_id,to_char(meeting,'YYYY-MM') ORDER BY meeting,id) AS rn FROM meeting_slots
)
DELETE FROM schedule_assignments WHERE slot_id IN (SELECT id FROM ranked WHERE rn > 1);
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY cycle_id,club_id,to_char(meeting,'YYYY-MM') ORDER BY meeting,id) AS rn FROM meeting_slots
)
DELETE FROM meeting_slots WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
UPDATE meeting_slots SET month=to_char(meeting,'YYYY-MM');
ALTER TABLE meeting_slots ALTER COLUMN month SET NOT NULL, ALTER COLUMN meeting DROP NOT NULL,
  DROP CONSTRAINT meeting_slots_cycle_id_club_id_meeting_key,
  ADD CONSTRAINT meeting_slots_month_check CHECK (month ~ '^\d{4}-\d{2}$'),
  ADD CONSTRAINT meeting_slots_meeting_month_check CHECK (meeting IS NULL OR to_char(meeting,'YYYY-MM') = month),
  ADD CONSTRAINT meeting_slots_cycle_club_month_key UNIQUE (cycle_id,club_id,month);
