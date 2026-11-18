-- Add a role to local accounts so a self-hosted instance can have more
-- than one account. The first account created during setup becomes the
-- administrator; accounts created afterwards are regular accounts.
ALTER TABLE "LocalAdmin" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'USER';

-- Existing installations have exactly one account; keep it as the
-- administrator so the instance owner retains account management.
UPDATE "LocalAdmin" SET "role" = 'ADMIN'
WHERE "id" IN (
  SELECT "id" FROM "LocalAdmin" ORDER BY "createdAt" ASC, "id" ASC LIMIT 1
);
