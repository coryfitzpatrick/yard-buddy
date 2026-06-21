# App Store Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Yard Analyzer to the Apple App Store and Google Play Store as a Capacitor wrapper around the live yardanalyzer.com web app, with native push notifications and biometric login as the load-bearing native capabilities, and aggressive paywall hiding so subscriptions stay on the web.

**Architecture:** Capacitor wraps the production URL in a WebView. The Next.js app detects "running inside the app" via a User-Agent token and conditionally hides paywall surfaces. Two real native capabilities — APNs/FCM push for 5 time-sensitive event types, biometric session-token unlock via iOS Keychain / Android Keystore — eliminate Apple's 4.2 "website wrapper" rejection risk. Single repo; `ios/` and `android/` projects committed alongside the existing Next.js code.

**Tech Stack:** Capacitor 6+, `@capacitor/{splash-screen,status-bar,app,browser,share,camera,push-notifications}`, `@aparajita/capacitor-biometric-auth`, `firebase-admin` (server-side push send), Next.js 16 App Router, Prisma, vitest. iOS 15+ / Android API 24+.

**Spec:** `docs/superpowers/specs/2026-06-20-app-store-distribution-design.md` (approved).

**Review checkpoints:** Seven logical groups. Stop after each group; user reviews before continuing.

**Prerequisites the engineer needs before Group 1:**
- macOS with Xcode 15+ installed (iOS builds require this; cannot be done on Linux/Windows)
- Android Studio installed
- Java 17 JDK (for Android Gradle builds)
- Apple Developer account ($99/year, takes 1-2 days to verify) — needed for Group 7 only
- Google Play Developer account ($25 one-time) — needed for Group 7 only
- Firebase project created at console.firebase.google.com — needed for Group 4

---

## Group 1 — Foundation: Capacitor + paywall detection

Single-shot: install Capacitor, generate the native projects, create the platform-detection helper. This group does NOT yet hide any paywall UI; it just stands up the detection mechanism.

### Task 1.1: Install Capacitor and create config

**Files:**
- Modify: `package.json` (auto via npm)
- Create: `capacitor.config.ts`

- [ ] **Step 1: Install Capacitor core + CLI**

Run:
```bash
npm install @capacitor/core @capacitor/cli
```
Expected: both added under `dependencies`. Versions `^7.x` or whatever npm resolves.

- [ ] **Step 2: Create `capacitor.config.ts` at the repo root**

```ts
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.yardanalyzer.app",
  appName: "Yard Analyzer",
  webDir: "public",
  server: {
    url: "https://yardanalyzer.com",
    cleartext: false,
  },
  appendUserAgent: "YardAnalyzerApp/1.0",
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: "#1a4d2e",
      launchAutoHide: true,
    },
    StatusBar: {
      style: "DARK",
    },
  },
};

export default config;
```

- [ ] **Step 3: Verify the config parses**

Run:
```bash
npx cap config --json
```
Expected: outputs the parsed config as JSON (no errors).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json capacitor.config.ts
git commit -m "Install Capacitor and add base config"
```

### Task 1.2: Generate iOS and Android native projects

**Files:**
- Create: `ios/` (large generated tree)
- Create: `android/` (large generated tree)

- [ ] **Step 1: Install platform packages**

Run:
```bash
npm install @capacitor/ios @capacitor/android
```

- [ ] **Step 2: Add iOS platform**

Run:
```bash
npx cap add ios
```
Expected: creates `ios/App/App.xcodeproj`, `ios/App/Podfile`, etc. CocoaPods runs automatically to install native dependencies.

- [ ] **Step 3: Add Android platform**

Run:
```bash
npx cap add android
```
Expected: creates `android/app/build.gradle`, `android/settings.gradle`, etc.

- [ ] **Step 4: Add build artifact ignores**

Append to `.gitignore`:
```
# Capacitor build artifacts
ios/App/Pods/
ios/App/build/
ios/App/App.xcworkspace/xcuserdata/
ios/App/App.xcodeproj/xcuserdata/
ios/App/App.xcodeproj/project.xcworkspace/xcuserdata/
ios/DerivedData/
android/.gradle/
android/app/build/
android/build/
android/local.properties
android/captures/
android/app/release/
```

- [ ] **Step 5: Verify both projects open**

Run:
```bash
npx cap open ios   # opens Xcode
npx cap open android  # opens Android Studio
```
Expected: both IDEs open without errors. Close them; you don't need to do anything yet.

- [ ] **Step 6: Commit**

```bash
git add ios/ android/ .gitignore package.json package-lock.json
git commit -m "Generate iOS and Android Capacitor projects"
```

### Task 1.3: Create platform-detection helper with TDD

**Files:**
- Create: `lib/platform.ts`
- Create: `lib/__tests__/platform.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// lib/__tests__/platform.test.ts
import { describe, it, expect, vi } from "vitest";
import { isMobileAppClient } from "@/lib/platform";

describe("isMobileAppClient", () => {
  it("returns false when navigator is undefined (SSR context)", () => {
    const orig = globalThis.navigator;
    // @ts-expect-error - simulating SSR
    delete (globalThis as { navigator?: unknown }).navigator;
    expect(isMobileAppClient()).toBe(false);
    globalThis.navigator = orig;
  });

  it("returns false for a normal browser UA", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Macintosh) AppleWebKit/605" });
    expect(isMobileAppClient()).toBe(false);
    vi.unstubAllGlobals();
  });

  it("returns true when UA contains the YardAnalyzerApp token", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (iPhone) AppleWebKit/605 Capacitor YardAnalyzerApp/1.0",
    });
    expect(isMobileAppClient()).toBe(true);
    vi.unstubAllGlobals();
  });

  it("returns true for any YardAnalyzerApp/X.Y version", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Android) AppleWebKit/605 YardAnalyzerApp/2.7",
    });
    expect(isMobileAppClient()).toBe(true);
    vi.unstubAllGlobals();
  });
});

describe("isMobileApp (server-side)", () => {
  it("returns true when request header contains the token", async () => {
    vi.doMock("next/headers", () => ({
      headers: async () => new Headers({ "user-agent": "Mozilla/5.0 Capacitor YardAnalyzerApp/1.0" }),
    }));
    const { isMobileApp } = await import("@/lib/platform");
    expect(await isMobileApp()).toBe(true);
    vi.doUnmock("next/headers");
  });

  it("returns false when request header lacks the token", async () => {
    vi.doMock("next/headers", () => ({
      headers: async () => new Headers({ "user-agent": "Mozilla/5.0 (Macintosh) Safari" }),
    }));
    const { isMobileApp } = await import("@/lib/platform");
    expect(await isMobileApp()).toBe(false);
    vi.doUnmock("next/headers");
  });

  it("returns false when no user-agent header is present", async () => {
    vi.doMock("next/headers", () => ({
      headers: async () => new Headers(),
    }));
    const { isMobileApp } = await import("@/lib/platform");
    expect(await isMobileApp()).toBe(false);
    vi.doUnmock("next/headers");
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run lib/__tests__/platform.test.ts`
Expected: FAIL with "Cannot find module '@/lib/platform'".

- [ ] **Step 3: Write the implementation**

```ts
// lib/platform.ts
import { headers } from "next/headers";

const TOKEN = "YardAnalyzerApp/";

export async function isMobileApp(): Promise<boolean> {
  const ua = (await headers()).get("user-agent") ?? "";
  return ua.includes(TOKEN);
}

export function isMobileAppClient(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.userAgent.includes(TOKEN);
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run lib/__tests__/platform.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Full suite check**

Run: `npm test`
Expected: green; previous 358 + 7 = 365.

- [ ] **Step 6: Commit**

```bash
git add lib/platform.ts lib/__tests__/platform.test.ts
git commit -m "Add platform-detection helper for in-app vs browser context"
```

### Task 1.4: Create the `<NotInApp>` conditional wrapper component

**Files:**
- Create: `components/NotInApp.tsx`
- Create: `components/__tests__/NotInApp.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// components/__tests__/NotInApp.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import NotInApp from "@/components/NotInApp";

describe("NotInApp", () => {
  it("renders children in a browser context", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 Safari" });
    const { getByText } = render(<NotInApp><span>visible</span></NotInApp>);
    expect(getByText("visible")).toBeDefined();
    vi.unstubAllGlobals();
  });

  it("renders nothing in the mobile app context", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 YardAnalyzerApp/1.0" });
    const { queryByText } = render(<NotInApp><span>hidden</span></NotInApp>);
    expect(queryByText("hidden")).toBeNull();
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run components/__tests__/NotInApp.test.tsx`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement**

```tsx
// components/NotInApp.tsx
"use client";
import { useEffect, useState, type ReactNode } from "react";
import { isMobileAppClient } from "@/lib/platform";

export default function NotInApp({ children }: { children: ReactNode }) {
  // Hydration-safe pattern: SSR renders nothing, then client decides on mount.
  // This avoids the brief flash of paywall content before hydration runs.
  const [shouldRender, setShouldRender] = useState(false);
  useEffect(() => {
    setShouldRender(!isMobileAppClient());
  }, []);
  if (!shouldRender) return null;
  return <>{children}</>;
}
```

- [ ] **Step 4: Verify tests pass**

Run: `npx vitest run components/__tests__/NotInApp.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add components/NotInApp.tsx components/__tests__/NotInApp.test.tsx
git commit -m "Add NotInApp client wrapper for conditional paywall hiding"
```

### **CHECKPOINT 1** — Stop, report to user

Report: "Group 1 (Foundation) complete. 4 commits. Capacitor installed, iOS + Android projects generated, `lib/platform.ts` + `<NotInApp>` wrapper live with TDD. App still behaves identically to web users; no UI hidden yet. Ready for Group 2 (conditional UI surfaces)."

---

## Group 2 — Conditional UI: paywall hiding across surfaces

Apply `<NotInApp>` + `isMobileApp()` to each of the 6 paywall surfaces from the spec. No new components; this group is exclusively about gating existing UI.

### Task 2.1: Redirect `/pricing` page in-app

**Files:**
- Modify: `app/pricing/page.tsx`

- [ ] **Step 1: Read current file to confirm shape**

Run: `head -30 app/pricing/page.tsx`
Note whether it's a Server Component (no `"use client"` at top) or Client Component.

- [ ] **Step 2: Add the redirect at the top of the component**

If it's a Server Component, prepend imports + early-return:
```ts
import { redirect } from "next/navigation";
import { isMobileApp } from "@/lib/platform";

export default async function PricingPage() {
  if (await isMobileApp()) redirect("/dashboard");
  // ... existing body
}
```

If it's a Client Component (rare for a marketing page), wrap with `<NotInApp>` and provide a `router.replace("/dashboard")` fallback for the in-app path:
```tsx
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isMobileAppClient } from "@/lib/platform";

export default function PricingPage() {
  const router = useRouter();
  useEffect(() => {
    if (isMobileAppClient()) router.replace("/dashboard");
  }, [router]);
  // ... existing body
}
```

- [ ] **Step 3: Verify TS still compiles**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add app/pricing/page.tsx
git commit -m "Redirect pricing page to dashboard inside the mobile app"
```

### Task 2.2: Hide trial-ending banner in-app

**Files:**
- Modify: whichever component renders the trial banner (likely under `components/dashboard/` or in `app/(dashboard)/dashboard/page.tsx`)

- [ ] **Step 1: Locate the banner**

Run:
```bash
grep -rln "trialEndsAt\|days left in trial\|Trial ends" components/ app/ --include="*.tsx"
```
The banner is wherever a non-test file shows trial countdown copy. Open and identify the JSX block.

- [ ] **Step 2: Wrap the banner JSX with `<NotInApp>`**

```tsx
import NotInApp from "@/components/NotInApp";
// ...
<NotInApp>
  {/* existing trial banner JSX */}
</NotInApp>
```

- [ ] **Step 3: Verify TS + tests**

Run: `npx tsc --noEmit && npm test`
Expected: clean, 365/365 green.

- [ ] **Step 4: Commit**

```bash
git add <the modified file>
git commit -m "Hide trial-ending banner inside the mobile app"
```

### Task 2.3: Hide upgrade CTA cards on dashboard

**Files:**
- Modify: `app/(dashboard)/dashboard/page.tsx` or its child components

- [ ] **Step 1: Locate upgrade CTA cards**

Run:
```bash
grep -rln "Upgrade\|home_plus\|upgrade" app/\(dashboard\)/dashboard/ components/dashboard/ --include="*.tsx"
```
Identify any block that prompts unpaid/trial users to upgrade.

- [ ] **Step 2: Wrap with `<NotInApp>`**

Same pattern as Task 2.2.

- [ ] **Step 3: Verify TS + tests**

Run: `npx tsc --noEmit && npm test`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add <modified files>
git commit -m "Hide dashboard upgrade CTA cards inside the mobile app"
```

### Task 2.4: Hide Billing tab in Settings

**Files:**
- Modify: `app/(dashboard)/settings/page.tsx`

- [ ] **Step 1: Read the file to see how tabs are configured**

Run: `cat app/\(dashboard\)/settings/page.tsx`
Note whether tabs are an array, conditional rendering blocks, or named imports of subsections like `<BillingSection />`.

- [ ] **Step 2: Gate the Billing tab/section with `isMobileApp()` server-side**

Pattern (adapt to actual structure):
```ts
import { isMobileApp } from "@/lib/platform";

export default async function SettingsPage() {
  const inApp = await isMobileApp();
  // ...
  return (
    <>
      {/* other sections */}
      {!inApp && <BillingSection />}
    </>
  );
}
```

If the tabs use a config array, filter it:
```ts
const tabs = [
  { id: "profile", label: "Profile", component: <ProfileSection /> },
  ...(inApp ? [] : [{ id: "billing", label: "Billing", component: <BillingSection /> }]),
  // ...
];
```

- [ ] **Step 3: Also hide the link FROM other places that may link TO billing**

Run:
```bash
grep -rn "/settings#billing\|/settings/billing" app/ components/ --include="*.tsx"
```
Wrap any link with `<NotInApp>`.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm test`

- [ ] **Step 5: Commit**

```bash
git add app/\(dashboard\)/settings/page.tsx
git commit -m "Hide Billing tab in settings inside the mobile app"
```

### Task 2.5: Update locked-feature paywall modal copy

**Files:**
- Modify: `components/dashboard/LockedTaskCard.tsx` (and any sibling locked-* components)

- [ ] **Step 1: Locate the upgrade button/CTA inside the locked card**

Read `components/dashboard/LockedTaskCard.tsx`. Find any `<button>` or `<Link>` whose action is to direct the user to subscribe.

- [ ] **Step 2: Conditionally render the button/CTA**

Inside the component, mark it `"use client"` if it isn't already, then:
```tsx
import { isMobileAppClient } from "@/lib/platform";
import { useEffect, useState } from "react";

export function LockedTaskCard({ ... }) {
  const [inApp, setInApp] = useState(false);
  useEffect(() => setInApp(isMobileAppClient()), []);
  // ...
  return (
    <div>
      <p>{inApp ? "This feature requires the Pro plan." : "Upgrade to access"}</p>
      {!inApp && <button onClick={...}>Subscribe</button>}
    </div>
  );
}
```

The exact JSX shape depends on the existing component; preserve all other behavior.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm test`

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/LockedTaskCard.tsx
git commit -m "Drop upgrade CTA from locked-feature card inside the mobile app"
```

### Task 2.6: Update login form copy for in-app context

**Files:**
- Modify: `components/auth/LoginForm.tsx`

- [ ] **Step 1: Locate the "Don't have an account?" / "Sign up" link**

Read `components/auth/LoginForm.tsx`. Find the link or text directing unauthenticated users to register.

- [ ] **Step 2: Branch the copy based on context**

```tsx
import { useEffect, useState } from "react";
import { isMobileAppClient } from "@/lib/platform";

// inside the component:
const [inApp, setInApp] = useState(false);
useEffect(() => setInApp(isMobileAppClient()), []);

// in JSX, replace the existing "no account?" link with:
{inApp ? (
  <p className="text-sm text-muted-foreground">
    Need an account? Create one at yardanalyzer.com
  </p>
) : (
  <Link href="/register">Don't have an account? Sign up</Link>
)}
```

Apple-compliance note: do NOT make the in-app text a clickable link to the web. Plain text only.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm test`

- [ ] **Step 4: Commit**

```bash
git add components/auth/LoginForm.tsx
git commit -m "Replace Sign-up link with web-account hint inside the mobile app"
```

### **CHECKPOINT 2** — Stop, report to user

Report: "Group 2 (Conditional UI) complete. 6 commits. Every paywall surface (pricing page, trial banner, upgrade CTAs, billing tab, locked-feature modal, sign-up link) now hides or rewrites itself when running inside the mobile app. Browser users see no change. Ready for Group 3 (device-token backend)."

---

## Group 3 — Device-token backend

Add the Prisma model + 3 API endpoints + `lib/push/send.ts` so the app can register a device for push and the server can later send to it. No actual push delivery yet (that's Group 4).

### Task 3.1: Add `DeviceToken` Prisma model + migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_device_token/migration.sql`

- [ ] **Step 1: Read existing schema for naming and convention**

Run: `head -50 prisma/schema.prisma`
Note the model style (PascalCase, `@@index`, `@@map` if any).

- [ ] **Step 2: Append the model to `prisma/schema.prisma`**

```prisma
model DeviceToken {
  id           String   @id @default(cuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  token        String   @unique
  platform     String   // "ios" | "android"
  createdAt    DateTime @default(now())
  lastUsedAt   DateTime @default(now())
  failureCount Int      @default(0)

  @@index([userId])
}
```

Also add the relation back-reference inside the `User` model:
```prisma
deviceTokens DeviceToken[]
```

- [ ] **Step 3: Generate the migration**

Run:
```bash
npx prisma migrate dev --name add_device_token --create-only
```
Expected: creates `prisma/migrations/<timestamp>_add_device_token/migration.sql` with the `CREATE TABLE` SQL but does not apply it.

- [ ] **Step 4: Append RLS to the migration SQL**

Open the newly created `migration.sql` and append:
```sql
ALTER TABLE "DeviceToken" ENABLE ROW LEVEL SECURITY;
```
This matches the project-wide convention from the 2026-06-16 RLS lockdown (per memory).

- [ ] **Step 5: Apply the migration locally**

Run: `npx prisma migrate dev`
Expected: migration applies cleanly. Prisma client regenerates.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "Add DeviceToken Prisma model for native push registration"
```

### Task 3.2: Add device-register API endpoint with TDD

**Files:**
- Create: `app/api/devices/register/route.ts`
- Create: `app/api/devices/__tests__/register.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// app/api/devices/__tests__/register.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpsert = vi.fn();
vi.mock("@/lib/db", () => ({
  db: { deviceToken: { upsert: (...args: unknown[]) => mockUpsert(...args) } },
}));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

import { POST } from "@/app/api/devices/register/route";
import { auth } from "@/lib/auth";

describe("POST /api/devices/register", () => {
  beforeEach(() => {
    mockUpsert.mockReset();
    (auth as ReturnType<typeof vi.fn>).mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const req = new Request("https://example.com/api/devices/register", {
      method: "POST",
      body: JSON.stringify({ token: "abc", platform: "ios" }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(401);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid body", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" } });
    const req = new Request("https://example.com/api/devices/register", {
      method: "POST",
      body: JSON.stringify({ token: "abc", platform: "windows" }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("upserts on valid input and returns 200", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" } });
    mockUpsert.mockResolvedValue({ id: "dt1", userId: "u1", token: "fcm-token-abc", platform: "ios" });
    const req = new Request("https://example.com/api/devices/register", {
      method: "POST",
      body: JSON.stringify({ token: "fcm-token-abc", platform: "ios" }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { token: "fcm-token-abc" },
        update: expect.objectContaining({ userId: "u1", platform: "ios" }),
        create: expect.objectContaining({ userId: "u1", token: "fcm-token-abc", platform: "ios" }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run app/api/devices/__tests__/register.test.ts`
Expected: FAIL with "Cannot find module '@/app/api/devices/register/route'".

- [ ] **Step 3: Implement**

```ts
// app/api/devices/register/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { withAxiom, logger } from "@/lib/observability/logger";

const Body = z.object({
  token: z.string().min(1),
  platform: z.enum(["ios", "android"]),
});

export const POST = withAxiom(async (req: Request) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    await db.deviceToken.upsert({
      where: { token: parsed.data.token },
      update: { userId: session.user.id, platform: parsed.data.platform, lastUsedAt: new Date(), failureCount: 0 },
      create: { userId: session.user.id, token: parsed.data.token, platform: parsed.data.platform },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("devices/register: upsert failed", {
      userId: session.user.id,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
});
```

- [ ] **Step 4: Verify tests pass**

Run: `npx vitest run app/api/devices/__tests__/register.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add app/api/devices/register/route.ts app/api/devices/__tests__/register.test.ts
git commit -m "Add device-token registration endpoint"
```

### Task 3.3: Add device-unregister API endpoint

**Files:**
- Create: `app/api/devices/[id]/route.ts`

- [ ] **Step 1: Implement**

```ts
// app/api/devices/[id]/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { withAxiom, logger } from "@/lib/observability/logger";

export const DELETE = withAxiom(async (
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  try {
    // deleteMany rather than delete: silently no-ops if the row doesn't exist
    // or belongs to another user, preventing IDOR via probe.
    const result = await db.deviceToken.deleteMany({
      where: { id, userId: session.user.id },
    });
    return NextResponse.json({ ok: true, deleted: result.count });
  } catch (err) {
    logger.error("devices/[id] DELETE failed", {
      userId: session.user.id,
      id,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
});
```

- [ ] **Step 2: Verify TS + suite**

Run: `npx tsc --noEmit && npm test`
Expected: clean, all green.

- [ ] **Step 3: Commit**

```bash
git add app/api/devices/\[id\]/route.ts
git commit -m "Add device-token unregister endpoint"
```

### Task 3.4: Add `lib/push/send.ts` with firebase-admin (TDD)

**Files:**
- Modify: `package.json` (`firebase-admin` dep)
- Create: `lib/push/send.ts`
- Create: `lib/push/__tests__/send.test.ts`

- [ ] **Step 1: Install firebase-admin**

Run: `npm install firebase-admin`

- [ ] **Step 2: Write failing tests**

```ts
// lib/push/__tests__/send.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSendEachForMulticast = vi.fn();
const mockMessaging = vi.fn(() => ({ sendEachForMulticast: mockSendEachForMulticast }));
const mockInitializeApp = vi.fn();
const mockCert = vi.fn();
const mockGetApps = vi.fn(() => []);

vi.mock("firebase-admin/app", () => ({
  initializeApp: mockInitializeApp,
  cert: mockCert,
  getApps: mockGetApps,
}));
vi.mock("firebase-admin/messaging", () => ({
  getMessaging: mockMessaging,
}));

const mockFindMany = vi.fn();
const mockUpdate = vi.fn();
const mockDeleteMany = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    deviceToken: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
    },
  },
}));

import { sendPushToUser } from "@/lib/push/send";

beforeEach(() => {
  mockSendEachForMulticast.mockReset();
  mockFindMany.mockReset();
  mockUpdate.mockReset();
  mockDeleteMany.mockReset();
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({
    project_id: "test",
    client_email: "x@y.iam.gserviceaccount.com",
    private_key: "fake",
  });
});

describe("sendPushToUser", () => {
  it("returns early without sending if the user has no device tokens", async () => {
    mockFindMany.mockResolvedValue([]);
    await sendPushToUser("u1", { title: "T", body: "B" });
    expect(mockSendEachForMulticast).not.toHaveBeenCalled();
  });

  it("sends a multicast to all tokens and updates lastUsedAt on success", async () => {
    mockFindMany.mockResolvedValue([
      { id: "dt1", token: "tok1", platform: "ios", failureCount: 0 },
      { id: "dt2", token: "tok2", platform: "android", failureCount: 0 },
    ]);
    mockSendEachForMulticast.mockResolvedValue({
      successCount: 2,
      failureCount: 0,
      responses: [{ success: true }, { success: true }],
    });
    await sendPushToUser("u1", { title: "T", body: "B", data: { yardId: "y1" } });
    expect(mockSendEachForMulticast).toHaveBeenCalledWith(
      expect.objectContaining({
        tokens: ["tok1", "tok2"],
        notification: { title: "T", body: "B" },
        data: { yardId: "y1" },
      }),
    );
    expect(mockUpdate).toHaveBeenCalledTimes(2);
  });

  it("increments failureCount on per-token failures and deletes at threshold", async () => {
    mockFindMany.mockResolvedValue([
      { id: "dt1", token: "tok1", platform: "ios", failureCount: 2 },
      { id: "dt2", token: "tok2", platform: "android", failureCount: 0 },
    ]);
    mockSendEachForMulticast.mockResolvedValue({
      successCount: 1,
      failureCount: 1,
      responses: [
        { success: false, error: { code: "messaging/registration-token-not-registered" } },
        { success: true },
      ],
    });
    await sendPushToUser("u1", { title: "T", body: "B" });
    // dt1 had failureCount 2, now 3 -> deleted
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { id: "dt1" } });
    // dt2 succeeded -> lastUsedAt updated
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "dt2" } }),
    );
  });
});
```

- [ ] **Step 3: Run test to verify failure**

Run: `npx vitest run lib/push/__tests__/send.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 4: Implement**

```ts
// lib/push/send.ts
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { db } from "@/lib/db";
import { logger } from "@/lib/observability/logger";

const FAILURE_THRESHOLD = 3;

function getApp() {
  if (getApps().length > 0) return getApps()[0]!;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON not set");
  const serviceAccount = JSON.parse(raw);
  return initializeApp({ credential: cert(serviceAccount) });
}

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  const tokens = await db.deviceToken.findMany({
    where: { userId },
    select: { id: true, token: true, platform: true, failureCount: true },
  });
  if (tokens.length === 0) return;

  const messaging = getMessaging(getApp());
  const result = await messaging.sendEachForMulticast({
    tokens: tokens.map((t) => t.token),
    notification: { title: payload.title, body: payload.body },
    ...(payload.data ? { data: payload.data } : {}),
  });

  await Promise.all(
    result.responses.map(async (resp, i) => {
      const dt = tokens[i]!;
      if (resp.success) {
        await db.deviceToken.update({
          where: { id: dt.id },
          data: { lastUsedAt: new Date(), failureCount: 0 },
        });
        return;
      }
      const next = dt.failureCount + 1;
      if (next >= FAILURE_THRESHOLD) {
        await db.deviceToken.deleteMany({ where: { id: dt.id } });
        return;
      }
      await db.deviceToken.update({
        where: { id: dt.id },
        data: { failureCount: next },
      });
    }),
  );

  if (result.failureCount > 0) {
    logger.warn("push.send: some deliveries failed", {
      userId,
      success: result.successCount,
      failed: result.failureCount,
    });
  }
}
```

- [ ] **Step 5: Verify tests pass**

Run: `npx vitest run lib/push/__tests__/send.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/push/send.ts lib/push/__tests__/send.test.ts
git commit -m "Add lib/push/send.ts: FCM multicast with failure pruning"
```

### Task 3.5: Add push-unsubscribe endpoint

**Files:**
- Create: `app/api/notifications/unsubscribe-push/route.ts`

- [ ] **Step 1: Implement**

```ts
// app/api/notifications/unsubscribe-push/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyUnsubscribeToken } from "@/lib/email";
import { withAxiom, logger } from "@/lib/observability/logger";

export const GET = withAxiom(async (req: Request) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const userId = verifyUnsubscribeToken(token);
  if (!userId) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 400 });
  }

  try {
    const result = await db.deviceToken.deleteMany({ where: { userId } });
    return NextResponse.json({ ok: true, deleted: result.count });
  } catch (err) {
    logger.error("unsubscribe-push: delete failed", {
      userId,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
});
```

> **Note:** `verifyUnsubscribeToken` is assumed to exist in `lib/email.ts` (companion to `generateUnsubscribeToken`). If it doesn't, add an export by mirroring the generate function. Verify by `grep -n "generateUnsubscribeToken\|verifyUnsubscribeToken" lib/email.ts` before writing the route.

- [ ] **Step 2: Verify TS + suite**

Run: `npx tsc --noEmit && npm test`
Expected: clean, all green.

- [ ] **Step 3: Commit**

```bash
git add app/api/notifications/unsubscribe-push/route.ts
git commit -m "Add push-unsubscribe endpoint"
```

### **CHECKPOINT 3** — Stop, report to user

Report: "Group 3 (Device-token backend) complete. 5 commits. `DeviceToken` Prisma model + RLS migration applied, register/delete/unsubscribe endpoints live, `lib/push/send.ts` with FCM multicast and failure pruning verified by 3 TDD tests. No actual push delivery wired into the cron yet (Group 4)."

---

## Group 4 — Push triggers + cron integration

Add the 5 trigger predicates, wire them into `daily-tasks`, add the `push.delivery` observability event.

### Task 4.1: Add `push.delivery` typed event emitter

**Files:**
- Modify: `lib/observability/events.ts`
- Modify: `lib/observability/__tests__/events.test.ts`

- [ ] **Step 1: Add the new emitter type and function**

In `lib/observability/events.ts`, after the existing emitters:

```ts
export type PushKind =
  | "best_day"
  | "weather_warning"
  | "preemergent_window"
  | "grub_window"
  | "overseed_window";

interface PushDeliveryArgs {
  userIdHash: string;
  kind: PushKind;
  tokens: number;
  success: number;
  failed: number;
}

export function emitPushDelivery(args: PushDeliveryArgs): void {
  const payload = {
    kind: "push.delivery",
    ...args,
    ...commonFields(),
  };
  if (args.failed > 0 && args.success === 0) {
    logger.error("push.delivery", payload);
  } else if (args.failed > 0) {
    logger.warn("push.delivery", payload);
  } else {
    logger.info("push.delivery", payload);
  }
}
```

- [ ] **Step 2: Add tests**

Append to `lib/observability/__tests__/events.test.ts`:

```ts
import { emitPushDelivery } from "@/lib/observability/events";

describe("emitPushDelivery", () => {
  it("logs error when all deliveries failed", () => {
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
    emitPushDelivery({ userIdHash: "abc", kind: "best_day", tokens: 2, success: 0, failed: 2 });
    expect(errorSpy).toHaveBeenCalledWith("push.delivery", expect.objectContaining({ failed: 2, success: 0 }));
    errorSpy.mockRestore();
  });

  it("logs warn on partial failure", () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    emitPushDelivery({ userIdHash: "abc", kind: "weather_warning", tokens: 2, success: 1, failed: 1 });
    expect(warnSpy).toHaveBeenCalledWith("push.delivery", expect.objectContaining({ failed: 1, success: 1 }));
    warnSpy.mockRestore();
  });

  it("logs info on full success", () => {
    const infoSpy = vi.spyOn(logger, "info").mockImplementation(() => {});
    emitPushDelivery({ userIdHash: "abc", kind: "preemergent_window", tokens: 1, success: 1, failed: 0 });
    expect(infoSpy).toHaveBeenCalledWith("push.delivery", expect.objectContaining({ failed: 0, success: 1 }));
    infoSpy.mockRestore();
  });
});
```

- [ ] **Step 3: Verify**

Run: `npx vitest run lib/observability/__tests__/events.test.ts`
Expected: PASS, all existing + 3 new tests green.

- [ ] **Step 4: Commit**

```bash
git add lib/observability/events.ts lib/observability/__tests__/events.test.ts
git commit -m "Add push.delivery typed event emitter"
```

### Task 4.2: Add push trigger predicates with TDD

**Files:**
- Create: `lib/push/triggers.ts`
- Create: `lib/push/__tests__/triggers.test.ts`

- [ ] **Step 1: Write failing tests covering all 5 predicates**

```ts
// lib/push/__tests__/triggers.test.ts
import { describe, it, expect } from "vitest";
import {
  shouldPushBestDay,
  shouldPushWeatherWarning,
  shouldPushPreEmergent,
  shouldPushGrub,
  shouldPushOverseed,
} from "@/lib/push/triggers";

describe("shouldPushBestDay", () => {
  it("returns true when task bestDay is today", () => {
    const today = new Date("2026-06-20T00:00:00Z");
    expect(shouldPushBestDay({ bestDay: new Date("2026-06-20T12:00:00Z") }, today)).toBe(true);
  });
  it("returns false when bestDay is in the future", () => {
    const today = new Date("2026-06-20T00:00:00Z");
    expect(shouldPushBestDay({ bestDay: new Date("2026-06-21T00:00:00Z") }, today)).toBe(false);
  });
  it("returns false when bestDay is null", () => {
    expect(shouldPushBestDay({ bestDay: null }, new Date())).toBe(false);
  });
});

describe("shouldPushWeatherWarning", () => {
  it("returns true when a scheduled task tomorrow has a weather concern", () => {
    const today = new Date("2026-06-20T00:00:00Z");
    expect(shouldPushWeatherWarning(
      { scheduledStart: new Date("2026-06-21T00:00:00Z"), weatherCondition: "heavy_rain" },
      today,
    )).toBe(true);
  });
  it("returns false when no weather concern", () => {
    const today = new Date("2026-06-20T00:00:00Z");
    expect(shouldPushWeatherWarning(
      { scheduledStart: new Date("2026-06-21T00:00:00Z"), weatherCondition: null },
      today,
    )).toBe(false);
  });
});

describe("shouldPushPreEmergent / Grub / Overseed", () => {
  it("only fires on first-true transition (today true, yesterday false)", () => {
    expect(shouldPushPreEmergent(true, false)).toBe(true);
    expect(shouldPushPreEmergent(true, true)).toBe(false);  // already in window
    expect(shouldPushPreEmergent(false, true)).toBe(false); // window closed
    expect(shouldPushPreEmergent(false, false)).toBe(false);
  });
  it("same for grub", () => {
    expect(shouldPushGrub(true, false)).toBe(true);
    expect(shouldPushGrub(true, true)).toBe(false);
  });
  it("same for overseed", () => {
    expect(shouldPushOverseed(true, false)).toBe(true);
    expect(shouldPushOverseed(true, true)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/push/__tests__/triggers.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// lib/push/triggers.ts
function sameUtcDate(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

export function shouldPushBestDay(
  task: { bestDay: Date | null },
  today: Date,
): boolean {
  if (!task.bestDay) return false;
  return sameUtcDate(task.bestDay, today);
}

export function shouldPushWeatherWarning(
  task: { scheduledStart: Date | null; weatherCondition: string | null },
  today: Date,
): boolean {
  if (!task.scheduledStart || !task.weatherCondition) return false;
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return sameUtcDate(task.scheduledStart, tomorrow);
}

// First-true-transition predicates: today's value is true, yesterday's was false.
// Caller passes both values; this keeps the predicate pure for testing.
export function shouldPushPreEmergent(todayApplicable: boolean, yesterdayApplicable: boolean): boolean {
  return todayApplicable && !yesterdayApplicable;
}

export function shouldPushGrub(todayApplicable: boolean, yesterdayApplicable: boolean): boolean {
  return todayApplicable && !yesterdayApplicable;
}

export function shouldPushOverseed(todayApplicable: boolean, yesterdayApplicable: boolean): boolean {
  return todayApplicable && !yesterdayApplicable;
}
```

- [ ] **Step 4: Verify**

Run: `npx vitest run lib/push/__tests__/triggers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/push/triggers.ts lib/push/__tests__/triggers.test.ts
git commit -m "Add push trigger predicates for the 5 time-sensitive event types"
```

### Task 4.3: Wire push triggers into `daily-tasks` cron

**Files:**
- Modify: `app/api/cron/daily-tasks/route.ts` (specifically the `runDailyTasks` helper from Group 3c polish)

- [ ] **Step 1: Add imports near the top of the file**

```ts
import { sendPushToUser, type PushPayload } from "@/lib/push/send";
import {
  shouldPushBestDay,
  shouldPushWeatherWarning,
} from "@/lib/push/triggers";
import { emitPushDelivery } from "@/lib/observability/events";
import { hashEmail } from "@/lib/observability/redact";
```

- [ ] **Step 2: Add a helper near the top of the file**

```ts
async function safePushUser(
  userId: string,
  payload: PushPayload,
  kind: "best_day" | "weather_warning" | "preemergent_window" | "grub_window" | "overseed_window",
): Promise<void> {
  try {
    await sendPushToUser(userId, payload);
    // sendPushToUser internally logs failures; we emit the kind dimension here.
    emitPushDelivery({
      userIdHash: hashEmail(userId),
      kind,
      tokens: 0,  // sendPushToUser doesn't return count; emit 0 if we don't know
      success: 1,
      failed: 0,
    });
  } catch (err) {
    logger.error("push: send threw", {
      userId,
      kind,
      err: err instanceof Error ? err.message : String(err),
    });
    emitPushDelivery({
      userIdHash: hashEmail(userId),
      kind,
      tokens: 0,
      success: 0,
      failed: 1,
    });
  }
}
```

- [ ] **Step 3: Hook into the existing per-yard processing inside `runDailyTasks`**

The `runDailyTasks` helper already iterates yards and computes GDD windows. Find the section where per-task or per-yard window state is calculated. After each window-applicability check, fire pushes:

```ts
// Inside the yards-loop or wherever GDD checks happen:
const preEmergentNow = isPreEmergentApplicable(...);
const preEmergentYesterday = /* fetch yesterday's GDD record applicability */;
if (shouldPushPreEmergent(preEmergentNow, preEmergentYesterday)) {
  await safePushUser(yard.user.id, {
    title: "Pre-emergent window open",
    body: `Soil temps just hit the pre-emergent window for your zone.`,
    data: { yardId: yard.id, kind: "preemergent_window" },
  }, "preemergent_window");
}
// Repeat for grub and overseed.
```

For best-day push: this fires per task during the per-task loop (where `bestDay` lives on `lawnTask`).

For weather-warning push: this fires when a scheduled task tomorrow has a weather concern.

> **Implementation note:** the exact integration point depends on the current shape of `runDailyTasks` after the observability work. Read the function first; identify the natural insertion points; keep the push fire-and-forget so a push failure does not block the cron's other work. Wrap each `await safePushUser(...)` in `Promise.all` with the existing email or DB writes only if you're sure ordering doesn't matter; otherwise just await sequentially within the existing yard loop.

- [ ] **Step 4: Verify build + tests**

Run: `npx tsc --noEmit && npm test`
Expected: clean, all green.

- [ ] **Step 5: Commit**

```bash
git add app/api/cron/daily-tasks/route.ts
git commit -m "Fire push notifications from daily-tasks cron for 5 trigger types"
```

### Task 4.4: Client-side permission flow

**Files:**
- Create: `components/mobile/PushPermissionPrompt.tsx`
- Modify: `app/(dashboard)/layout.tsx` (mount the prompt for logged-in users)
- Modify: `package.json` (install `@capacitor/push-notifications` + `@capacitor/preferences`)

- [ ] **Step 1: Install the Capacitor plugins**

Run: `npm install @capacitor/push-notifications @capacitor/preferences`

- [ ] **Step 2: Implement the prompt component**

```tsx
// components/mobile/PushPermissionPrompt.tsx
"use client";
import { useEffect, useState } from "react";
import { isMobileAppClient } from "@/lib/platform";

const PROMPT_KEY = "push_permission_prompted_v1";

export default function PushPermissionPrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isMobileAppClient()) return;
    (async () => {
      const { Preferences } = await import("@capacitor/preferences");
      const { value } = await Preferences.get({ key: PROMPT_KEY });
      if (value === "shown") return;
      setShow(true);
    })();
  }, []);

  async function handleEnable() {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const { Preferences } = await import("@capacitor/preferences");

    const perm = await PushNotifications.requestPermissions();
    if (perm.receive === "granted") {
      // Listen ONCE for the token, then register
      const off = await PushNotifications.addListener("registration", async (t) => {
        // detect platform from Capacitor
        const { Capacitor } = await import("@capacitor/core");
        const platform = Capacitor.getPlatform() === "ios" ? "ios" : "android";
        await fetch("/api/devices/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: t.value, platform }),
        });
        off.remove();
      });
      await PushNotifications.register();
    }
    await Preferences.set({ key: PROMPT_KEY, value: "shown" });
    setShow(false);
  }

  async function handleLater() {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.set({ key: PROMPT_KEY, value: "shown" });
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="fixed inset-x-0 bottom-4 mx-auto max-w-sm rounded-lg border bg-background p-4 shadow-lg">
      <h3 className="text-base font-semibold">Enable lawn care reminders?</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Yard Analyzer can remind you about time-sensitive moments (best days for pre-emergent, weather warnings before scheduled work).
      </p>
      <div className="mt-3 flex gap-2">
        <button onClick={handleEnable} className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground">
          Enable Notifications
        </button>
        <button onClick={handleLater} className="rounded border px-3 py-1.5 text-sm">
          Maybe Later
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Mount in the dashboard layout**

In `app/(dashboard)/layout.tsx`, add the component near the bottom of the JSX so it overlays at the bottom of every authenticated page:

```tsx
import PushPermissionPrompt from "@/components/mobile/PushPermissionPrompt";
// ...
<PushPermissionPrompt />
```

- [ ] **Step 4: Verify TS + suite**

Run: `npx tsc --noEmit && npm test`
Expected: clean. The component uses dynamic imports for Capacitor APIs which are SSR-safe and won't trip the test environment.

- [ ] **Step 5: Commit**

```bash
git add components/mobile/PushPermissionPrompt.tsx app/\(dashboard\)/layout.tsx package.json package-lock.json
git commit -m "Add push permission prompt for first dashboard load on mobile"
```

### **CHECKPOINT 4** — Stop, report to user

Report: "Group 4 (Push triggers + cron integration) complete. 4 commits. `push.delivery` event in observability, 5 trigger predicates with TDD, daily-tasks cron now fires pushes for best-day / weather / window-opening events, client prompt asks for permission on first dashboard load. Pushes won't actually deliver until Firebase config files are placed in iOS/Android projects (Group 6) and `FIREBASE_SERVICE_ACCOUNT_JSON` is set on Vercel."

---

## Group 5 — Biometric login (refresh-token pattern)

Pivot from the original "cache session JWT" design (option A) to a refresh-token pattern (option 3 per the verification finding). The session cookie is HttpOnly, so JS-side `document.cookie = ...` doesn't work. Instead, server issues a 256-bit refresh token, client caches it in Keychain, biometric unlocks it, server exchanges it for a fresh session cookie via `Set-Cookie`. Per-device revocable, token-rotating, RFC-8252 aligned.

Task expansion vs original plan: 4 tasks → 9 tasks, because the refresh-token model requires a backend (DB model + 3 endpoints + helper module) on top of the client-side biometric flow.

### Task 5.1: Install biometric plugin

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install**

Run:
```bash
npm install @aparajita/capacitor-biometric-auth
```

- [ ] **Step 2: Skip `npx cap sync`**

Task 1.2 (native iOS/Android project generation) was deferred — no `ios/` or `android/` directories exist yet, so `npx cap sync` has nothing to sync. The web-side install of the plugin completes; the native registration happens later when `npx cap add ios|android` runs in a future session.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "Install @aparajita/capacitor-biometric-auth plugin (web-side)"
```

### Task 5.2: Add `BiometricRefreshToken` Prisma model + migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_biometric_refresh_token/migration.sql`

- [ ] **Step 1: Append the model to `prisma/schema.prisma`**

```prisma
model BiometricRefreshToken {
  id                String    @id @default(cuid())
  userId            String
  user              User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash         String    @unique   // sha256(plaintext token), hex
  deviceFingerprint String?              // informational only: platform + app version + UA hash
  createdAt         DateTime  @default(now())
  lastUsedAt        DateTime  @default(now())
  revokedAt         DateTime?            // null = active; non-null = revoked

  @@index([userId])
}
```

Add the back-reference inside the `User` model:
```prisma
biometricRefreshTokens BiometricRefreshToken[]
```

- [ ] **Step 2: Generate the migration with `--create-only`** (same prod-DB-safety guardrails as Group 3 Task 3.1)

Run:
```bash
npx prisma migrate dev --name add_biometric_refresh_token --create-only
```

If this fails the same way as Group 3 (DIRECT_URL env empty / Supabase shadow DB), hand-write the migration SQL following the format of `prisma/migrations/20260620194639_add_device_token/migration.sql`. Apply the same RLS lockdown:
```sql
ALTER TABLE "BiometricRefreshToken" ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 3: Regenerate the Prisma client**

Run: `npx prisma generate`

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "Add BiometricRefreshToken Prisma model for biometric login"
```

### Task 5.3: Add `lib/auth/biometric-refresh.ts` helper module with TDD

**Files:**
- Create: `lib/auth/biometric-refresh.ts`
- Create: `lib/auth/__tests__/biometric-refresh.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// lib/auth/__tests__/biometric-refresh.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFindUnique = vi.fn();
const mockUpdate = vi.fn();
const mockCreate = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    biometricRefreshToken: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      create: (...args: unknown[]) => mockCreate(...args),
    },
  },
}));

import {
  generateRefreshToken,
  hashRefreshToken,
  validateAndConsume,
} from "@/lib/auth/biometric-refresh";

beforeEach(() => {
  mockFindUnique.mockReset();
  mockUpdate.mockReset();
  mockCreate.mockReset();
});

describe("generateRefreshToken", () => {
  it("returns a base64url plaintext and its sha256 hex hash", () => {
    const { token, hash } = generateRefreshToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(40); // base64url of 32 bytes
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashRefreshToken(token));
  });

  it("produces distinct tokens on successive calls", () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a.token).not.toBe(b.token);
    expect(a.hash).not.toBe(b.hash);
  });
});

describe("hashRefreshToken", () => {
  it("is deterministic", () => {
    expect(hashRefreshToken("abc")).toBe(hashRefreshToken("abc"));
  });
  it("differs across inputs", () => {
    expect(hashRefreshToken("a")).not.toBe(hashRefreshToken("b"));
  });
});

describe("validateAndConsume", () => {
  it("returns null when no row matches the hash", async () => {
    mockFindUnique.mockResolvedValue(null);
    expect(await validateAndConsume("nonexistent")).toBeNull();
  });

  it("returns null when row is revoked", async () => {
    mockFindUnique.mockResolvedValue({
      id: "r1",
      userId: "u1",
      revokedAt: new Date(),
      lastUsedAt: new Date(),
    });
    expect(await validateAndConsume("any")).toBeNull();
  });

  it("returns null when lastUsedAt is older than 90 days", async () => {
    const ninetyOneDaysAgo = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000);
    mockFindUnique.mockResolvedValue({
      id: "r1",
      userId: "u1",
      revokedAt: null,
      lastUsedAt: ninetyOneDaysAgo,
    });
    expect(await validateAndConsume("any")).toBeNull();
  });

  it("returns userId and rowId on valid token", async () => {
    mockFindUnique.mockResolvedValue({
      id: "r1",
      userId: "u1",
      revokedAt: null,
      lastUsedAt: new Date(),
    });
    const result = await validateAndConsume("any");
    expect(result).toEqual({ userId: "u1", rowId: "r1" });
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run lib/auth/__tests__/biometric-refresh.test.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement**

```ts
// lib/auth/biometric-refresh.ts
import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";

const REFRESH_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

export function generateRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  const hash = hashRefreshToken(token);
  return { token, hash };
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function validateAndConsume(
  plaintextToken: string,
): Promise<{ userId: string; rowId: string } | null> {
  const tokenHash = hashRefreshToken(plaintextToken);
  const row = await db.biometricRefreshToken.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, revokedAt: true, lastUsedAt: true },
  });
  if (!row) return null;
  if (row.revokedAt) return null;
  if (Date.now() - row.lastUsedAt.getTime() > REFRESH_TTL_MS) return null;
  return { userId: row.userId, rowId: row.id };
}
```

- [ ] **Step 4: Verify**

Run: `npx vitest run lib/auth/__tests__/biometric-refresh.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/auth/biometric-refresh.ts lib/auth/__tests__/biometric-refresh.test.ts
git commit -m "Add biometric refresh token helper module"
```

### Task 5.4: `POST /api/auth/biometric-issue` endpoint with TDD

**Files:**
- Create: `app/api/auth/biometric-issue/route.ts`
- Create: `app/api/auth/biometric-issue/__tests__/route.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// app/api/auth/biometric-issue/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreate = vi.fn();
vi.mock("@/lib/db", () => ({
  db: { biometricRefreshToken: { create: (...args: unknown[]) => mockCreate(...args) } },
}));

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

import { POST } from "@/app/api/auth/biometric-issue/route";
import { auth } from "@/lib/auth";

describe("POST /api/auth/biometric-issue", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    (auth as ReturnType<typeof vi.fn>).mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const req = new Request("https://example.com/api/auth/biometric-issue", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req as never, undefined as never);
    expect(res.status).toBe(401);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates a row with sha256(token) and returns plaintext token + id", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" } });
    mockCreate.mockImplementation(async ({ data }) => ({ id: "r1", ...data }));
    const req = new Request("https://example.com/api/auth/biometric-issue", {
      method: "POST",
      body: JSON.stringify({ deviceFingerprint: "ios:1.0:abcd" }),
    });
    const res = await POST(req as never, undefined as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(body.id).toBe("r1");
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "u1",
        tokenHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        deviceFingerprint: "ios:1.0:abcd",
      }),
    });
  });

  it("accepts request without deviceFingerprint", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" } });
    mockCreate.mockImplementation(async ({ data }) => ({ id: "r1", ...data }));
    const req = new Request("https://example.com/api/auth/biometric-issue", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req as never, undefined as never);
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run app/api/auth/biometric-issue/__tests__/route.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// app/api/auth/biometric-issue/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateRefreshToken } from "@/lib/auth/biometric-refresh";
import { withAxiom, logger } from "@/lib/observability/logger";

const Body = z.object({
  deviceFingerprint: z.string().max(200).optional(),
});

export const POST = withAxiom(async (req: Request) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
  }

  const { token, hash } = generateRefreshToken();

  try {
    const row = await db.biometricRefreshToken.create({
      data: {
        userId: session.user.id,
        tokenHash: hash,
        deviceFingerprint: parsed.data.deviceFingerprint ?? null,
      },
    });
    return NextResponse.json({ token, id: row.id });
  } catch (err) {
    logger.error("biometric-issue: create failed", {
      userId: session.user.id,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
});
```

- [ ] **Step 4: Verify**

Run: `npx vitest run app/api/auth/biometric-issue/__tests__/route.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add app/api/auth/biometric-issue/route.ts app/api/auth/biometric-issue/__tests__/route.test.ts
git commit -m "Add /api/auth/biometric-issue endpoint"
```

### Task 5.5: `POST /api/auth/biometric-exchange` endpoint with TDD

**Files:**
- Create: `app/api/auth/biometric-exchange/route.ts`
- Create: `app/api/auth/biometric-exchange/__tests__/route.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// app/api/auth/biometric-exchange/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockValidateAndConsume = vi.fn();
const mockGenerateRefreshToken = vi.fn();
vi.mock("@/lib/auth/biometric-refresh", () => ({
  validateAndConsume: (...args: unknown[]) => mockValidateAndConsume(...args),
  generateRefreshToken: (...args: unknown[]) => mockGenerateRefreshToken(...args),
  hashRefreshToken: (token: string) => `hash(${token})`,
}));

const mockTransaction = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => mockTransaction(fn),
    biometricRefreshToken: {
      update: vi.fn(),
      create: vi.fn(),
    },
  },
}));

const mockEncode = vi.fn();
vi.mock("next-auth/jwt", () => ({ encode: (...args: unknown[]) => mockEncode(...args) }));

import { POST } from "@/app/api/auth/biometric-exchange/route";

beforeEach(() => {
  mockValidateAndConsume.mockReset();
  mockGenerateRefreshToken.mockReset();
  mockTransaction.mockReset();
  mockEncode.mockReset();
  process.env.AUTH_SECRET = "test-secret";
});

describe("POST /api/auth/biometric-exchange", () => {
  it("returns 400 on missing token", async () => {
    const req = new Request("https://example.com/api/auth/biometric-exchange", {
      method: "POST", body: JSON.stringify({}),
    });
    const res = await POST(req as never, undefined as never);
    expect(res.status).toBe(400);
  });

  it("returns 401 when token is invalid", async () => {
    mockValidateAndConsume.mockResolvedValue(null);
    const req = new Request("https://example.com/api/auth/biometric-exchange", {
      method: "POST", body: JSON.stringify({ token: "bad" }),
    });
    const res = await POST(req as never, undefined as never);
    expect(res.status).toBe(401);
  });

  it("on valid token: encodes a session JWT, rotates the refresh token, sets cookie via Set-Cookie", async () => {
    mockValidateAndConsume.mockResolvedValue({ userId: "u1", rowId: "r-old" });
    mockGenerateRefreshToken.mockReturnValue({ token: "new-token", hash: "new-hash" });
    mockEncode.mockResolvedValue("encoded.jwt.value");
    mockTransaction.mockImplementation(async (fn) => {
      const tx = {
        biometricRefreshToken: {
          update: vi.fn().mockResolvedValue({}),
          create: vi.fn().mockResolvedValue({ id: "r-new" }),
        },
      };
      return fn(tx);
    });

    const req = new Request("https://example.com/api/auth/biometric-exchange", {
      method: "POST", body: JSON.stringify({ token: "old-token" }),
    });
    const res = await POST(req as never, undefined as never);

    expect(res.status).toBe(200);
    expect(mockEncode).toHaveBeenCalledWith(expect.objectContaining({
      token: expect.objectContaining({ id: "u1" }),
      secret: "test-secret",
    }));

    // Cookie was set
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toContain("authjs.session-token=encoded.jwt.value");
    expect(setCookie?.toLowerCase()).toContain("httponly");
    expect(setCookie?.toLowerCase()).toContain("samesite=lax");

    const body = await res.json();
    expect(body).toEqual({ ok: true, token: "new-token" });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run app/api/auth/biometric-exchange/__tests__/route.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// app/api/auth/biometric-exchange/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { encode } from "next-auth/jwt";
import { db } from "@/lib/db";
import {
  generateRefreshToken,
  validateAndConsume,
} from "@/lib/auth/biometric-refresh";
import { withAxiom, logger } from "@/lib/observability/logger";

const Body = z.object({
  token: z.string().min(1).max(200),
});

const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days, matches NextAuth default
const COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";

export const POST = withAxiom(async (req: Request) => {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const validated = await validateAndConsume(parsed.data.token);
  if (!validated) {
    logger.warn("biometric-exchange: invalid token", {});
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Encode a NextAuth-compatible session JWT
    const sessionJwt = await encode({
      token: { id: validated.userId, sub: validated.userId },
      secret: process.env.AUTH_SECRET!,
      salt: COOKIE_NAME,
      maxAge: SESSION_MAX_AGE,
    });

    // Rotate the refresh token in a single transaction
    const { token: newToken, hash: newHash } = generateRefreshToken();
    await db.$transaction(async (tx) => {
      await tx.biometricRefreshToken.update({
        where: { id: validated.rowId },
        data: { revokedAt: new Date() },
      });
      await tx.biometricRefreshToken.create({
        data: { userId: validated.userId, tokenHash: newHash },
      });
    });

    // Set the session cookie with NextAuth's exact attributes
    const res = NextResponse.json({ ok: true, token: newToken });
    res.cookies.set(COOKIE_NAME, sessionJwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });

    return res;
  } catch (err) {
    logger.error("biometric-exchange: server error", {
      userId: validated.userId,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
});
```

> **Plugin/library note:** `encode` from `next-auth/jwt` is the load-bearing call. NextAuth 5+ requires the `salt` parameter to match the cookie name (this is how it's configured to derive the encryption key). If `encode`'s signature differs from the snippet above in your installed version, check `node_modules/next-auth/jwt/index.d.ts` and adapt.

- [ ] **Step 4: Verify**

Run: `npx vitest run app/api/auth/biometric-exchange/__tests__/route.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add app/api/auth/biometric-exchange/route.ts app/api/auth/biometric-exchange/__tests__/route.test.ts
git commit -m "Add /api/auth/biometric-exchange endpoint with token rotation"
```

### Task 5.6: `POST /api/auth/biometric-revoke` endpoint

**Files:**
- Create: `app/api/auth/biometric-revoke/route.ts`

- [ ] **Step 1: Implement**

```ts
// app/api/auth/biometric-revoke/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { withAxiom, logger } from "@/lib/observability/logger";

const Body = z.object({
  id: z.string().optional(),  // omit to revoke all rows for the user
});

export const POST = withAxiom(async (req: Request) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  try {
    const where = parsed.data.id
      ? { id: parsed.data.id, userId: session.user.id }
      : { userId: session.user.id };
    const result = await db.biometricRefreshToken.updateMany({
      where,
      data: { revokedAt: new Date() },
    });
    return NextResponse.json({ ok: true, revoked: result.count });
  } catch (err) {
    logger.error("biometric-revoke: failed", {
      userId: session.user.id,
      id: parsed.data.id,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
});
```

> Uses `updateMany` (not `update`) for the same IDOR-safe reason as `app/api/devices/[id]/route.ts`: silently no-ops if the row doesn't exist or belongs to another user.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npm test`

- [ ] **Step 3: Commit**

```bash
git add app/api/auth/biometric-revoke/route.ts
git commit -m "Add /api/auth/biometric-revoke endpoint (per-device or all)"
```

### Task 5.7: Biometric opt-in prompt (client-side)

**Files:**
- Create: `lib/biometric/store.ts` (Keychain abstraction — stores refresh tokens, not session JWTs)
- Create: `components/mobile/BiometricOptInPrompt.tsx`
- Modify: `app/(dashboard)/layout.tsx`

- [ ] **Step 1: Implement the Keychain abstraction**

```ts
// lib/biometric/store.ts
// Thin abstraction over @aparajita/capacitor-biometric-auth. Stores a
// server-issued refresh token (NOT a session JWT) keyed by a server identifier.
// Methods only run in the Capacitor app context; callers should gate on
// isMobileAppClient() before invoking.

const SERVER_KEY = "yardanalyzer.refresh";

export interface BiometricStore {
  isAvailable(): Promise<boolean>;
  storeRefreshToken(token: string): Promise<void>;
  unlockRefreshToken(): Promise<string | null>;
  clear(): Promise<void>;
}

export async function getBiometricStore(): Promise<BiometricStore> {
  const { BiometricAuth } = await import("@aparajita/capacitor-biometric-auth");

  return {
    async isAvailable() {
      const r = await BiometricAuth.checkBiometry();
      return r.isAvailable;
    },
    async storeRefreshToken(token: string) {
      await BiometricAuth.setBiometricCredentials({ server: SERVER_KEY, username: "refresh", password: token });
    },
    async unlockRefreshToken() {
      try {
        await BiometricAuth.authenticate({
          reason: "Sign in to Yard Analyzer",
          cancelTitle: "Use Password",
          allowDeviceCredential: false,
        });
        const r = await BiometricAuth.getBiometricCredentials({ server: SERVER_KEY });
        return r.password ?? null;
      } catch {
        return null;
      }
    },
    async clear() {
      try {
        await BiometricAuth.deleteBiometricCredentials({ server: SERVER_KEY });
      } catch { /* no-op if nothing stored */ }
    },
  };
}
```

> **Plugin API note:** the exact method names (`setBiometricCredentials`, `getBiometricCredentials`) are from `@aparajita/capacitor-biometric-auth`'s docs. If the actual export differs, adjust accordingly — the abstraction shape stays the same.

- [ ] **Step 2: Implement the opt-in prompt**

```tsx
// components/mobile/BiometricOptInPrompt.tsx
"use client";
import { useEffect, useState } from "react";
import { isMobileAppClient } from "@/lib/platform";

const PROMPT_KEY = "biometric_optin_prompted_v1";

export default function BiometricOptInPrompt({ userIsAuthed }: { userIsAuthed: boolean }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isMobileAppClient() || !userIsAuthed) return;
    (async () => {
      const { Preferences } = await import("@capacitor/preferences");
      const { value } = await Preferences.get({ key: PROMPT_KEY });
      if (value === "shown") return;
      const { getBiometricStore } = await import("@/lib/biometric/store");
      const store = await getBiometricStore();
      if (!(await store.isAvailable())) {
        await Preferences.set({ key: PROMPT_KEY, value: "shown" });
        return;
      }
      setShow(true);
    })();
  }, [userIsAuthed]);

  async function handleEnable() {
    const { Preferences } = await import("@capacitor/preferences");
    const { Capacitor } = await import("@capacitor/core");

    // Build a device fingerprint for the server-side audit trail
    const fingerprint = `${Capacitor.getPlatform()}:${navigator.userAgent.slice(0, 100)}`;

    // POST to /api/auth/biometric-issue to get a fresh refresh token
    let issuedToken: string | null = null;
    try {
      const res = await fetch("/api/auth/biometric-issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceFingerprint: fingerprint }),
      });
      if (res.ok) {
        const body = await res.json();
        issuedToken = body.token;
      }
    } catch { /* swallowed */ }

    if (!issuedToken) {
      // Server-side failure; leave PROMPT_KEY unset so we can retry next time
      console.warn("BiometricOptInPrompt: biometric-issue request failed");
      setShow(false);
      return;
    }

    const { getBiometricStore } = await import("@/lib/biometric/store");
    const store = await getBiometricStore();
    try {
      await store.storeRefreshToken(issuedToken);
      await Preferences.set({ key: PROMPT_KEY, value: "shown" });
      await Preferences.set({ key: "biometric_enabled", value: "true" });
    } catch (err) {
      console.warn("BiometricOptInPrompt: Keychain write failed", err);
    }
    setShow(false);
  }

  async function handleLater() {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.set({ key: PROMPT_KEY, value: "shown" });
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="fixed inset-x-0 bottom-4 mx-auto max-w-sm rounded-lg border bg-background p-4 shadow-lg">
      <h3 className="text-base font-semibold">Sign in faster next time?</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Use Face ID, Touch ID, or your fingerprint to unlock Yard Analyzer without re-entering your password.
      </p>
      <div className="mt-3 flex gap-2">
        <button onClick={handleEnable} className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground">
          Enable
        </button>
        <button onClick={handleLater} className="rounded border px-3 py-1.5 text-sm">
          Not Now
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Mount in dashboard layout**

In `app/(dashboard)/layout.tsx`:
```tsx
import { auth } from "@/lib/auth";
import BiometricOptInPrompt from "@/components/mobile/BiometricOptInPrompt";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  return (
    <>
      {children}
      <BiometricOptInPrompt userIsAuthed={!!session?.user?.id} />
    </>
  );
}
```

Note: no longer passing the session token. The prompt fetches a refresh token from the server on demand.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm test`

- [ ] **Step 5: Commit**

```bash
git add lib/biometric/store.ts components/mobile/BiometricOptInPrompt.tsx app/\(dashboard\)/layout.tsx
git commit -m "Add biometric opt-in prompt that fetches and stores a refresh token"
```

### Task 5.8: Cold-launch biometric unlock gate

**Files:**
- Create: `components/mobile/BiometricUnlockGate.tsx`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Implement**

```tsx
// components/mobile/BiometricUnlockGate.tsx
"use client";
import { useEffect, useState } from "react";
import { isMobileAppClient } from "@/lib/platform";

export default function BiometricUnlockGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      if (!isMobileAppClient()) {
        setReady(true);
        return;
      }
      const { Preferences } = await import("@capacitor/preferences");
      const { value: enabled } = await Preferences.get({ key: "biometric_enabled" });
      if (enabled !== "true") {
        setReady(true);
        return;
      }

      // Check if the current session is still valid
      try {
        const sessionRes = await fetch("/api/auth/session");
        if (sessionRes.ok) {
          const session = await sessionRes.json();
          if (session?.user) {
            setReady(true);
            return;
          }
        }
      } catch { /* fall through to biometric */ }

      // Session invalid -- prompt biometric, then exchange the refresh token
      const { getBiometricStore } = await import("@/lib/biometric/store");
      const store = await getBiometricStore();
      const refreshToken = await store.unlockRefreshToken();
      if (!refreshToken) {
        setReady(true);  // user cancelled or biometric failed; fall through to login
        return;
      }

      try {
        const res = await fetch("/api/auth/biometric-exchange", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: refreshToken }),
        });
        if (res.ok) {
          const body = await res.json();
          // Server set the session cookie; rotate the stored refresh token
          await store.storeRefreshToken(body.token);
          window.location.reload();
          return;
        }
        // Exchange rejected the token (revoked, expired, etc.)
        console.warn("BiometricUnlockGate: exchange failed", res.status);
        await store.clear();
        await Preferences.remove({ key: "biometric_enabled" });
      } catch (err) {
        console.warn("BiometricUnlockGate: exchange threw", err);
      }
      setReady(true);
    })();
  }, []);

  if (!ready) return null;
  return <>{children}</>;
}
```

- [ ] **Step 2: Wrap the root layout**

In `app/layout.tsx`:
```tsx
import BiometricUnlockGate from "@/components/mobile/BiometricUnlockGate";
// ...
<body>
  <BiometricUnlockGate>{children}</BiometricUnlockGate>
</body>
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm test`

- [ ] **Step 4: Commit**

```bash
git add components/mobile/BiometricUnlockGate.tsx app/layout.tsx
git commit -m "Add cold-launch biometric unlock via refresh-token exchange"
```

### Task 5.9: Logout cleanup

**Files:**
- Locate the existing logout / sign-out handler

- [ ] **Step 1: Find the call site**

Run:
```bash
grep -rn "signOut\|sign-out\|signout" components/ app/ --include="*.tsx" --include="*.ts" | grep -v __tests__
```

- [ ] **Step 2: Augment the logout handler**

Add this BEFORE the existing `signOut()` call (so we revoke the refresh token server-side while we still have a valid session):

```tsx
async function handleLogout() {
  // NEW: revoke the refresh token + clear biometric storage if in app
  const { isMobileAppClient } = await import("@/lib/platform");
  if (isMobileAppClient()) {
    try {
      await fetch("/api/auth/biometric-revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),  // empty body = revoke all for this user
      });
    } catch { /* best-effort; user might already be offline */ }

    const { Preferences } = await import("@capacitor/preferences");
    const { getBiometricStore } = await import("@/lib/biometric/store");
    const store = await getBiometricStore();
    await store.clear();
    await Preferences.remove({ key: "biometric_enabled" });
  }

  // existing logout logic
  await signOut();
}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm test`

- [ ] **Step 4: Commit**

```bash
git add <modified files>
git commit -m "Revoke biometric refresh token + clear Keychain on logout"
```

### **CHECKPOINT 5** — Stop, report to user

Report: "Group 5 (Biometric login — refresh-token pattern) complete. 9 commits. Backend: `BiometricRefreshToken` model + RLS migration, helper module with TDD, 3 endpoints (issue, exchange with token rotation + HttpOnly cookie set, revoke per-device or all). Client: Keychain abstraction (stores refresh tokens, not JWTs), opt-in prompt that fetches+stores a token, cold-launch unlock gate that exchanges the token for a fresh session cookie, logout cleanup that revokes server-side + clears Keychain. Settings → Devices revocation UI deferred to Group 7. Browser users unaffected. Ready for Group 6 (native plugin configuration)."

---

## Group 6 — Native plugin setup + iOS/Android config

Install the remaining Capacitor plugins, place the Firebase config files, set the iOS Info.plist permission strings, set the Android manifest permissions, generate icons and splash screens.

### Task 6.1: Install remaining Capacitor plugins

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install all remaining plugins in one go**

Run:
```bash
npm install \
  @capacitor/splash-screen \
  @capacitor/status-bar \
  @capacitor/app \
  @capacitor/browser \
  @capacitor/share \
  @capacitor/camera
```

(Push notifications + preferences were installed in Group 4 task 4.4; biometric in Group 5 task 5.1.)

- [ ] **Step 2: Sync to native projects**

Run: `npx cap sync`
Expected: all plugins register cleanly.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json ios/ android/
git commit -m "Install remaining Capacitor official plugins"
```

### Task 6.2: Generate app icons and splash screens

**Files:**
- Create: `mobile/icons/icon.png` (1024×1024 master)
- Create: `mobile/splash/splash.png` (2732×2732 master)
- Create: `mobile/README.md` (placeholder runbook; expanded in Group 7)
- Modify: many generated files under `ios/App/App/Assets.xcassets/` and `android/app/src/main/res/mipmap-*/`

- [ ] **Step 1: Place icon and splash source files**

You need:
- `mobile/icons/icon.png` — 1024×1024 PNG with no transparency (Apple requirement); the Yard Analyzer logo on the brand background `#1a4d2e`.
- `mobile/splash/splash.png` — 2732×2732 PNG; logo centered, brand background.

If you don't have these yet, ask the user (or designer) for the master files before continuing.

- [ ] **Step 2: Install the assets-generator**

Run:
```bash
npm install --save-dev @capacitor/assets
```

- [ ] **Step 3: Run the generator**

Run:
```bash
npx @capacitor/assets generate \
  --assetPath mobile \
  --iconBackgroundColor "#1a4d2e" \
  --splashBackgroundColor "#1a4d2e"
```
Expected: generates every required size under `ios/App/App/Assets.xcassets/` and `android/app/src/main/res/mipmap-*/` + `drawable*/`.

- [ ] **Step 4: Verify**

Open the iOS project (`npx cap open ios`) and confirm `Assets.xcassets/AppIcon` shows all sizes filled. Same for Android Studio (`npx cap open android`) under `res/mipmap-*`.

- [ ] **Step 5: Stub the runbook**

Create `mobile/README.md`:
```markdown
# Mobile build runbook

(Expanded in Group 7. This file currently holds the asset sources used to
generate icons and splash screens.)

## Assets
- `icons/icon.png` (1024×1024) — app icon master
- `splash/splash.png` (2732×2732) — splash screen master

## Regenerate after asset changes
```bash
npx @capacitor/assets generate --assetPath mobile \
  --iconBackgroundColor "#1a4d2e" --splashBackgroundColor "#1a4d2e"
```
```

- [ ] **Step 6: Commit**

```bash
git add mobile/ ios/App/App/Assets.xcassets/ android/app/src/main/res/ package.json package-lock.json
git commit -m "Generate iOS/Android app icons and splash screens from master assets"
```

### Task 6.3: iOS Info.plist usage strings

**Files:**
- Modify: `ios/App/App/Info.plist`

- [ ] **Step 1: Open the Info.plist file in Xcode or directly**

The file is at `ios/App/App/Info.plist`. Open in Xcode (Right-click → Open As → Source Code) or directly in your editor.

- [ ] **Step 2: Add usage description strings (Apple-required for each permission)**

Add inside the top-level `<dict>`:

```xml
<key>NSCameraUsageDescription</key>
<string>Yard Analyzer uses the camera to capture lawn photos for AI analysis.</string>

<key>NSPhotoLibraryUsageDescription</key>
<string>Yard Analyzer reads from your photo library so you can analyze existing lawn photos.</string>

<key>NSPhotoLibraryAddUsageDescription</key>
<string>Yard Analyzer saves analyzed lawn reports to your photo library.</string>

<key>NSFaceIDUsageDescription</key>
<string>Yard Analyzer uses Face ID to unlock your saved session for quick sign-in.</string>
```

Apple rejects vague strings ("This app needs access to X"). The above are user-readable and specific to actual app behavior.

- [ ] **Step 3: Commit**

```bash
git add ios/App/App/Info.plist
git commit -m "Add iOS permission usage descriptions (camera, photo library, Face ID)"
```

### Task 6.4: Android manifest permissions

**Files:**
- Modify: `android/app/src/main/AndroidManifest.xml`

- [ ] **Step 1: Open the manifest**

The file is at `android/app/src/main/AndroidManifest.xml`.

- [ ] **Step 2: Add permissions inside `<manifest>` (above `<application>`)**

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.USE_BIOMETRIC" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />

<uses-feature android:name="android.hardware.camera" android:required="false" />
<uses-feature android:name="android.hardware.fingerprint" android:required="false" />
```

`INTERNET` is usually already present; don't duplicate. `android:required="false"` lets devices without the hardware still install.

- [ ] **Step 3: Commit**

```bash
git add android/app/src/main/AndroidManifest.xml
git commit -m "Add Android permissions for camera, biometric, push, photo library"
```

### Task 6.5: Firebase config files

**Files:**
- Create: `ios/App/App/GoogleService-Info.plist` (download from Firebase console)
- Create: `android/app/google-services.json` (download from Firebase console)
- Modify: `android/build.gradle` (add Google services plugin)
- Modify: `android/app/build.gradle` (apply plugin)

- [ ] **Step 1: Add iOS app to Firebase project**

In the Firebase console:
- Project Settings → Your apps → Add app → iOS
- Bundle ID: `com.yardanalyzer.app`
- App nickname: `Yard Analyzer iOS`
- Download `GoogleService-Info.plist`
- Place at `ios/App/App/GoogleService-Info.plist`
- In Xcode, drag the file into the `App` group (so it's part of the build target). Verify "Copy items if needed" is checked.

- [ ] **Step 2: Add Android app to Firebase project**

In the Firebase console:
- Project Settings → Your apps → Add app → Android
- Package name: `com.yardanalyzer.app`
- App nickname: `Yard Analyzer Android`
- Download `google-services.json`
- Place at `android/app/google-services.json`

- [ ] **Step 3: Modify `android/build.gradle` (top-level)**

In the `dependencies` block of `buildscript`, add:
```gradle
classpath 'com.google.gms:google-services:4.4.0'
```

- [ ] **Step 4: Modify `android/app/build.gradle`**

At the very bottom of the file, add:
```gradle
apply plugin: 'com.google.gms.google-services'
```

- [ ] **Step 5: Upload APNs auth key to Firebase (one-time)**

- In Apple Developer account: Keys → Create a Key → Apple Push Notifications service (APNs). Download the .p8 file.
- In Firebase console: Project Settings → Cloud Messaging → Apple app config → Upload .p8, fill in Key ID + Team ID.

- [ ] **Step 6: Set `FIREBASE_SERVICE_ACCOUNT_JSON` on Vercel**

- In Firebase console: Project Settings → Service accounts → Generate new private key. Downloads a JSON file.
- Copy the entire JSON content (single-line) into a Vercel env var `FIREBASE_SERVICE_ACCOUNT_JSON` for Production + Preview + Development.

- [ ] **Step 7: Commit (config files go in repo; service account does NOT)**

```bash
# Verify google-services.json + GoogleService-Info.plist are NOT in .gitignore
# (they don't contain secrets; they're public config)
git add ios/App/App/GoogleService-Info.plist android/app/google-services.json android/build.gradle android/app/build.gradle
git commit -m "Add Firebase Cloud Messaging config files for iOS and Android"
```

### Task 6.6: Sync everything + smoke build

**Files:** none

- [ ] **Step 1: Final sync**

Run: `npx cap sync`
Expected: clean. All plugins and configs propagate to native projects.

- [ ] **Step 2: Smoke-build iOS in Xcode**

Run: `npx cap open ios`
In Xcode: select an iPhone simulator → Run (Cmd+R). Expected: app launches, splash screen shows, loads `yardanalyzer.com` in WebView.

- [ ] **Step 3: Smoke-build Android in Android Studio**

Run: `npx cap open android`
In Android Studio: select an emulator → Run. Expected: same flow.

- [ ] **Step 4: No commit** (this is verification only)

### **CHECKPOINT 6** — Stop, report to user

Report: "Group 6 (Native plugin setup + iOS/Android config) complete. 5 commits. All 8 Capacitor plugins installed, icons + splash generated, iOS Info.plist usage strings added, Android manifest permissions added, Firebase config files placed for both platforms, `FIREBASE_SERVICE_ACCOUNT_JSON` set on Vercel. Smoke build verified on both simulators. Ready for Group 7 (store submission prep)."

---

## Group 7 — Store submission prep

Final group: produce the store-listing materials, capture screenshots, submit to TestFlight + Play Internal Testing, and write the runbook.

### Task 7.1: Create App Store Connect listing

This task is entirely click-ops in the Apple Developer console. No code, no commit. The user does this themselves.

- [ ] **Step 1: Log in to App Store Connect**

URL: https://appstoreconnect.apple.com

- [ ] **Step 2: Create a new app**

- Apps → "+" → New App
- Platform: iOS
- Name: "Yard Analyzer"
- Primary language: English (U.S.)
- Bundle ID: select `com.yardanalyzer.app` (must already be registered in Apple Developer Account → Identifiers)
- SKU: `yard-analyzer-ios-001`
- Full Access (typically the only option)

- [ ] **Step 3: Fill in App Information**

- Category: Lifestyle (primary), Productivity (secondary)
- Content rights: confirm "Does NOT use third-party content"
- Age rating: complete the questionnaire (no objectionable content → 4+)

- [ ] **Step 4: Fill in Pricing and Availability**

- Price: Free
- Availability: all territories (or subset based on target market)

- [ ] **Step 5: Fill in Privacy nutrition label**

Per Apple requirements, declare what data is collected:
- **Email Address** — linked to user, used for App Functionality
- **Name** — linked to user, used for App Functionality
- **Coarse Location** (ZIP code) — linked to user, used for App Functionality and Personalization
- **Photos** (lawn photos) — linked to user, used for App Functionality
- **Device ID** (push token) — linked to user, used for App Functionality
- **Usage Data** (interaction analytics via Axiom) — linked to user, used for Analytics

- [ ] **Step 6: Confirm and save**

No commit (no repo changes).

### Task 7.2: Create Google Play Console listing

Click-ops in Google Play Console. No commit.

- [ ] **Step 1: Log in to Play Console**

URL: https://play.google.com/console

- [ ] **Step 2: Create a new app**

- Apps → Create App
- App name: "Yard Analyzer"
- Default language: English (US)
- App or game: App
- Free or paid: Free
- Confirm declarations

- [ ] **Step 3: Fill in store listing**

- Short description (80 chars max)
- Full description (4000 chars max)
- App icon (use the 512×512 generated icon from `mobile/icons/`)
- Feature graphic (1024×500) — create or commission
- Phone screenshots (at least 2, 16:9 or 9:16, min 320px)
- Tablet screenshots (optional but recommended)

- [ ] **Step 4: Fill in app content**

- Privacy policy URL: `https://yardanalyzer.com/privacy`
- Ads: No
- App access: Full access (provide a test account if requested)
- Content rating: complete questionnaire
- Target audience: 18+
- News app: No
- Data safety: declare collected data (mirror the iOS privacy label)
- Government app: No

- [ ] **Step 5: Save (no commit)**

### Task 7.3: Capture screenshots

**Files:**
- Create: `mobile/screenshots/ios/` (3+ images)
- Create: `mobile/screenshots/android/` (3+ images)

- [ ] **Step 1: Take iOS screenshots**

Use an iPhone simulator at the required Apple sizes (6.5" — e.g. iPhone 15 Pro Max; and 5.5" — e.g. iPhone 8 Plus). At least 3 screenshots per size showing:
- Dashboard view
- A lawn analysis result
- Calendar / task view

Save under `mobile/screenshots/ios/6.5/` and `mobile/screenshots/ios/5.5/`.

- [ ] **Step 2: Take Android screenshots**

Phone-size + tablet-size. Same 3 scenes. Save under `mobile/screenshots/android/phone/` and `mobile/screenshots/android/tablet/`.

- [ ] **Step 3: Upload to App Store Connect + Play Console**

App Store Connect → App version → Add screenshots per size.
Play Console → Store listing → Add screenshots per device type.

- [ ] **Step 4: Commit the source screenshots**

```bash
git add mobile/screenshots/
git commit -m "Add iOS and Android store-listing screenshots"
```

### Task 7.4: Write the full mobile runbook

**Files:**
- Modify: `mobile/README.md`

- [ ] **Step 1: Replace the placeholder runbook with the full version**

```markdown
# Mobile build & release runbook

## Prerequisites
- macOS with Xcode 15+
- Android Studio
- Java 17 JDK
- Apple Developer account ($99/year) — set up in App Store Connect
- Google Play Developer account ($25 one-time)
- Firebase project at console.firebase.google.com — `yard-analyzer`

## Per-release: build + upload

```bash
# 1. Bump version
# In capacitor.config.ts: appVersion field (if added)
# In ios/App/App.xcodeproj: MARKETING_VERSION + CURRENT_PROJECT_VERSION
# In android/app/build.gradle: versionCode + versionName

# 2. Sync to native
npx cap sync

# 3. iOS build + upload
npx cap open ios
# In Xcode: Product → Archive → Distribute App → App Store Connect → Upload

# 4. Android build + upload
npx cap open android
# In Studio: Build → Generate Signed Bundle / APK → AAB
# Then in Play Console: Upload AAB to a track (Internal Testing first)
```

## Assets
- `icons/icon.png` (1024×1024) — app icon master
- `splash/splash.png` (2732×2732) — splash master
- `screenshots/ios/`, `screenshots/android/` — store-listing screenshots

## Regenerate icons + splash after master changes
```bash
npx @capacitor/assets generate --assetPath mobile \
  --iconBackgroundColor "#1a4d2e" --splashBackgroundColor "#1a4d2e"
```

## Versioning convention
- Web app: continuous (whatever's on `main`)
- Mobile app: semver (e.g. `1.0.0`), tagged `mobile-v1.0.0`
- Mobile version is independent of web version

## What requires an app rebuild?
- Adding/removing Capacitor plugins
- Bumping Capacitor major versions
- iOS deployment-target or Android targetSdkVersion bump (yearly)
- Changing icons, splash, or native asset
- Modifying Info.plist or AndroidManifest.xml

## What does NOT require an app rebuild?
- Any change in `app/`, `lib/`, `components/`, `prisma/` — propagates on next app open

## Android keystore backup
The keystore lives in `~/.keystore/yard-analyzer-release.jks` (NOT in repo).
Lost keystore = cannot update the Android app, ever.
Back up to: 1Password + offline drive (USB).

## Annual maintenance
- Apple Developer renewal: $99/year, calendar reminder 30 days before expiry
- Watch developer dashboards for SDK deprecation warnings (~6 month window before forced bumps)

## Apple review submission notes (paste into App Review Information field)
Native push notifications via APNs for time-sensitive lawn care reminders (best-day GDD task windows, weather warnings, agronomic windows opening). Face ID / Touch ID biometric login via iOS Keychain. Native share sheet for sharing lawn analysis reports. Native camera capture for higher-quality lawn photos. Universal Links (https://yardanalyzer.com/yard/...) open directly in the app. External links (Stripe billing portal, OAuth providers) open in system browser via SFSafariViewController for security and UX.

## Demo account for App Review
- Email: review@yardanalyzer.com
- Password: (set up before submission and rotate after each accepted review cycle)
```

- [ ] **Step 2: Commit**

```bash
git add mobile/README.md
git commit -m "Write full mobile build and release runbook"
```

### Task 7.5: First TestFlight + Play Internal Testing submission

This task is the actual first submission. No commit. The user does this themselves.

- [ ] **Step 1: iOS — Submit to TestFlight**

Follow `mobile/README.md` "Per-release: build + upload" steps for iOS. After upload completes (~15 min processing):
- App Store Connect → TestFlight → add yourself as Internal Tester
- Install TestFlight on a real iPhone, accept the invite, install the build
- Test the full smoke-test checklist from the spec

- [ ] **Step 2: Android — Submit to Internal Testing**

Follow the Android steps in the runbook. After upload:
- Play Console → Testing → Internal testing → create a release with the AAB
- Add yourself + test email to the testers list
- Install via the opt-in URL on a real Android device
- Same smoke-test checklist

- [ ] **Step 3: Document smoke-test results**

For Cory to capture in a one-off note: which devices were tested, what worked, what didn't, any unexpected behavior.

- [ ] **Step 4: Submit to App Store + Play production review**

When happy with internal testing:
- App Store Connect → Submit for App Review (paste the App Review Information from the runbook)
- Play Console → Production track → Create release → Upload AAB → Submit

### **CHECKPOINT 7 (FINAL)** — Stop, report to user

Report: "All 7 groups complete. Implementation work done. Outstanding (manual, off-keyboard):
1. Awaiting Apple App Review (1-7 days typical)
2. Awaiting Google Play production review (1-3 hours typical)
3. After both approvals: app is live in both stores.

The runbook at `mobile/README.md` is the source of truth for the next person doing a release."

---

## Self-Review Notes (filled during plan-writing)

**Spec coverage:** every spec section maps to a task or task group:
- Goal / non-goals → reflected in scope of plan
- Architecture / repo layout → Task 1.1, 1.2, 6.2
- Native plugin set → Tasks 1.1, 4.4, 5.1, 6.1
- Conditional UI → Group 2 (Tasks 2.1-2.6)
- Push notifications (all subsections) → Group 3 + Group 4
- Biometric login (all subsections) → Group 5
- Auth flow in WebView → Tasks 5.3, 6.3
- Build & release pipeline → Group 6, Task 7.4 (runbook)
- App Store review strategy → Task 6.3 (Info.plist), Task 7.4 (review notes), Task 7.5
- Ongoing maintenance → Task 7.4 (runbook documentation)
- Testing strategy → tests baked into Tasks 1.3, 1.4, 3.2, 3.4, 4.1, 4.2

**Placeholder scan:** no TBDs. Two intentional soft pointers:
- Task 5.2 has a "Plugin API note" reminding the engineer to verify `@aparajita/capacitor-biometric-auth` method names against current docs (can't pin exact names since the plugin's API evolves).
- Task 5.3 has a "Cookie name caveat" — NextAuth 5 default is `authjs.session-token` but custom config could change it; the plan instructs verification first.

Both are concrete verification steps, not "implement appropriate X."

**Type consistency:** `DeviceToken` schema fields (`token`, `platform`, `failureCount`, etc.) consistent across Prisma model, register endpoint, `sendPushToUser`, and tests. `PushKind` literal union consistent across `lib/push/triggers.ts`, `lib/observability/events.ts`'s `emitPushDelivery`, and the cron call sites. `BiometricStore` interface consistent across abstraction (`lib/biometric/store.ts`) and consumer components.
