ALTER TABLE titles
  ADD COLUMN publisher text CHECK (publisher IS NULL OR length(publisher) <= 200),
  ADD COLUMN synopsis text CHECK (synopsis IS NULL OR length(synopsis) <= 4000),
  ADD COLUMN date_published text CHECK (date_published IS NULL OR length(date_published) <= 40),
  ADD COLUMN binding text CHECK (binding IS NULL OR length(binding) <= 100),
  ADD COLUMN language text CHECK (language IS NULL OR length(language) <= 40);
