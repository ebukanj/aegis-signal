-- CreateTable
CREATE TABLE "Insight" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sources" TEXT[],
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "url" TEXT,
    "language" TEXT NOT NULL,
    "publishedAt" BIGINT NOT NULL,
    "collectedAt" BIGINT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "impact" TEXT NOT NULL,
    "entities" JSONB NOT NULL,
    "coins" TEXT[],
    "tags" TEXT[],
    "confidence" DOUBLE PRECISION NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Insight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Insight_dedupeKey_key" ON "Insight"("dedupeKey");

-- CreateIndex
CREATE INDEX "Insight_category_idx" ON "Insight"("category");

-- CreateIndex
CREATE INDEX "Insight_severity_idx" ON "Insight"("severity");

-- CreateIndex
CREATE INDEX "Insight_publishedAt_idx" ON "Insight"("publishedAt");

-- CreateIndex
CREATE INDEX "Insight_coins_idx" ON "Insight"("coins");
