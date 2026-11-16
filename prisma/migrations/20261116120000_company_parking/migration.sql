-- Company (tenant) on each floor, and optional car details on a visit.
ALTER TABLE "floors" ADD COLUMN "company" TEXT;
ALTER TABLE "guests" ADD COLUMN "license_plate" TEXT;
ALTER TABLE "guests" ADD COLUMN "vehicle" TEXT;
