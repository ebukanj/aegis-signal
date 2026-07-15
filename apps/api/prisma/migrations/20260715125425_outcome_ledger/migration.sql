-- CreateTable
CREATE TABLE "LedgerEntry" (
    "signalId" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "strategyVersion" INTEGER NOT NULL,
    "rulesHash" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "regime" TEXT NOT NULL,
    "entryPrice" DOUBLE PRECISION NOT NULL,
    "stopLoss" DOUBLE PRECISION NOT NULL,
    "takeProfits" DOUBLE PRECISION[],
    "confidence" JSONB NOT NULL,
    "confluence" JSONB NOT NULL,
    "signalScore" JSONB NOT NULL,
    "calibrationVersion" INTEGER NOT NULL,
    "publishedAt" BIGINT NOT NULL,
    "barTime" BIGINT NOT NULL,
    "settlement" JSONB,
    "outcome" TEXT,
    "realisedR" DOUBLE PRECISION,
    "settledAt" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("signalId")
);

-- CreateTable
CREATE TABLE "LedgerAudit" (
    "id" TEXT NOT NULL,
    "signalId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "at" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LedgerEntry_strategyId_rulesHash_idx" ON "LedgerEntry"("strategyId", "rulesHash");

-- CreateIndex
CREATE INDEX "LedgerEntry_outcome_idx" ON "LedgerEntry"("outcome");

-- CreateIndex
CREATE INDEX "LedgerEntry_settledAt_idx" ON "LedgerEntry"("settledAt");

-- CreateIndex
CREATE INDEX "LedgerEntry_symbol_idx" ON "LedgerEntry"("symbol");

-- CreateIndex
CREATE INDEX "LedgerEntry_regime_idx" ON "LedgerEntry"("regime");

-- CreateIndex
CREATE INDEX "LedgerEntry_publishedAt_idx" ON "LedgerEntry"("publishedAt");

-- CreateIndex
CREATE INDEX "LedgerAudit_signalId_idx" ON "LedgerAudit"("signalId");

-- CreateIndex
CREATE INDEX "LedgerAudit_action_idx" ON "LedgerAudit"("action");

-- AddForeignKey
ALTER TABLE "LedgerAudit" ADD CONSTRAINT "LedgerAudit_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "LedgerEntry"("signalId") ON DELETE RESTRICT ON UPDATE CASCADE;
