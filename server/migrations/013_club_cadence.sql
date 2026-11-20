DO $migration$
DECLARE unknown_values text;
BEGIN
  SELECT string_agg(DISTINCT quote_literal(cadence), ', ' ORDER BY quote_literal(cadence))
    INTO unknown_values FROM clubs
    WHERE lower(trim(cadence)) NOT IN ('', 'monthly', 'month', '1', '1.5', '6 weeks', '6 week', 'six weeks', 'six week', '6-week', 'six-week');
  IF unknown_values IS NOT NULL THEN
    RAISE EXCEPTION 'Unrecognized club cadence values: %. Update these clubs before running migrations.', unknown_values
      USING ERRCODE = 'P0001';
  END IF;
END
$migration$;

ALTER TABLE clubs ALTER COLUMN cadence DROP DEFAULT;
ALTER TABLE clubs ALTER COLUMN cadence TYPE double precision USING
  CASE WHEN lower(trim(cadence)) IN ('', 'monthly', 'month', '1') THEN 1 ELSE 1.5 END;
ALTER TABLE clubs ALTER COLUMN cadence SET DEFAULT 1;
ALTER TABLE clubs ADD CONSTRAINT clubs_cadence_check CHECK (cadence IN (1, 1.5));
