# Arrival Desk — Android app

The floor-staff app for Arrival Desk. Floor staff and floor admins can:

- see their guests for a day, and add, edit, cancel, restore or delete them
- use the **Calendar** (day and week) — guests who arrive stay on it, struck through
- get a **phone alert with the arrival chime** when reception taps *Arrived*
  (an email is still sent too, as a record)

Reception and super-admin work stays on the website.

The app talks to the website's `/api/mobile/*` routes, so the rules (who can
see or edit which guest) are exactly the same as on the website.

## Run it

```bash
cd mobile
flutter pub get
flutter run                     # uses the live site (see lib/config.dart)
flutter run --dart-define=API_URL=http://10.0.2.2:3000   # local dev server, Android emulator
```

Release APK for installing on phones:

```bash
flutter build apk --release      # build/app/outputs/flutter-apk/app-release.apk
```

> Release builds are signed with the debug key for now. Before publishing to
> Google Play, create an upload key and add a `signingConfig` in
> `android/app/build.gradle.kts`.

## Turn on phone alerts (Firebase)

The app builds and works without Firebase; you just won't get phone alerts
(emails still go out). To turn them on:

1. Go to <https://console.firebase.google.com>, **Add project** (Analytics not needed).
2. In the project, **Add app › Android**. Package name: `com.crossroadstech.arrival_desk`.
3. Download **`google-services.json`** and put it at `mobile/android/app/google-services.json`.
   (It's git-ignored; keep a copy somewhere safe.) Rebuild the app.
4. **Project settings › Service accounts › Generate new private key.** This downloads a JSON key
   for the server. Keep it secret.
5. Add it to the website's environment as `FIREBASE_SERVICE_ACCOUNT`, either the JSON on one line
   or base64-encoded (`base64 -w0 key.json`). Locally that's `.env`; on Vercel it's
   *Settings › Environment Variables*, then redeploy.
6. In the app: **Settings › Arrival alerts › Turn on alerts**, then **Send a test alert**.

## How alerts work

- Reception taps **Arrived** → the website sends the host a browser push, a Firebase alert to
  every phone they're signed in on, and an email, all at once (`lib/notify.ts`, `lib/fcm.ts`).
- Alerts use the Android channel **"Guest arrivals"** with the custom chime
  (`android/app/src/main/res/raw/arrival.wav`) and the white "A" status-bar icon.
- If alerts don't show up, the app's *Settings › Not getting alerts?* has the phone settings to check
  (notification channel, battery "Unrestricted", Do Not Disturb).

## Layout

```
lib/
  main.dart              app start, sign-in gate
  config.dart            website address (API_URL)
  api.dart               /api/mobile client
  session.dart           sign-in, floors, chosen floor
  notifications.dart     Firebase alerts + the "Guest arrivals" channel
  guest_loader.dart      loads a date range, refreshes every 30 s / on alert / on resume
  dates.dart, models.dart, theme.dart, widgets.dart
  screens/               login, home, guests, calendar, guest sheet, guest form, settings
```

Times shown in the app ("2:30 PM") and "today" come from the server in office
time, so a phone with the wrong clock or time zone still shows the right thing.
