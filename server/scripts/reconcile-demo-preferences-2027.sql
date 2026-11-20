\set ON_ERROR_STOP on
\pset pager off
\encoding UTF8

BEGIN ISOLATION LEVEL SERIALIZABLE;

\echo 'Verify the target database, schema, and user before continuing:'
SELECT current_database() AS database, current_schema() AS schema, current_user AS database_user;

CREATE TEMP TABLE source_rows (
  row_number bigint GENERATED ALWAYS AS IDENTITY,
  club text,
  title text,
  required_rank text
) ON COMMIT DROP;
INSERT INTO source_rows (club, title, required_rank) VALUES
  (E'Club', E'Title', E'Required rank'),
  (E'Aqua Bookclub', E'The Miller women by Kelli Hawkins', E'2'),
  (E'Aqua Bookclub', E'Fourteen days : a literary project of the Authors Guild of America by Various authors (edited by Margaret Atwood and Douglas Preston)', E'3'),
  (E'Aqua Bookclub', E'I''ll leave you with this by Kylie Ladd', E'4'),
  (E'Aqua Bookclub', E'Whistler by Ann Patchett', E'5'),
  (E'Aqua Bookclub', E'Just ignore him by Alan Davies', E'6'),
  (E'Aqua Bookclub', E'The inheritance by Kate Horan', E'7'),
  (E'Aqua Bookclub', E'Homecoming by Kate Morton', E'8'),
  (E'Aqua Bookclub', E'It should have been you by Andrea Mara', E'9'),
  (E'Aqua Bookclub', E'Everyone on this train is a suspect by Benjamin Stevenson', E'10'),
  (E'Aqua Bookclub', E'The remarkable truths of alfie bains by Sarah Clutton', E'11'),
  (E'Aqua Bookclub', E'My friends by Fredrik Backman', E'12'),
  (E'Aqua Bookclub', E'Housemates by Teun Toebes', E'13'),
  (E'Aqua Bookclub', E'The midnight estate by Kelly Rimmer', E'14'),
  (E'Aqua Bookclub', E'Sam Bloom : heartache & birdsong by Samantha Bloom; Cameron Bloom; Bradley Trevor Greive', E'15'),
  (E'Aqua Bookclub', E'A family of strangers by Fiona Lowe', E'16'),
  (E'Aqua Bookclub', E'Butter by Asako Yuzuki', E'17'),
  (E'Aqua Bookclub', E'Disgraceful by Rachel Fox McLeod', E'18'),
  (E'Aqua Bookclub', E'Horse by Geraldine Brooks', E'19'),
  (E'Aqua Bookclub', E'The calamity club by Kathryn Stockett', E'20'),
  (E'Attwood Book Lovers', E'Baggage : tales from a fully packed life by Alan Cumming', E'13'),
  (E'Attwood Book Lovers', E'Ten steps to Nanette a memoir situation by Hannah Gadsby', E'14'),
  (E'Attwood Book Lovers', E'Housemates by Teun Toebes', E'15'),
  (E'Attwood Book Lovers', E'The ledge by Christian White', E'16'),
  (E'Attwood Book Lovers', E'The Midnight Library by Matt Haig', E'17'),
  (E'Attwood Book Lovers', E'Dear Debbie by Freida McFadden', E'18'),
  (E'Attwood Book Lovers', E'Hear me roar by Erna Walraven', E'19'),
  (E'Attwood Book Lovers', E'An afterlife for Rosemary Lamb by Louise Wolhuter', E'20'),
  (E'Aveo', E'Inheritance by Kath O''Connor', E'15'),
  (E'Aveo', E'The inheritance by Kate Horan', E'16'),
  (E'Aveo', E'Guilty by definition by Susie Dent', E'17'),
  (E'Aveo', E'Gone by Glenna Thomson', E'18'),
  (E'Aveo', E'The no-show by Beth O’Leary', E'19'),
  (E'Aveo', E'Here one moment by Liane Moriarty', E'20'),
  (E'Between the lines', E'The inheritance by Kate Horan', E'5'),
  (E'Between the lines', E'Anna O by Matthew Blake', E'6'),
  (E'Between the lines', E'Atmosphere by Taylor Jenkins Reid', E'7'),
  (E'Between the lines', E'Dear Debbie by Freida McFadden', E'8'),
  (E'Between the lines', E'Did I ever tell you this? a memoir by Sam Neill', E'9'),
  (E'Between the lines', E'The Paris library by Janet Skeslien Charles', E'10'),
  (E'Between the lines', E'Yesteryear a novel by Caro Claire Burke', E'11'),
  (E'Between the lines', E'Whistler by Ann Patchett', E'12'),
  (E'Between the lines', E'Go as a river by Shelley Read', E'13'),
  (E'Between the lines', E'The calamity club by Kathryn Stockett', E'14'),
  (E'Between the lines', E'Here one moment by Liane Moriarty', E'15'),
  (E'Between the lines', E'The secret life of sunflowers by Marta Molnar', E'16'),
  (E'Between the lines', E'None of this is true by Lisa Jewell', E'17'),
  (E'Between the lines', E'Gone by Glenna Thomson', E'18'),
  (E'Between the lines', E'Always home, always homesick by Hannah Kent', E'19'),
  (E'Between the lines', E'Fourteen days : a literary project of the Authors Guild of America by Various authors (edited by Margaret Atwood and Douglas Preston)', E'20'),
  (E'Book club buddies', E'The inheritance by Kate Horan', E'15'),
  (E'Book club buddies', E'Small great things by Jodi Picoult', E'16'),
  (E'Book club buddies', E'The secrets of the Huon Wren by Claire van Ryn', E'17'),
  (E'Book club buddies', E'When lemons give you life by Anna Johnston', E'18'),
  (E'Book club buddies', E'The woman in the library : a mystery by Sulari Gentill', E'19'),
  (E'Book club buddies', E'The survivors by Jane Harper', E'20'),
  (E'Books & Bites', E'The inheritance by Kate Horan', E'12'),
  (E'Books & Bites', E'It should have been you by Andrea Mara', E'13'),
  (E'Books & Bites', E'The Kamogawa food detectives by Hisashi Kashiwai', E'14'),
  (E'Books & Bites', E'Last one out by Jane Harper', E'15'),
  (E'Books & Bites', E'The last thing he told me a novel by Laura Dave', E'16'),
  (E'Books & Bites', E'The last reunion by Kayte Nunn', E'17'),
  (E'Books & Bites', E'Lenny Marks gets away with murder by Kerryn Mayne', E'18'),
  (E'Books & Bites', E'The midnight estate by Kelly Rimmer', E'19'),
  (E'Books & Bites', E'Molly by Rosalie Ham', E'20'),
  (E'BOOKWORMS BOOK CLUB', E'Whistler by Ann Patchett', E'6'),
  (E'BOOKWORMS BOOK CLUB', E'Softly calls the devil by Chris Blake', E'7'),
  (E'BOOKWORMS BOOK CLUB', E'The last poem by Courtney Peppernell', E'8'),
  (E'BOOKWORMS BOOK CLUB', E'The ledge by Christian White', E'9'),
  (E'BOOKWORMS BOOK CLUB', E'The unforgettable mailman by April Howells', E'10'),
  (E'BOOKWORMS BOOK CLUB', E'Beautiful ugly by Alice Feeney', E'11'),
  (E'BOOKWORMS BOOK CLUB', E'Housemates by Teun Toebes', E'12'),
  (E'BOOKWORMS BOOK CLUB', E'Four dogs missing by Rhys Gard', E'13'),
  (E'BOOKWORMS BOOK CLUB', E'The first time i saw him by Laura Dave', E'14'),
  (E'BOOKWORMS BOOK CLUB', E'Where the crawdads sing by Delia Owens', E'15'),
  (E'BOOKWORMS BOOK CLUB', E'The happiest man on Earth by Eddie Jaku', E'16'),
  (E'BOOKWORMS BOOK CLUB', E'This tender land : a novel by William Kent Krueger', E'17'),
  (E'BOOKWORMS BOOK CLUB', E'Open water by Caleb Azumah Nelson', E'18'),
  (E'BOOKWORMS BOOK CLUB', E'The labyrinth a pastoral by Amanda Lohrey', E'19'),
  (E'BOOKWORMS BOOK CLUB', E'Always home, always homesick by Hannah Kent', E'20'),
  (E'Butterflies', E'Beautiful ugly by Alice Feeney', E'3'),
  (E'Butterflies', E'Butter by Asako Yuzuki', E'4'),
  (E'Butterflies', E'Inheritance by Kath O''Connor', E'14'),
  (E'Butterflies', E'The Irish goodbye by Heather Aimee O’Neill', E'15'),
  (E'Butterflies', E'Julie Chan is dead or that''s what she needs you to think by Liann Zhang', E'16'),
  (E'Butterflies', E'Last one out by Jane Harper', E'17'),
  (E'Butterflies', E'The last thing he told me a novel by Laura Dave', E'18'),
  (E'Butterflies', E'Lola in the mirror by Trent Dalton', E'19'),
  (E'Butterflies', E'When lemons give you life by Anna Johnston', E'20'),
  (E'Clarkefield Book Group', E'The inheritance by Kate Horan', E'7'),
  (E'Clarkefield Book Group', E'Lenny Marks gets away with murder by Kerryn Mayne', E'8'),
  (E'Clarkefield Book Group', E'The ledge by Christian White', E'9'),
  (E'Clarkefield Book Group', E'Lola in the mirror by Trent Dalton', E'10'),
  (E'Clarkefield Book Group', E'The midnight estate by Kelly Rimmer', E'11'),
  (E'Clarkefield Book Group', E'The names by Florence Knapp', E'12'),
  (E'Clarkefield Book Group', E'Nesting by Roisín O’Donnell', E'13'),
  (E'Clarkefield Book Group', E'The swimmers by Julie Otsuka', E'14'),
  (E'Clarkefield Book Group', E'The unearthed by Lenny Bartulin', E'15'),
  (E'Clarkefield Book Group', E'When lemons give you life by Anna Johnston', E'16'),
  (E'Clarkefield Book Group', E'All our shimmering skies by Trent Dalton', E'17'),
  (E'Clarkefield Book Group', E'Always home, always homesick by Hannah Kent', E'18'),
  (E'Clarkefield Book Group', E'An ill wind by Margaret Hickey', E'19'),
  (E'Clarkefield Book Group', E'Anna O by Matthew Blake', E'20'),
  (E'FICTION ADDICTION', E'The inheritance by Kate Horan', E'9'),
  (E'FICTION ADDICTION', E'Housemates by Teun Toebes', E'10'),
  (E'FICTION ADDICTION', E'We all live here by Jojo Moyes', E'11'),
  (E'FICTION ADDICTION', E'Four dogs missing by Rhys Gard', E'12'),
  (E'FICTION ADDICTION', E'Twisted river by James Dunbar', E'13'),
  (E'FICTION ADDICTION', E'Everyone on this train is a suspect by Benjamin Stevenson', E'14'),
  (E'FICTION ADDICTION', E'Prisoner of the state unlawfully arrested, illegally detained, a punishment to last a lifetime by Lily Arthur', E'15'),
  (E'FICTION ADDICTION', E'Always home, always homesick by Hannah Kent', E'16'),
  (E'FICTION ADDICTION', E'Baggage : tales from a fully packed life by Alan Cumming', E'17'),
  (E'FICTION ADDICTION', E'Be useful seven tools for life by Arnold Schwarzenegger', E'18'),
  (E'FICTION ADDICTION', E'Getting away with murder a memoir by Lynda La Plante', E'19'),
  (E'FICTION ADDICTION', E'Lessons in chemistry by Bonnie Garmus', E'20'),
  (E'First Thursday Night book club', E'The Irish goodbye by Heather Aimee O’Neill', E'11'),
  (E'First Thursday Night book club', E'The Midnight Library by Matt Haig', E'12'),
  (E'First Thursday Night book club', E'The things we never say by Elizabeth Strout', E'13'),
  (E'First Thursday Night book club', E'The Paris library by Janet Skeslien Charles', E'14'),
  (E'First Thursday Night book club', E'Guilty by definition by Susie Dent', E'15'),
  (E'First Thursday Night book club', E'It should have been you by Andrea Mara', E'16'),
  (E'First Thursday Night book club', E'Four dogs missing by Rhys Gard', E'17'),
  (E'First Thursday Night book club', E'Gone by Glenna Thomson', E'18'),
  (E'First Thursday Night book club', E'How to knit a human a memoir by Anna Jacobson', E'19'),
  (E'First Thursday Night book club', E'How to be remembered by Michael Thompson', E'20'),
  (E'FOUNDATION', E'Softly calls the devil by Chris Blake', E'18'),
  (E'FOUNDATION', E'Here one moment by Liane Moriarty', E'19'),
  (E'FOUNDATION', E'The keeper of stories by Sally Page', E'20'),
  (E'Page Turners - Tullamarine Wednesday group', E'Women talking by Miriam Toews', E'17'),
  (E'Page Turners - Tullamarine Wednesday group', E'Dear Debbie by Freida McFadden', E'18'),
  (E'Page Turners - Tullamarine Wednesday group', E'The first time i saw him by Laura Dave', E'19'),
  (E'Page Turners - Tullamarine Wednesday group', E'Gravity let me go by Trent Dalton', E'20'),
  (E'REDSTONE READERS', E'An ill wind by Margaret Hickey', E'1'),
  (E'REDSTONE READERS', E'Lessons in chemistry by Bonnie Garmus', E'2'),
  (E'REDSTONE READERS', E'Daisy Jones & The Six by Taylor Jenkins Reid', E'3'),
  (E'REDSTONE READERS', E'Here one moment by Liane Moriarty', E'4'),
  (E'REDSTONE READERS', E'The Midnight Library by Matt Haig', E'5'),
  (E'REDSTONE READERS', E'The happiest man on Earth by Eddie Jaku', E'6'),
  (E'REDSTONE READERS', E'The invisible life of Addie LaRue by V. E. Schwab', E'7'),
  (E'REDSTONE READERS', E'Sorrow and bliss by Meg Mason', E'8'),
  (E'REDSTONE READERS', E'None of this is true by Lisa Jewell', E'9'),
  (E'REDSTONE READERS', E'Lenny Marks gets away with murder by Kerryn Mayne', E'10'),
  (E'REDSTONE READERS', E'The bookbinder of Jericho by Pip Williams', E'11'),
  (E'REDSTONE READERS', E'Horse by Geraldine Brooks', E'12'),
  (E'REDSTONE READERS', E'Homecoming by Kate Morton', E'13'),
  (E'REDSTONE READERS', E'Go as a river by Shelley Read', E'14'),
  (E'REDSTONE READERS', E'The Kamogawa food detectives by Hisashi Kashiwai', E'15'),
  (E'REDSTONE READERS', E'Butter by Asako Yuzuki', E'16'),
  (E'REDSTONE READERS', E'Sisters under the rising sun by Heather Morris', E'17'),
  (E'REDSTONE READERS', E'The calamity club by Kathryn Stockett', E'18'),
  (E'REDSTONE READERS', E'Getting away with murder a memoir by Lynda La Plante', E'19'),
  (E'REDSTONE READERS', E'Iluka by Cassie Stroud', E'20'),
  (E'Salesian Spine Breakers', E'How to be remembered by Michael Thompson', E'14'),
  (E'Salesian Spine Breakers', E'Until the red leaves fall by Alli Parker', E'15'),
  (E'Salesian Spine Breakers', E'The flight by Julie Clark', E'16'),
  (E'Salesian Spine Breakers', E'Dear Debbie by Freida McFadden', E'17'),
  (E'Salesian Spine Breakers', E'Jane and Dan at the end of the world by Colleen Oakley', E'18'),
  (E'Salesian Spine Breakers', E'The last poem by Courtney Peppernell', E'19'),
  (E'Salesian Spine Breakers', E'The no-show by Beth O’Leary', E'20'),
  (E'SHELF INDULGENCE', E'All the words we know by Bruce Nash', E'1'),
  (E'SHELF INDULGENCE', E'Always home, always homesick by Hannah Kent', E'2'),
  (E'SHELF INDULGENCE', E'Atmosphere by Taylor Jenkins Reid', E'3'),
  (E'SHELF INDULGENCE', E'Beautiful ugly by Alice Feeney', E'4'),
  (E'SHELF INDULGENCE', E'The flight by Julie Clark', E'5'),
  (E'SHELF INDULGENCE', E'Gravity let me go by Trent Dalton', E'6'),
  (E'SHELF INDULGENCE', E'Girl falling by Hayley Scrivenor', E'7'),
  (E'SHELF INDULGENCE', E'Kin by Tayari Jones', E'14'),
  (E'SHELF INDULGENCE', E'The last daughter by Brenda Matthews', E'15'),
  (E'SHELF INDULGENCE', E'Lessons in chemistry by Bonnie Garmus', E'16'),
  (E'SHELF INDULGENCE', E'Lola in the mirror by Trent Dalton', E'17'),
  (E'SHELF INDULGENCE', E'The midnight estate by Kelly Rimmer', E'18'),
  (E'SUNBURY MORNING BOOK CLUB', E'The inheritance by Kate Horan', E'12'),
  (E'SUNBURY MORNING BOOK CLUB', E'Inheritance by Kath O''Connor', E'13'),
  (E'SUNBURY MORNING BOOK CLUB', E'The Irish goodbye by Heather Aimee O’Neill', E'14'),
  (E'SUNBURY MORNING BOOK CLUB', E'The Jane Austen remedy it is a truth universally acknowledged that a book can change a life by Ruth Wilson', E'15'),
  (E'SUNBURY MORNING BOOK CLUB', E'Julie Chan is dead or that''s what she needs you to think by Liann Zhang', E'16'),
  (E'SUNBURY MORNING BOOK CLUB', E'The ledge by Christian White', E'17'),
  (E'SUNBURY MORNING BOOK CLUB', E'Getting away with murder a memoir by Lynda La Plante', E'18'),
  (E'SUNBURY MORNING BOOK CLUB', E'Gone by Glenna Thomson', E'19'),
  (E'SUNBURY MORNING BOOK CLUB', E'The flight by Julie Clark', E'20'),
  (E'The Broadie Mermaids', E'The inheritance by Kate Horan', E'9'),
  (E'The Broadie Mermaids', E'Julie Chan is dead or that''s what she needs you to think by Liann Zhang', E'10'),
  (E'The Broadie Mermaids', E'Last one out by Jane Harper', E'11'),
  (E'The Broadie Mermaids', E'The last poem by Courtney Peppernell', E'12'),
  (E'The Broadie Mermaids', E'The Miller women by Kelli Hawkins', E'13'),
  (E'The Broadie Mermaids', E'None of this is true by Lisa Jewell', E'14'),
  (E'The Broadie Mermaids', E'The no-show by Beth O’Leary', E'15'),
  (E'The Broadie Mermaids', E'Remember me by Charity Norman', E'16'),
  (E'The Broadie Mermaids', E'The running club by Ali Lowe', E'17'),
  (E'The Broadie Mermaids', E'Twisted river by James Dunbar', E'18'),
  (E'The Broadie Mermaids', E'Wish you were here by Jodi Picoult', E'19'),
  (E'The Broadie Mermaids', E'The unforgettable mailman by April Howells', E'20'),
  (E'WALLAN BOOK GROUP', E'Inheritance by Kath O''Connor', E'7'),
  (E'WALLAN BOOK GROUP', E'The Inheritance by Kate Horan', E'8'),
  (E'WALLAN BOOK GROUP', E'Inside out : an incredible friendship and fight for justice by Kathleen Folbigg; Tracy Chapman', E'9'),
  (E'WALLAN BOOK GROUP', E'Julie Chan is dead or that''s what she needs you to think by Liann Zhang', E'10'),
  (E'WALLAN BOOK GROUP', E'Just ignore him by Alan Davies', E'11'),
  (E'WALLAN BOOK GROUP', E'The keeper of stories by Sally Page', E'12'),
  (E'WALLAN BOOK GROUP', E'The Miller women by Kelli Hawkins', E'13'),
  (E'WALLAN BOOK GROUP', E'My next breath by Jeremy Renner', E'14'),
  (E'WALLAN BOOK GROUP', E'The names by Florence Knapp', E'15'),
  (E'WALLAN BOOK GROUP', E'Nesting by Roisín O’Donnell', E'16'),
  (E'WALLAN BOOK GROUP', E'The tenant by Freida McFadden', E'17'),
  (E'WALLAN BOOK GROUP', E'Twisted river by James Dunbar', E'18'),
  (E'WALLAN BOOK GROUP', E'Soft serve : a novel by George Kemp', E'19'),
  (E'WALLAN BOOK GROUP', E'Yesteryear a novel by Caro Claire Burke', E'20'),
  (E'Zany Old Ladies Book Group', E'The inheritance by Kate Horan', E'3'),
  (E'Zany Old Ladies Book Group', E'Always home, always homesick by Hannah Kent', E'4'),
  (E'Zany Old Ladies Book Group', E'The bookbinder of Jericho by Pip Williams', E'5'),
  (E'Zany Old Ladies Book Group', E'The god of no good by Sita Walker', E'6'),
  (E'Zany Old Ladies Book Group', E'Here one moment by Liane Moriarty', E'7'),
  (E'Zany Old Ladies Book Group', E'Lessons in chemistry by Bonnie Garmus', E'8'),
  (E'Zany Old Ladies Book Group', E'Honey, baby, mine a mother and daughter talk life, death, love (and banana pudding) by Laura Dern; Diane Ladd', E'9'),
  (E'Zany Old Ladies Book Group', E'Disgraceful by Rachel Fox McLeod', E'10'),
  (E'Zany Old Ladies Book Group', E'Twisted river by James Dunbar', E'11'),
  (E'Zany Old Ladies Book Group', E'Baggage : tales from a fully packed life by Alan Cumming', E'12'),
  (E'Zany Old Ladies Book Group', E'The keeper of stories by Sally Page', E'13'),
  (E'Zany Old Ladies Book Group', E'Beautiful ugly by Alice Feeney', E'14'),
  (E'Zany Old Ladies Book Group', E'The seven skins of Esther Wilding by Holly Ringland', E'15'),
  (E'Zany Old Ladies Book Group', E'Dear Debbie by Freida McFadden', E'16'),
  (E'Zany Old Ladies Book Group', E'The happiest man on Earth by Eddie Jaku', E'17'),
  (E'Zany Old Ladies Book Group', E'The running club by Ali Lowe', E'18'),
  (E'Zany Old Ladies Book Group', E'Salonika burning by Gail Jones', E'19'),
  (E'Zany Old Ladies Book Group', E'The book of two ways by Jodi Picoult', E'20');
-- End embedded rankings.


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM source_rows WHERE row_number = 1
      AND replace(club, chr(65279), '') = 'Club'
      AND title = 'Title' AND required_rank = 'Required rank'
  ) THEN
    RAISE EXCEPTION 'Expected CSV header: Club,Title,Required rank';
  END IF;
END $$;
DELETE FROM source_rows WHERE row_number = 1;

CREATE FUNCTION pg_temp.normal(value text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT regexp_replace(lower(trim(value)), '[^[:alnum:]]', '', 'g')
$$;

-- Dice similarity on distinct padded trigrams. This needs no database extensions.
CREATE FUNCTION pg_temp.similarity(left_value text, right_value text) RETURNS double precision
LANGUAGE sql IMMUTABLE STRICT AS $$
  WITH inputs AS (
    SELECT '  ' || pg_temp.normal(left_value) || '  ' AS a,
           '  ' || pg_temp.normal(right_value) || '  ' AS b
  ), a AS (
    SELECT DISTINCT substr(inputs.a, i, 3) AS gram
    FROM inputs, generate_series(1, greatest(length(inputs.a) - 2, 0)) AS i
  ), b AS (
    SELECT DISTINCT substr(inputs.b, i, 3) AS gram
    FROM inputs, generate_series(1, greatest(length(inputs.b) - 2, 0)) AS i
  )
  SELECT CASE WHEN pg_temp.normal(left_value) = '' OR pg_temp.normal(right_value) = '' THEN 0
    ELSE 2.0 * (SELECT count(*) FROM a JOIN b USING (gram)) /
      ((SELECT count(*) FROM a) + (SELECT count(*) FROM b)) END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM source_rows) THEN
    RAISE EXCEPTION 'CSV contains no preference rows';
  END IF;
  IF EXISTS (SELECT 1 FROM source_rows
    WHERE coalesce(pg_temp.normal(club), '') = '' OR coalesce(pg_temp.normal(title), '') = ''
       OR required_rank IS NULL OR trim(required_rank) !~ '^[1-9][0-9]{0,2}$') THEN
    RAISE EXCEPTION 'CSV rows require a club, title and integer rank from 1 to 500';
  END IF;
  IF EXISTS (SELECT 1 FROM source_rows WHERE trim(required_rank)::integer > 500) THEN
    RAISE EXCEPTION 'CSV ranks must not exceed 500';
  END IF;
  IF EXISTS (
    SELECT 1 FROM source_rows GROUP BY pg_temp.normal(club), pg_temp.normal(title) HAVING count(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM source_rows GROUP BY pg_temp.normal(club), trim(required_rank)::integer HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'CSV contains duplicate club/title or club/rank combinations';
  END IF;
  PERFORM 1 FROM cycles WHERE id = 'demo-preferences-cycle-2027' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target demo-preferences-cycle-2027 does not exist';
  END IF;
END $$;

-- These reviewed aliases are from the original demo-preferences importer.
CREATE TEMP TABLE title_aliases (source text PRIMARY KEY, isbn text NOT NULL) ON COMMIT DROP;
INSERT INTO title_aliases VALUES
  ('Before the swallows come back by Fiona Curnew', '9780995531499'),
  ('Daisy Jones and the Six by Jenkins Reid', '9781787462144'),
  ('Did I ever tell you this by Sam Neill', '9781922790859'),
  ('Dropping the mask by Noni Hazelhurst', '9781460759042'),
  ('Fourteen days by Margaret Attwood', '9781529926873'),
  ('Getting away with murder by Lynda La Plante', '9781804183854'),
  ('Heartache and birdsong et al by Sam Bloom', '9780733339790'),
  ('Homecoming by Kate Moreton', '9781761470974'),
  ('Honey, baby, mine by Laura Dern & Dianne Ladd', '9781538720363'),
  ('How to knit a human by Anna Jacobson', '9781761170041'),
  ('Inside out by Kathleen Folbigg & Tracey Chapman', '9781761346620'),
  ('Julie Chan is dead by Lian Zhang', '9781526681850'),
  ('Not now, not ever by Julia Gillard', '9781761343445'),
  ('Prisoner of the state by Lily Arthur', '9781923144910'),
  ('Secrets of the Huon Wren by Claire Van Ryn', '9781761049279'),
  ('Soft serve by George Kemp', '9780702269134'),
  ('Ten steps to Nanette by Hannah Gadsby', '9781761471384'),
  ('The calamity club by Kathy Stockland', '9780241796917'),
  ('The correspondent by Virginia Evans', '9781405971553'),
  ('The Doctor of Hiroshima by Michihiko Hachiya', '9781800961517'),
  ('The Jane Austen remedy by Ruth Wilson', '9781761069567'),
  ('The Kamagawa food detectives by Hisashi Kashiwai', '9781035009589'),
  ('The labyrinth by Amanda Lowrey', '9781922458469'),
  ('The last poem by Courtnet Peppernell', '9781761631887'),
  ('The last thing he told me by Laura Dave', '9781501171345'),
  ('The Paris library by Jane Skeslien Charles', '9781529335446'),
  ('The remarkable truths of Alfie Bain by Sarah Clutton', '9781761473760'),
  ('The things we never say by Elizabeth Strout', '9798217154746'),
  ('The woman in the library by Sulari Gentile', '9781761151392'),
  ('Things I cannot say by Geraldine Mellet -general fiction', '9781038953438'),
  ('This tender land by William Kent Krueger', '9781476749303'),
  ('Weyward by Emelia Hart', '9780008499129'),
  ('Whistler by Ann Patchatt', '9780063511637'),
  ('Women talking by Miriam Toewes', '9781635572582'),
  ('Yesteryear by Caro Claire Burke', '9780008742775');

CREATE TEMP TABLE club_candidates ON COMMIT DROP AS
WITH sources AS (SELECT DISTINCT club FROM source_rows),
scored AS (
  SELECT s.club AS source, c.id, c.name, pg_temp.similarity(s.club, c.name) AS score
  FROM sources s CROSS JOIN clubs c
), ranked AS (
  SELECT *, row_number() OVER (PARTITION BY source ORDER BY score DESC, id) AS position,
    count(*) OVER (PARTITION BY source, score) AS ties
  FROM scored
)
SELECT * FROM ranked;

CREATE TEMP TABLE club_matches ON COMMIT DROP AS
SELECT s.club AS source, c.id, c.name, c.score, c.ties,
  CASE WHEN c.id IS NULL OR c.score < 0.60 THEN 'weak or no match'
       WHEN c.ties > 1 THEN 'tied match'
       WHEN pg_temp.normal(s.club) = pg_temp.normal(c.name) THEN 'exact'
       ELSE 'fuzzy' END AS method
FROM (SELECT DISTINCT club FROM source_rows) s
LEFT JOIN club_candidates c ON c.source = s.club AND c.position = 1;

CREATE TEMP TABLE title_sources ON COMMIT DROP AS
SELECT DISTINCT title AS source,
  CASE WHEN title ~* '^.*[[:space:]]by[[:space:]].+$'
    THEN regexp_replace(title, '^(.*)[[:space:]]by[[:space:]](.+)$', '\1', 'i') ELSE title END AS name,
  CASE WHEN title ~* '^.*[[:space:]]by[[:space:]].+$'
    THEN regexp_replace(title, '^(.*)[[:space:]]by[[:space:]](.+)$', '\2', 'i') ELSE '' END AS author
FROM source_rows;

CREATE TEMP TABLE title_candidates ON COMMIT DROP AS
WITH components AS (
  SELECT s.source, s.name AS source_name, s.author AS source_author,
    t.id, t.name, t.author, t.isbn,
    pg_temp.similarity(s.name, t.name) AS name_score,
    CASE WHEN s.author = '' OR pg_temp.normal(t.author) = 'unknownauthor' THEN 1.0
      ELSE pg_temp.similarity(s.author, t.author) END AS author_score,
    pg_temp.normal(s.source) = pg_temp.normal(t.name || ' by ' || t.author) AS full_match,
    EXISTS (SELECT 1 FROM title_aliases a
      WHERE pg_temp.normal(a.source) = pg_temp.normal(s.source) AND a.isbn = t.isbn) AS alias_match
  FROM title_sources s CROSS JOIN titles t
), scored AS (
  SELECT *, CASE WHEN alias_match THEN 2.0 WHEN full_match THEN 1.5
    ELSE 0.75 * name_score + 0.25 * author_score END AS score
  FROM components
), ranked AS (
  SELECT *, row_number() OVER (PARTITION BY source ORDER BY score DESC, id) AS position,
    count(*) OVER (PARTITION BY source, score) AS ties
  FROM scored
)
SELECT * FROM ranked;

CREATE TEMP TABLE title_matches ON COMMIT DROP AS
SELECT s.source, c.id, c.name, c.author, c.isbn, c.score, c.name_score, c.author_score, c.ties,
  CASE WHEN c.id IS NULL OR (NOT c.alias_match AND NOT c.full_match AND
         (c.score < 0.65 OR c.name_score < 0.60 OR c.author_score < 0.35)) THEN 'weak or no match'
       WHEN c.ties > 1 THEN 'tied match'
       WHEN c.alias_match THEN 'alias'
       WHEN c.full_match THEN 'exact'
       WHEN pg_temp.normal(s.name) = pg_temp.normal(c.name)
         AND (s.author = '' OR pg_temp.normal(s.author) = pg_temp.normal(c.author)) THEN 'exact'
       ELSE 'fuzzy' END AS method
FROM title_sources s
LEFT JOIN title_candidates c ON c.source = s.source AND c.position = 1;

CREATE TEMP TABLE invalid_clubs (club_id text PRIMARY KEY, reason text NOT NULL) ON COMMIT DROP;
INSERT INTO invalid_clubs
SELECT id, 'multiple source clubs map to the same database club'
FROM club_matches WHERE method IN ('exact', 'fuzzy')
GROUP BY id HAVING count(*) > 1;

INSERT INTO invalid_clubs
SELECT cm.id, 'multiple source rows map to the same database title'
FROM source_rows s
JOIN club_matches cm ON cm.source = s.club AND cm.method IN ('exact', 'fuzzy')
JOIN title_matches tm ON tm.source = s.title AND tm.method IN ('exact', 'alias', 'fuzzy')
GROUP BY cm.id, tm.id HAVING count(*) > 1
ON CONFLICT (club_id) DO NOTHING;

CREATE TEMP TABLE requested ON COMMIT DROP AS
SELECT cm.id AS club_id, tm.id AS title_id, s.club AS source_club, s.title AS source_title,
  trim(s.required_rank)::integer AS requested_rank
FROM source_rows s
JOIN club_matches cm ON cm.source = s.club AND cm.method IN ('exact', 'fuzzy')
JOIN title_matches tm ON tm.source = s.title AND tm.method IN ('exact', 'alias', 'fuzzy')
WHERE NOT EXISTS (SELECT 1 FROM invalid_clubs i WHERE i.club_id = cm.id);

CREATE TEMP TABLE target_ballots ON COMMIT DROP AS
SELECT b.cycle_id, b.club_id, b.person_id
FROM ballots b
WHERE b.cycle_id = 'demo-preferences-cycle-2027'
  AND EXISTS (SELECT 1 FROM requested r WHERE r.club_id = b.club_id);

CREATE TEMP TABLE desired ON COMMIT DROP AS
WITH preserved AS (
  SELECT b.cycle_id, b.club_id, b.person_id, m.title_id,
    row_number() OVER (PARTITION BY b.cycle_id, b.club_id, b.person_id ORDER BY m.rank, m.title_id) AS sequence
  FROM target_ballots b
  JOIN ballot_marks m USING (cycle_id, club_id, person_id)
  WHERE m.mark = 'selected'
    AND NOT EXISTS (SELECT 1 FROM requested r WHERE r.club_id = b.club_id AND r.title_id = m.title_id)
), limits AS (
  SELECT b.*, greatest(
    (SELECT max(r.requested_rank) FROM requested r WHERE r.club_id = b.club_id),
    (SELECT count(*) FROM requested r WHERE r.club_id = b.club_id) +
    (SELECT count(*) FROM preserved p WHERE p.cycle_id = b.cycle_id AND p.club_id = b.club_id AND p.person_id = b.person_id)
  ) AS last_slot
  FROM target_ballots b
), free_slots AS (
  SELECT l.cycle_id, l.club_id, l.person_id, slot,
    row_number() OVER (PARTITION BY l.cycle_id, l.club_id, l.person_id ORDER BY slot) AS sequence
  FROM limits l CROSS JOIN LATERAL generate_series(1, l.last_slot::integer) slot
  WHERE NOT EXISTS (SELECT 1 FROM requested r WHERE r.club_id = l.club_id AND r.requested_rank = slot)
), positioned AS (
  SELECT b.cycle_id, b.club_id, b.person_id, r.title_id,
    r.requested_rank AS slot, r.requested_rank
  FROM target_ballots b JOIN requested r USING (club_id)
  UNION ALL
  SELECT p.cycle_id, p.club_id, p.person_id, p.title_id, f.slot, NULL::integer
  FROM preserved p JOIN free_slots f USING (cycle_id, club_id, person_id, sequence)
)
SELECT cycle_id, club_id, person_id, title_id, requested_rank,
  row_number() OVER (PARTITION BY cycle_id, club_id, person_id ORDER BY slot)::integer AS rank
FROM positioned;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM desired GROUP BY cycle_id, club_id, person_id HAVING count(*) > 500) THEN
    RAISE EXCEPTION 'A proposed ballot exceeds the application limit of 500 marks';
  END IF;
END $$;

CREATE TEMP TABLE proposed_changes ON COMMIT DROP AS
SELECT coalesce(m.cycle_id, d.cycle_id) AS cycle_id,
  coalesce(m.club_id, d.club_id) AS club_id, coalesce(m.person_id, d.person_id) AS person_id,
  coalesce(m.title_id, d.title_id) AS title_id,
  m.mark AS old_mark, m.rank AS old_rank,
  CASE WHEN d.title_id IS NOT NULL THEN 'selected' END AS new_mark,
  d.rank AS new_rank, d.requested_rank
FROM (SELECT m.* FROM ballot_marks m JOIN target_ballots b USING (cycle_id, club_id, person_id)) m
FULL JOIN desired d USING (cycle_id, club_id, person_id, title_id);

CREATE TEMP TABLE changed_ballots ON COMMIT DROP AS
SELECT DISTINCT cycle_id, club_id, person_id FROM proposed_changes
WHERE old_mark IS DISTINCT FROM new_mark OR old_rank IS DISTINCT FROM new_rank;

\echo 'Club mappings (weak and tied matches are skipped):'
SELECT * FROM club_matches ORDER BY source;
\echo 'Top club candidates for fuzzy or skipped mappings:'
SELECT c.source, c.name, c.id, round(c.score::numeric, 3) AS score
FROM club_candidates c JOIN club_matches m USING (source)
WHERE m.method <> 'exact' AND c.position <= 3 ORDER BY c.source, c.position;
\echo 'Title mappings (weak and tied matches are skipped; alias score is 2, full exact score is 1.5):'
SELECT source, name, author, isbn, id, method, round(score::numeric, 3) AS score,
  round(name_score::numeric, 3) AS name_score, round(author_score::numeric, 3) AS author_score
FROM title_matches ORDER BY source;
\echo 'Top title candidates for fuzzy or skipped mappings:'
SELECT c.source, c.name, c.author, c.isbn, c.id, round(c.score::numeric, 3) AS score
FROM title_candidates c JOIN title_matches m USING (source)
WHERE m.method NOT IN ('exact', 'alias') AND c.position <= 3 ORDER BY c.source, c.position;
\echo 'Clubs skipped because of conflicting mappings:'
SELECT i.club_id, c.name, i.reason FROM invalid_clubs i JOIN clubs c ON c.id = i.club_id ORDER BY c.name;
\echo 'Source rows not applied because of a missing, weak, tied or conflicting match:'
SELECT s.row_number, s.club, s.title, s.required_rank, cm.method AS club_match,
  tm.method AS title_match, i.reason AS club_collision
FROM source_rows s JOIN club_matches cm ON cm.source = s.club JOIN title_matches tm ON tm.source = s.title
LEFT JOIN invalid_clubs i ON i.club_id = cm.id
WHERE cm.method NOT IN ('exact', 'fuzzy') OR tm.method NOT IN ('exact', 'alias', 'fuzzy') OR i.club_id IS NOT NULL
ORDER BY s.row_number;
\echo 'Resolved clubs without existing ballots in the target cycle:'
SELECT DISTINCT r.source_club, r.club_id FROM requested r
WHERE NOT EXISTS (SELECT 1 FROM target_ballots b WHERE b.club_id = r.club_id) ORDER BY r.source_club;
\echo 'Before and after for changed ballots, including cleared read/wont marks:'
SELECT c.name AS club, p.name AS person, ch.person_id, t.name AS title, t.author, ch.title_id,
  ch.old_mark, ch.old_rank, ch.new_mark, ch.new_rank, ch.requested_rank
FROM proposed_changes ch JOIN changed_ballots b USING (cycle_id, club_id, person_id)
JOIN clubs c ON c.id = ch.club_id JOIN people p ON p.id = ch.person_id JOIN titles t ON t.id = ch.title_id
ORDER BY c.name, ch.person_id, ch.new_rank NULLS LAST, ch.old_rank NULLS LAST, ch.title_id;
\echo 'Requested positions compacted because earlier slots could not be filled:'
SELECT c.name AS club, d.person_id, t.name AS title, d.requested_rank, d.rank AS actual_rank
FROM desired d JOIN clubs c ON c.id = d.club_id JOIN titles t ON t.id = d.title_id
WHERE d.requested_rank IS NOT NULL AND d.requested_rank <> d.rank
ORDER BY c.name, d.person_id, d.requested_rank;
\echo 'Finalized groups to clear for changed clubs:'
SELECT f.club_id, c.name, count(r.title_id) AS finalized_titles
FROM finalized_groups f JOIN clubs c ON c.id = f.club_id
LEFT JOIN finalized_rankings r USING (cycle_id, club_id)
WHERE f.cycle_id = 'demo-preferences-cycle-2027'
  AND EXISTS (SELECT 1 FROM changed_ballots b WHERE b.cycle_id = f.cycle_id AND b.club_id = f.club_id)
GROUP BY f.club_id, c.name ORDER BY c.name;
\echo 'Summary:'
SELECT (SELECT count(*) FROM source_rows) AS source_rows,
  (SELECT count(*) FROM requested) AS resolved_rows,
  (SELECT count(*) FROM target_ballots) AS targeted_ballots,
  (SELECT count(*) FROM changed_ballots) AS changed_ballots,
  (SELECT count(*) FROM proposed_changes WHERE old_mark IN ('read', 'wont')) AS cleared_read_or_wont;
\echo 'Existing schedule assignments and club reading history are not changed; history can still exclude selections.'
\echo 'The transaction holds the cycle lock until you apply or roll back.'
\prompt 'Type APPLY to commit these changes; anything else rolls back: ' confirmation
SELECT :'confirmation' = 'APPLY' AS apply_changes \gset
\if :apply_changes
  DELETE FROM ballot_marks m USING changed_ballots b
  WHERE m.cycle_id = b.cycle_id AND m.club_id = b.club_id AND m.person_id = b.person_id;
  INSERT INTO ballot_marks (cycle_id, club_id, person_id, title_id, mark, rank)
  SELECT d.cycle_id, d.club_id, d.person_id, d.title_id, 'selected', d.rank
  FROM desired d JOIN changed_ballots b USING (cycle_id, club_id, person_id);
  UPDATE ballots b SET revision = b.revision + 1
  FROM changed_ballots ch
  WHERE b.cycle_id = ch.cycle_id AND b.club_id = ch.club_id AND b.person_id = ch.person_id;
  DELETE FROM finalized_rankings r WHERE r.cycle_id = 'demo-preferences-cycle-2027'
    AND EXISTS (SELECT 1 FROM changed_ballots b WHERE b.cycle_id = r.cycle_id AND b.club_id = r.club_id);
  DELETE FROM finalized_groups f WHERE f.cycle_id = 'demo-preferences-cycle-2027'
    AND EXISTS (SELECT 1 FROM changed_ballots b WHERE b.cycle_id = f.cycle_id AND b.club_id = f.club_id);
  UPDATE cycles SET revision = revision + 1 WHERE id = 'demo-preferences-cycle-2027'
    AND EXISTS (SELECT 1 FROM changed_ballots);
  COMMIT;
  \echo 'Changes committed.'
\else
  ROLLBACK;
  \echo 'Preview rolled back; no changes committed.'
\endif
