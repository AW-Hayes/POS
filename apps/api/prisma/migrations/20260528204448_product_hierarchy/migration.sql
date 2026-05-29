-- CreateTable: ProductType
CREATE TABLE "ProductType" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductType_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductType_tenantId_name_key" ON "ProductType"("tenantId", "name");
CREATE INDEX "ProductType_tenantId_idx" ON "ProductType"("tenantId");

-- CreateTable: ProductClass
CREATE TABLE "ProductClass" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductClass_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductClass_categoryId_name_key" ON "ProductClass"("categoryId", "name");
CREATE INDEX "ProductClass_tenantId_idx" ON "ProductClass"("tenantId");

-- CreateTable: Fineline
CREATE TABLE "Fineline" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fineline_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Fineline_classId_name_key" ON "Fineline"("classId", "name");
CREATE INDEX "Fineline_tenantId_idx" ON "Fineline"("tenantId");

-- AlterTable: Category — add productTypeId
ALTER TABLE "Category" ADD COLUMN "productTypeId" TEXT;

-- AlterTable: Product — add hierarchy FKs + upc, shortCode
ALTER TABLE "Product"
    ADD COLUMN "productTypeId" TEXT,
    ADD COLUMN "classId" TEXT,
    ADD COLUMN "finelineId" TEXT,
    ADD COLUMN "upc" TEXT,
    ADD COLUMN "shortCode" TEXT;

CREATE UNIQUE INDEX "Product_tenantId_upc_key" ON "Product"("tenantId", "upc") WHERE "upc" IS NOT NULL;
CREATE UNIQUE INDEX "Product_tenantId_shortCode_key" ON "Product"("tenantId", "shortCode") WHERE "shortCode" IS NOT NULL;

-- AddForeignKey constraints
ALTER TABLE "ProductType" ADD CONSTRAINT "ProductType_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Category" ADD CONSTRAINT "Category_productTypeId_fkey"
    FOREIGN KEY ("productTypeId") REFERENCES "ProductType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductClass" ADD CONSTRAINT "ProductClass_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Fineline" ADD CONSTRAINT "Fineline_classId_fkey"
    FOREIGN KEY ("classId") REFERENCES "ProductClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Product" ADD CONSTRAINT "Product_productTypeId_fkey"
    FOREIGN KEY ("productTypeId") REFERENCES "ProductType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Product" ADD CONSTRAINT "Product_classId_fkey"
    FOREIGN KEY ("classId") REFERENCES "ProductClass"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Product" ADD CONSTRAINT "Product_finelineId_fkey"
    FOREIGN KEY ("finelineId") REFERENCES "Fineline"("id") ON DELETE SET NULL ON UPDATE CASCADE;
