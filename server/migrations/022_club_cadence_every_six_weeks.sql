ALTER TABLE clubs DROP CONSTRAINT clubs_cadence_check;
ALTER TABLE clubs ADD CONSTRAINT clubs_cadence_check CHECK (cadence IN (1, 1.5, 2));
