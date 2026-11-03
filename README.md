# Arrival Desk

Web app for floor guest lists and the ground-floor reception board.

Floor admins add visitors for a date. Reception, on a tablet or a PC, sees every floor and marks a guest cleared for the elevator. A super admin adds floors and people and sets each person's password. Everyone signs in with that email and password. Forgot password sends a reset link through your SMTP server. New floors are added in the admin screen.

## Setup

1. Copy `.env.example` to `.env` and fill in Supabase, the super admin password, and SMTP.
2. Apply the schema:

```bash
npx prisma migrate deploy
npx prisma db seed
```

3. In the Supabase SQL editor, run [`prisma/sql/realtime.sql`](prisma/sql/realtime.sql). That enables row-level security and live updates on the reception board.
4. Start the app:

```bash
npm run dev
```

5. Open `http://localhost:3000` and sign in with `SEED_SUPER_ADMIN_EMAIL` and `SEED_SUPER_ADMIN_PASSWORD`.

Then add a reception user and a floor admin for the 6th floor from the Admin screen.

## Scripts

- `npm run dev` — local app
- `npm run build` — production build
- `npx prisma migrate deploy` — apply database migrations
- `npx prisma db seed` — create the 6th floor and the super admin
