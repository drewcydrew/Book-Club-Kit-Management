CREATE TABLE title_label_assignments (
  title_id text NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  label_id text NOT NULL REFERENCES kit_labels(id) ON DELETE RESTRICT,
  PRIMARY KEY (title_id, label_id)
);

CREATE INDEX title_label_assignments_by_label ON title_label_assignments (label_id, title_id);

INSERT INTO title_label_assignments (title_id, label_id)
SELECT DISTINCT k.title_id, a.label_id
FROM kit_label_assignments a JOIN kits k ON k.id = a.kit_id;

UPDATE titles SET revision = revision + 1
WHERE id IN (SELECT title_id FROM title_label_assignments);
UPDATE kits SET revision = revision + 1
WHERE title_id IN (SELECT title_id FROM title_label_assignments);

DROP TABLE kit_label_assignments;
