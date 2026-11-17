-- "Also notify": colleagues told about a visit and alerted on arrival with the host.
CREATE TABLE "guest_invitees" (
    "id" TEXT NOT NULL,
    "guest_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "invited_by_id" TEXT,
    "notified_at" TIMESTAMP(3),
    "notified_via" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guest_invitees_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "guest_invitees_guest_id_user_id_key" ON "guest_invitees"("guest_id", "user_id");
CREATE INDEX "guest_invitees_user_id_idx" ON "guest_invitees"("user_id");

ALTER TABLE "guest_invitees" ADD CONSTRAINT "guest_invitees_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guest_invitees" ADD CONSTRAINT "guest_invitees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guest_invitees" ADD CONSTRAINT "guest_invitees_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "guest_invitees" ENABLE ROW LEVEL SECURITY;
