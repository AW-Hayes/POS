-- AlterTable
ALTER TABLE "CashDrop" ADD COLUMN     "reason" TEXT,
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'drop';
