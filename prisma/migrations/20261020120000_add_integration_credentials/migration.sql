CREATE TABLE "IntegrationCredential" (
    "name" TEXT NOT NULL,
    "encryptedValue" TEXT NOT NULL,
    "maskedValue" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "IntegrationCredential_pkey" PRIMARY KEY ("name")
);
