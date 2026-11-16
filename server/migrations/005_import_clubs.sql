INSERT INTO clubs (id, name, branch, size, cadence, pickup, address)
SELECT v.id, v.name, 'Central', 10, '', 'pickup', ''
FROM (VALUES
  ('club-001', 'Pascoe vale readers'),
  ('club-002', 'Book club buddies'),
  ('club-003', 'Salesian Spine Breakers'),
  ('club-004', 'Attwood Book Lovers'),
  ('club-005', 'Aveo'),
  ('club-006', 'First Thursday Night book club'),
  ('club-007', 'Night readers'),
  ('club-008', 'St Ambrose Book Club'),
  ('club-009', 'Beauties and the Beast'),
  ('club-010', 'Aqua Bookclub'),
  ('club-011', 'FOUNDATION'),
  ('club-012', 'Craigiebites'),
  ('club-013', 'Zany Old Ladies Book Group'),
  ('club-014', 'JCP Book Club'),
  ('club-015', 'Between the lines'),
  ('club-016', 'Just an Ordinary Book Club'),
  ('club-017', 'Novel bookclub Sunbury'),
  ('club-018', 'CHASING TITLES'),
  ('club-019', 'Third Thursday'),
  ('club-020', 'Top Shelf Book Group'),
  ('club-021', 'Chapter Chicks'),
  ('club-022', 'Gisborne Book Club'),
  ('club-023', 'Couch St Connections Book Club'),
  ('club-024', 'Clarkefield Book Group'),
  ('club-025', 'Page Turners - Tullamarine Wednesday group'),
  ('club-026', 'Happy Bookers Book Club'),
  ('club-027', 'FICTION ADDICTION'),
  ('club-028', 'BOOKWORMS BOOK CLUB'),
  ('club-029', 'FND GIRLS'),
  ('club-030', 'The Broadie Mermaids'),
  ('club-031', 'Books & Bites'),
  ('club-032', 'Books and Beer'),
  ('club-033', 'SUN SISTERS')
) AS v(id, name)
WHERE NOT EXISTS (SELECT 1 FROM clubs c WHERE lower(c.name) = lower(v.name))
ON CONFLICT (id) DO NOTHING;
