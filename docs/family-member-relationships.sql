-- Optional schema upgrade for explicit parent-child relationship types.
-- Run this in Supabase SQL Editor before using adoptive/step/guardian relationships.

CREATE TABLE IF NOT EXISTS family_member_relationships (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  child_id bigint NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  parent_id bigint NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  parent_role text NOT NULL CHECK (parent_role IN ('father', 'mother', 'parent')),
  relation_kind text NOT NULL DEFAULT 'biological'
    CHECK (relation_kind IN ('biological', 'adoptive', 'step', 'guardian', 'unknown')),
  is_primary boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT family_member_relationships_unique_role
    UNIQUE (child_id, parent_id, parent_role)
);

CREATE INDEX IF NOT EXISTS idx_family_member_relationships_child_id
  ON family_member_relationships(child_id);

CREATE INDEX IF NOT EXISTS idx_family_member_relationships_parent_id
  ON family_member_relationships(parent_id);

INSERT INTO family_member_relationships (
  child_id,
  parent_id,
  parent_role,
  relation_kind,
  is_primary
)
SELECT
  id,
  father_id,
  'father',
  'biological',
  true
FROM family_members
WHERE father_id IS NOT NULL
ON CONFLICT (child_id, parent_id, parent_role) DO NOTHING;

INSERT INTO family_member_relationships (
  child_id,
  parent_id,
  parent_role,
  relation_kind,
  is_primary
)
SELECT
  id,
  mom_id,
  'mother',
  'biological',
  true
FROM family_members
WHERE mom_id IS NOT NULL
ON CONFLICT (child_id, parent_id, parent_role) DO NOTHING;
