ALTER TABLE clubs ADD COLUMN meeting_weekday integer NOT NULL DEFAULT 1
  CONSTRAINT clubs_meeting_weekday_check CHECK (meeting_weekday BETWEEN 0 AND 6);
ALTER TABLE clubs ADD COLUMN meeting_occurrence integer NOT NULL DEFAULT 1
  CONSTRAINT clubs_meeting_occurrence_check CHECK (meeting_occurrence IN (1, 2, 3, 4, -1));
