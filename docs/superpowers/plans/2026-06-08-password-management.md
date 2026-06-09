# Password Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow credential (email/password) users to change their password in Settings and reset a forgotten password via an emailed token link on the login page.

**Architecture:** Add a `PasswordResetToken` model to Prisma for one-time reset tokens (expire in 1 hour). Two public API routes handle forgot-password (creates token, sends email) and reset-password (validates token, updates hash). One auth-gated API route handles change-password from Settings. New UI is added to the login page (Forgot password link → standalone form page) and Settings page (Change Password section, only shown to credential users). Resend is already integrated; HMAC token helpers already exist in `lib/email.ts` for reference but reset tokens are stored in the DB for one-time-use semantics.

**Tech Stack:** Prisma (PostgreSQL), NextAuth v5 JWT sessions, bcryptjs (12 rounds), crypto (random token generation), Resend (email), Next.js App Router, react-hook-form + zod.

---

## File Structure

**Modified:**
- `prisma/schema.prisma` — add `PasswordResetToken` model; add `passwordResets` relation to `User`
- `lib/validations/auth.ts` — add `forgotPasswordSchema`, `resetPasswordSchema`, `changePasswordSchema`
- `lib/email.ts` — add `buildPasswordResetEmail` function
- `components/auth/LoginForm.tsx` — add "Forgot password?" link below password field

**Created:**
- `lib/__tests__/auth-validation.test.ts` — tests for the three new schemas
- `app/api/auth/forgot-password/route.ts` — POST: create token, send email
- `app/api/auth/reset-password/route.ts` — POST: validate token, update password
- `app/api/user/password/route.ts` — PUT: auth-gated change-password
- `app/(auth)/forgot-password/page.tsx` — page wrapping `ForgotPasswordForm`
- `components/auth/ForgotPasswordForm.tsx` — client form (email input)
- `app/(auth)/reset-password/page.tsx` — page wrapping `ResetPasswordForm`
- `components/auth/ResetPasswordForm.tsx` — client form (reads `?token=` from URL, new + confirm password)
- `components/settings/ChangePassword.tsx` — client form (current + new + confirm password)

**Modified (settings):**
- `app/(dashboard)/settings/page.tsx` — fetch `passwordHash`, render `ChangePassword` section

---

### Task 1: Add `PasswordResetToken` model to Prisma schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the model and User relation**

In `prisma/schema.prisma`, add this model at the end of the file:

```prisma
model PasswordResetToken {
  id        String   @id @default(cuid())
  userId    String
  token     String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}
```

Also add the relation to the `User` model. In the `User` model, after `yards Yard[]`, add:

```prisma
  passwordResets       PasswordResetToken[]
```

- [ ] **Step 2: Generate and apply migration**

```bash
npx prisma migrate dev --name add_password_reset_token
```

Expected output: migration created and applied.

- [ ] **Step 3: Verify**

```bash
npx prisma generate
```

Expected: Prisma Client regenerated with no errors.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add PasswordResetToken model to schema"
```

---

### Task 2: Add validation schemas for password operations

**Files:**
- Modify: `lib/validations/auth.ts`
- Create: `lib/__tests__/auth-validation.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/auth-validation.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from "@/lib/validations/auth";

describe("forgotPasswordSchema", () => {
  it("accepts a valid email", () => {
    expect(forgotPasswordSchema.safeParse({ email: "a@b.com" }).success).toBe(true);
  });
  it("rejects an invalid email", () => {
    expect(forgotPasswordSchema.safeParse({ email: "notanemail" }).success).toBe(false);
  });
});

describe("resetPasswordSchema", () => {
  it("accepts matching passwords of minimum length", () => {
    expect(
      resetPasswordSchema.safeParse({
        token: "abc123",
        password: "newpass1",
        confirmPassword: "newpass1",
      }).success
    ).toBe(true);
  });
  it("rejects when passwords don't match", () => {
    const result = resetPasswordSchema.safeParse({
      token: "abc123",
      password: "newpass1",
      confirmPassword: "different",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("confirmPassword"))).toBe(true);
    }
  });
  it("rejects a password shorter than 8 characters", () => {
    expect(
      resetPasswordSchema.safeParse({
        token: "abc123",
        password: "short",
        confirmPassword: "short",
      }).success
    ).toBe(false);
  });
});

describe("changePasswordSchema", () => {
  it("accepts valid current + new passwords", () => {
    expect(
      changePasswordSchema.safeParse({
        currentPassword: "oldpass1",
        newPassword: "newpass1",
        confirmPassword: "newpass1",
      }).success
    ).toBe(true);
  });
  it("rejects when new passwords don't match", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "oldpass1",
      newPassword: "newpass1",
      confirmPassword: "different",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("confirmPassword"))).toBe(true);
    }
  });
  it("rejects a new password shorter than 8 characters", () => {
    expect(
      changePasswordSchema.safeParse({
        currentPassword: "oldpass1",
        newPassword: "short",
        confirmPassword: "short",
      }).success
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run lib/__tests__/auth-validation.test.ts
```

Expected: FAIL — schemas not defined yet.

- [ ] **Step 3: Add schemas to `lib/validations/auth.ts`**

Append to the existing file (after the existing exports):

```typescript
export const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Token is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run lib/__tests__/auth-validation.test.ts
```

Expected: 9/9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/validations/auth.ts lib/__tests__/auth-validation.test.ts
git commit -m "feat: add forgot/reset/change password validation schemas"
```

---

### Task 3: Add `buildPasswordResetEmail` to `lib/email.ts`

**Files:**
- Modify: `lib/email.ts`

There are no tests for this function — it returns an HTML string and is trivially verifiable by inspection. The existing `buildDigestEmail` in the same file is the pattern to follow.

- [ ] **Step 1: Add the function at the end of `lib/email.ts`**

```typescript
export function buildPasswordResetEmail(opts: {
  userName: string;
  resetUrl: string;
}): { subject: string; html: string } {
  const { userName, resetUrl } = opts;
  return {
    subject: "Reset your Yard Buddy password",
    html: `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111;">
  <h1 style="color:#16a34a;font-size:20px;margin-bottom:4px;">Yard Buddy</h1>
  <p style="color:#6b7280;margin-top:0;">Hi ${escapeHtml(userName)},</p>
  <p style="color:#374151;">We received a request to reset your password. Click the button below to choose a new one. This link expires in 1 hour.</p>
  <div style="text-align:center;margin:32px 0;">
    <a href="${resetUrl}" style="background:#16a34a;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Reset Password</a>
  </div>
  <p style="color:#9ca3af;font-size:12px;">If you didn't request a password reset, you can safely ignore this email.</p>
</body>
</html>`,
  };
}
```

Note: `escapeHtml` is already defined earlier in `lib/email.ts` — use it, don't redefine it.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/email.ts
git commit -m "feat: add buildPasswordResetEmail helper"
```

---

### Task 4: Forgot-password API route

**Files:**
- Create: `app/api/auth/forgot-password/route.ts`

This route is intentionally vague in its response to prevent email enumeration — it always returns `{ ok: true }` regardless of whether the email exists.

- [ ] **Step 1: Create `app/api/auth/forgot-password/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { forgotPasswordSchema } from "@/lib/validations/auth";
import { resend, buildPasswordResetEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const user = await db.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, name: true, passwordHash: true },
  });

  // Always return ok to prevent email enumeration.
  // Only send email if user exists and has a password (not OAuth-only).
  if (user?.passwordHash) {
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await db.passwordResetToken.create({
      data: { userId: user.id, token, expiresAt },
    });

    const resetUrl = `${process.env.NEXTAUTH_URL}/reset-password?token=${token}`;
    const { subject, html } = buildPasswordResetEmail({
      userName: user.name ?? "there",
      resetUrl,
    });

    await resend.emails.send({
      from: "Yard Buddy <noreply@yardbuddy.app>",
      to: parsed.data.email,
      subject,
      html,
    });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/auth/forgot-password/route.ts
git commit -m "feat: add forgot-password API route"
```

---

### Task 5: Reset-password API route

**Files:**
- Create: `app/api/auth/reset-password/route.ts`

- [ ] **Step 1: Create `app/api/auth/reset-password/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { resetPasswordSchema } from "@/lib/validations/auth";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { token, password } = parsed.data;

  const record = await db.passwordResetToken.findUnique({
    where: { token },
    include: { user: { select: { id: true } } },
  });

  if (!record || record.expiresAt < new Date()) {
    return NextResponse.json(
      { error: "Reset link is invalid or has expired. Please request a new one." },
      { status: 400 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await db.$transaction([
    db.user.update({
      where: { id: record.userId },
      data: { passwordHash },
    }),
    db.passwordResetToken.delete({ where: { id: record.id } }),
  ]);

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/auth/reset-password/route.ts
git commit -m "feat: add reset-password API route"
```

---

### Task 6: Change-password API route (auth-gated)

**Files:**
- Create: `app/api/user/password/route.ts`

- [ ] **Step 1: Create `app/api/user/password/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { changePasswordSchema } from "@/lib/validations/auth";

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const user = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { passwordHash: true },
  });

  if (!user.passwordHash) {
    return NextResponse.json(
      { error: "This account uses Google sign-in and does not have a password." },
      { status: 400 }
    );
  }

  const currentValid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!currentValid) {
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await db.user.update({
    where: { id: session.user.id },
    data: { passwordHash },
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/user/password/route.ts
git commit -m "feat: add change-password API route"
```

---

### Task 7: ForgotPasswordForm component and page

**Files:**
- Create: `components/auth/ForgotPasswordForm.tsx`
- Create: `app/(auth)/forgot-password/page.tsx`
- Modify: `components/auth/LoginForm.tsx` — add "Forgot password?" link

- [ ] **Step 1: Create `components/auth/ForgotPasswordForm.tsx`**

```typescript
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { forgotPasswordSchema, ForgotPasswordInput } from "@/lib/validations/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ForgotPasswordForm() {
  const [submitted, setSubmitted] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  async function onSubmit(data: ForgotPasswordInput) {
    await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <Card className="w-full max-w-md">
        <CardContent className="pt-6 text-center space-y-3">
          <p className="text-gray-700 font-medium">Check your email</p>
          <p className="text-sm text-gray-500">
            If an account exists for that address, we sent a reset link. It expires in 1 hour.
          </p>
          <Link href="/login" className="text-sm text-green-600 hover:underline block">
            Back to sign in
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-2xl">Forgot password</CardTitle>
        <CardDescription>Enter your email and we'll send a reset link.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" {...register("email")} />
            {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Sending..." : "Send reset link"}
          </Button>
          <Link href="/login" className="text-sm text-gray-500 hover:underline block text-center">
            Back to sign in
          </Link>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Create `app/(auth)/forgot-password/page.tsx`**

```typescript
import Image from "next/image";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-md">
      <div className="text-center mb-2">
        <div className="flex items-center justify-center gap-1 mb-1">
          <Image src="/gnome-buddy.png" alt="Yard Buddy" width={40} height={40} className="rounded-full scale-x-[-1]" />
          <h1 className="text-3xl font-bold text-green-700">Yard Buddy</h1>
        </div>
        <p className="text-sm text-gray-500">Your AI lawn care assistant</p>
      </div>
      <ForgotPasswordForm />
    </div>
  );
}
```

- [ ] **Step 3: Add "Forgot password?" link to `LoginForm`**

In `components/auth/LoginForm.tsx`, find the password field block:

```tsx
          <div className="space-y-1">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" {...register("password")} />
            {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
          </div>
```

Replace with:

```tsx
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link href="/forgot-password" className="text-xs text-green-600 hover:underline">
                Forgot password?
              </Link>
            </div>
            <Input id="password" type="password" {...register("password")} />
            {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
          </div>
```

Ensure `Link` is imported from `"next/link"` at the top of `LoginForm.tsx`:

```typescript
import Link from "next/link";
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/auth/ForgotPasswordForm.tsx app/\(auth\)/forgot-password/page.tsx components/auth/LoginForm.tsx
git commit -m "feat: add forgot-password page and link on login form"
```

---

### Task 8: ResetPasswordForm component and page

**Files:**
- Create: `components/auth/ResetPasswordForm.tsx`
- Create: `app/(auth)/reset-password/page.tsx`

The reset page reads `?token=` from the URL via `useSearchParams`. If the token is missing, show an error immediately.

- [ ] **Step 1: Create `components/auth/ResetPasswordForm.tsx`**

```typescript
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { resetPasswordSchema, ResetPasswordInput } from "@/lib/validations/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Omit<ResetPasswordInput, "token">>({
    resolver: zodResolver(
      resetPasswordSchema.omit({ token: true })
    ),
  });

  if (!token) {
    return (
      <Card className="w-full max-w-md">
        <CardContent className="pt-6 text-center space-y-3">
          <p className="text-red-600 font-medium">Invalid reset link</p>
          <p className="text-sm text-gray-500">This link is missing a reset token.</p>
          <Link href="/forgot-password" className="text-sm text-green-600 hover:underline block">
            Request a new reset link
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (done) {
    return (
      <Card className="w-full max-w-md">
        <CardContent className="pt-6 text-center space-y-3">
          <p className="text-gray-700 font-medium">Password updated</p>
          <p className="text-sm text-gray-500">You can now sign in with your new password.</p>
          <Link href="/login" className="text-sm text-green-600 hover:underline block">
            Sign in
          </Link>
        </CardContent>
      </Card>
    );
  }

  async function onSubmit(data: Omit<ResetPasswordInput, "token">) {
    setServerError(null);
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, token }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setServerError(json.error ?? "Something went wrong. Please try again.");
      return;
    }
    setDone(true);
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-2xl">Reset password</CardTitle>
        <CardDescription>Choose a new password for your account.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {serverError && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">{serverError}</div>
          )}
          <div className="space-y-1">
            <Label htmlFor="password">New password</Label>
            <Input id="password" type="password" {...register("password")} />
            {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="confirmPassword">Confirm new password</Label>
            <Input id="confirmPassword" type="password" {...register("confirmPassword")} />
            {errors.confirmPassword && <p className="text-xs text-red-500">{errors.confirmPassword.message}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Updating..." : "Update password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Create `app/(auth)/reset-password/page.tsx`**

`ResetPasswordForm` uses `useSearchParams` which requires `<Suspense>` at the page level in Next.js App Router.

```typescript
import { Suspense } from "react";
import Image from "next/image";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export default function ResetPasswordPage() {
  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-md">
      <div className="text-center mb-2">
        <div className="flex items-center justify-center gap-1 mb-1">
          <Image src="/gnome-buddy.png" alt="Yard Buddy" width={40} height={40} className="rounded-full scale-x-[-1]" />
          <h1 className="text-3xl font-bold text-green-700">Yard Buddy</h1>
        </div>
        <p className="text-sm text-gray-500">Your AI lawn care assistant</p>
      </div>
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/auth/ResetPasswordForm.tsx app/\(auth\)/reset-password/page.tsx
git commit -m "feat: add reset-password page and form"
```

---

### Task 9: ChangePassword component and Settings integration

**Files:**
- Create: `components/settings/ChangePassword.tsx`
- Modify: `app/(dashboard)/settings/page.tsx`

Only shown to credential users (those with a `passwordHash`). Google-only users won't see this section.

- [ ] **Step 1: Create `components/settings/ChangePassword.tsx`**

```typescript
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { changePasswordSchema, ChangePasswordInput } from "@/lib/validations/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ChangePassword() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
  });

  async function onSubmit(data: ChangePasswordInput) {
    setServerError(null);
    setSuccess(false);
    const res = await fetch("/api/user/password", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setServerError(json.error ?? "Something went wrong. Please try again.");
      return;
    }
    setSuccess(true);
    reset();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {serverError && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">{serverError}</div>
      )}
      {success && (
        <div className="rounded-md bg-green-50 p-3 text-sm text-green-700">Password updated successfully.</div>
      )}
      <div className="space-y-1">
        <Label htmlFor="currentPassword">Current password</Label>
        <Input id="currentPassword" type="password" {...register("currentPassword")} />
        {errors.currentPassword && <p className="text-xs text-red-500">{errors.currentPassword.message}</p>}
      </div>
      <div className="space-y-1">
        <Label htmlFor="newPassword">New password</Label>
        <Input id="newPassword" type="password" {...register("newPassword")} />
        {errors.newPassword && <p className="text-xs text-red-500">{errors.newPassword.message}</p>}
      </div>
      <div className="space-y-1">
        <Label htmlFor="confirmPassword">Confirm new password</Label>
        <Input id="confirmPassword" type="password" {...register("confirmPassword")} />
        {errors.confirmPassword && <p className="text-xs text-red-500">{errors.confirmPassword.message}</p>}
      </div>
      <Button type="submit" className="w-full sm:w-auto" disabled={isSubmitting}>
        {isSubmitting ? "Updating..." : "Update password"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Update `app/(dashboard)/settings/page.tsx`**

Add imports and fetch `passwordHash`, then conditionally render the Change Password section.

The full updated file:

```typescript
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { NotificationPreferences } from "@/components/settings/NotificationPreferences";
import { ChangePassword } from "@/components/settings/ChangePassword";
import { Bell, Lock } from "lucide-react";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { notificationsEnabled: true, notifyDaysAhead: true, passwordHash: true },
  });

  return (
    <div className="px-4 py-8 pb-20 sm:pb-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

      <div className="max-w-lg space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Bell className="w-5 h-5 text-green-600" />
            <h2 className="text-lg font-semibold text-gray-900">Notifications</h2>
          </div>
          <NotificationPreferences
            initialEnabled={user.notificationsEnabled}
            initialDaysAhead={user.notifyDaysAhead}
          />
        </div>

        {user.passwordHash && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Lock className="w-5 h-5 text-green-600" />
              <h2 className="text-lg font-semibold text-gray-900">Change Password</h2>
            </div>
            <ChangePassword />
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Run all tests**

```bash
npx vitest run
```

Expected: all passing.

- [ ] **Step 5: Commit**

```bash
git add components/settings/ChangePassword.tsx app/\(dashboard\)/settings/page.tsx
git commit -m "feat: add change-password section to Settings for credential users"
```

---

### Task 10: End-to-end verification

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Test forgot-password flow**

1. Go to `/login`. Confirm "Forgot password?" link appears below the password field.
2. Click it — should land on `/forgot-password`.
3. Enter your account email. Confirm the success message appears ("Check your email").
4. Check your inbox for the reset email. Confirm it contains a "Reset Password" button.
5. Click the button — should land on `/reset-password?token=...`.
6. Enter a new password and confirm it. Confirm "Password updated" success state.
7. Sign in at `/login` with the new password. Confirm it works.

- [ ] **Step 3: Test change-password flow (credential user)**

1. Sign in as a credential (email/password) user.
2. Go to `/settings`. Confirm a "Change Password" section appears.
3. Enter the current password correctly and a new password. Confirm success message.
4. Sign out and sign back in with the new password.

- [ ] **Step 4: Confirm Google-only users don't see Change Password**

1. Sign in with Google OAuth.
2. Go to `/settings`. Confirm no "Change Password" section is visible.

- [ ] **Step 5: Test token expiry edge case**

1. Request a reset email.
2. In Prisma Studio (`npx prisma studio`), find the `PasswordResetToken` record and set `expiresAt` to a past date.
3. Try to submit the reset form. Confirm the error "Reset link is invalid or has expired" appears.
