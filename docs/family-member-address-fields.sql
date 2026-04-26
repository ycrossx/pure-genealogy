-- Optional schema upgrade for structured residence address fields.
-- Run this in Supabase SQL Editor before using the structured address form.

ALTER TABLE family_members
  ADD COLUMN IF NOT EXISTS residence_country text,
  ADD COLUMN IF NOT EXISTS residence_country_code text,
  ADD COLUMN IF NOT EXISTS residence_province text,
  ADD COLUMN IF NOT EXISTS residence_province_code text,
  ADD COLUMN IF NOT EXISTS residence_city text,
  ADD COLUMN IF NOT EXISTS residence_city_code text,
  ADD COLUMN IF NOT EXISTS residence_district text,
  ADD COLUMN IF NOT EXISTS residence_district_code text,
  ADD COLUMN IF NOT EXISTS residence_town text,
  ADD COLUMN IF NOT EXISTS residence_town_code text,
  ADD COLUMN IF NOT EXISTS residence_address text;

-- Keep residence_place as the display/legacy full address field.
-- No NOT NULL constraints are added here so existing historical data remains valid.

CREATE TABLE IF NOT EXISTS administrative_divisions (
  code text PRIMARY KEY,
  name text NOT NULL,
  level text NOT NULL CHECK (level IN ('country', 'province', 'city', 'district', 'town')),
  parent_code text REFERENCES administrative_divisions(code) ON DELETE CASCADE,
  full_name text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_administrative_divisions_parent_code
  ON administrative_divisions(parent_code);

CREATE INDEX IF NOT EXISTS idx_administrative_divisions_level
  ON administrative_divisions(level);

INSERT INTO administrative_divisions (code, name, level, parent_code, full_name, sort_order)
VALUES ('CN', '中国', 'country', NULL, '中国', 1)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  level = EXCLUDED.level,
  parent_code = EXCLUDED.parent_code,
  full_name = EXCLUDED.full_name,
  sort_order = EXCLUDED.sort_order;
