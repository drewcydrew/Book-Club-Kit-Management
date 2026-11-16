CREATE TABLE title_covers (
  title_id text PRIMARY KEY REFERENCES titles(id) ON DELETE CASCADE,
  isbn text NOT NULL CHECK (isbn ~ '^\d{13}$'),
  image_url text CHECK (image_url IS NULL OR length(image_url) <= 2000),
  fetched_at timestamptz NOT NULL DEFAULT now()
);
