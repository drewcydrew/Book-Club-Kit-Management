CREATE TABLE library_services (
  id text PRIMARY KEY,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO library_services(id, name) VALUES ('hume', 'Hume');

DO $$
DECLARE
  table_name text;
  tables text[] := ARRAY[
    'titles', 'kits', 'kit_identifiers', 'clubs', 'club_kits', 'people',
    'membership_versions', 'memberships', 'cycles', 'meeting_slots', 'ballots',
    'ballot_marks', 'finalized_groups', 'finalized_rankings', 'lending_settings',
    'circulation_events', 'club_history', 'schedule_assignments',
    'kit_labels', 'title_label_assignments', 'firebase_identities'
  ];
  fk record;
  source_columns text;
  target_columns text;
  delete_action text;
  update_action text;
  index_name text;
BEGIN
  IF to_regclass('kit_label_assignments') IS NOT NULL THEN
    tables := array_append(tables, 'kit_label_assignments');
  END IF;
  FOREACH table_name IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN library_service_id text NOT NULL DEFAULT %L', table_name, 'hume');
    EXECUTE format('ALTER TABLE %I ALTER COLUMN library_service_id SET DEFAULT NULLIF(current_setting(%L, true), %L)', table_name, 'app.library_service_id', '');
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (library_service_id) REFERENCES library_services(id) ON DELETE RESTRICT',
      table_name, table_name || '_library_service_fkey');
  END LOOP;

  FOR fk IN
    SELECT c.oid, c.conname, c.conrelid::regclass AS source_table, c.confrelid::regclass AS target_table,
      c.conkey, c.confkey, c.confdeltype, c.confupdtype, c.condeferrable, c.condeferred
    FROM pg_constraint c
    JOIN pg_class source ON source.oid = c.conrelid
    JOIN pg_class target ON target.oid = c.confrelid
    JOIN pg_namespace n ON n.oid = source.relnamespace
    WHERE c.contype = 'f' AND n.nspname = current_schema()
      AND target.relnamespace = source.relnamespace
      AND source.relname = ANY(tables) AND target.relname = ANY(tables)
  LOOP
    SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY k.ordinality)
      INTO source_columns
      FROM unnest(fk.conkey) WITH ORDINALITY AS k(attnum, ordinality)
      JOIN pg_attribute a ON a.attrelid = fk.source_table AND a.attnum = k.attnum;
    SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY k.ordinality)
      INTO target_columns
      FROM unnest(fk.confkey) WITH ORDINALITY AS k(attnum, ordinality)
      JOIN pg_attribute a ON a.attrelid = fk.target_table AND a.attnum = k.attnum;
    index_name := 'service_ref_' || md5(fk.target_table::text || ':' || target_columns);
    EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS %I ON %s (%s, library_service_id)', index_name, fk.target_table, target_columns);
    delete_action := CASE fk.confdeltype WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' ELSE 'NO ACTION' END;
    update_action := CASE fk.confupdtype WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' ELSE 'NO ACTION' END;
    IF fk.confdeltype IN ('n', 'd') OR fk.confupdtype IN ('n', 'd') THEN
      RAISE EXCEPTION 'Unsupported foreign-key action in library service migration';
    END IF;
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%s, library_service_id) REFERENCES %s (%s, library_service_id) ON DELETE %s ON UPDATE %s %s',
      fk.source_table, 'service_fk_' || md5(fk.conname || ':' || fk.source_table::text),
      source_columns, fk.target_table, target_columns, delete_action, update_action,
      CASE WHEN fk.condeferrable THEN CASE WHEN fk.condeferred THEN 'DEFERRABLE INITIALLY DEFERRED' ELSE 'DEFERRABLE INITIALLY IMMEDIATE' END ELSE 'NOT DEFERRABLE' END);
  END LOOP;

  FOREACH table_name IN ARRAY tables LOOP
    EXECUTE format('CREATE INDEX %I ON %I (library_service_id)', 'library_scope_' || table_name, table_name);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY library_service_isolation ON %I USING (library_service_id = NULLIF(current_setting(%L, true), %L)) WITH CHECK (library_service_id = NULLIF(current_setting(%L, true), %L))',
      table_name, 'app.library_service_id', '', 'app.library_service_id', '');
  END LOOP;
END $$;

ALTER TABLE firebase_identities DROP CONSTRAINT firebase_identities_pkey;
ALTER TABLE firebase_identities ADD PRIMARY KEY (uid, library_service_id);
ALTER TABLE lending_settings DROP CONSTRAINT lending_settings_pkey;
ALTER TABLE lending_settings ADD PRIMARY KEY (library_service_id);
DROP INDEX kit_identifier_unique;
CREATE UNIQUE INDEX kit_identifier_unique ON kit_identifiers (library_service_id, lower(identifier));
DROP INDEX kit_labels_category_name_unique;
CREATE UNIQUE INDEX kit_labels_category_name_unique ON kit_labels (library_service_id, category, lower(name));
