CREATE TABLE "RevokedSession" (
    "revocationKey" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevokedSession_pkey" PRIMARY KEY ("revocationKey")
);

CREATE INDEX "RevokedSession_expiresAt_idx" ON "RevokedSession"("expiresAt");
