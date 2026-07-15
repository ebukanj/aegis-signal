-- CreateTable
CREATE TABLE "HistoricalSetup" (
    "id" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "rulesHash" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "regime" TEXT NOT NULL,
    "volatilityState" TEXT NOT NULL,
    "volatilityBucket" TEXT NOT NULL,
    "liquidityBucket" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "patterns" TEXT[],
    "score" INTEGER NOT NULL,
    "barTime" BIGINT NOT NULL,
    "entryPrice" DOUBLE PRECISION NOT NULL,
    "stopPrice" DOUBLE PRECISION NOT NULL,
    "targetPrice" DOUBLE PRECISION NOT NULL,
    "outcome" TEXT NOT NULL,
    "realisedR" DOUBLE PRECISION NOT NULL,
    "barsHeld" INTEGER NOT NULL,
    "split" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistoricalSetup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalibrationModel" (
    "version" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "corpus" JSONB NOT NULL,
    "bins" JSONB NOT NULL,
    "plattA" DOUBLE PRECISION,
    "plattB" DOUBLE PRECISION,
    "inSample" JSONB NOT NULL,
    "outOfSample" JSONB NOT NULL,
    "fittedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalibrationModel_pkey" PRIMARY KEY ("version")
);

-- CreateIndex
CREATE INDEX "HistoricalSetup_strategyId_rulesHash_idx" ON "HistoricalSetup"("strategyId", "rulesHash");

-- CreateIndex
CREATE INDEX "HistoricalSetup_score_idx" ON "HistoricalSetup"("score");

-- CreateIndex
CREATE INDEX "HistoricalSetup_split_idx" ON "HistoricalSetup"("split");

-- CreateIndex
CREATE UNIQUE INDEX "HistoricalSetup_strategyId_rulesHash_symbol_timeframe_barTi_key" ON "HistoricalSetup"("strategyId", "rulesHash", "symbol", "timeframe", "barTime");

-- CreateIndex
CREATE INDEX "CalibrationModel_active_idx" ON "CalibrationModel"("active");
