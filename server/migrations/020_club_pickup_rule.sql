ALTER TABLE clubs ADD COLUMN pickup_weekday integer;
ALTER TABLE clubs ADD COLUMN pickup_occurrence integer;
UPDATE clubs SET pickup_weekday = meeting_weekday, pickup_occurrence = meeting_occurrence;
ALTER TABLE clubs ALTER COLUMN pickup_weekday SET NOT NULL, ALTER COLUMN pickup_occurrence SET NOT NULL;
ALTER TABLE clubs ADD CONSTRAINT clubs_pickup_weekday_check CHECK (pickup_weekday BETWEEN 0 AND 6);
ALTER TABLE clubs ADD CONSTRAINT clubs_pickup_occurrence_check CHECK (pickup_occurrence IN (1, 2, 3, 4, -1));
