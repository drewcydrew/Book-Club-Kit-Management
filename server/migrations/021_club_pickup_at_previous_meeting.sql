ALTER TABLE clubs ADD COLUMN pickup_at_previous_meeting boolean NOT NULL DEFAULT false;
ALTER TABLE clubs ADD CONSTRAINT clubs_pickup_at_previous_meeting_check CHECK (NOT pickup_at_previous_meeting OR cadence = 1.5);
