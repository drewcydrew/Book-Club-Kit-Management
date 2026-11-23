ALTER TABLE clubs ADD COLUMN pickup_offset_days integer NOT NULL DEFAULT 0
  CONSTRAINT clubs_pickup_offset_days_check CHECK (pickup_offset_days BETWEEN -7 AND 7);
ALTER TABLE clubs ADD COLUMN skip_months integer NOT NULL DEFAULT 0
  CONSTRAINT clubs_skip_months_check CHECK (skip_months BETWEEN 0 AND 4095);

-- Six-weekly clubs become "every six weeks" (cadence 2). Their old month-based slots are replaced by the recurring rule.
UPDATE clubs SET cadence = 2, cadence_offset = 0 WHERE cadence = 1.5;

-- Weekday 0 is Sunday, so ((weekday + 6) % 7) numbers Monday as 0. Both inputs are 0..6, so the difference is always within -6..6.
UPDATE clubs SET pickup_offset_days = ((pickup_weekday + 6) % 7) - ((meeting_weekday + 6) % 7);

ALTER TABLE clubs DROP CONSTRAINT clubs_cadence_check;
ALTER TABLE clubs ADD CONSTRAINT clubs_cadence_check CHECK (cadence IN (1, 2));

ALTER TABLE clubs DROP COLUMN cadence_offset;
ALTER TABLE clubs DROP COLUMN pickup_at_previous_meeting;
ALTER TABLE clubs DROP COLUMN pickup_occurrence;
ALTER TABLE clubs DROP COLUMN pickup_weekday;
