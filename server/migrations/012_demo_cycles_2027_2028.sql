-- Tidies the demo cycles to two, one per year:
--   demo-preferences-cycle-2027 "Demo schedule 2027"        <- data of the current demo-preferences-cycle-2028
--                                                              (the aligned preferences and its schedule), dates minus one year
--   demo-preferences-cycle-2028 "Demo open for voting 2028" <- data of the current demo-preferences-cycle-2027
--                                                              (the older edited ballots), dates plus one year, collecting votes
-- Every other cycle (for example the old "Open for voting" development cycle) is deleted. Cycle IDs cannot be
-- updated in place, so both cycles are staged, all cycles are deleted, and the two are reinserted with the
-- swapped IDs. The older dataset's schedule assignments are discarded so that it can collect votes.
-- It does nothing when either cycle is missing or the 2028 cycle is already the open-for-voting one.
DO $migration$
DECLARE
  id_2027 constant text := 'demo-preferences-cycle-2027';
  id_2028 constant text := 'demo-preferences-cycle-2028';
  removed text;
  cycle_count integer;
  summary text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cycles WHERE id = id_2027) OR NOT EXISTS (SELECT 1 FROM cycles WHERE id = id_2028) THEN
    RAISE NOTICE 'Skipping demo cycle tidy-up: % or % does not exist.', id_2027, id_2028;
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM cycles WHERE id = id_2028 AND name = 'Demo open for voting 2028') THEN
    RAISE NOTICE 'Skipping demo cycle tidy-up: already applied.';
    RETURN;
  END IF;

  -- Staged under their new IDs: "old" 2028 becomes 2027 (shift -1 year) and "old" 2027 becomes 2028 (shift +1 year).
  CREATE TEMP TABLE tidy_cycles ON COMMIT DROP AS
  SELECT CASE id WHEN id_2028 THEN id_2027 ELSE id_2028 END AS new_id,
    CASE id WHEN id_2028 THEN 'Demo schedule 2027' ELSE 'Demo open for voting 2028' END AS new_name,
    CASE id WHEN id_2028 THEN interval '-1 year' ELSE interval '1 year' END AS shift,
    CASE id WHEN id_2028 THEN status ELSE 'collecting' END AS new_status,
    id AS old_id, deadline, starts_on, ends_on, revision + 1 AS new_revision
  FROM cycles WHERE id IN (id_2027, id_2028);
  CREATE TEMP TABLE tidy_slots ON COMMIT DROP AS
  SELECT t.new_id, s.id, s.club_id,
    to_char(to_date(s.month || '-01', 'YYYY-MM-DD') + t.shift, 'YYYY-MM') AS month,
    (s.meeting + t.shift)::date AS meeting
  FROM meeting_slots s JOIN tidy_cycles t ON t.old_id = s.cycle_id;
  CREATE TEMP TABLE tidy_ballots ON COMMIT DROP AS
  SELECT t.new_id, b.club_id, b.person_id, b.revision FROM ballots b JOIN tidy_cycles t ON t.old_id = b.cycle_id;
  CREATE TEMP TABLE tidy_marks ON COMMIT DROP AS
  SELECT t.new_id, m.club_id, m.person_id, m.title_id, m.mark, m.rank FROM ballot_marks m JOIN tidy_cycles t ON t.old_id = m.cycle_id;
  CREATE TEMP TABLE tidy_groups ON COMMIT DROP AS
  SELECT t.new_id, g.club_id FROM finalized_groups g JOIN tidy_cycles t ON t.old_id = g.cycle_id;
  CREATE TEMP TABLE tidy_rankings ON COMMIT DROP AS
  SELECT t.new_id, r.club_id, r.title_id, r.rank FROM finalized_rankings r JOIN tidy_cycles t ON t.old_id = r.cycle_id;
  -- Only the schedule moving to 2027 keeps its assignments.
  CREATE TEMP TABLE tidy_assignments ON COMMIT DROP AS
  SELECT a.id, t.new_id, a.slot_id, a.club_id, a.kit_id, (a.ready + t.shift)::date AS ready, (a.meeting + t.shift)::date AS meeting,
    (a.due + t.shift)::date AS due, a.locked
  FROM schedule_assignments a JOIN tidy_cycles t ON t.old_id = a.cycle_id AND t.new_id = id_2027;

  SELECT string_agg(c.id || ' (' || c.name || ', ' || c.status || ', ' || (SELECT count(*) FROM schedule_assignments a WHERE a.cycle_id = c.id) || ' assignments)', '; ' ORDER BY c.id)
  INTO removed FROM cycles c WHERE c.id NOT IN (id_2027, id_2028);
  RAISE NOTICE 'Deleting other cycles: %', coalesce(removed, 'none');

  -- Child rows first, in foreign-key order. Every cycle is removed, so no filter is needed.
  DELETE FROM schedule_assignments;
  DELETE FROM finalized_rankings;
  DELETE FROM finalized_groups;
  DELETE FROM ballot_marks;
  DELETE FROM ballots;
  DELETE FROM meeting_slots;
  DELETE FROM cycles;

  INSERT INTO cycles (id, name, deadline, starts_on, ends_on, status, revision)
  SELECT new_id, new_name, (deadline + shift)::date, (starts_on + shift)::date, (ends_on + shift)::date, new_status, new_revision FROM tidy_cycles;
  INSERT INTO meeting_slots (id, cycle_id, club_id, month, meeting) SELECT id, new_id, club_id, month, meeting FROM tidy_slots;
  INSERT INTO ballots (cycle_id, club_id, person_id, revision) SELECT new_id, club_id, person_id, revision FROM tidy_ballots;
  INSERT INTO ballot_marks (cycle_id, club_id, person_id, title_id, mark, rank) SELECT new_id, club_id, person_id, title_id, mark, rank FROM tidy_marks;
  INSERT INTO finalized_groups (cycle_id, club_id) SELECT new_id, club_id FROM tidy_groups;
  INSERT INTO finalized_rankings (cycle_id, club_id, title_id, rank) SELECT new_id, club_id, title_id, rank FROM tidy_rankings;
  INSERT INTO schedule_assignments (id, cycle_id, slot_id, club_id, kit_id, ready, meeting, due, locked)
  SELECT id, new_id, slot_id, club_id, kit_id, ready, meeting, due, locked FROM tidy_assignments;

  SELECT count(*) INTO cycle_count FROM cycles;
  IF cycle_count <> 2 THEN RAISE EXCEPTION 'Demo cycle tidy-up: expected 2 cycles but found %', cycle_count; END IF;
  SELECT string_agg(c.id || ': ' || c.status || ', ' || (SELECT count(*) FROM ballots b WHERE b.cycle_id = c.id) || ' ballots, '
    || (SELECT count(*) FROM ballot_marks m WHERE m.cycle_id = c.id AND m.mark = 'selected') || ' selections, '
    || (SELECT count(*) FROM meeting_slots s WHERE s.cycle_id = c.id) || ' slots, '
    || (SELECT count(*) FROM schedule_assignments a WHERE a.cycle_id = c.id) || ' assignments', '; ' ORDER BY c.id) INTO summary FROM cycles c;
  RAISE NOTICE 'Remaining cycles: %', summary;
END
$migration$;
