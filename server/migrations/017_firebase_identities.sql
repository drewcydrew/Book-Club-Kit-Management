CREATE TABLE firebase_identities (
  uid text PRIMARY KEY,
  person_id text NOT NULL UNIQUE REFERENCES people(id) ON DELETE RESTRICT
);
