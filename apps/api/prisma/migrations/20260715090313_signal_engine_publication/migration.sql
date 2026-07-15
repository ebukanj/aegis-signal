-- CreateTable
CREATE TABLE "Signal" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "regime" TEXT NOT NULL,
    "strategies" TEXT[],
    "rulesHashes" TEXT[],
    "marketType" TEXT NOT NULL,
    "suggestedLeverage" INTEGER,
    "entryPrice" DOUBLE PRECISION NOT NULL,
    "stopLoss" DOUBLE PRECISION NOT NULL,
    "takeProfits" DOUBLE PRECISION[],
    "confidence" JSONB NOT NULL,
    "confluence" JSONB NOT NULL,
    "signalScore" JSONB NOT NULL,
    "isPrime" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL,
    "barTime" BIGINT NOT NULL,
    "publishedAt" BIGINT NOT NULL,
    "expiresAt" BIGINT NOT NULL,
    "summary" TEXT NOT NULL,
    "whyPublished" TEXT NOT NULL,
    "supporting" TEXT[],
    "contradicting" TEXT[],
    "unassessed" TEXT[],
    "calibrationVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Signal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignalTransition" (
    "id" TEXT NOT NULL,
    "signalId" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "at" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignalTransition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrimeAllocation" (
    "id" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "signalId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "awardedAt" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrimeAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Signal_status_idx" ON "Signal"("status");

-- CreateIndex
CREATE INDEX "Signal_symbol_direction_timeframe_barTime_idx" ON "Signal"("symbol", "direction", "timeframe", "barTime");

-- CreateIndex
CREATE INDEX "Signal_isPrime_idx" ON "Signal"("isPrime");

-- CreateIndex
CREATE INDEX "Signal_publishedAt_idx" ON "Signal"("publishedAt");

-- CreateIndex
CREATE INDEX "SignalTransition_signalId_idx" ON "SignalTransition"("signalId");

-- CreateIndex
CREATE INDEX "PrimeAllocation_day_idx" ON "PrimeAllocation"("day");

-- CreateIndex
CREATE UNIQUE INDEX "PrimeAllocation_day_slot_key" ON "PrimeAllocation"("day", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "PrimeAllocation_day_signalId_key" ON "PrimeAllocation"("day", "signalId");

-- AddForeignKey
ALTER TABLE "SignalTransition" ADD CONSTRAINT "SignalTransition_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "Signal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
