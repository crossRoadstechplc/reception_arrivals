-- User ID for integrations: every person gets a UUID, which a super admin can replace.
ALTER TABLE "users" ADD COLUMN "external_id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text;

CREATE UNIQUE INDEX "users_external_id_key" ON "users"("external_id");
