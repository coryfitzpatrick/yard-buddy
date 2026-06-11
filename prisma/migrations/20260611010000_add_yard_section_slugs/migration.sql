-- Add slug columns as nullable first
ALTER TABLE "Yard" ADD COLUMN IF NOT EXISTS "slug" TEXT;
ALTER TABLE "YardSection" ADD COLUMN IF NOT EXISTS "slug" TEXT;

-- Backfill Yard slugs from name, unique per userId (append -N for duplicates)
WITH numbered AS (
  SELECT
    id,
    "userId",
    trim(both '-' from regexp_replace(lower(trim(name)), '[^a-z0-9]+', '-', 'g')) AS base_slug,
    row_number() OVER (
      PARTITION BY "userId", trim(both '-' from regexp_replace(lower(trim(name)), '[^a-z0-9]+', '-', 'g'))
      ORDER BY "createdAt"
    ) AS rn
  FROM "Yard"
  WHERE slug IS NULL
)
UPDATE "Yard" y
SET slug = CASE WHEN n.rn = 1 THEN n.base_slug ELSE n.base_slug || '-' || (n.rn - 1)::text END
FROM numbered n
WHERE y.id = n.id;

-- Backfill YardSection slugs from name, unique per yardId (append -N for duplicates)
WITH numbered AS (
  SELECT
    id,
    "yardId",
    trim(both '-' from regexp_replace(lower(trim(name)), '[^a-z0-9]+', '-', 'g')) AS base_slug,
    row_number() OVER (
      PARTITION BY "yardId", trim(both '-' from regexp_replace(lower(trim(name)), '[^a-z0-9]+', '-', 'g'))
      ORDER BY "createdAt"
    ) AS rn
  FROM "YardSection"
  WHERE slug IS NULL
)
UPDATE "YardSection" s
SET slug = CASE WHEN n.rn = 1 THEN n.base_slug ELSE n.base_slug || '-' || (n.rn - 1)::text END
FROM numbered n
WHERE s.id = n.id;

-- Set NOT NULL after backfill
ALTER TABLE "Yard" ALTER COLUMN "slug" SET NOT NULL;
ALTER TABLE "YardSection" ALTER COLUMN "slug" SET NOT NULL;

-- Add unique constraints
ALTER TABLE "Yard" ADD CONSTRAINT "Yard_userId_slug_key" UNIQUE ("userId", "slug");
ALTER TABLE "YardSection" ADD CONSTRAINT "YardSection_yardId_slug_key" UNIQUE ("yardId", "slug");
