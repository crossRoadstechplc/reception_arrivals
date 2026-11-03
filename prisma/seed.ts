import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/password";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_SUPER_ADMIN_PASSWORD ?? "";
  if (!email) {
    throw new Error("SEED_SUPER_ADMIN_EMAIL is required. Set it in .env before seeding.");
  }
  if (password.length < 8) {
    throw new Error("SEED_SUPER_ADMIN_PASSWORD must be at least 8 characters.");
  }

  await prisma.floor.upsert({
    where: { number: 6 },
    update: { name: "6th Floor", active: true },
    create: { name: "6th Floor", number: 6, active: true },
  });

  const existing = await prisma.user.findUnique({ where: { email } });
  const passwordHash = await hashPassword(password);

  if (!existing) {
    await prisma.user.create({
      data: {
        email,
        name: "Super admin",
        role: "SUPER_ADMIN",
        active: true,
        passwordHash,
      },
    });
  } else {
    await prisma.user.update({
      where: { email },
      data: {
        role: "SUPER_ADMIN",
        active: true,
        passwordHash: existing.passwordHash ?? passwordHash,
      },
    });
  }

  console.log(`Seeded 6th Floor and super admin ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
