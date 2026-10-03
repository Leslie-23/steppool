# StepPool

Walk. Hit your goal. Share the pool.

Players join a challenge (48h, 7d or 30d). Each player gets a **personal goal** based on their own usual week. **Everyone who hits their goal splits the pool.** Rank is for bragging rights; payouts depend only on your goal.

- **Credits challenges**: entry costs demo credits (1,000 on signup). The pool is split between finishers. If nobody finishes, everyone is refunded.
- **Sponsored challenges**: free to enter, and a brand funds a cash/airtime prize for finishers, claimed via MoMo. This is a promotion, not a wager.
- No real-money entry. `PAID_ENTRY_ENABLED` exists but is off until legal review.

## Layout

```
app/         Expo Router screens (auth → onboarding → tabs, arena, results, create, join, claim)
components/  ds/ (design system: StepRing, Odometer, HoldButton, Particles, TabBar…), arena/, share/
lib/         api, session, socket, sync, health adapters (HealthKit / Health Connect), haptics, share
theme/       colour/type tokens and motion presets
shared/      wire contracts (zod) and goal maths, used by app AND server
server/      Express + MongoDB + Redis + Socket.IO + BullMQ
targets/     iOS home/lock-screen widget (expo-apple-targets)
render.yaml  Render blueprint
```

## Run it

**Server** (needs MongoDB as a replica set, because transactions require one, plus Redis):

```bash
cd server && npm install
mongod --replSet rs0 --port 27017 --dbpath ./.mongo &   # once: mongosh --eval 'rs.initiate()'
npm run dev            # API on :4000. OTP codes come back in the response in dev
npm run worker:dev     # lifecycle jobs: start, last-hour push, settle, 5-min sweep
```

**App** (dev build required, because HealthKit, Health Connect, Skia and widgets are native):

```bash
npm install
EXPO_PUBLIC_API_URL=http://<your-lan-ip>:4000 npx expo run:ios     # or run:android
```

The Health screen has a "Skip (dev only)" button for the simulator.

## Sign-in options

- **Email code** works everywhere (Gmail SMTP via `MAIL_USER` / `MAIL_APP_PASSWORD`).
- **Sign in with Apple** is on for iOS (`usesAppleSignIn`). Server checks the token against Apple's keys with audience `APPLE_AUDIENCES`.
- **Google** is hidden until configured. In Google Cloud → Credentials create an **iOS** client (bundle `com.steppool.app`) and a **Web** client, then set:
  - app: `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, and at build time `GOOGLE_IOS_URL_SCHEME` (the iOS client's reversed id), then rebuild;
  - server: `GOOGLE_CLIENT_IDS` = both client ids, comma-separated.
- Accounts link automatically when Apple/Google report the **same verified email**; unverified emails never link.

## Verification (how steps are trusted)

Clients upload **raw samples** (interval, count, writer app, recording method), never totals. The server then:

1. Drops manual entries, untrusted writer apps (allowlist in `server/src/verify.ts`, extend with `EXTRA_TRUSTED_SOURCES`) and cadence above 250 steps/min.
2. Splits samples into UTC hours and takes the **max across sources** per hour, so phone and watch aren't double counted.
3. Holds **4+ consecutive hours at 9,000+/hour** (phone shaker or fan signature), judging runs whole even across later syncs.
4. Holds **late uploads that look nothing like the person**, for example days of 36k steps from a 6k/day walker. An honest late sync (the OS killed background sync) passes.

Held steps never count automatically. Review them at `GET /admin/challenges/:id/flags`.

## Tests

```bash
cd server
MONGOMS_SYSTEM_BINARY=$(which mongod) npm test         # unit + integration (Mongo replset + Redis db 9)
npm run simulate                                       # 100 players incl. shakers, fake apps, manual entry, dumpers
API_URL=http://localhost:4000 npx tsx scripts/smoke.ts # live API + worker + socket check
```

## Admin (sponsored challenges)

```bash
curl -X POST $API/admin/challenges -H "x-admin-key: $ADMIN_API_KEY" -H 'content-type: application/json' -d '{
  "name": "MTN Walk Week", "durationHours": 168, "entryCredits": 0, "visibility": "public",
  "sponsor": { "name": "MTN", "prizeDescription": "GH₵2,000 split between finishers", "prizeValueGhs": 2000 }
}'
# GET /admin/payouts?status=claimed → pay via MoMo → POST /admin/payouts/:id/fulfill
# GET /admin/ledger/check → { sum: 0, mismatchedUsers: [] }
```

## Deploy (Render)

1. Create a MongoDB Atlas cluster and copy its connection string.
2. Render → New → Blueprint → this repo. Set `MONGO_URL` on both services, and `MAIL_USER` / `MAIL_APP_PASSWORD` (Gmail app password) for sign-in emails.
3. Set `APPLE_TEAM_ID` and `ANDROID_SHA256_FINGERPRINTS` so `/j/CODE` invite links open the app.
