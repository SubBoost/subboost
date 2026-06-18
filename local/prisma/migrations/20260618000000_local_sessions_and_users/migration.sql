CREATE TABLE "LocalSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocalSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LocalSession_tokenHash_key" ON "LocalSession"("tokenHash");
CREATE INDEX "LocalSession_ownerId_idx" ON "LocalSession"("ownerId");
CREATE INDEX "LocalSession_expiresAt_idx" ON "LocalSession"("expiresAt");

ALTER TABLE "LocalSession"
ADD CONSTRAINT "LocalSession_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "LocalAdmin"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
