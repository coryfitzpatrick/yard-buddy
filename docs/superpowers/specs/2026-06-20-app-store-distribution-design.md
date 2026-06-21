# App Store Distribution (Capacitor wrapper) — design

**Date:** 2026-06-20
**Status:** Draft, awaiting implementation plan
**Author:** brainstorming session, Claude + Cory

---

## Goal

Get Yard Analyzer downloadable from the Apple App Store and Google Play Store with a single source of truth (the existing Next.js app), modest ongoing maintenance burden, and two genuinely native capabilities (push notifications + biometric login) that justify the app's existence beyond a website wrapper. The mobile apps are thin native shells around the live `yardanalyzer.com` web app, plus native bridges for the two capabilities above.

## Non-goals

- Offline mode. (Possible future; would require local-asset bundling.)
- Native camera capture beyond what the standard `@capacitor/camera` plugin provides.
- Rewriting any UI in React Native.
- Apple In-App Purchase integration. Subscriptions stay on the web only.
- Independent mobile-only features. The mobile app is feature-equivalent to the web app, minus paywall-related surfaces.
- Web push (PWA-style). Only native iOS/Android push via APNs/FCM.
- Push delivery as a wholesale replacement for email. Email continues to handle digests, billing, trial reminders, account changes; push handles only time-sensitive task/weather events.
- (none — refresh-token pattern handles OAuth and credentials users equivalently)

## Decisions made during brainstorming

| # | Question | Decision |
|---|---|---|
| 1 | Why be in the stores? | **A** (initially) — discoverability + install ease. Expanded mid-design to include push notifications and biometric login as load-bearing native features. |
| 2 | How to handle existing Stripe subscriptions? | **A** — hide all paywall UI in-app. Subscriptions happen on the web only. |
| 3 | Architectural approach | **Approach 1** — Capacitor wrapping the live `yardanalyzer.com` URL with native plugins. |
| 4 | Push notification scope | **C** — push for time-sensitive events only ("mow tomorrow before rain," "best GDD day is today," "pre-emergent window opens"). Email continues to handle weekly digests, billing, trial reminders, and account events. |
| 5 | Biometric login security model | **A** initially (cache session JWT) → revised to **refresh-token pattern** mid-implementation. Discovery: NextAuth's session cookie is HttpOnly, so `document.cookie = token` cannot set it from JS. Rather than work around with a `/api/auth/biometric-unlock` endpoint that re-issues the SAME session cookie (Option 1), pivoted to a server-issued refresh token stored in Keychain. The refresh token is exchanged via `/api/auth/biometric-exchange` for a fresh session cookie. Per-device revocable, rotates on each use, stronger audit story, aligns with RFC 8252 (OAuth for native apps). |

## Architecture

### Repo layout

```
yard-analyzer/
├── app/                  existing Next.js App Router (unchanged)
├── lib/                  existing (gains `lib/platform.ts`)
├── components/           existing (gains <NotInApp> wrapper + a few platform-aware variants)
├── ios/                  NEW: Capacitor-generated Xcode project (committed)
├── android/              NEW: Capacitor-generated Android Studio project (committed)
├── mobile/               NEW: Capacitor-specific assets + runbook
│   ├── icons/            1024x1024 master + generated sizes
│   ├── splash/           2732x2732 master + generated sizes
│   └── README.md         build/release runbook
├── capacitor.config.ts   NEW: at repo root
└── package.json          adds @capacitor/* deps
```

### Single-repo rationale

- The web app is the source of truth; the mobile shell loads it. Splitting repos would version-skew app config against web behavior.
- The "hide paywall in-app" conditional UI lives in the existing Next.js code and needs to be in the same repo.
- One `git push` deploys both web and (when manually triggered) the mobile rebuild.

### Why `ios/` and `android/` are committed

They contain Xcode/Android Studio project config that Capacitor only regenerates on demand. Committing them means reproducible builds without re-running `npx cap add`. A targeted `.gitignore` excludes the per-build artifacts (`Pods/`, `build/`, `*.xcuserdata/`).

### Capacitor configuration

```ts
// capacitor.config.ts
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.yardanalyzer.app",
  appName: "Yard Analyzer",
  webDir: "public",  // irrelevant for remote-loaded apps but required field
  server: {
    url: "https://yardanalyzer.com",
    cleartext: false,
  },
  appendUserAgent: "YardAnalyzerApp/1.0",
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: "#1a4d2e",  // matches brand
      launchAutoHide: true,
    },
    StatusBar: {
      style: "DARK",
    },
  },
};

export default config;
```

- `server.url` points to production. A staging/preview build flips this to `https://staging.yardanalyzer.com` (or similar).
- `appendUserAgent` is the load-bearing identifier that lets the web app detect "I am running inside the mobile app."

## Native plugin set

Eight plugins. Six are official Capacitor; one is the well-maintained community biometric plugin; FCM is invoked indirectly via the official push plugin.

| Plugin | Purpose | Justification for App Store review |
|---|---|---|
| `@capacitor/splash-screen` | Branded launch splash | Required native UX polish |
| `@capacitor/status-bar` | Theme-aware status bar | WebView content sits under a styled bar |
| `@capacitor/app` | Deep links, Android back button, app lifecycle | Required for `yardanalyzer://`-style URL handling |
| `@capacitor/browser` | Opens external URLs in in-app Safari/Chrome | Critical for OAuth and Stripe redirects: opens in system browser via SFSafariViewController, returns control to the app afterwards |
| `@capacitor/share` | Native iOS/Android share sheet | Native capability for sharing lawn reports |
| `@capacitor/camera` | Native camera capture | Native capability for higher-quality lawn photos |
| `@capacitor/push-notifications` | APNs (iOS) + FCM (Android) registration, permission flow, and message receipt | **Load-bearing native capability #1.** Triggers real OS-level system permission dialog ("Allow notifications from Yard Analyzer?"). Receives device tokens that the web backend uses to deliver targeted reminders. The web app cannot do this. |
| `@aparajita/capacitor-biometric-auth` | Face ID / Touch ID / Android biometric prompt | **Load-bearing native capability #2.** Uses iOS Keychain and Android Keystore (hardware-backed on supporting devices) to store the session token and gates re-access on biometric verification. The web has nothing equivalent. |

Push + biometric are the unmistakable "this is a real native app" capabilities for App Store reviewers. The share/camera/browser/app plugins remain in scope as supplementary native bridges, and the splash + status-bar plugins handle launch polish.

## Conditional UI: hiding the paywall in-app

### Detection (two-layer)

```ts
// lib/platform.ts
import { headers } from "next/headers";

export async function isMobileApp(): Promise<boolean> {
  const ua = (await headers()).get("user-agent") ?? "";
  return ua.includes("YardAnalyzerApp/");
}

export function isMobileAppClient(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.userAgent.includes("YardAnalyzerApp/");
}
```

Two helpers because Server Components need the gate at render time (e.g. redirecting `/pricing`) while client components need it during hydration (e.g. the trial-countdown banner).

### What's hidden in the app

| Surface | Browser | App |
|---|---|---|
| `/pricing` page | Full pricing tiers + Subscribe CTAs | `redirect("/dashboard")` |
| Trial-ending banner | "X days left — upgrade to Pro" | Hidden entirely |
| Dashboard upgrade CTA cards | Visible | Hidden |
| Settings → Billing tab | Full subscription management | Hidden tab; user can't reach it |
| Locked-feature paywall modals | "Upgrade to access" + Subscribe button | Replaced with "This feature requires the Pro plan" (no link, no Subscribe button) |
| Login screen "no account?" link | "Sign up" → `/register` | "Need an account? Create one at yardanalyzer.com" (deliberately bland) |

### What's NOT hidden (intentional)

- That some features are locked. Apple is fine with "this is a Pro feature" messaging.
- Account settings (email change, password, notifications). Not paywall.

### Implementation surfaces

- `components/NotInApp.tsx` — client-side conditional wrapper: `<NotInApp>{paywall content}</NotInApp>` renders children only when `!isMobileAppClient()`.
- Server-side `redirect()` at the top of `/pricing/page.tsx`.
- `(dashboard)/settings/page.tsx` filters the Billing tab from its Tabs config when `await isMobileApp()`.
- Login form copy variant based on `isMobileAppClient()`.

### Apple compliance note on copy

"Create an account at yardanalyzer.com" is the safest possible mention of external signup. Avoid anything that says "subscribe," "buy," "upgrade," or directly mentions pricing on the web side. Apple's 2024+ guidelines allow link-out mentions but penalize anything that reads like explicit purchase-steering.

## Push notifications

### Provider

**FCM (Firebase Cloud Messaging) for both iOS and Android.** FCM relays to APNs under the hood for iOS, so we maintain one SDK (`firebase-admin` server-side) and one credential surface. Alternatives considered: direct APNs + FCM (two integrations, more control, more code) and third-party (OneSignal, Pusher Beams, Knock — vendor lock-in, monthly cost). FCM is the lowest-friction option that keeps everything in-house.

### Setup additions

- Create a Firebase project (free tier covers our message volume by orders of magnitude).
- iOS: upload APNs auth key to Firebase console (one-time, in Apple Developer Account → Keys).
- Android: download `google-services.json` and place in `android/app/`.
- iOS: download `GoogleService-Info.plist` and place in `ios/App/App/`.
- Server: download Firebase service account JSON, store as `FIREBASE_SERVICE_ACCOUNT_JSON` (single-line JSON) on Vercel.
- Add `firebase-admin` to npm deps.

### What events trigger a push

Per question 4 (decision C — time-sensitive only):

| Event | Trigger | Push body example |
|---|---|---|
| Best-day GDD task hits its window | Daily-tasks cron, when `bestDay` is today | "Today is the best day to apply pre-emergent." |
| Weather warning before scheduled outdoor task | Daily-tasks cron, when scheduled task has rain/wind/etc. in the forecast | "Heavy rain tomorrow. Reschedule mowing?" |
| Pre-emergent window opens | Daily-tasks cron, on `isPreEmergentApplicable` first-true transition | "Soil temps just hit the pre-emergent window for your zone." |
| Grub alert window opens | Daily-tasks cron, on `isGrubAlertApplicable` first-true transition | "Grub treatment window opening in your area this week." |
| Overseeding window opens | Daily-tasks cron, on `isOverseedingApplicable` first-true transition | "Overseeding window opening in your area this week." |

Each trigger lives inside the existing `daily-tasks` cron alongside the email-send fan-out. Email continues to ship its existing content; push is additive (not replacement) only for these five categories.

### Data model addition

```prisma
model DeviceToken {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  token       String   @unique
  platform    String   // "ios" | "android"
  createdAt   DateTime @default(now())
  lastUsedAt  DateTime @default(now())
  failureCount Int     @default(0)

  @@index([userId])
}
```

`failureCount` tracks consecutive FCM "unregistered" or "invalid token" responses; tokens with `failureCount >= 3` get pruned (FCM returns these when the user uninstalls or revokes notifications). New migration with `ALTER TABLE … ENABLE ROW LEVEL SECURITY` per project convention.

### Backend endpoints

- `POST /api/devices/register` (authenticated) — body `{ token: string, platform: "ios" | "android" }`, upserts a `DeviceToken` row keyed on the token (handles re-registration after app reinstall).
- `DELETE /api/devices/:id` (authenticated) — called on user logout to drop the device's token immediately (avoids "ghost" pushes to a signed-out device).
- `POST /api/notifications/unsubscribe-push` (signed token in URL, same shape as the existing email unsubscribe) — for one-tap "stop sending me notifications" from a push action button.

### Permission flow

1. User logs in for the first time on the app.
2. On dashboard mount, a one-time client-side hook checks: "is this Capacitor + has the user not yet been prompted?" Tracked client-side via `Preferences` (Capacitor's storage plugin).
3. If yes, show a custom in-app explainer first: "Yard Analyzer can remind you about time-sensitive lawn care (best days for pre-emergent, weather warnings)." Two buttons: "Enable Notifications" and "Maybe Later."
4. If they tap Enable: call `PushNotifications.requestPermissions()`. On grant, call `PushNotifications.register()`, capture the FCM token from the `registration` listener, POST to `/api/devices/register`.
5. On deny: respect it, mark the preference, never re-prompt (Apple guideline; constant re-prompts get apps rejected).
6. User can re-enable later via Settings → Notifications → "Push notifications."

### Send path

`lib/push/send.ts` exposes one function:

```ts
export async function sendPushToUser(userId: string, payload: {
  title: string;
  body: string;
  data?: Record<string, string>;
}): Promise<void>
```

Internally: fetch all `DeviceToken` rows for the user, batch-send via `firebase-admin`'s `messaging().sendEachForMulticast(...)`, increment `failureCount` on per-token errors, prune at threshold. The send is fire-and-forget within the cron — wrapped in a try/catch so push failures don't kill the cron (the existing email path still runs).

### Observability hooks (using the brand-new observability layer)

- New typed event: `push.delivery` — emitted on each `sendPushToUser` call with `{ userId, success: boolean, tokens: number, errors: number, kind: "best_day" | "weather" | "preemergent" | ... }`.
- Dashboard panel: push delivery success rate over time.
- Alert: if push delivery success rate drops below 80% over 1 hour (catches FCM outages or stale-token accumulation).

## Biometric login

### Storage model — refresh-token pattern (NOT the session JWT)

iOS Keychain + Android Keystore, accessed via `@aparajita/capacitor-biometric-auth`. Both are hardware-backed on modern devices (Secure Enclave on iPhone, StrongBox on Pixel). The plugin handles per-platform availability checks, biometric type detection (Face ID vs Touch ID vs Fingerprint vs Iris), and falls back to device passcode if biometrics aren't available.

**What's stored: a server-issued refresh token, NOT the NextAuth session JWT itself.** The refresh token is opaque to the client (random 256-bit value, base64-encoded) and only useful when presented to the `/api/auth/biometric-exchange` endpoint. The server stores a SHA-256 hash of the token (not the plaintext) keyed by `(userId, deviceId)` in a new `BiometricRefreshToken` Prisma model.

**Why refresh tokens instead of caching the session JWT:**
- **Per-device revocation:** "lost phone" can wipe that device's refresh token without logging the user out of laptop/tablet.
- **Exfiltration is single-purpose:** a stolen refresh token only works against our exchange endpoint, which can rate-limit, geofence, and log. A stolen session JWT works against the entire API directly.
- **Token rotation:** each successful exchange issues a new refresh token + invalidates the old, so the exposure window for any leaked token is one cold launch.
- **Independent TTL:** refresh token can live 90 days; session JWT (re-issued on exchange) stays at NextAuth's default 30 min lifetime — defense-in-depth.
- **OAuth 2.0 alignment:** RFC 8252 recommends refresh tokens for native apps. Easier security audit story.

### Data model

```prisma
model BiometricRefreshToken {
  id                String    @id @default(cuid())
  userId            String
  user              User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash         String    @unique  // sha256(plaintext)
  deviceFingerprint String?              // optional: platform + app version + UA hash; informational only
  createdAt         DateTime  @default(now())
  lastUsedAt        DateTime  @default(now())
  revokedAt         DateTime?            // null = active; non-null = revoked, do not honor

  @@index([userId])
}
```

Plus `biometricRefreshTokens BiometricRefreshToken[]` back-reference on the `User` model. New migration includes `ALTER TABLE … ENABLE ROW LEVEL SECURITY` per project convention.

### Backend endpoints

- `POST /api/auth/biometric-issue` (authenticated) — generates a fresh 256-bit refresh token, stores `sha256(token)` in DB, returns plaintext to client (only chance to see it). Body: optional `{ deviceFingerprint?: string }`. Response: `{ token, id }`.
- `POST /api/auth/biometric-exchange` (unauthenticated) — body `{ token: string }`. Looks up the row by `tokenHash = sha256(token)`, rejects if not found, revoked, or last used > 90 days ago. On success: issues a new session JWT via `next-auth/jwt` encode, sets the session cookie with matching attributes (HttpOnly, Secure in prod, SameSite=Lax, correct name `authjs.session-token` / `__Secure-authjs.session-token`), rotates the refresh token (new token replaces old, old row marked revoked), returns the new refresh token. Client overwrites the Keychain entry with the new token.
- `POST /api/auth/biometric-revoke` (authenticated) — body `{ id?: string }`. With id: revokes that specific row (per-device logout). Without id: revokes all rows for the user (full reset). Called on logout (per-device) and from future Settings → Devices UI (per-device or all).

### Helper module

`lib/auth/biometric-refresh.ts` exports:
- `generateRefreshToken(): { token: string; hash: string }` — `randomBytes(32).toString("base64url")` + `sha256(token).hex`
- `hashRefreshToken(token: string): string` — `sha256(token).hex`
- `validateAndConsume(token: string): Promise<{ userId: string; rowId: string } | null>` — checks DB, returns userId on success (or null if invalid/revoked/expired)
- `issueSessionCookie(userId: string, response: NextResponse): Promise<void>` — encodes a NextAuth JWT with `userId` claim, sets cookie via `Set-Cookie` header with NextAuth's exact attributes for the current environment

### Opt-in flow

1. User successfully logs in (password or OAuth) inside the app.
2. After session is established, a one-time prompt appears: "Sign in faster next time with Face ID?" (system biometric name detected dynamically — "Touch ID," "Fingerprint," etc.).
3. Two buttons: "Enable" and "Not Now."
4. If Enable:
   - App POSTs to `/api/auth/biometric-issue` to get a fresh refresh token.
   - App stores the token in Keychain via `BiometricAuth.setBiometricCredentials({ server: "yardanalyzer.refresh", username: "session", password: token })`.
   - Trigger a single biometric verification to confirm the device has working biometrics.
   - Set `Preferences.biometricEnabled = true`.
5. On Not Now: respect, never re-prompt automatically (re-enable via Settings → Account → "Sign in with Face ID" — Group 7 work).

### Cold-launch unlock flow

1. App opens. `App` plugin emits `appStateChange` (active).
2. Client checks `Preferences.biometricEnabled`. If false → normal web flow, NextAuth session cookie persists across launches (default behavior, nothing new).
3. If true:
   - Check if the current NextAuth session is still valid (call `/api/auth/session`).
   - If valid → app is logged in, no prompt.
   - If invalid/expired → prompt biometric. On success:
     - Read refresh token from Keychain.
     - POST to `/api/auth/biometric-exchange` with the token.
     - Server validates, rotates the token (returns a new one), sets the session cookie via `Set-Cookie` header (HttpOnly, NextAuth-compatible).
     - Client overwrites the Keychain entry with the new refresh token returned in the response.
     - Reload the page; new session cookie is in effect, app is logged in.
   - On biometric failure or cancel → fall through to normal login screen.

### Logout behavior

Logout (whether triggered by user action, server-side session revocation, or 401 from any API call):
1. POST to `/api/auth/biometric-revoke` to mark this device's refresh token row `revokedAt = now()` in DB.
2. Clear the Keychain entry via `BiometricAuth.deleteBiometricCredentials({ server: "yardanalyzer.refresh" })`.
3. Clear `Preferences.biometricEnabled`.
4. Call the existing NextAuth `signOut()` to drop the session cookie.

Re-enabling requires logging in again and re-opting in (new refresh token is issued).

### Edge cases

- **Biometric disabled in OS settings.** Plugin returns "not available." App skips the prompt entirely and uses the normal login flow.
- **Biometric failed 3 times in a row.** iOS locks biometric for some duration. Plugin returns "lockout." App falls back to manual login.
- **User changes device biometrics (new finger registered, Face ID reset).** iOS Keychain has an option to invalidate on biometric change; we enable it. Effect: refresh token gets wiped from Keychain, user has to re-login + re-opt-in. The DB row stays but is effectively orphaned until garbage-collected (revoke-all on next login).
- **OAuth users.** Same flow — biometric stores a refresh token, not a password, so OAuth and credentials users get equivalent UX. The refresh token is independent of how the original session was established.
- **Stolen device, attacker bypasses lockscreen.** Refresh token is in biometric-protected Keychain; attacker needs the user's face/finger to read it. If they have that, they could just use the unlocked phone normally. No additional risk surface vs. a normal phone-lock bypass.
- **Refresh token compromised via Keychain exfiltration (hypothetical OS-level malware).** Attacker still has to hit `/api/auth/biometric-exchange` from a network we can monitor. We log exchange attempts; high-volume or geographically-anomalous exchange traffic can trigger alerts. Token rotation means a leaked token is invalidated the moment the legitimate user does a cold-launch unlock.

### Deferred to Group 7: Settings → Devices revocation UI

A list view of all the user's active refresh tokens (one per biometric-opted-in device) with revoke buttons. Out of Group 5 scope; provides the user-facing entry point for per-device revocation that the data model already supports. ~half day of work.

## Auth flow in the WebView

NextAuth 5's cookie-based session model works inside Capacitor's WebView with minimal adjustment. The two subtle items:

1. **OAuth/email magic-link redirects.** If a redirect lands inside the WebView and crosses an origin boundary (e.g. Google's OAuth page), the user can get trapped. Mitigation: detect OAuth click events client-side and route the URL through `@capacitor/browser` (`Browser.open({ url })`), which opens it in the system browser. Once auth completes, the redirect lands on a `https://yardanalyzer.com/api/auth/...` deep link that Universal Links / Android App Links opens back in the app.
2. **Session cookie persistence.** NextAuth's cookies are HttpOnly and SameSite=Lax by default. WebView preserves them across launches. Verified working pattern; no code changes required.

## Build & release pipeline

### One-time setup (~half a day)

| Step | Cost |
|---|---|
| Apple Developer account | $99/year |
| Google Play Developer account | $25 one-time |
| iOS code-signing certs + provisioning profile (auto via Xcode) | Free |
| Android keystore (`keytool`-generated, backed up in 1Password + offline) | Free |
| App Store Connect listing (`com.yardanalyzer.app`, metadata) | Free |
| Google Play Console listing | Free |
| Icons (1024×1024 master → all sizes via `@capacitor/assets`) | Free |
| Splash (2732×2732 master → all sizes) | Free |
| Screenshots (6.5", 5.5", iPad, Android phone/tablet — 3+ each) | Free |
| Store metadata: description, keywords, support URL, privacy policy URL | Free |

### Per-release pipeline (manual, ~30 min once familiar)

```bash
# 1. Bump version in capacitor.config.ts + package.json
# 2. Sync Capacitor changes into native projects
npx cap sync

# 3. iOS — open in Xcode, archive, upload
npx cap open ios
# Product → Archive → Distribute App → App Store Connect → Upload

# 4. Android — open in Android Studio, build signed bundle, upload
npx cap open android
# Build → Generate Signed Bundle → AAB → Upload to Play Console
```

### Automation: deferred until pattern is boring

First 2-3 releases stay manual. Automation pays off once releases are boring and predictable, not while still learning the consoles' quirks. Future options when ready: **Codemagic** (free tier, mobile-specific, recommended for solo) or **GitHub Actions + Fastlane** (more setup, full control).

### Versioning convention

- Web: continuous (whatever's on `main`).
- Mobile: semver (`1.0.0`, `1.0.1`, ...) bumped manually in `capacitor.config.ts` + `package.json`, tagged in git as `mobile-v1.0.0`.
- Mobile version is independent of web version. Different cadences.

## Apple App Store review strategy

In the **App Review Information** field at submission time, explicitly list native features:

> Native push notifications via APNs for time-sensitive lawn care reminders (best-day GDD task windows, weather warnings, agronomic windows opening). Face ID / Touch ID biometric login via iOS Keychain. Native share sheet for sharing lawn analysis reports. Native camera capture for higher-quality lawn photos. Universal Links (`https://yardanalyzer.com/yard/...`) open directly in the app. External links (Stripe billing portal, OAuth providers) open in system browser via SFSafariViewController for security and UX.

### Rejection recovery path

With push + biometric in the initial plugin set, 4.2 rejection risk is effectively eliminated. Push alone is what most rejected wrappers add and pass on resubmission. Other rejection categories to be ready for:

- **Privacy nutrition label mismatch.** Apple cross-checks declared data collection against actual API behavior. Mitigation: be exhaustive in the App Store Connect privacy questionnaire (collect: email, name, location-by-ZIP, photo, device token, usage analytics).
- **Permissions usage strings.** iOS requires a clear `NSCameraUsageDescription`, `NSPhotoLibraryAddUsageDescription`, etc. in `Info.plist`. Vague or missing strings get bounced. Bake explicit, user-readable strings into `ios/App/App/Info.plist`.
- **Sign-In-with-Apple parity.** If the app offers any third-party social sign-in (Google, etc.), it MUST also offer Sign In with Apple. NextAuth supports it; we'll add it if any other social provider is enabled. If only email/password, this rule doesn't apply.

Typical resubmission turnaround when corrections are needed: ~24h Apple, ~hours Google.

### Google Play

Much more lenient. Pixel-quality icon, store listing, age rating, content guidelines — usually approved in 1-3 hours. Not a meaningful review risk.

## Ongoing maintenance

### No app rebuild needed (the common case)

- New features, bug fixes, UI tweaks, copy changes, content updates
- Database schema, API additions
- Cron jobs, observability, performance tuning
- Anything in `app/`, `lib/`, `components/`, `prisma/`

All propagates instantly to mobile users on next app open.

### App rebuild required (rare)

| Trigger | Frequency | Effort |
|---|---|---|
| Capacitor major version bump | ~1/year | ~1 day (regenerate native projects, test plugins) |
| New native plugin added | At discretion | Same-day if standard plugin |
| Icon or splash redesign | At discretion | ~30 min |
| Apple-required iOS deployment-target bump | ~1/year (post-WWDC) | ~30 min |
| Google-required `targetSdkVersion` bump | ~1/year (Aug deadline) | ~30 min |
| Privacy manifest / data declaration changes | When required | Variable |
| Critical bug in the native shell | Rare | Hours |

Realistic cadence: **2-4 mobile releases per year**, all platform-maintenance-driven.

### Annual costs

- Apple Developer: **$99/year** (auto-renews; lapsing = de-listed)
- Google Play Developer: **$0** after $25 one-time
- Total: **~$99/year**

### Forgot-about-it failure modes

1. Apple Developer renewal lapses → apps removed within ~weeks. **Calendar reminder 30 days before renewal.**
2. Apple/Google deprecate SDK version → store rejects new submissions. **Watch developer dashboards for warnings (6-month windows typical).**
3. Lost Android keystore → can't update Android app, ever. **Back up to 1Password + offline drive on day 1.**

## Testing strategy

- **Web tests stay unchanged.** The Next.js app behaves identically whether served to a browser or a Capacitor WebView; existing vitest suite covers the underlying logic.
- **New unit tests:**
  - `lib/__tests__/platform.test.ts` covers `isMobileApp()` and `isMobileAppClient()` against fixture user-agents.
  - `lib/push/__tests__/send.test.ts` covers `sendPushToUser` with mocked `firebase-admin`: success path, partial failure path, full failure pruning at `failureCount >= 3`.
  - `app/api/devices/__tests__/register.test.ts` covers the device-token registration endpoint (upsert behavior, auth required).
  - `lib/push/__tests__/triggers.test.ts` covers each of the 5 trigger predicates (`shouldPushBestDay`, `shouldPushWeatherWarning`, etc.) over fixtures.
- **Component test:** `components/__tests__/NotInApp.test.tsx` verifies conditional render.
- **Manual smoke testing per app release:**
  - Login flow on iOS simulator + real device
  - Login flow on Android emulator + real device
  - Push permission prompt (first launch, accept → token registered server-side, verify via DB query)
  - Push permission prompt (deny → no re-prompt on next launch)
  - Receive a push: trigger a test send via `npx tsx scripts/push/send-test.ts <userId>` and verify both iOS + Android receive it
  - Biometric opt-in prompt after first login
  - Biometric unlock on cold launch (session token unlocks from Keychain)
  - Biometric failure → manual login fallback
  - Logout clears Keychain + biometric preference
  - Photo upload (camera + library picker)
  - Share a lawn report via share sheet
  - Open external link (Stripe billing → returns to app)
  - Pull-to-refresh behavior
  - Deep link from email (`yardanalyzer.com/yard/abc123`) → opens in app, not Safari

No automated mobile end-to-end testing in v1 (Detox/Appium overhead not justified at this scale).

## Rollout

1. **Land all repo changes in one branch + PR.** Includes Capacitor config, plugin installs, `lib/platform.ts`, `<NotInApp>` wrapper, paywall surface gates, generated `ios/` and `android/` projects, mobile assets, runbook.
2. **Verify web app is unchanged when no UA token present.** Existing browser users see no difference.
3. **Build iOS and Android locally.** Test on simulator + real device for the smoke-test checklist.
4. **Submit to TestFlight (iOS) and Google Play Internal Testing.** Self-test for 2-3 days.
5. **Submit to App Store + Google Play production review.** Expect Apple review 1-7 days; Google Play 1-3 hours.
6. **First public release.** Monitor app crash rates via App Store Connect + Play Console for the first week.
7. **Document the runbook.** `mobile/README.md` captures everything learned during the first release for the next one to be smooth.

## Risks & mitigations

- **Apple 4.2 rejection.** Mitigated by push + biometric as the load-bearing native capabilities (each is something a website fundamentally cannot do). Recovery path documented. Risk now effectively eliminated.
- **OAuth redirect getting trapped in WebView.** Mitigated by `@capacitor/browser` routing for external auth providers. Tested on both platforms before submission.
- **Apple subscription-rule enforcement.** Mitigated by aggressive paywall hiding + bland external-signup copy. If Apple complains, we can hide even the "create an account at yardanalyzer.com" hint and rely on users signing up via web independently.
- **Lost Android keystore.** Mitigated by day-1 backup procedure (1Password + offline drive + git-encrypted secondary backup).
- **Maintenance debt from stale Capacitor/SDK versions.** Mitigated by calendar reminders + the small but real ~30 min/quarter time budget for platform-maintenance updates.
- **FCM service account credential leak.** The Firebase service account JSON has push-send authority for all users. Mitigated by storing only on Vercel env vars (never in repo), rotating annually, and scoping the IAM role to FCM-only (no other Firebase services granted).
- **Stale push tokens accumulating.** Mitigated by `failureCount`-based pruning (3 strikes and the token is deleted) plus periodic batch cleanup in the monthly cost-report cron.
- **Push notification fatigue.** Per question 4 (C), only 5 trigger categories ship pushes, and each has natural rate limits (best-day fires once per task; weather warning fires once per scheduled task; window-opening events fire once per season transition). Realistic worst-case: ~2-3 pushes per user per week. Add a global per-user "max 1 push per 4 hours" rate limit if real-world data shows higher.
- **Biometric storage compromise.** Mitigated by storing only a server-issued refresh token (not the session JWT, not the password) which is single-purpose (only works against `/api/auth/biometric-exchange`), rotates on every use, and is per-device revocable from the future Settings → Devices UI. A leaked token's effective TTL collapses to one cold-launch unlock by the legitimate user (rotation invalidates the old token). If a device is lost, the user can revoke that device's row from another logged-in session.
- **Exchange-endpoint abuse.** `/api/auth/biometric-exchange` is unauthenticated by design (it's how you become authenticated). Mitigated by rate-limiting per IP and per token-hash, logging all attempts to Axiom with `userId` (derived from the validated token) so anomalous patterns (high-volume, geo-anomalous) surface as observability alerts.

## Out of scope (explicit, may be future projects)

- Offline mode via local-asset bundling
- Apple In-App Purchase integration
- React Native rewrite
- Desktop apps (Tauri, Electron)
- Watch / wearable companions
- Push delivery as a wholesale replacement for email (digests stay on email; push is additive for time-sensitive only)
- Web push (PWA-style notifications) — only native iOS/Android
- Biometric for OAuth-only flows in v1 — the session-token Keychain pattern works equivalently for both, no separate code path needed
- Rich push (images, action buttons beyond default tap-to-open) — text-only in v1; rich payloads are a Capacitor-level feature add later if engagement warrants
- Push delivery via direct APNs (separate iOS pipeline) — FCM handles both platforms in v1
