CREATE TABLE people (
  id text PRIMARY KEY,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  role text NOT NULL CHECK (role IN ('admin','staff','member')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0)
);
CREATE TABLE membership_versions (
  club_id text PRIMARY KEY REFERENCES clubs(id) ON DELETE CASCADE,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0)
);
CREATE TABLE memberships (
  club_id text NOT NULL REFERENCES clubs(id) ON DELETE RESTRICT,
  person_id text NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
  leader boolean NOT NULL DEFAULT false,
  PRIMARY KEY (club_id,person_id)
);
CREATE UNIQUE INDEX one_leader_per_club ON memberships(club_id) WHERE leader;
CREATE TABLE cycles (
  id text PRIMARY KEY,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  deadline date NOT NULL,
  status text NOT NULL CHECK (status IN ('open','collecting','drafted','published')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0)
);
CREATE TABLE meeting_slots (
  id text PRIMARY KEY,
  cycle_id text NOT NULL REFERENCES cycles(id) ON DELETE RESTRICT,
  club_id text NOT NULL REFERENCES clubs(id) ON DELETE RESTRICT,
  meeting date NOT NULL,
  UNIQUE (cycle_id,club_id,meeting),
  UNIQUE (id,cycle_id,club_id,meeting)
);
CREATE TABLE ballots (
  cycle_id text NOT NULL REFERENCES cycles(id) ON DELETE RESTRICT,
  club_id text NOT NULL,
  person_id text NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  PRIMARY KEY (cycle_id,club_id,person_id),
  FOREIGN KEY (club_id,person_id) REFERENCES memberships(club_id,person_id) ON DELETE RESTRICT
);
CREATE TABLE ballot_marks (
  cycle_id text NOT NULL, club_id text NOT NULL, person_id text NOT NULL,
  title_id text NOT NULL REFERENCES titles(id) ON DELETE RESTRICT,
  mark text NOT NULL CHECK (mark IN ('selected','read','wont')),
  rank integer CHECK (rank > 0),
  PRIMARY KEY (cycle_id,club_id,person_id,title_id),
  UNIQUE (cycle_id,club_id,person_id,rank),
  FOREIGN KEY (cycle_id,club_id,person_id) REFERENCES ballots(cycle_id,club_id,person_id) ON DELETE RESTRICT,
  CHECK ((mark='selected') = (rank IS NOT NULL))
);
CREATE TABLE finalized_groups (
  cycle_id text NOT NULL REFERENCES cycles(id) ON DELETE RESTRICT,
  club_id text NOT NULL REFERENCES clubs(id) ON DELETE RESTRICT,
  PRIMARY KEY (cycle_id,club_id)
);
CREATE TABLE finalized_rankings (
  cycle_id text NOT NULL,
  club_id text NOT NULL,
  title_id text NOT NULL REFERENCES titles(id) ON DELETE RESTRICT,
  rank integer NOT NULL CHECK (rank > 0),
  PRIMARY KEY (cycle_id,club_id,title_id),
  UNIQUE (cycle_id,club_id,rank),
  FOREIGN KEY (cycle_id,club_id) REFERENCES finalized_groups(cycle_id,club_id) ON DELETE RESTRICT
);
CREATE TABLE lending_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  branches text[] NOT NULL,
  loan_days integer NOT NULL CHECK (loan_days > 0),
  buffer_days integer NOT NULL CHECK (buffer_days >= 0),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0)
);
INSERT INTO lending_settings(name,branches,loan_days,buffer_days) VALUES ('Library',ARRAY[]::text[],28,3);
ALTER TABLE kits ADD COLUMN status text NOT NULL DEFAULT 'available'
  CHECK (status IN ('available','reserved','out','inspection','unavailable'));
CREATE TABLE circulation_events (
  id text PRIMARY KEY,
  kit_id text NOT NULL REFERENCES kits(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('reserved','picked up','delivered','returned','inspected','resolved')),
  at timestamptz NOT NULL,
  notes text NOT NULL,
  returned_copies integer CHECK (returned_copies >= 0),
  missing_components text[]
);
CREATE FUNCTION reject_circulation_event_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Circulation events are append-only' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER circulation_events_append_only BEFORE UPDATE OR DELETE ON circulation_events
FOR EACH ROW EXECUTE FUNCTION reject_circulation_event_change();
CREATE TABLE club_history (
  club_id text NOT NULL REFERENCES clubs(id) ON DELETE RESTRICT,
  title_id text NOT NULL REFERENCES titles(id) ON DELETE RESTRICT,
  PRIMARY KEY (club_id,title_id)
);
CREATE TABLE schedule_assignments (
  id text PRIMARY KEY,
  cycle_id text NOT NULL REFERENCES cycles(id) ON DELETE RESTRICT,
  slot_id text NOT NULL UNIQUE,
  club_id text NOT NULL REFERENCES clubs(id) ON DELETE RESTRICT,
  kit_id text NOT NULL REFERENCES kits(id) ON DELETE RESTRICT,
  ready date NOT NULL, meeting date NOT NULL, due date NOT NULL,
  locked boolean NOT NULL,
  CHECK (ready <= meeting AND meeting <= due),
  FOREIGN KEY (slot_id,cycle_id,club_id,meeting) REFERENCES meeting_slots(id,cycle_id,club_id,meeting) ON DELETE RESTRICT
);
