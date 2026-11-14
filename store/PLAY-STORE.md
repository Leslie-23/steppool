# Google Play Console listing: StepPool

Package `com.steppool.app` · minSdk 26 · targetSdk 36 · bundle from `eas build -p android --profile production`

## 1. Create app
- **App name** (30): StepPool: Walk Challenges
- **Default language:** English (United States)
- **App or game:** App · **Free or paid:** Free
- Tick both declarations (Developer Program Policies, US export laws).

## 2. Main store listing
- **Short description** (80):
  Walk with friends, hit your own step goal and share the prize pool.
- **App icon** (512×512): `store/google-play-assets/icon-512.png`
- **Feature graphic** (1024×500): `store/google-play-assets/feature-1024x500.png`
- **Phone screenshots** (1080×2160, upload all six in order): `store/screenshots/google-play/`
- Tablet screenshots: optional, skip.

### Full description (4000)
```
StepPool turns everyday walking into a challenge you can actually win.

Join a challenge with your class, your office or your group chat. Everyone gets a personal step goal based on their own usual pace, so a desk worker and a marathon runner both have a real shot. Hit your goal before the timer runs out and you share the pool with everyone else who made it.

WALK YOUR WAY
• A live daily ring and your own daily target
• Streaks and a 7-day view to keep you moving
• "Beat me" nudges that tell you exactly how many steps to pass the next person

CHALLENGES THAT FEEL LIVE
• Leaderboards that update as everyone walks
• Feel every overtake
• Private challenges with a 6-character invite code, or open ones anyone can join
• Set how hard the goal is when you create a challenge

SPONSORED PRIZES, FREE TO ENTER
Brands sponsor challenges with real prizes for everyone who hits their goal. No entry fee, no purchase needed.

EARN CREDITS BY WALKING
Credits are free in-app points you use to enter challenges. Earn them every day you hit your target, with streak bonuses, weekly top-ups and referrals. Credits can't be bought and have no cash value.

FAIR FOR EVERYONE
Steps come from Health Connect and are verified on our side. Manual entries and step-faking apps don't count, so every challenge is fair.

SEE HOW YOU MOVE
30-day trends, the hours you walk most, streaks and your challenge record.

StepPool reads step data from Health Connect with your permission and never writes to it.

Google is not a sponsor of, and is not involved in, any StepPool challenge or prize. Official rules: https://steppool-web.onrender.com/rules
```

## 3. Store settings
- **Category:** Health & Fitness
- **Tags:** Step counter, Walking, Fitness tracker, Workout challenges (pick the closest offered)
- **Email:** leslieajayi27@gmail.com
- **Website:** https://steppool-web.onrender.com
- Phone: optional.

## 4. App content (Policy → App content)

### Privacy policy
https://steppool-web.onrender.com/privacy

### App access
All or some functionality is restricted → add instructions:
- **Name:** Review account
- **Username:** review@steppool.app
- **Password:** the 6-digit code (`REVIEW_CODE` in `~/steppool/.env` on the server; not stored in this repo)
- **Any other information:**
```
Tap "or use email", enter review@steppool.app, then enter the 6-digit code above as the sign-in code. No email is sent for this account. The app then asks for Health Connect step access; challenges still work with 0 steps if the device has no step history.
```

### Ads
No, my app does not contain ads.

### Content rating (IARC questionnaire)
- Email: leslieajayi27@gmail.com · Category: **All other app types**
- Violence, sexuality, language, controlled substances, gambling: **No** to all
- Users can interact or exchange content: **Yes** (display names and step totals on shared leaderboards; no chat, no user-uploaded media)
- Shares user's location: **No** · Allows purchases of digital goods: **No**
- Expected result: Everyone / PEGI 3.

### Target audience and content
- **Age groups:** 18 and over only (prizes and mobile-money payouts; also keeps the app out of the Families policy)
- Appeals to children: **No**

### News app · Government app
No · No

### Financial features
None of the listed features (credits are free points with no cash value; paid entry is switched off).

### Health apps
- **Activity and fitness** (step tracking and walking challenges). Nothing under medical or human-subjects research.

### Health Connect permissions declaration
| Permission | Use |
|---|---|
| `READ_STEPS` | Read step counts to show daily progress and verify each participant's total in a walking challenge. |
| `READ_HEALTH_DATA_IN_BACKGROUND` | Keep challenge leaderboards current and settle a challenge on time when the user hasn't opened the app. |

Justification text:
```
StepPool is a walking-challenge app. It reads step counts (and which app or device recorded them) from Health Connect to show the user's daily progress, rank them on the leaderboards of challenges they join, and verify whether they reached their goal when a challenge ends. Background read keeps leaderboards up to date and lets challenges settle on time without the user reopening the app. StepPool reads steps only, never writes to Health Connect, never uses health data for advertising and never sells it.
```

### Advertising ID
No, the app does not use an advertising ID.
(After uploading, confirm in the bundle's permission list that `com.google.android.gms.permission.AD_ID` is absent.)

### Data safety
- Collects or shares user data: **Yes**
- Encrypted in transit: **Yes**
- Users can request deletion: **Yes** · Delete-account URL: https://steppool-web.onrender.com/delete
- **Shared with third parties:** none (hosting, database, email and push providers are service providers)

All collected data: **required** unless noted, **not** processed ephemerally, purpose **App functionality** (plus **Account management** for email / user ID, and **Fraud prevention, security and compliance** for fitness info).

| Category | Data type | Notes |
|---|---|---|
| Personal info | Name | display name on leaderboards |
| Personal info | Email address | sign-in |
| Personal info | User IDs | account |
| Personal info | Phone number | optional: only when claiming a sponsored prize |
| Health and fitness | Fitness info | step counts and their source |
| Device or other IDs | Device or other IDs | push notification token |

Not collected: location, contacts, photos, files, messages, browsing history, financial info, diagnostics, analytics.

## 5. Release
1. **Testing → Closed testing** (or Internal testing first): create a release and upload the `.aab` from the EAS build page. Accept **Play App Signing**.
2. Release name: `1.0.0 (4)`. Release notes:
   ```
   First release of StepPool: walking challenges with friends, personal step goals and shared prize pools.
   ```
3. **Countries:** Ghana plus any others you want.
4. Personal developer accounts created after November 2023 must run a closed test with at least 12 testers for 14 days before Google unlocks Production.

### After the first upload: signing fingerprints
Play re-signs the app with its own key, so copy the **App signing key** SHA-1 and SHA-256 from Test and release → Setup → App signing, then:
- Add the SHA-1 to the Android OAuth client in Google Cloud / Firebase, otherwise Google sign-in fails in the Play-installed app.
- Add the SHA-256 to `ANDROID_SHA256_FINGERPRINTS` in `~/steppool/.env` on the server (comma-separated with the upload key's) and rerun `server/deploy/deploy.sh`, so invite links open the app.
