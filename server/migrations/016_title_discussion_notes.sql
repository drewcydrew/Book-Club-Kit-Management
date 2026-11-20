ALTER TABLE titles
  ADD COLUMN discussion_notes text NOT NULL DEFAULT '' CHECK (length(discussion_notes) <= 4000),
  ADD COLUMN discussion_notes_revision integer NOT NULL DEFAULT 1 CHECK (discussion_notes_revision > 0);
