-- Hume-only manual corrections to club scheduling rules, applied to clubs as they currently exist.
-- Offsets are days from the meeting date to pickup (-7..7). Each update only touches rows that differ,
-- so re-running this migration is a no-op. Clubs not listed here are left unchanged.

UPDATE clubs SET pickup_offset_days = -2, revision = revision + 1
WHERE library_service_id = 'hume' AND name = 'Aqua Bookclub' AND pickup_offset_days IS DISTINCT FROM -2;

UPDATE clubs SET pickup_offset_days = -1, revision = revision + 1
WHERE library_service_id = 'hume' AND name = 'Attwood Book Lovers' AND pickup_offset_days IS DISTINCT FROM -1;

UPDATE clubs SET pickup_offset_days = -7, revision = revision + 1
WHERE library_service_id = 'hume' AND name = 'BOOK CLUB BUDDIES' AND pickup_offset_days IS DISTINCT FROM -7;

UPDATE clubs SET pickup_offset_days = -7, revision = revision + 1
WHERE library_service_id = 'hume' AND name = 'BROADIE MERMAIDS' AND pickup_offset_days IS DISTINCT FROM -7;

UPDATE clubs SET pickup_offset_days = -7, revision = revision + 1
WHERE library_service_id = 'hume' AND name = 'Beauties and the Beast' AND pickup_offset_days IS DISTINCT FROM -7;

UPDATE clubs SET pickup_offset_days = -5, revision = revision + 1
WHERE library_service_id = 'hume' AND name = 'Books & Bites' AND pickup_offset_days IS DISTINCT FROM -5;

UPDATE clubs SET pickup_offset_days = -6, revision = revision + 1
WHERE library_service_id = 'hume' AND name = 'Books and Beer' AND pickup_offset_days IS DISTINCT FROM -6;

UPDATE clubs SET pickup_offset_days = 1, revision = revision + 1
WHERE library_service_id = 'hume' AND name = 'Chapter Chicks' AND pickup_offset_days IS DISTINCT FROM 1;

UPDATE clubs SET meeting_weekday = 4, revision = revision + 1
WHERE library_service_id = 'hume' AND name = 'FICTION ADDICTION' AND meeting_weekday IS DISTINCT FROM 4;

UPDATE clubs SET pickup_offset_days = -7, revision = revision + 1
WHERE library_service_id = 'hume' AND name = 'First Thursday Night book club' AND pickup_offset_days IS DISTINCT FROM -7;

UPDATE clubs SET pickup_offset_days = -7, revision = revision + 1
WHERE library_service_id = 'hume' AND name = 'Gisborne Book Club' AND pickup_offset_days IS DISTINCT FROM -7;

UPDATE clubs SET pickup_offset_days = -7, revision = revision + 1
WHERE library_service_id = 'hume' AND name = 'Happy Bookers Book Club' AND pickup_offset_days IS DISTINCT FROM -7;

UPDATE clubs SET pickup_offset_days = -7, revision = revision + 1
WHERE library_service_id = 'hume' AND name = 'JACKSON''S CREEK PROBUS' AND pickup_offset_days IS DISTINCT FROM -7;

UPDATE clubs SET pickup_offset_days = -7, revision = revision + 1
WHERE library_service_id = 'hume' AND name = 'Night readers' AND pickup_offset_days IS DISTINCT FROM -7;

UPDATE clubs SET pickup_offset_days = -3, revision = revision + 1
WHERE library_service_id = 'hume' AND name = 'PASCOE VALE READERS' AND pickup_offset_days IS DISTINCT FROM -3;
