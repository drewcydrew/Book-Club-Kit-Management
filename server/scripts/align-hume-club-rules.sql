\set ON_ERROR_STOP on
\pset pager off
\encoding UTF8

BEGIN ISOLATION LEVEL SERIALIZABLE;

DO $$
DECLARE target_schema text := current_schema();
BEGIN
  IF target_schema IS NULL OR target_schema IN ('pg_catalog', 'information_schema') THEN
    RAISE EXCEPTION 'No safe application schema is selected.';
  END IF;
  PERFORM set_config('search_path', format('%I, pg_catalog', target_schema), true);
  IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE name = '018_library_services.sql')
     OR NOT EXISTS (SELECT 1 FROM schema_migrations WHERE name = '024_standardise_club_scheduling.sql') THEN
    RAISE EXCEPTION 'Library service and scheduling migrations 018 and 024 are required.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM library_services WHERE id = 'hume') THEN
    RAISE EXCEPTION 'The hume library service does not exist.';
  END IF;
  PERFORM set_config('app.library_service_id', 'hume', true);
END $$;

\echo 'Verify the target database, schema and user before continuing:'
SELECT current_database() AS database, current_schema() AS schema, current_user AS database_user;

-- Prevent club names or rules changing between preview and confirmation.
LOCK TABLE clubs IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE source_rules (
  source text PRIMARY KEY,
  cadence double precision NOT NULL,
  meeting_weekday integer,
  meeting_occurrence integer,
  pickup_weekday integer,
  pickup_occurrence integer,
  meeting_rule text NOT NULL,
  pickup_rule text NOT NULL,
  approximation text NOT NULL
) ON COMMIT DROP;

-- Workbook: book club meeting rules (1).xlsx, Sheet1, rows 2-44 (43 clubs, rule start 2027-01-01).
-- NULL means the workbook gives no value, so the existing club value is kept.
-- Pickup offsets are days from the previous meeting (-7..7). "X Before" and "On Day" rules are converted;
-- occurrence-based pickups (e.g. "Third Mon") cannot be expressed as an offset, so the existing offset is kept for review.
INSERT INTO source_rules VALUES
  ('Aqua Book Club', 1, 3, 3, 1, 3, 'Third Wed', 'Third Mon', ''),
  ('Attwood Book Lovers', 1, 2, 3, 1, 3, 'Third Tue', 'Third Mon', ''),
  ('Aveo', 1, 1, 2, 1, 1, 'Second Mon', 'First Mon', ''),
  ('Beauties & The Beast', 1.5, NULL, NULL, NULL, NULL, 'Every Six Weeks', 'Fri Before', 'relative pickup retained (six-weekly, meeting day unknown); meeting weekday retained; occurrence retained'),
  ('Between The Lines', 1, 4, 3, 4, 3, 'Third Thu', 'Third Thu', ''),
  ('Book Club Buddies', 1, 5, -1, 5, 3, 'Last Fri', 'Fri Before', 'relative pickup approximated'),
  ('Books and Beer', 1, 4, -1, 5, 3, 'Last Thu', 'Fri Before', 'relative pickup approximated'),
  ('Books and bites', 1, 6, 1, 1, -1, 'First Sat', 'Mon Before', 'relative pickup approximated'),
  ('Books before Bedtime', 1, 4, 4, 4, 4, 'Fourth Thu', 'Fourth Thu', ''),
  ('Bookworms', 1, 3, 3, 3, 1, 'Third Wed', 'First Wed', ''),
  ('Broadie Mermaids', 1.5, NULL, NULL, NULL, NULL, 'Every Six Weeks', 'Mon Before', 'relative pickup retained (six-weekly, meeting day unknown); meeting weekday retained; occurrence retained'),
  ('Butterflies', 1, 4, 1, 4, 1, 'First Thu', 'First Thu', ''),
  ('Chapter Chicks', 1, 0, 2, 1, 1, 'Second Sun', 'First Mon', ''),
  ('Chasing Titles', 1, 4, 2, 4, 2, 'Second Thu', 'Second Thu', ''),
  ('Clarkefield', 1, 2, 2, 2, 1, 'Second Tue', 'First Tue', ''),
  ('Couch St', 1, 5, 2, 4, 1, 'Second Fri', 'First Thu', ''),
  ('Craigiebites', 1, 4, 1, 4, -1, 'First Thu', 'Thu Before', 'relative pickup approximated'),
  ('Fiction Addiction', 1.5, 4, NULL, NULL, NULL, 'Thu Six Weekly', 'On Day', 'on-day pickup retained; occurrence retained'),
  ('FND Girls', 1, 2, 3, 2, 2, 'Third Tue', 'Second Tue', ''),
  ('Foundation', 1, 3, 2, 5, 4, 'Second Wed', 'Fourth Fri', ''),
  ('Gisborne', 1, 3, 1, 3, -1, 'First Wed', 'Wed Before', 'relative pickup approximated'),
  ('Happy Bookers', 1, 3, 1, 3, -1, 'First Wed', 'Wed Before', 'relative pickup approximated'),
  ('Jackson''s Creek Probus', 1, 4, 3, 4, 2, 'Third Thu', 'Thu Before', 'relative pickup approximated'),
  ('Last Chapter', 1, 4, 1, 1, 1, 'First Thu', 'Mon Before', 'relative pickup approximated'),
  ('Literary Ladies', 1, 6, 2, 1, 1, 'Second Sat', 'Mon Before', 'relative pickup approximated'),
  ('Night Readers', 1, 4, 1, 4, -1, 'First Thu', 'Thu Before', 'relative pickup approximated'),
  ('Open Books', 1, 4, 2, 4, 2, 'Second Thu', 'Second Thu', ''),
  ('Ordinary book club', 1, 3, 1, 3, -1, 'First Wed', 'Last Wed', ''),
  ('Page Turners', 1.5, 3, NULL, NULL, NULL, 'Wed Six Weekly', 'On Day', 'on-day pickup retained; occurrence retained'),
  ('Pascoe Vale readers', 1, 1, 1, 5, -1, 'First Mon', 'Last Fri', ''),
  ('Plot twisters', 1, 4, 2, 4, 2, 'Second Thu', 'Second thu', ''),
  ('Redstone Readers', 1, 5, -1, 1, 4, 'Last Fri', 'Mon Before', 'relative pickup approximated'),
  ('Salesian Spine Breakers', 1, 3, -1, 3, 1, 'Last Wed', 'First Wed', ''),
  ('Shelf indulgence', 1, 3, 2, 3, 1, 'Second Wed', 'First Wed', ''),
  ('St Ambrose book club', 1.5, NULL, NULL, NULL, NULL, 'Six weekly', 'on day', 'on-day pickup retained; meeting weekday retained; occurrence retained'),
  ('Sunbury Morning', 1, 5, -1, 5, 3, 'Last Fri', 'Third Fri', ''),
  ('Sunbury Novel', 1, 1, 3, 1, 2, 'Third Mon', 'Second Mon', ''),
  ('Sunsisters', 1, 2, 3, 2, 2, 'Third Tue', 'Second Tue', ''),
  ('Third Thursday', 1, 4, 3, 4, 3, 'Third Thu', 'Third Thu', ''),
  ('Thursday Nighters', 1, 4, 1, 4, -1, 'First Thu', 'Thu Before', 'relative pickup approximated'),
  ('Top Shelf', 1, 4, 4, 4, 4, 'Fourth Thu', 'Fourth Thu', ''),
  ('Wallan Group', 1, 4, 3, 1, 3, 'Third Thu', 'Third Mon', ''),
  ('Zany Ladies', 1, 1, 3, 3, 2, 'Third Monday', 'Second Wed', '');

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

-- Matching is limited to Hume clubs explicitly, not only by row-level security.
CREATE TEMP TABLE candidates ON COMMIT DROP AS
SELECT s.source, c.id, c.name,
  pg_temp.club_key(s.source) = pg_temp.club_key(c.name) AS exact
FROM source_rules s JOIN clubs c
  ON c.library_service_id = 'hume' AND (pg_temp.club_key(s.source) = pg_temp.club_key(c.name)
  OR EXISTS (SELECT 1 FROM club_aliases a WHERE a.source = s.source
    AND pg_temp.club_key(a.alias) = pg_temp.club_key(c.name)));

CREATE TEMP TABLE candidate_summary ON COMMIT DROP AS
SELECT source, count(*) AS matches, min(id) AS club_id,
  string_agg(name || ' [' || id || ']', '; ' ORDER BY name, id) AS candidate_names,
  bool_or(exact) AS exact
FROM candidates GROUP BY source;

CREATE TEMP TABLE collisions ON COMMIT DROP AS
SELECT club_id FROM candidate_summary WHERE matches = 1
GROUP BY club_id HAVING count(*) > 1;

CREATE TEMP TABLE proposal ON COMMIT DROP AS
SELECT s.source, s.meeting_rule, s.pickup_rule, s.approximation,
  coalesce(cs.candidate_names, '') AS candidates,
  CASE WHEN cs.matches IS NULL THEN 'unmatched'
    WHEN cs.matches > 1 THEN 'ambiguous'
    WHEN collisions.club_id IS NOT NULL THEN 'multiple source clubs'
    WHEN c.revision = 2147483647 THEN 'revision overflow'
    WHEN cs.exact THEN 'exact'
    ELSE 'alias: review' END AS match_status,
  c.id AS club_id, c.name AS club_name, c.revision,
  c.cadence AS old_cadence, CASE WHEN s.cadence = 1.5 THEN 2 ELSE s.cadence END AS new_cadence,
  c.meeting_weekday AS old_meeting_weekday, coalesce(s.meeting_weekday, c.meeting_weekday) AS new_meeting_weekday,
  c.meeting_occurrence AS old_meeting_occurrence, coalesce(s.meeting_occurrence, c.meeting_occurrence) AS new_meeting_occurrence,
  c.pickup_offset_days AS old_pickup_offset_days,
  CASE WHEN lower(s.pickup_rule) LIKE '%on day%' THEN 0
    WHEN lower(s.pickup_rule) LIKE '% before' AND s.pickup_weekday IS NOT NULL AND coalesce(s.meeting_weekday, c.meeting_weekday) IS NOT NULL
      THEN ((s.pickup_weekday + 6) % 7) - ((coalesce(s.meeting_weekday, c.meeting_weekday) + 6) % 7)
    ELSE c.pickup_offset_days END AS new_pickup_offset_days,
  CASE WHEN lower(s.pickup_rule) LIKE '%on day%' THEN 'on day'
    WHEN lower(s.pickup_rule) LIKE '% before' AND s.pickup_weekday IS NOT NULL AND coalesce(s.meeting_weekday, c.meeting_weekday) IS NOT NULL THEN 'weekday offset (approximation)'
    ELSE 'not convertible: existing offset kept' END AS pickup_note
FROM source_rules s
LEFT JOIN candidate_summary cs ON cs.source = s.source
LEFT JOIN collisions ON collisions.club_id = cs.club_id AND cs.matches = 1
LEFT JOIN clubs c ON c.id = cs.club_id AND cs.matches = 1 AND c.library_service_id = 'hume'
ORDER BY s.source;

CREATE TEMP TABLE targets ON COMMIT DROP AS
SELECT p.*,
  (p.old_cadence, p.old_meeting_weekday, p.old_meeting_occurrence, p.old_pickup_offset_days)
    IS DISTINCT FROM
  (p.new_cadence, p.new_meeting_weekday, p.new_meeting_occurrence, p.new_pickup_offset_days) AS changed
FROM proposal p
WHERE p.match_status IN ('exact', 'alias: review');

\echo 'Review source rules, candidate clubs and proposed values. Weekdays: 0 Sunday, 1 Monday ... 6 Saturday.'
\echo 'Occurrences: 1-4 or -1 for last. Six-weekly source cadence 1.5 is migrated to cadence 2 (every six weeks).'
SELECT source, meeting_rule, candidates, match_status, old_cadence, new_cadence,
  old_meeting_weekday, new_meeting_weekday, old_meeting_occurrence, new_meeting_occurrence
FROM proposal ORDER BY source;

\echo 'Pickup offsets are days from the previous meeting (-7..7). Return is seven days after the meeting.'
SELECT source, pickup_rule, old_pickup_offset_days, new_pickup_offset_days, pickup_note, approximation
FROM proposal ORDER BY source;

\echo 'Existing meeting slots and schedule assignments are not changed. Future assignments for changed clubs are reported below.'
SELECT
  (SELECT count(*) FROM targets) AS matched,
  (SELECT count(*) FROM proposal WHERE match_status NOT IN ('exact', 'alias: review')) AS skipped,
  (SELECT count(*) FROM targets WHERE changed) AS clubs_to_change;

SELECT count(*) AS future_assignments_for_changed_clubs
FROM schedule_assignments sa
JOIN targets t ON t.club_id = sa.club_id AND t.changed
WHERE sa.library_service_id = 'hume' AND sa.meeting >= current_date;

\echo 'The transaction holds a lock on clubs until you apply or roll back.'
\prompt 'Type APPLY to commit these changes; anything else rolls back: ' confirmation
SELECT :'confirmation' = 'APPLY' AS apply_changes \gset
\if :apply_changes
  UPDATE clubs c SET cadence = t.new_cadence, meeting_weekday = t.new_meeting_weekday,
    meeting_occurrence = t.new_meeting_occurrence, pickup_offset_days = t.new_pickup_offset_days,
    revision = c.revision + 1
  FROM targets t WHERE t.club_id = c.id AND t.changed AND c.library_service_id = 'hume';
  COMMIT;
  \echo 'Changes committed.'
\else
  ROLLBACK;
  \echo 'Preview rolled back; no changes committed.'
\endif
