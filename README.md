# Arrival Desk

Web app for floor guest lists and the ground-floor reception board.

## Who does what

- **Super admin**: adds floors and people, and decides who is admin of which floor.
- **Floor admin**: sees every guest on their floor and manages the floor team. Adds members by email; new people get an invite email to set their password.
- **Member**: adds and sees only their own guests. Gets a browser notification and an email when reception checks a guest in.
- **Reception**: sees every floor on one board, marks guests arrived and cleared, and sees whether the host was alerted.

A person has one account and can be on several floors, with a different role on each (for example admin of floor 6 and member of floor 7).

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

## Arrival notifications

Hosts get a browser push notification when their guest arrives. It works in Chrome, Edge, Firefox and Safari (macOS 13+). On iPhone/iPad (iOS 16.4+) the person must first add the site to their Home Screen and open it from there. Every alert is also sent by email, as a record in case the push is missed.

1. Generate keys once: `npx web-push generate-vapid-keys`
2. Put them in `.env` as `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`, and set `VAPID_SUBJECT` to `mailto:` plus a mailbox you own.
3. Push needs HTTPS in production (`localhost` works for testing).

Keep the same keys forever. Changing them stops every existing subscription; people would have to turn alerts on again.

## Scripts

- `npm run dev` — local app
- `npm run build` — production build
- `npx prisma migrate deploy` — apply database migrations
- `npx prisma db seed` — create the 6th floor and the super admin
