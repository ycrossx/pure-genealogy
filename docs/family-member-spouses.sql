-- Optional schema upgrade for structured spouse relationships.
-- Run this in Supabase SQL Editor before using structured spouse links.

CREATE TABLE IF NOT EXISTS family_member_spouses (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  member_id bigint NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  spouse_id bigint NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  relation_kind text NOT NULL DEFAULT 'spouse'
    CHECK (relation_kind IN ('spouse', 'former', 'unknown')),
  is_primary boolean NOT NULL DEFAULT true,
  notes text,
  member_low_id bigint GENERATED ALWAYS AS (LEAST(member_id, spouse_id)) STORED,
  member_high_id bigint GENERATED ALWAYS AS (GREATEST(member_id, spouse_id)) STORED,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT family_member_spouses_not_self
    CHECK (member_id <> spouse_id),
  CONSTRAINT family_member_spouses_unique_pair
    UNIQUE (member_low_id, member_high_id)
);

CREATE INDEX IF NOT EXISTS idx_family_member_spouses_member_id
  ON family_member_spouses(member_id);

CREATE INDEX IF NOT EXISTS idx_family_member_spouses_spouse_id
  ON family_member_spouses(spouse_id);

CREATE INDEX IF NOT EXISTS idx_family_member_spouses_pair
  ON family_member_spouses(member_low_id, member_high_id);

ALTER TABLE family_member_spouses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to read family member spouses"
  ON family_member_spouses
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert family member spouses"
  ON family_member_spouses
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update family member spouses"
  ON family_member_spouses
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to delete family member spouses"
  ON family_member_spouses
  FOR DELETE
  TO authenticated
  USING (true);

-- Existing family_members.spouse text is intentionally kept as compatibility
-- display text. Migrate it to this table only after manually confirming matches,
-- because duplicate names can otherwise create incorrect spouse links.
