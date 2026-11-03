-- Floor members: per-floor roles, guest hosts, arrival tracking, push subscriptions.

-- People with floor access are now "floor staff". Their power on each floor
-- comes from floor_assignments.role. Rename in place so existing rows keep working.
ALTER TYPE "role" RENAME VALUE 'FLOOR_ADMIN' TO 'FLOOR_STAFF';

-- CreateEnum
CREATE TYPE "floor_role" AS ENUM ('ADMIN', 'MEMBER');

-- AlterTable
ALTER TABLE "floor_assignments" ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "role" "floor_role" NOT NULL DEFAULT 'MEMBER';

-- Everyone assigned to a floor before this change was that floor's admin.
UPDATE "floor_assignments" SET "role" = 'ADMIN';

-- AlterTable
ALTER TABLE "guests" ADD COLUMN     "arrived_at" TIMESTAMP(3),
ADD COLUMN     "arrived_by_id" TEXT,
ADD COLUMN     "host_notified_at" TIMESTAMP(3),
ADD COLUMN     "host_notified_via" TEXT,
ADD COLUMN     "host_user_id" TEXT;

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions"("user_id");

-- CreateIndex
CREATE INDEX "floor_assignments_floor_id_idx" ON "floor_assignments"("floor_id");

-- CreateIndex
CREATE INDEX "guests_host_user_id_visit_date_idx" ON "guests"("host_user_id", "visit_date");

-- AddForeignKey
ALTER TABLE "guests" ADD CONSTRAINT "guests_host_user_id_fkey" FOREIGN KEY ("host_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guests" ADD CONSTRAINT "guests_arrived_by_id_fkey" FOREIGN KEY ("arrived_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "push_subscriptions" ENABLE ROW LEVEL SECURITY;
