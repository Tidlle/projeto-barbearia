-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "confirmationAutoFailedAt" TIMESTAMP(3),
ADD COLUMN     "confirmationSkippedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Barbershop" ADD COLUMN     "confirmationBatchMinutes" INTEGER NOT NULL DEFAULT 0;
