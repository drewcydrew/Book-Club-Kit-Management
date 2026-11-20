ALTER TABLE clubs ADD COLUMN cadence_offset integer NOT NULL DEFAULT 0
  CONSTRAINT clubs_cadence_offset_check CHECK (cadence_offset BETWEEN 0 AND 2);
