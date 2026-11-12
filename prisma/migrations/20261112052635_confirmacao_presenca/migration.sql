-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "attendanceConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "reminderSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Barbershop" ADD COLUMN     "confirmationEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "confirmationLeadMinutes" INTEGER NOT NULL DEFAULT 120,
ALTER COLUMN "paymentMode" SET DEFAULT 'NONE';

-- CreateTable
CREATE TABLE "MessageLog" (
    "id" TEXT NOT NULL,
    "barbershopId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "kind" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'WHATSAPP',
    "provider" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessageLog_barbershopId_createdAt_idx" ON "MessageLog"("barbershopId", "createdAt");

-- AddForeignKey
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "Barbershop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
