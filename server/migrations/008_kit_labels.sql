CREATE TABLE kit_labels (
  id text PRIMARY KEY,
  category text NOT NULL CHECK (category IN ('genre', 'vibe')),
  name text NOT NULL CHECK (name = trim(name) AND length(name) BETWEEN 1 AND 100),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0)
);

CREATE UNIQUE INDEX kit_labels_category_name_unique ON kit_labels (category, lower(name));

CREATE TABLE kit_label_assignments (
  kit_id text NOT NULL REFERENCES kits(id) ON DELETE CASCADE,
  label_id text NOT NULL REFERENCES kit_labels(id) ON DELETE RESTRICT,
  PRIMARY KEY (kit_id, label_id)
);

CREATE INDEX kit_label_assignments_by_label ON kit_label_assignments (label_id, kit_id);
