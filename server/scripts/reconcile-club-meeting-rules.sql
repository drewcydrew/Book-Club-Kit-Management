\set ON_ERROR_STOP on
\pset pager off
\encoding UTF8

BEGIN ISOLATION LEVEL SERIALIZABLE;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM schema_migrations WHERE name='018_library_services.sql') THEN
    RAISE EXCEPTION 'This maintenance command does not yet support library services and cannot be run safely.';
  END IF;
END $$;

\echo 'Verify the target database, schema and user before continuing:'
SELECT current_database() AS database, current_schema() AS schema, current_user AS database_user;

DO $$
DECLARE target_schema text := current_schema();
BEGIN
  IF target_schema IS NULL OR target_schema IN ('pg_catalog', 'information_schema') THEN
    RAISE EXCEPTION 'No safe application schema is selected.';
  END IF;
  PERFORM set_config('search_path', format('%I, pg_catalog', target_schema), true);
  IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE name = '013_club_cadence.sql')
     OR NOT EXISTS (SELECT 1 FROM schema_migrations WHERE name = '014_club_meeting_rule.sql') THEN
    RAISE EXCEPTION 'Club cadence and meeting-rule migrations 013 and 014 are required.';
  END IF;
END $$;

-- Prevent club names or rules changing between preview and confirmation.
LOCK TABLE clubs IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE source_rules (
  source text PRIMARY KEY,
  cadence double precision NOT NULL,
  weekday integer,
  occurrence integer,
  meeting_rule text NOT NULL,
  pickup_rule text NOT NULL,
  return_rule text NOT NULL
) ON COMMIT DROP;

-- Workbook: book club meeting rules (1).xlsx, Sheet1, rows 2-44.
INSERT INTO source_rules VALUES
  ('Aqua Book Club', 1, 3, 3, 'Third Wed', 'Third Mon', '1 week past meeting'),
  ('Attwood Book Lovers', 1, 2, 3, 'Third Tue', 'Third Mon', '1 week past meeting'),
  ('Aveo', 1, 1, 2, 'Second Mon', 'First Mon', '1 week past meeting'),
  ('Beauties & The Beast', 1.5, NULL, NULL, 'Every Six Weeks', 'Fri Before', '1 week past meeting'),
  ('Between The Lines', 1, 4, 3, 'Third Thu', 'Third Thu', '1 week past meeting'),
  ('Book Club Buddies', 1, 5, -1, 'Last Fri', 'Fri Before', '1 week past meeting'),
  ('Books and Beer', 1, 4, -1, 'Last Thu', 'Fri Before', '1 week past meeting'),
  ('Books and bites', 1, 6, 1, 'First Sat', 'Mon Before', '1 week past meeting'),
  ('Books before Bedtime', 1, 4, 4, 'Fourth Thu', 'Fourth Thu', '1 week past meeting'),
  ('Bookworms', 1, 3, 3, 'Third Wed', 'First Wed', '1 week past meeting'),
  ('Broadie Mermaids', 1.5, NULL, NULL, 'Every Six Weeks', 'Mon Before', '1 week past meeting'),
  ('Butterflies', 1, 4, 1, 'First Thu', 'First Thu', '1 week past meeting'),
  ('Chapter Chicks', 1, 0, 2, 'Second Sun', 'First Mon', '1 week past meeting'),
  ('Chasing Titles', 1, 4, 2, 'Second Thu', 'Second Thu', '1 week past meeting'),
  ('Clarkefield', 1, 2, 2, 'Second Tue', 'First Tue', '1 week past meeting'),
  ('Couch St', 1, 5, 2, 'Second Fri', 'First Thu', '1 week past meeting'),
  ('Craigiebites', 1, 4, 1, 'First Thu', 'Thu Before', '1 week past meeting'),
  ('Fiction Addiction', 1.5, 4, NULL, 'Thu Six Weekly', 'On Day', '1 week past meeting'),
  ('FND Girls', 1, 2, 3, 'Third Tue', 'Second Tue', '1 week past meeting'),
  ('Foundation', 1, 3, 2, 'Second Wed', 'Fourth Fri', '1 week past meeting'),
  ('Gisborne', 1, 3, 1, 'First Wed', 'Wed Before', '1 week past meeting'),
  ('Happy Bookers', 1, 3, 1, 'First Wed', 'Wed Before', '1 week past meeting'),
  ('Jackson''s Creek Probus', 1, 4, 3, 'Third Thu', 'Thu Before', '1 week past meeting'),
  ('Last Chapter', 1, 4, 1, 'First Thu', 'Mon Before', '1 week past meeting'),
  ('Literary Ladies', 1, 6, 2, 'Second Sat', 'Mon Before', '1 week past meeting'),
  ('Night Readers', 1, 4, 1, 'First Thu', 'Thu Before', '1 week past meeting'),
  ('Open Books', 1, 4, 2, 'Second Thu', 'Second Thu', '1 week past meeting'),
  ('Ordinary book club', 1, 3, 1, 'First Wed', 'Last Wed', '1 week past meeting'),
  ('Page Turners', 1.5, 3, NULL, 'Wed Six Weekly', 'On Day', '1 week past meeting'),
  ('Pascoe Vale readers', 1, 1, 1, 'First Mon', 'Last Fri', '1 week past meeting'),
  ('Plot twisters', 1, 4, 2, 'Second Thu', 'Second thu', '1 week past meeting'),
  ('Redstone Readers', 1, 5, -1, 'Last Fri', 'Mon Before', '1 week past meeting'),
  ('Salesian Spine Breakers', 1, 3, -1, 'Last Wed', 'First Wed', '1 week past meeting'),
  ('Shelf indulgence', 1, 3, 2, 'Second Wed', 'First Wed', '1 week past meeting'),
  ('St Ambrose book club', 1.5, NULL, NULL, 'Six weekly', 'on day', '1 week past meeting'),
  ('Sunbury Morning', 1, 5, -1, 'Last Fri', 'Third Fri', '1 week past meeting'),
  ('Sunbury Novel', 1, 1, 3, 'Third Mon', 'Second Mon', '1 week past meeting'),
  ('Sunsisters', 1, 2, 3, 'Third Tue', 'Second Tue', '1 week past meeting'),
  ('Third Thursday', 1, 4, 3, 'Third Thu', 'Third Thu', '1 week past meeting'),
  ('Thursday Nighters', 1, 4, 1, 'First Thu', 'Thu Before', '1 week past meeting'),
  ('Top Shelf', 1, 4, 4, 'Fourth Thu', 'Fourth Thu', '1 week past meeting'),
  ('Wallan Group', 1, 4, 3, 'Third Thu', 'Third Mon', '1 week past meeting'),
  ('Zany Ladies', 1, 1, 3, 'Third Monday', 'Second Wed', '1 week past meeting');

-- These are best-guess name correspondences, not club IDs. Review the preview.
CREATE TEMP TABLE club_aliases (source text NOT NULL REFERENCES source_rules(source), alias text NOT NULL) ON COMMIT DROP;
INSERT INTO club_aliases VALUES
  ('Beauties & The Beast', 'Beauties and the Beast'),
  ('Books and bites', 'Books & Bites'),
  ('Bookworms', 'BOOKWORMS BOOK CLUB'),
  ('Broadie Mermaids', 'The Broadie Mermaids'),
  ('Clarkefield', 'Clarkefield Book Group'),
  ('Couch St', 'Couch St Connections Book Club'),
  ('Gisborne', 'Gisborne Book Club'),
  ('Happy Bookers', 'Happy Bookers Book Club'),
  ('Jackson''s Creek Probus', 'JCP Book Club'),
  ('Ordinary book club', 'Just an Ordinary Book Club'),
  ('Page Turners', 'Page Turners - Tullamarine Wednesday group'),
  ('Sunbury Morning', 'SUNBURY MORNING BOOK CLUB'),
  ('Sunbury Novel', 'Novel bookclub Sunbury'),
  ('Thursday Nighters', 'First Thursday Night book club'),
  ('Top Shelf', 'Top Shelf Book Group'),
  ('Wallan Group', 'WALLAN BOOK GROUP'),
  ('Zany Ladies', 'Zany Old Ladies Book Group');

CREATE FUNCTION pg_temp.club_key(value text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT regexp_replace(lower(trim(value)), '[^[:alnum:]]', '', 'g')
$$;

CREATE TEMP TABLE candidates ON COMMIT DROP AS
SELECT s.source, c.id, c.name,
  pg_temp.club_key(s.source) = pg_temp.club_key(c.name) AS exact
FROM source_rules s JOIN clubs c
  ON pg_temp.club_key(s.source) = pg_temp.club_key(c.name)
  OR EXISTS (SELECT 1 FROM club_aliases a WHERE a.source = s.source
    AND pg_temp.club_key(a.alias) = pg_temp.club_key(c.name));

CREATE TEMP TABLE candidate_summary ON COMMIT DROP AS
SELECT source, count(*) AS matches, min(id) AS club_id,
  string_agg(name || ' [' || id || ']', '; ' ORDER BY name, id) AS candidate_names,
  bool_or(exact) AS exact
FROM candidates GROUP BY source;

CREATE TEMP TABLE collisions ON COMMIT DROP AS
SELECT club_id FROM candidate_summary WHERE matches = 1
GROUP BY club_id HAVING count(*) > 1;

CREATE TEMP TABLE proposal ON COMMIT DROP AS
SELECT s.source, s.meeting_rule, s.pickup_rule, s.return_rule,
  coalesce(cs.candidate_names, '') AS candidates,
  CASE WHEN cs.matches IS NULL THEN 'unmatched'
    WHEN cs.matches > 1 THEN 'ambiguous'
    WHEN collisions.club_id IS NOT NULL THEN 'multiple source clubs'
    WHEN c.revision = 2147483647 THEN 'revision overflow'
    WHEN cs.exact THEN 'exact'
    ELSE 'alias: review' END AS match_status,
  c.id AS club_id, c.name AS club_name, c.revision,
  c.cadence AS old_cadence, s.cadence AS new_cadence,
  c.meeting_weekday AS old_weekday, coalesce(s.weekday, c.meeting_weekday) AS new_weekday,
  c.meeting_occurrence AS old_occurrence, coalesce(s.occurrence, c.meeting_occurrence) AS new_occurrence,
  CASE WHEN s.weekday IS NULL THEN 'weekday and occurrence retained'
    WHEN s.occurrence IS NULL THEN 'occurrence retained'
    ELSE '' END AS approximation
FROM source_rules s
LEFT JOIN candidate_summary cs ON cs.source = s.source
LEFT JOIN collisions ON collisions.club_id = cs.club_id AND cs.matches = 1
LEFT JOIN clubs c ON c.id = cs.club_id AND cs.matches = 1
ORDER BY s.source;

\echo 'Review source rules, candidate clubs, proposed numeric values and approximations:'
\echo 'Weekdays: 0 Sunday, 1 Monday, 2 Tuesday, 3 Wednesday, 4 Thursday, 5 Friday, 6 Saturday.'
\echo 'Occurrences: 1-4 or -1 for last. Six-week cadence (1.5) is a two-month-on, one-month-off approximation.'
SELECT source, meeting_rule, candidates, match_status, old_cadence, new_cadence,
  old_weekday, new_weekday, old_occurrence, new_occurrence, approximation
FROM proposal ORDER BY source;

\echo 'Pickup and return rules below are reported only; this script does not apply them:'
SELECT source, pickup_rule, return_rule FROM proposal ORDER BY source;
\echo 'All source rules start 2027-01-01. The app cannot store this start date: club rules apply to undated meetings in any cycle.'
\echo 'Existing meeting slots and assignments are not changed. Later confirmed generation can reconcile cadence and remove meetings.'
\echo 'Review aliases carefully. Unmatched, ambiguous, colliding and revision-overflow clubs are skipped.'
SELECT count(*) FILTER (WHERE match_status IN ('exact', 'alias: review')) AS matched,
  count(*) FILTER (WHERE match_status NOT IN ('exact', 'alias: review')) AS skipped,
  count(*) FILTER (WHERE match_status IN ('exact', 'alias: review') AND
    (old_cadence, old_weekday, old_occurrence) IS DISTINCT FROM (new_cadence, new_weekday, new_occurrence)) AS clubs_to_change
FROM proposal;
\echo 'The transaction holds a lock on clubs until you apply or roll back.'
\prompt 'Type APPLY to commit these changes; anything else rolls back: ' confirmation
SELECT :'confirmation' = 'APPLY' AS apply_changes \gset
\if :apply_changes
  UPDATE clubs c SET cadence = p.new_cadence, meeting_weekday = p.new_weekday,
    meeting_occurrence = p.new_occurrence, revision = c.revision + 1
  FROM proposal p WHERE p.club_id = c.id AND p.match_status IN ('exact', 'alias: review')
    AND (c.cadence, c.meeting_weekday, c.meeting_occurrence)
      IS DISTINCT FROM (p.new_cadence, p.new_weekday, p.new_occurrence);
  COMMIT;
  \echo 'Changes committed.'
\else
  ROLLBACK;
  \echo 'Preview rolled back; no changes committed.'
\endif
