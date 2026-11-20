-- Moves "Demo preferences 2027 (aligned)" to a 2028 cycle so its kit loans do not overlap the original
-- 2027 preferences cycle. The 2028 cycle ("Demo preferences 2028", demo-preferences-cycle-2028) takes the
-- deadline and cycle dates of demo-preferences-cycle-2027 plus one year, the aligned cycle's meeting slots
-- (months and dates plus one year), ballots and ranked selections, and then the aligned cycle is removed.
-- It does nothing when the aligned cycle is missing or the 2028 cycle already exists. It stops, changing
-- nothing, when the aligned cycle already has schedule assignments or the 2027 source cycle is missing.
DO $migration$
DECLARE
  source_cycle constant text := 'demo-preferences-cycle-2027';
  old_cycle constant text := 'demo-preferences-cycle-2027-aligned';
  new_cycle constant text := 'demo-preferences-cycle-2028';
  new_status text;
  ballot_count integer;
  selection_count integer;
  slot_count integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cycles WHERE id = old_cycle) THEN
    RAISE NOTICE 'Skipping demo preferences 2028: % does not exist.', old_cycle;
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM cycles WHERE id = new_cycle) THEN
    RAISE NOTICE 'Skipping demo preferences 2028: % already exists.', new_cycle;
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cycles WHERE id = source_cycle) THEN
    RAISE EXCEPTION 'Demo preferences 2028: % is needed for the 2028 dates but does not exist', source_cycle;
  END IF;
  IF EXISTS (SELECT 1 FROM schedule_assignments WHERE cycle_id = old_cycle) THEN
    RAISE EXCEPTION 'Demo preferences 2028: % has schedule assignments and cannot be moved', old_cycle;
  END IF;

  -- Slots are copied without assignments, so a drafted or published cycle starts collecting again.
  SELECT CASE WHEN status = 'open' THEN 'open' ELSE 'collecting' END INTO new_status FROM cycles WHERE id = old_cycle;
  INSERT INTO cycles (id, name, deadline, starts_on, ends_on, status)
  SELECT new_cycle, 'Demo preferences 2028', (deadline + interval '1 year')::date, (starts_on + interval '1 year')::date,
    (ends_on + interval '1 year')::date, new_status FROM cycles WHERE id = source_cycle;
  INSERT INTO meeting_slots (id, cycle_id, club_id, month, meeting)
  SELECT gen_random_uuid()::text, new_cycle, club_id, to_char(to_date(month || '-01', 'YYYY-MM-DD') + interval '1 year', 'YYYY-MM'),
    (meeting + interval '1 year')::date
  FROM meeting_slots WHERE cycle_id = old_cycle;
  INSERT INTO ballots (cycle_id, club_id, person_id, revision)
  SELECT new_cycle, club_id, person_id, revision FROM ballots WHERE cycle_id = old_cycle;
  INSERT INTO ballot_marks (cycle_id, club_id, person_id, title_id, mark, rank)
  SELECT new_cycle, club_id, person_id, title_id, mark, rank FROM ballot_marks WHERE cycle_id = old_cycle;
  INSERT INTO finalized_groups (cycle_id, club_id) SELECT new_cycle, club_id FROM finalized_groups WHERE cycle_id = old_cycle;
  INSERT INTO finalized_rankings (cycle_id, club_id, title_id, rank)
  SELECT new_cycle, club_id, title_id, rank FROM finalized_rankings WHERE cycle_id = old_cycle;

  DELETE FROM finalized_rankings WHERE cycle_id = old_cycle;
  DELETE FROM finalized_groups WHERE cycle_id = old_cycle;
  DELETE FROM ballot_marks WHERE cycle_id = old_cycle;
  DELETE FROM ballots WHERE cycle_id = old_cycle;
  DELETE FROM meeting_slots WHERE cycle_id = old_cycle;
  DELETE FROM cycles WHERE id = old_cycle;

  SELECT count(*) INTO ballot_count FROM ballots WHERE cycle_id = new_cycle;
  SELECT count(*) INTO selection_count FROM ballot_marks WHERE cycle_id = new_cycle AND mark = 'selected';
  SELECT count(*) INTO slot_count FROM meeting_slots WHERE cycle_id = new_cycle;
  RAISE NOTICE 'Created % with % ballots, % selections and % meeting slots; removed %.', new_cycle, ballot_count, selection_count, slot_count, old_cycle;
END
$migration$;
