CREATE TABLE "JobLeaseLock" (
    "name" TEXT NOT NULL,
    "ownerToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobLeaseLock_pkey" PRIMARY KEY ("name")
);

CREATE INDEX "JobLeaseLock_expiresAt_idx" ON "JobLeaseLock"("expiresAt");
