-- CreateEnum
CREATE TYPE "JobPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "accessories" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "customerSignature" TEXT,
ADD COLUMN     "damageSpots" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "expectedCompletion" TIMESTAMP(3),
ADD COLUMN     "fuelLevel" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "insurancePolicyNo" TEXT,
ADD COLUMN     "isAccidentCase" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "photos" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "priority" "JobPriority" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "serviceAdvisorId" TEXT,
ADD COLUMN     "towingFrom" TEXT,
ADD COLUMN     "towingRequired" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "vin" TEXT;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_serviceAdvisorId_fkey" FOREIGN KEY ("serviceAdvisorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
