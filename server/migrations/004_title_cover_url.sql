ALTER TABLE titles
  ADD COLUMN cover_url text CHECK (cover_url IS NULL OR (cover_url ~ '^https://' AND length(cover_url) <= 2000));

DROP TABLE title_covers;
