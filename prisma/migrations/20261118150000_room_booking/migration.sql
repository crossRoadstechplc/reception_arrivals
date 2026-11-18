-- Meeting room booking: a switch per floor, and the room booked for a guest.
ALTER TABLE "floors" ADD COLUMN "room_booking_enabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "guests"
  ADD COLUMN "booking_id" TEXT,
  ADD COLUMN "booking_status" TEXT,
  ADD COLUMN "booking_room_id" TEXT,
  ADD COLUMN "booking_room_name" TEXT,
  ADD COLUMN "booking_starts_at" TIMESTAMP(3),
  ADD COLUMN "booking_ends_at" TIMESTAMP(3),
  ADD COLUMN "booking_employee" TEXT,
  ADD COLUMN "booking_title" TEXT,
  ADD COLUMN "booking_attempt" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "booking_error" TEXT;
