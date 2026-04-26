-- Required schema upgrade for identifier-based member imports.
-- Run this in Supabase SQL Editor before using the new batch import template.

ALTER TABLE family_members
  ADD COLUMN IF NOT EXISTS import_code text;

CREATE UNIQUE INDEX IF NOT EXISTS family_members_import_code_key
  ON family_members(import_code)
  WHERE import_code IS NOT NULL;

COMMENT ON COLUMN family_members.import_code IS
  'Stable external/import identifier used to resolve parent relationships during batch import.';
