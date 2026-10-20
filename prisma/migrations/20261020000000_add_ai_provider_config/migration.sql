-- CreateEnum
CREATE TYPE "AiProviderType" AS ENUM ('OPENAI', 'ANTHROPIC', 'GEMINI', 'XAI', 'OPENAI_COMPATIBLE');

-- CreateEnum
CREATE TYPE "AiHealthStatus" AS ENUM ('CONNECTED', 'DEGRADED', 'DISCONNECTED', 'NOT_CONFIGURED', 'UNKNOWN');

-- CreateTable
CREATE TABLE "AiProviderConfig" (
    "id" TEXT NOT NULL,
    "providerType" "AiProviderType" NOT NULL,
    "displayName" TEXT NOT NULL,
    "encryptedApiKey" TEXT NOT NULL,
    "maskedApiKey" TEXT NOT NULL,
    "baseUrl" TEXT,
    "defaultModel" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isFallback" BOOLEAN NOT NULL DEFAULT false,
    "fallbackPriority" INTEGER NOT NULL DEFAULT 0,
    "healthStatus" "AiHealthStatus" NOT NULL DEFAULT 'UNKNOWN',
    "lastHealthCheck" TIMESTAMP(3),
    "lastSuccessfulCheck" TIMESTAMP(3),
    "lastLatencyMs" INTEGER,
    "lastErrorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "AiProviderConfig_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "AiActivityLog" ALTER COLUMN "tenantId" DROP NOT NULL;
ALTER TABLE "AiActivityLog" ADD COLUMN "totalTokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AiActivityLog" ADD COLUMN "durationMs" INTEGER;
ALTER TABLE "AiActivityLog" ADD COLUMN "isFallback" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AiActivityLog" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'SUCCESS';
ALTER TABLE "AiActivityLog" ADD COLUMN "errorMessage" TEXT;

-- CreateIndex
CREATE INDEX "AiProviderConfig_isActive_isDefault_idx" ON "AiProviderConfig"("isActive", "isDefault");

-- CreateIndex
CREATE INDEX "AiProviderConfig_healthStatus_idx" ON "AiProviderConfig"("healthStatus");

-- CreateIndex
CREATE INDEX "AiActivityLog_provider_createdAt_idx" ON "AiActivityLog"("provider", "createdAt");
