CREATE TABLE titles (
  id text PRIMARY KEY,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  author text NOT NULL CHECK (length(trim(author)) BETWEEN 1 AND 200),
  isbn text NOT NULL DEFAULT '',
  pages integer NOT NULL CHECK (pages >= 0),
  genres text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  large_print boolean NOT NULL DEFAULT false,
  audio boolean NOT NULL DEFAULT false,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0)
);

CREATE TABLE kits (
  id text PRIMARY KEY,
  title_id text NOT NULL REFERENCES titles(id) ON DELETE RESTRICT,
  branch text NOT NULL CHECK (length(trim(branch)) BETWEEN 1 AND 200),
  copies integer NOT NULL CHECK (copies > 0),
  extras text NOT NULL DEFAULT '',
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0)
);

CREATE TABLE kit_identifiers (
  kit_id text NOT NULL REFERENCES kits(id) ON DELETE CASCADE,
  identifier text NOT NULL CHECK (length(trim(identifier)) BETWEEN 1 AND 200),
  kind text NOT NULL CHECK (kind IN ('kit', 'copy'))
);
CREATE UNIQUE INDEX kit_identifier_unique ON kit_identifiers (lower(identifier));
CREATE UNIQUE INDEX kit_primary_identifier_unique ON kit_identifiers (kit_id) WHERE kind = 'kit';

CREATE TABLE clubs (
  id text PRIMARY KEY,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  branch text NOT NULL CHECK (length(trim(branch)) BETWEEN 1 AND 200),
  size integer NOT NULL CHECK (size > 0),
  cadence text NOT NULL DEFAULT '',
  pickup text NOT NULL CHECK (pickup IN ('pickup', 'delivery')),
  address text NOT NULL DEFAULT '',
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  CHECK (pickup <> 'delivery' OR length(trim(address)) > 0)
);

CREATE TABLE club_kits (
  club_id text NOT NULL REFERENCES clubs(id) ON DELETE RESTRICT,
  kit_id text NOT NULL REFERENCES kits(id) ON DELETE RESTRICT,
  PRIMARY KEY (club_id, kit_id)
);
