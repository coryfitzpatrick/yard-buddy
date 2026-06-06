# Yard Buddy Phase 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deployable web app where users sign up, create a yard profile, upload photos, and receive AI-powered lawn care recommendations and tasks.

**Architecture:** Next.js 14 App Router monorepo with PostgreSQL (Supabase), NextAuth.js for auth, Anthropic Claude for AI analysis and recommendations, and OpenWeatherMap for weather context. All API logic lives in Next.js route handlers; the frontend is fully responsive via Tailwind + shadcn/ui.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, shadcn/ui, Prisma, PostgreSQL (Supabase), NextAuth.js v5, Anthropic SDK, OpenWeatherMap API, Supabase Storage, React Hook Form, Zod, TanStack Query

---

## Subsequent Phases (not in this plan)

- **Phase 2:** Smart Scheduler — weather-triggered reminders, seasonal calendar, push notifications
- **Phase 3:** Product Intelligence — spreader settings, product amounts, pricing, retailer links
- **Phase 4:** Payments & Premium — Stripe billing, premium tier features, mobile app (React Native)

---

## File Structure

```
yard-buddy/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   ├── register/page.tsx
│   │   └── layout.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   ├── dashboard/page.tsx
│   │   ├── yard/setup/page.tsx
│   │   └── analyze/page.tsx
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts
│   │   ├── yard/route.ts
│   │   ├── analyze/route.ts
│   │   └── recommendations/route.ts
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── ui/               (shadcn generated)
│   ├── auth/
│   │   ├── LoginForm.tsx
│   │   └── RegisterForm.tsx
│   ├── yard/
│   │   ├── YardSetupForm.tsx
│   │   ├── GrassTypeSelector.tsx
│   │   └── YardProfileCard.tsx
│   ├── analysis/
│   │   ├── PhotoUpload.tsx
│   │   └── AnalysisResults.tsx
│   └── dashboard/
│       ├── TaskList.tsx
│       └── WeatherWidget.tsx
├── lib/
│   ├── auth.ts
│   ├── db.ts
│   ├── claude.ts
│   ├── weather.ts
│   └── validations/
│       ├── yard.ts
│       └── auth.ts
├── prisma/
│   └── schema.prisma
├── types/
│   └── index.ts
├── middleware.ts
└── ...config files
```

---

## Task 1: Project Initialization

**Files:**
- Create: `package.json`, `tsconfig.json`, `tailwind.config.ts`, `next.config.ts`
- Create: `.env.local`, `.env.example`
- Create: `types/index.ts`

- [ ] **Step 1: Scaffold Next.js project**

```bash
cd /Users/cory/Projects/yard-buddy
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir=no --import-alias="@/*"
```

- [ ] **Step 2: Install all dependencies**

```bash
npm install @prisma/client @auth/prisma-adapter next-auth@beta \
  @anthropic-ai/sdk @supabase/supabase-js \
  react-hook-form @hookform/resolvers zod \
  @tanstack/react-query @tanstack/react-query-devtools \
  lucide-react class-variance-authority clsx tailwind-merge \
  date-fns

npm install -D prisma @types/node
```

- [ ] **Step 3: Install shadcn/ui and add components**

```bash
npx shadcn@latest init
# Choose: Default style, Slate base color, yes to CSS variables

npx shadcn@latest add button card input label textarea select \
  form toast dialog sheet badge avatar progress separator \
  dropdown-menu navigation-menu skeleton alert tabs
```

- [ ] **Step 4: Create `.env.example`**

```env
# Database
DATABASE_URL="postgresql://..."

# Auth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="generate-with-openssl-rand-base64-32"

# OAuth (optional but recommended)
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""

# Anthropic
ANTHROPIC_API_KEY=""

# Supabase (DB + Storage)
NEXT_PUBLIC_SUPABASE_URL=""
NEXT_PUBLIC_SUPABASE_ANON_KEY=""
SUPABASE_SERVICE_ROLE_KEY=""

# Weather
OPENWEATHERMAP_API_KEY=""
```

Copy to `.env.local` and fill in real values.

- [ ] **Step 5: Create `types/index.ts`**

```typescript
export type GrassType =
  | "bermuda"
  | "kentucky_bluegrass"
  | "tall_fescue"
  | "fine_fescue"
  | "zoysia"
  | "st_augustine"
  | "centipede"
  | "buffalo"
  | "ryegrass"
  | "unknown";

export type SpreadType = "broadcast" | "drop" | "handheld" | "liquid" | "none";

export type LawnIssue =
  | "grubs"
  | "weeds_broadleaf"
  | "weeds_grassy"
  | "fungus"
  | "drought_stress"
  | "overwatering"
  | "bare_spots"
  | "thatch"
  | "compaction"
  | "nutrient_deficiency"
  | "pests"
  | "healthy";

export type TaskStatus = "pending" | "completed" | "skipped";
export type TaskPriority = "urgent" | "high" | "medium" | "low";

export interface WeatherData {
  temp: number;
  humidity: number;
  description: string;
  icon: string;
  windSpeed: number;
  forecast: Array<{ date: string; high: number; low: number; description: string }>;
}

export interface AnalysisResult {
  issues: LawnIssue[];
  healthScore: number; // 0-100
  summary: string;
  recommendations: RecommendationItem[];
}

export interface RecommendationItem {
  title: string;
  description: string;
  priority: TaskPriority;
  timing: string;
  productSuggestion?: string;
  applicationRate?: string;
  spreaderSetting?: string;
}
```

- [ ] **Step 6: Commit**

```bash
git init
git add .
git commit -m "feat: initialize Next.js project with dependencies and types"
```

---

## Task 2: Database Schema

**Files:**
- Create: `prisma/schema.prisma`
- Create: `lib/db.ts`

- [ ] **Step 1: Initialize Prisma**

```bash
npx prisma init --datasource-provider postgresql
```

- [ ] **Step 2: Write `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id            String       @id @default(cuid())
  name          String?
  email         String       @unique
  emailVerified DateTime?
  image         String?
  passwordHash  String?
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt
  accounts      Account[]
  sessions      Session[]
  yardProfiles  YardProfile[]
}

model Account {
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([provider, providerAccountId])
}

model Session {
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String
  expires    DateTime

  @@id([identifier, token])
}

model YardProfile {
  id            String         @id @default(cuid())
  userId        String
  name          String         @default("My Yard")
  zipCode       String
  city          String?
  state         String?
  latitude      Float?
  longitude     Float?
  yardSizeSqft  Int?
  grassType     String
  soilPh        Float?
  soilMoisture  String?        // dry/moderate/moist
  spreaderType  String?
  spreaderModel String?
  notes         String?
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
  user          User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  analyses      LawnAnalysis[]
  tasks         LawnTask[]
}

model LawnAnalysis {
  id            String      @id @default(cuid())
  yardProfileId String
  imageUrls     String[]
  healthScore   Int
  issues        String[]
  summary       String      @db.Text
  rawResponse   String      @db.Text
  createdAt     DateTime    @default(now())
  yardProfile   YardProfile @relation(fields: [yardProfileId], references: [id], onDelete: Cascade)
  tasks         LawnTask[]
}

model LawnTask {
  id            String       @id @default(cuid())
  yardProfileId String
  analysisId    String?
  title         String
  description   String       @db.Text
  priority      String       @default("medium")
  status        String       @default("pending")
  dueDate       DateTime?
  completedAt   DateTime?
  product       String?
  applicationRate String?
  spreaderSetting String?
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt
  yardProfile   YardProfile  @relation(fields: [yardProfileId], references: [id], onDelete: Cascade)
  analysis      LawnAnalysis? @relation(fields: [analysisId], references: [id])
}
```

- [ ] **Step 2: Run migration**

```bash
npx prisma migrate dev --name init
```

Expected: Migration created and applied, Prisma Client generated.

- [ ] **Step 3: Write `lib/db.ts`**

```typescript
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const db =
  globalForPrisma.prisma ||
  new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["query"] : [] });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
```

- [ ] **Step 4: Commit**

```bash
git add prisma/ lib/db.ts
git commit -m "feat: add Prisma schema and database client"
```

---

## Task 3: Authentication

**Files:**
- Create: `lib/auth.ts`
- Create: `app/api/auth/[...nextauth]/route.ts`
- Create: `lib/validations/auth.ts`
- Create: `components/auth/LoginForm.tsx`
- Create: `components/auth/RegisterForm.tsx`
- Create: `app/(auth)/layout.tsx`
- Create: `app/(auth)/login/page.tsx`
- Create: `app/(auth)/register/page.tsx`
- Create: `middleware.ts`

- [ ] **Step 1: Write `lib/auth.ts`**

```typescript
import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { loginSchema } from "@/lib/validations/auth";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    Credentials({
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await db.user.findUnique({
          where: { email: parsed.data.email },
        });
        if (!user || !user.passwordHash) return null;

        const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.id) session.user.id = token.id as string;
      return session;
    },
  },
});
```

Install bcryptjs: `npm install bcryptjs && npm install -D @types/bcryptjs`

- [ ] **Step 2: Write `app/api/auth/[...nextauth]/route.ts`**

```typescript
import { handlers } from "@/lib/auth";
export const { GET, POST } = handlers;
```

- [ ] **Step 3: Write `lib/validations/auth.ts`**

```typescript
import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
```

- [ ] **Step 4: Create register API route `app/api/auth/register/route.ts`**

```typescript
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { registerSchema } from "@/lib/validations/auth";

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await db.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) {
    return NextResponse.json({ error: "Email already registered" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const user = await db.user.create({
    data: { name: parsed.data.name, email: parsed.data.email, passwordHash },
  });

  return NextResponse.json({ id: user.id, email: user.email }, { status: 201 });
}
```

- [ ] **Step 5: Write `middleware.ts`**

```typescript
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isAuthPage = req.nextUrl.pathname.startsWith("/login") ||
    req.nextUrl.pathname.startsWith("/register");
  const isDashboard = req.nextUrl.pathname.startsWith("/dashboard") ||
    req.nextUrl.pathname.startsWith("/yard") ||
    req.nextUrl.pathname.startsWith("/analyze");

  if (isDashboard && !isLoggedIn) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (isAuthPage && isLoggedIn) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 6: Write `components/auth/LoginForm.tsx`**

```typescript
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { loginSchema, LoginInput } from "@/lib/validations/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  async function onSubmit(data: LoginInput) {
    setError(null);
    const result = await signIn("credentials", {
      email: data.email,
      password: data.password,
      redirect: false,
    });
    if (result?.error) {
      setError("Invalid email or password");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-2xl">Welcome back</CardTitle>
        <CardDescription>Sign in to your Yard Buddy account</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</div>
          )}
          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" {...register("email")} />
            {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" {...register("password")} />
            {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Signing in..." : "Sign in"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
          >
            Continue with Google
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 7: Write `components/auth/RegisterForm.tsx`**

```typescript
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { registerSchema, RegisterInput } from "@/lib/validations/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
  });

  async function onSubmit(data: RegisterInput) {
    setError(null);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Registration failed");
      return;
    }
    router.push("/login?registered=true");
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-2xl">Create account</CardTitle>
        <CardDescription>Start your journey to a healthier lawn</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</div>
          )}
          <div className="space-y-1">
            <Label htmlFor="name">Name</Label>
            <Input id="name" {...register("name")} />
            {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" {...register("email")} />
            {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" {...register("password")} />
            {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <Input id="confirmPassword" type="password" {...register("confirmPassword")} />
            {errors.confirmPassword && (
              <p className="text-xs text-red-500">{errors.confirmPassword.message}</p>
            )}
          </div>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Creating account..." : "Create account"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 8: Write auth pages**

`app/(auth)/layout.tsx`:
```typescript
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100 p-4">
      {children}
    </div>
  );
}
```

`app/(auth)/login/page.tsx`:
```typescript
import Link from "next/link";
import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-md">
      <div className="text-center mb-2">
        <h1 className="text-3xl font-bold text-green-700">🌿 Yard Buddy</h1>
        <p className="text-sm text-gray-500">Your AI lawn care assistant</p>
      </div>
      <LoginForm />
      <p className="text-sm text-gray-600">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="text-green-600 font-medium hover:underline">
          Sign up
        </Link>
      </p>
    </div>
  );
}
```

`app/(auth)/register/page.tsx`:
```typescript
import Link from "next/link";
import { RegisterForm } from "@/components/auth/RegisterForm";

export default function RegisterPage() {
  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-md">
      <div className="text-center mb-2">
        <h1 className="text-3xl font-bold text-green-700">🌿 Yard Buddy</h1>
        <p className="text-sm text-gray-500">Your AI lawn care assistant</p>
      </div>
      <RegisterForm />
      <p className="text-sm text-gray-600">
        Already have an account?{" "}
        <Link href="/login" className="text-green-600 font-medium hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
```

- [ ] **Step 9: Verify auth works**

```bash
npm run dev
```

Visit http://localhost:3000/login — form renders without errors.
Visit http://localhost:3000/dashboard — redirects to /login.
Register a new account — redirects to /login with ?registered=true.
Sign in — redirects to /dashboard (will 404 until Task 5, that's expected).

- [ ] **Step 10: Commit**

```bash
git add .
git commit -m "feat: add authentication with credentials and Google OAuth"
```

---

## Task 4: Yard Profile Setup

**Files:**
- Create: `lib/validations/yard.ts`
- Create: `app/api/yard/route.ts`
- Create: `components/yard/GrassTypeSelector.tsx`
- Create: `components/yard/YardSetupForm.tsx`
- Create: `app/(dashboard)/yard/setup/page.tsx`

- [ ] **Step 1: Write `lib/validations/yard.ts`**

```typescript
import { z } from "zod";

export const yardProfileSchema = z.object({
  name: z.string().min(1).default("My Yard"),
  zipCode: z.string().regex(/^\d{5}$/, "Enter a valid 5-digit ZIP code"),
  yardSizeSqft: z.coerce.number().min(100).max(100000).optional(),
  grassType: z.enum([
    "bermuda", "kentucky_bluegrass", "tall_fescue", "fine_fescue",
    "zoysia", "st_augustine", "centipede", "buffalo", "ryegrass", "unknown",
  ]),
  soilPh: z.coerce.number().min(4).max(9).optional(),
  soilMoisture: z.enum(["dry", "moderate", "moist"]).optional(),
  spreaderType: z.enum(["broadcast", "drop", "handheld", "liquid", "none"]).optional(),
  spreaderModel: z.string().optional(),
  notes: z.string().max(500).optional(),
});

export type YardProfileInput = z.infer<typeof yardProfileSchema>;
```

- [ ] **Step 2: Write `app/api/yard/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { yardProfileSchema } from "@/lib/validations/yard";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = yardProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const profile = await db.yardProfile.create({
    data: { ...parsed.data, userId: session.user.id },
  });
  return NextResponse.json(profile, { status: 201 });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profiles = await db.yardProfile.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(profiles);
}
```

- [ ] **Step 3: Write `components/yard/GrassTypeSelector.tsx`**

```typescript
"use client";

import { GrassType } from "@/types";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const GRASS_TYPES: Array<{ value: GrassType; label: string; zone: string; description: string }> = [
  { value: "bermuda", label: "Bermuda", zone: "Warm", description: "Drought-tolerant, full sun" },
  { value: "kentucky_bluegrass", label: "Kentucky Bluegrass", zone: "Cool", description: "Lush, dark green" },
  { value: "tall_fescue", label: "Tall Fescue", zone: "Transition/Cool", description: "Shade tolerant" },
  { value: "fine_fescue", label: "Fine Fescue", zone: "Cool", description: "Low maintenance" },
  { value: "zoysia", label: "Zoysia", zone: "Warm/Transition", description: "Dense, heat tolerant" },
  { value: "st_augustine", label: "St. Augustine", zone: "Warm", description: "Shade tolerant, coastal" },
  { value: "centipede", label: "Centipede", zone: "Warm", description: "Low-input, acidic soil" },
  { value: "buffalo", label: "Buffalo Grass", zone: "Warm/Transition", description: "Native, drought hardy" },
  { value: "ryegrass", label: "Ryegrass", zone: "Cool", description: "Fast germination" },
  { value: "unknown", label: "Not Sure", zone: "", description: "We'll help identify it" },
];

interface Props {
  value: GrassType | undefined;
  onChange: (value: GrassType) => void;
}

export function GrassTypeSelector({ value, onChange }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {GRASS_TYPES.map((grass) => (
        <Card
          key={grass.value}
          className={cn(
            "p-3 cursor-pointer border-2 transition-all hover:border-green-400",
            value === grass.value ? "border-green-600 bg-green-50" : "border-gray-200"
          )}
          onClick={() => onChange(grass.value)}
        >
          <div className="font-medium text-sm">{grass.label}</div>
          {grass.zone && (
            <div className="text-xs text-gray-500 mt-0.5">{grass.zone} season</div>
          )}
          <div className="text-xs text-gray-400 mt-0.5">{grass.description}</div>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Write `components/yard/YardSetupForm.tsx`**

```typescript
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { yardProfileSchema, YardProfileInput } from "@/lib/validations/yard";
import { GrassTypeSelector } from "./GrassTypeSelector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const STEPS = ["Location & Size", "Grass Type", "Soil & Equipment", "Review"];

export function YardSetupForm() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } =
    useForm<YardProfileInput>({
      resolver: zodResolver(yardProfileSchema),
      defaultValues: { name: "My Yard", grassType: "unknown" },
    });

  const grassType = watch("grassType");

  async function onSubmit(data: YardProfileInput) {
    setError(null);
    const res = await fetch("/api/yard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      setError("Failed to save yard profile");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex gap-1 mb-8">
        {STEPS.map((s, i) => (
          <div
            key={s}
            className={`flex-1 h-2 rounded-full transition-colors ${
              i <= step ? "bg-green-500" : "bg-gray-200"
            }`}
          />
        ))}
      </div>
      <h2 className="text-xl font-semibold mb-1">{STEPS[step]}</h2>

      <form onSubmit={handleSubmit(onSubmit)}>
        {error && <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</div>}

        {step === 0 && (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Yard Name</Label>
              <Input placeholder="Front Yard, Back Yard..." {...register("name")} />
            </div>
            <div className="space-y-1">
              <Label>ZIP Code *</Label>
              <Input placeholder="90210" maxLength={5} {...register("zipCode")} />
              {errors.zipCode && <p className="text-xs text-red-500">{errors.zipCode.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>Yard Size (sq ft)</Label>
              <Input type="number" placeholder="2500" {...register("yardSizeSqft")} />
              <p className="text-xs text-gray-400">Optional — helps calculate product amounts</p>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <p className="text-sm text-gray-500 mb-3">
              Select the grass type growing in your yard. This determines what products and timing work best.
            </p>
            <GrassTypeSelector
              value={grassType}
              onChange={(v) => setValue("grassType", v)}
            />
            {errors.grassType && <p className="text-xs text-red-500">{errors.grassType.message}</p>}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Soil pH</Label>
              <Input type="number" step="0.1" min="4" max="9" placeholder="6.5" {...register("soilPh")} />
              <p className="text-xs text-gray-400">Optional — test with a soil kit from your local hardware store</p>
            </div>
            <div className="space-y-1">
              <Label>Soil Moisture</Label>
              <Select onValueChange={(v) => setValue("soilMoisture", v as "dry" | "moderate" | "moist")}>
                <SelectTrigger><SelectValue placeholder="Select moisture level" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dry">Dry — cracks easily, water beads</SelectItem>
                  <SelectItem value="moderate">Moderate — moist 1 inch down</SelectItem>
                  <SelectItem value="moist">Moist — stays damp, possible overwatering</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Spreader Type</Label>
              <Select onValueChange={(v) => setValue("spreaderType", v as YardProfileInput["spreaderType"])}>
                <SelectTrigger><SelectValue placeholder="Select spreader" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="broadcast">Broadcast / Rotary</SelectItem>
                  <SelectItem value="drop">Drop Spreader</SelectItem>
                  <SelectItem value="handheld">Handheld Spreader</SelectItem>
                  <SelectItem value="liquid">Liquid / Hose-end Sprayer</SelectItem>
                  <SelectItem value="none">None / Hand Apply</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Spreader Model (optional)</Label>
              <Input placeholder="e.g. Scotts EdgeGuard DLX" {...register("spreaderModel")} />
            </div>
            <div className="space-y-1">
              <Label>Additional Notes</Label>
              <Textarea placeholder="Shady areas, problem spots, recent treatments..." {...register("notes")} />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3 text-sm">
            <p className="text-gray-500">Review your yard profile before saving.</p>
            <div className="rounded-lg bg-gray-50 p-4 space-y-2">
              <div><span className="font-medium">ZIP Code:</span> {watch("zipCode")}</div>
              <div><span className="font-medium">Grass:</span> {watch("grassType")?.replace(/_/g, " ")}</div>
              {watch("yardSizeSqft") && (
                <div><span className="font-medium">Size:</span> {watch("yardSizeSqft")} sq ft</div>
              )}
              {watch("spreaderType") && (
                <div><span className="font-medium">Spreader:</span> {watch("spreaderType")}</div>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-between mt-8">
          {step > 0 ? (
            <Button type="button" variant="outline" onClick={() => setStep((s) => s - 1)}>
              Back
            </Button>
          ) : <div />}

          {step < STEPS.length - 1 ? (
            <Button type="button" onClick={() => setStep((s) => s + 1)} className="bg-green-600 hover:bg-green-700">
              Next
            </Button>
          ) : (
            <Button type="submit" disabled={isSubmitting} className="bg-green-600 hover:bg-green-700">
              {isSubmitting ? "Saving..." : "Save Yard Profile"}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 5: Write `app/(dashboard)/yard/setup/page.tsx`**

```typescript
import { YardSetupForm } from "@/components/yard/YardSetupForm";

export default function YardSetupPage() {
  return (
    <div className="container max-w-3xl py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-green-700">Set Up Your Yard</h1>
        <p className="text-gray-500 mt-1">
          Tell us about your lawn so we can give you personalized recommendations.
        </p>
      </div>
      <YardSetupForm />
    </div>
  );
}
```

- [ ] **Step 6: Test yard setup flow**

```bash
npm run dev
```

Sign in, visit http://localhost:3000/yard/setup, complete the 4-step form, submit.
Check Supabase / your database — a `YardProfile` row should exist.

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "feat: add multi-step yard profile setup form"
```

---

## Task 5: Weather Integration

**Files:**
- Create: `lib/weather.ts`
- Create: `app/api/weather/route.ts`
- Create: `components/dashboard/WeatherWidget.tsx`

- [ ] **Step 1: Write `lib/weather.ts`**

```typescript
import { WeatherData } from "@/types";

const BASE = "https://api.openweathermap.org/data/2.5";
const KEY = process.env.OPENWEATHERMAP_API_KEY!;

export async function getWeatherByZip(zip: string, country = "us"): Promise<WeatherData> {
  const [current, forecast] = await Promise.all([
    fetch(`${BASE}/weather?zip=${zip},${country}&appid=${KEY}&units=imperial`).then((r) => r.json()),
    fetch(`${BASE}/forecast?zip=${zip},${country}&appid=${KEY}&units=imperial&cnt=24`).then((r) => r.json()),
  ]);

  const dailyMap = new Map<string, { high: number; low: number; description: string }>();
  for (const item of forecast.list ?? []) {
    const date = item.dt_txt.split(" ")[0];
    const existing = dailyMap.get(date);
    if (!existing) {
      dailyMap.set(date, {
        high: item.main.temp_max,
        low: item.main.temp_min,
        description: item.weather[0].description,
      });
    } else {
      dailyMap.set(date, {
        ...existing,
        high: Math.max(existing.high, item.main.temp_max),
        low: Math.min(existing.low, item.main.temp_min),
      });
    }
  }

  return {
    temp: Math.round(current.main.temp),
    humidity: current.main.humidity,
    description: current.weather[0].description,
    icon: current.weather[0].icon,
    windSpeed: Math.round(current.wind.speed),
    forecast: Array.from(dailyMap.entries())
      .slice(0, 5)
      .map(([date, data]) => ({ date, ...data })),
  };
}
```

- [ ] **Step 2: Write `app/api/weather/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getWeatherByZip } from "@/lib/weather";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const zip = req.nextUrl.searchParams.get("zip");
  if (!zip || !/^\d{5}$/.test(zip)) {
    return NextResponse.json({ error: "Valid ZIP required" }, { status: 400 });
  }

  try {
    const weather = await getWeatherByZip(zip);
    return NextResponse.json(weather, {
      headers: { "Cache-Control": "public, max-age=1800" },
    });
  } catch {
    return NextResponse.json({ error: "Weather unavailable" }, { status: 502 });
  }
}
```

- [ ] **Step 3: Write `components/dashboard/WeatherWidget.tsx`**

```typescript
"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WeatherData } from "@/types";
import { Droplets, Wind } from "lucide-react";

export function WeatherWidget({ zip }: { zip: string }) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/weather?zip=${zip}`)
      .then((r) => r.json())
      .then((d) => { setWeather(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [zip]);

  if (loading) return (
    <Card><CardContent className="p-4 h-24 animate-pulse bg-gray-100 rounded-lg" /></Card>
  );
  if (!weather) return null;

  return (
    <Card className="bg-gradient-to-br from-sky-400 to-blue-500 text-white border-0">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium opacity-90">Current Weather</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-4xl font-bold">{weather.temp}°F</div>
            <div className="text-sm opacity-90 capitalize">{weather.description}</div>
          </div>
          <img
            src={`https://openweathermap.org/img/wn/${weather.icon}@2x.png`}
            alt={weather.description}
            className="w-16 h-16"
          />
        </div>
        <div className="flex gap-4 mt-3 text-sm opacity-90">
          <span className="flex items-center gap-1">
            <Droplets className="w-3 h-3" /> {weather.humidity}%
          </span>
          <span className="flex items-center gap-1">
            <Wind className="w-3 h-3" /> {weather.windSpeed} mph
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: add weather integration with OpenWeatherMap"
```

---

## Task 6: Claude AI Integration

**Files:**
- Create: `lib/claude.ts`
- Create: `app/api/recommendations/route.ts`
- Create: `app/api/analyze/route.ts`

- [ ] **Step 1: Write `lib/claude.ts`**

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { GrassType, LawnIssue, AnalysisResult, RecommendationItem } from "@/types";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface LawnContext {
  grassType: GrassType;
  zipCode: string;
  yardSizeSqft?: number | null;
  spreaderType?: string | null;
  soilPh?: number | null;
  soilMoisture?: string | null;
  weatherSummary?: string;
  notes?: string | null;
}

const SYSTEM_PROMPT = `You are an expert lawn care agronomist and horticulturist with 20+ years of experience helping homeowners maintain healthy lawns across all US climate zones. You have deep knowledge of:
- All major grass types (warm-season and cool-season) and their specific care requirements
- Fertilization schedules, NPK ratios, soil amendments
- Weed identification and control (pre-emergent and post-emergent)
- Pest identification (grubs, chinch bugs, armyworms, etc.)
- Disease diagnosis (brown patch, dollar spot, red thread, etc.)
- Irrigation and water management
- Aerating, dethatching, overseeding timing and technique
- Spreader settings for major brands (Scotts, Andersons, Lesco)

Always give specific, actionable advice. When recommending products, suggest the active ingredient AND a common brand example. Always consider the season, grass type, and local climate when making recommendations. Be direct and practical — homeowners want to know exactly what to do and when.`;

export async function generateRecommendations(context: LawnContext): Promise<RecommendationItem[]> {
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Generate lawn care recommendations for this yard:

Grass Type: ${context.grassType.replace(/_/g, " ")}
ZIP Code: ${context.zipCode}
${context.yardSizeSqft ? `Yard Size: ${context.yardSizeSqft} sq ft` : ""}
${context.spreaderType ? `Spreader: ${context.spreaderType}` : ""}
${context.soilPh ? `Soil pH: ${context.soilPh}` : ""}
${context.soilMoisture ? `Soil Moisture: ${context.soilMoisture}` : ""}
${context.weatherSummary ? `Current Weather: ${context.weatherSummary}` : ""}
${context.notes ? `Notes: ${context.notes}` : ""}

Return a JSON array of 3-6 recommendations, each with this exact structure:
{
  "title": "string (short action title)",
  "description": "string (2-3 sentences explaining what to do and why)",
  "priority": "urgent" | "high" | "medium" | "low",
  "timing": "string (when to do this, e.g. 'This week', 'Next 2-4 weeks', 'Wait until fall')",
  "productSuggestion": "string (optional - specific product/active ingredient)",
  "applicationRate": "string (optional - e.g. '3 lbs per 1000 sq ft')",
  "spreaderSetting": "string (optional - e.g. 'Scotts: 4, Andersons: 12')"
}

Return only the JSON array, no other text.`,
      },
    ],
  });

  const text = (message.content[0] as { type: string; text: string }).text;
  return JSON.parse(text) as RecommendationItem[];
}

export async function analyzeImages(
  imageUrls: string[],
  context: LawnContext
): Promise<AnalysisResult> {
  const imageContent = imageUrls.map((url) => ({
    type: "image" as const,
    source: { type: "url" as const, url },
  }));

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 3000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          ...imageContent,
          {
            type: "text",
            text: `Analyze this lawn image for a ${context.grassType.replace(/_/g, " ")} lawn in ZIP code ${context.zipCode}.
${context.yardSizeSqft ? `Yard size: ${context.yardSizeSqft} sq ft.` : ""}
${context.spreaderType ? `Spreader: ${context.spreaderType}.` : ""}
${context.soilPh ? `Soil pH: ${context.soilPh}.` : ""}

Provide a detailed analysis in this exact JSON format:
{
  "issues": ["array of issue keys from: grubs, weeds_broadleaf, weeds_grassy, fungus, drought_stress, overwatering, bare_spots, thatch, compaction, nutrient_deficiency, pests, healthy"],
  "healthScore": number (0-100, where 100 is perfect),
  "summary": "2-3 sentence plain English summary of what you see",
  "recommendations": [array of 3-6 recommendation objects with same structure as before]
}

Return only the JSON object, no other text.`,
          },
        ],
      },
    ],
  });

  const text = (message.content[0] as { type: string; text: string }).text;
  return JSON.parse(text) as AnalysisResult;
}
```

- [ ] **Step 2: Write `app/api/recommendations/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateRecommendations } from "@/lib/claude";
import { getWeatherByZip } from "@/lib/weather";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profileId = req.nextUrl.searchParams.get("profileId");
  if (!profileId) return NextResponse.json({ error: "profileId required" }, { status: 400 });

  const profile = await db.yardProfile.findFirst({
    where: { id: profileId, userId: session.user.id },
  });
  if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let weatherSummary: string | undefined;
  try {
    const weather = await getWeatherByZip(profile.zipCode);
    weatherSummary = `${weather.temp}°F, ${weather.description}, ${weather.humidity}% humidity`;
  } catch {}

  const recommendations = await generateRecommendations({
    grassType: profile.grassType as any,
    zipCode: profile.zipCode,
    yardSizeSqft: profile.yardSizeSqft,
    spreaderType: profile.spreaderType,
    soilPh: profile.soilPh,
    soilMoisture: profile.soilMoisture ?? undefined,
    weatherSummary,
    notes: profile.notes,
  });

  // Save as tasks
  await db.lawnTask.createMany({
    data: recommendations.map((r) => ({
      yardProfileId: profileId,
      title: r.title,
      description: r.description,
      priority: r.priority,
      product: r.productSuggestion,
      applicationRate: r.applicationRate,
      spreaderSetting: r.spreaderSetting,
    })),
  });

  return NextResponse.json(recommendations);
}
```

- [ ] **Step 3: Write `app/api/analyze/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { analyzeImages } from "@/lib/claude";
import { getWeatherByZip } from "@/lib/weather";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { profileId, imageUrls } = await req.json();
  if (!profileId || !imageUrls?.length) {
    return NextResponse.json({ error: "profileId and imageUrls required" }, { status: 400 });
  }

  const profile = await db.yardProfile.findFirst({
    where: { id: profileId, userId: session.user.id },
  });
  if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let weatherSummary: string | undefined;
  try {
    const weather = await getWeatherByZip(profile.zipCode);
    weatherSummary = `${weather.temp}°F, ${weather.description}, ${weather.humidity}% humidity`;
  } catch {}

  const result = await analyzeImages(imageUrls, {
    grassType: profile.grassType as any,
    zipCode: profile.zipCode,
    yardSizeSqft: profile.yardSizeSqft,
    spreaderType: profile.spreaderType,
    soilPh: profile.soilPh,
    weatherSummary,
    notes: profile.notes,
  });

  const analysis = await db.lawnAnalysis.create({
    data: {
      yardProfileId: profileId,
      imageUrls,
      healthScore: result.healthScore,
      issues: result.issues,
      summary: result.summary,
      rawResponse: JSON.stringify(result),
      tasks: {
        create: result.recommendations.map((r) => ({
          yardProfileId: profileId,
          title: r.title,
          description: r.description,
          priority: r.priority,
          product: r.productSuggestion,
          applicationRate: r.applicationRate,
          spreaderSetting: r.spreaderSetting,
        })),
      },
    },
    include: { tasks: true },
  });

  return NextResponse.json({ analysis, result });
}
```

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: integrate Claude AI for lawn analysis and recommendations"
```

---

## Task 7: Photo Upload & Analysis UI

**Files:**
- Create: `components/analysis/PhotoUpload.tsx`
- Create: `components/analysis/AnalysisResults.tsx`
- Create: `app/(dashboard)/analyze/page.tsx`
- Create: `app/api/upload/route.ts`

- [ ] **Step 1: Write `app/api/upload/route.ts`** (Supabase Storage)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "File must be an image" }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "File must be under 10MB" }, { status: 400 });
  }

  const ext = file.name.split(".").pop();
  const path = `${session.user.id}/${Date.now()}.${ext}`;
  const bytes = await file.arrayBuffer();

  const { error } = await supabase.storage
    .from("lawn-photos")
    .upload(path, bytes, { contentType: file.type });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: { publicUrl } } = supabase.storage.from("lawn-photos").getPublicUrl(path);
  return NextResponse.json({ url: publicUrl });
}
```

In Supabase dashboard: create a storage bucket named `lawn-photos` with public access enabled.

- [ ] **Step 2: Write `components/analysis/PhotoUpload.tsx`**

```typescript
"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Upload, X, Loader2 } from "lucide-react";

interface Props {
  onUploaded: (urls: string[]) => void;
  maxImages?: number;
}

export function PhotoUpload({ onUploaded, maxImages = 4 }: Props) {
  const [previews, setPreviews] = useState<Array<{ file: File; url: string; uploaded?: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList) {
    const newItems = Array.from(files).slice(0, maxImages - previews.length).map((file) => ({
      file,
      url: URL.createObjectURL(file),
    }));
    setPreviews((p) => [...p, ...newItems]);
  }

  async function uploadAll() {
    setUploading(true);
    const uploaded: string[] = [];
    for (const item of previews) {
      if (item.uploaded) { uploaded.push(item.uploaded); continue; }
      const fd = new FormData();
      fd.append("file", item.file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (data.url) uploaded.push(data.url);
    }
    setPreviews((p) => p.map((item, i) => ({ ...item, uploaded: uploaded[i] })));
    setUploading(false);
    onUploaded(uploaded);
  }

  return (
    <div className="space-y-4">
      <div
        className="border-2 border-dashed border-green-300 rounded-xl p-8 text-center cursor-pointer hover:border-green-500 transition-colors"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
      >
        <Upload className="mx-auto h-10 w-10 text-green-400 mb-3" />
        <p className="text-sm font-medium text-gray-700">Drop photos here or click to browse</p>
        <p className="text-xs text-gray-400 mt-1">Up to {maxImages} photos, max 10MB each</p>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          multiple
          accept="image/*"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
      </div>

      {previews.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {previews.map((item, i) => (
            <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
              <img src={item.url} alt="" className="object-cover w-full h-full" />
              <button
                className="absolute top-1 right-1 bg-black/50 rounded-full p-0.5 text-white hover:bg-black/70"
                onClick={() => setPreviews((p) => p.filter((_, j) => j !== i))}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {previews.length > 0 && (
        <Button
          onClick={uploadAll}
          disabled={uploading}
          className="w-full bg-green-600 hover:bg-green-700"
        >
          {uploading ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading...</>
          ) : (
            `Analyze ${previews.length} Photo${previews.length > 1 ? "s" : ""}`
          )}
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Write `components/analysis/AnalysisResults.tsx`**

```typescript
"use client";

import { AnalysisResult } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, CheckCircle, Clock } from "lucide-react";

const PRIORITY_COLOR: Record<string, string> = {
  urgent: "bg-red-100 text-red-700 border-red-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
  low: "bg-green-100 text-green-700 border-green-200",
};

const ISSUE_LABEL: Record<string, string> = {
  grubs: "Grub Damage",
  weeds_broadleaf: "Broadleaf Weeds",
  weeds_grassy: "Grassy Weeds",
  fungus: "Fungal Disease",
  drought_stress: "Drought Stress",
  overwatering: "Overwatering",
  bare_spots: "Bare Spots",
  thatch: "Excess Thatch",
  compaction: "Soil Compaction",
  nutrient_deficiency: "Nutrient Deficiency",
  pests: "Pest Damage",
  healthy: "Healthy",
};

export function AnalysisResults({ result }: { result: AnalysisResult }) {
  const scoreColor = result.healthScore >= 70 ? "text-green-600" : result.healthScore >= 40 ? "text-yellow-600" : "text-red-600";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Lawn Health Score
            <span className={`text-4xl font-bold ${scoreColor}`}>{result.healthScore}/100</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Progress value={result.healthScore} className="h-3 mb-3" />
          <p className="text-sm text-gray-600">{result.summary}</p>
          {result.issues.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {result.issues.map((issue) => (
                <Badge key={issue} variant="outline" className={issue === "healthy" ? "border-green-300 text-green-700" : "border-orange-300 text-orange-700"}>
                  {issue === "healthy" ? <CheckCircle className="w-3 h-3 mr-1" /> : <AlertTriangle className="w-3 h-3 mr-1" />}
                  {ISSUE_LABEL[issue] ?? issue}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div>
        <h3 className="font-semibold text-lg mb-3">Recommendations</h3>
        <div className="space-y-3">
          {result.recommendations.map((rec, i) => (
            <Card key={i} className="border-l-4" style={{ borderLeftColor: rec.priority === "urgent" ? "#ef4444" : rec.priority === "high" ? "#f97316" : rec.priority === "medium" ? "#eab308" : "#22c55e" }}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h4 className="font-medium text-sm">{rec.title}</h4>
                  <Badge variant="outline" className={`text-xs shrink-0 ${PRIORITY_COLOR[rec.priority]}`}>
                    {rec.priority}
                  </Badge>
                </div>
                <p className="text-sm text-gray-600 mb-2">{rec.description}</p>
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <Clock className="w-3 h-3" /> {rec.timing}
                </div>
                {rec.productSuggestion && (
                  <div className="mt-2 text-xs bg-gray-50 rounded p-2 space-y-1">
                    <div><span className="font-medium">Product:</span> {rec.productSuggestion}</div>
                    {rec.applicationRate && <div><span className="font-medium">Rate:</span> {rec.applicationRate}</div>}
                    {rec.spreaderSetting && <div><span className="font-medium">Setting:</span> {rec.spreaderSetting}</div>}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write `app/(dashboard)/analyze/page.tsx`**

```typescript
"use client";

import { useState, useEffect } from "react";
import { PhotoUpload } from "@/components/analysis/PhotoUpload";
import { AnalysisResults } from "@/components/analysis/AnalysisResults";
import { AnalysisResult } from "@/types";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface YardProfile { id: string; name: string; grassType: string; zipCode: string; }

export default function AnalyzePage() {
  const [profiles, setProfiles] = useState<YardProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  useEffect(() => {
    fetch("/api/yard").then((r) => r.json()).then((data) => {
      setProfiles(data);
      if (data.length > 0) setSelectedProfileId(data[0].id);
    });
  }, []);

  async function handleUploaded(urls: string[]) {
    if (!selectedProfileId) return;
    setAnalyzing(true);
    setResult(null);
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: selectedProfileId, imageUrls: urls }),
    });
    const data = await res.json();
    setResult(data.result);
    setAnalyzing(false);
  }

  return (
    <div className="container max-w-2xl py-8 px-4">
      <h1 className="text-3xl font-bold text-green-700 mb-1">Analyze Your Lawn</h1>
      <p className="text-gray-500 mb-6">Upload photos and get AI-powered diagnosis and recommendations.</p>

      {profiles.length > 1 && (
        <div className="mb-4">
          <Select value={selectedProfileId} onValueChange={setSelectedProfileId}>
            <SelectTrigger><SelectValue placeholder="Select yard" /></SelectTrigger>
            <SelectContent>
              {profiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {profiles.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-gray-500">
            <p>Set up a yard profile first before analyzing photos.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <PhotoUpload onUploaded={handleUploaded} />
          {analyzing && (
            <div className="flex items-center justify-center gap-2 py-8 text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin text-green-500" />
              <span>Analyzing your lawn... this takes about 10 seconds</span>
            </div>
          )}
          {result && <div className="mt-6"><AnalysisResults result={result} /></div>}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: add photo upload and AI lawn analysis UI"
```

---

## Task 8: Dashboard

**Files:**
- Create: `app/(dashboard)/layout.tsx`
- Create: `app/(dashboard)/dashboard/page.tsx`
- Create: `components/dashboard/TaskList.tsx`
- Create: `components/yard/YardProfileCard.tsx`
- Modify: `app/layout.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Write `app/(dashboard)/layout.tsx`**

```typescript
import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth";
import { LayoutDashboard, Search, Settings, LogOut, Leaf } from "lucide-react";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-16">
          <Link href="/dashboard" className="flex items-center gap-2 font-bold text-green-700 text-lg">
            <Leaf className="w-5 h-5" /> Yard Buddy
          </Link>
          <div className="hidden sm:flex items-center gap-1">
            <Link href="/dashboard">
              <Button variant="ghost" size="sm"><LayoutDashboard className="w-4 h-4 mr-1" /> Dashboard</Button>
            </Link>
            <Link href="/analyze">
              <Button variant="ghost" size="sm"><Search className="w-4 h-4 mr-1" /> Analyze</Button>
            </Link>
            <Link href="/yard/setup">
              <Button variant="ghost" size="sm"><Settings className="w-4 h-4 mr-1" /> Setup</Button>
            </Link>
            <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
              <Button variant="ghost" size="sm" type="submit">
                <LogOut className="w-4 h-4 mr-1" /> Sign out
              </Button>
            </form>
          </div>
        </div>
      </nav>
      <main className="max-w-6xl mx-auto">
        {children}
      </main>
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t flex justify-around py-2">
        <Link href="/dashboard" className="flex flex-col items-center gap-0.5 text-xs text-gray-500 px-4 py-1">
          <LayoutDashboard className="w-5 h-5" /> Home
        </Link>
        <Link href="/analyze" className="flex flex-col items-center gap-0.5 text-xs text-gray-500 px-4 py-1">
          <Search className="w-5 h-5" /> Analyze
        </Link>
        <Link href="/yard/setup" className="flex flex-col items-center gap-0.5 text-xs text-gray-500 px-4 py-1">
          <Settings className="w-5 h-5" /> Setup
        </Link>
      </nav>
    </div>
  );
}
```

- [ ] **Step 2: Write `components/dashboard/TaskList.tsx`**

```typescript
"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, Clock, Package } from "lucide-react";

interface Task {
  id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  product?: string | null;
  applicationRate?: string | null;
  spreaderSetting?: string | null;
}

const PRIORITY_DOT: Record<string, string> = {
  urgent: "bg-red-500",
  high: "bg-orange-400",
  medium: "bg-yellow-400",
  low: "bg-green-400",
};

export function TaskList({ tasks: initial }: { tasks: Task[] }) {
  const [tasks, setTasks] = useState(initial);

  async function toggleTask(id: string, current: string) {
    const newStatus = current === "completed" ? "pending" : "completed";
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    setTasks((t) => t.map((task) => task.id === id ? { ...task, status: newStatus } : task));
  }

  const pending = tasks.filter((t) => t.status !== "completed");
  const completed = tasks.filter((t) => t.status === "completed");

  return (
    <div className="space-y-3">
      {pending.map((task) => (
        <Card key={task.id} className="hover:shadow-sm transition-shadow">
          <CardContent className="p-4">
            <div className="flex gap-3">
              <button onClick={() => toggleTask(task.id, task.status)} className="mt-0.5 shrink-0">
                <Circle className="w-5 h-5 text-gray-300 hover:text-green-500 transition-colors" />
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${PRIORITY_DOT[task.priority]}`} />
                  <span className="font-medium text-sm">{task.title}</span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">{task.description}</p>
                {task.product && (
                  <div className="mt-2 flex items-center gap-1 text-xs text-gray-400">
                    <Package className="w-3 h-3" />
                    <span>{task.product}</span>
                    {task.applicationRate && <span>· {task.applicationRate}</span>}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
      {pending.length === 0 && (
        <div className="text-center py-8 text-gray-400">
          <CheckCircle2 className="mx-auto w-10 h-10 mb-2 text-green-300" />
          <p className="text-sm">All caught up! Analyze your lawn for new tasks.</p>
        </div>
      )}
      {completed.length > 0 && (
        <details className="mt-4">
          <summary className="text-xs text-gray-400 cursor-pointer">
            {completed.length} completed task{completed.length > 1 ? "s" : ""}
          </summary>
          <div className="space-y-2 mt-2">
            {completed.map((task) => (
              <Card key={task.id} className="opacity-50">
                <CardContent className="p-3 flex gap-3">
                  <button onClick={() => toggleTask(task.id, task.status)}>
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  </button>
                  <span className="text-sm line-through text-gray-400">{task.title}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Write task PATCH API `app/api/tasks/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { status } = await req.json();
  const task = await db.lawnTask.findFirst({
    where: { id: params.id, yardProfile: { userId: session.user.id } },
  });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await db.lawnTask.update({
    where: { id: params.id },
    data: { status, completedAt: status === "completed" ? new Date() : null },
  });
  return NextResponse.json(updated);
}
```

- [ ] **Step 4: Write `app/(dashboard)/dashboard/page.tsx`**

```typescript
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WeatherWidget } from "@/components/dashboard/WeatherWidget";
import { TaskList } from "@/components/dashboard/TaskList";
import { Plus, Camera } from "lucide-react";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const yards = await db.yardProfile.findMany({
    where: { userId: session.user.id },
    include: {
      tasks: { where: { status: "pending" }, orderBy: { createdAt: "desc" }, take: 20 },
      analyses: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  });

  if (yards.length === 0) redirect("/yard/setup");

  const yard = yards[0];
  const latestScore = yard.analyses[0]?.healthScore;

  return (
    <div className="px-4 py-6 pb-20 sm:pb-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Good morning, {session.user.name?.split(" ")[0]}!
          </h1>
          <p className="text-gray-500 text-sm">{yard.name} · {yard.grassType.replace(/_/g, " ")} grass</p>
        </div>
        {latestScore != null && (
          <div className="text-center">
            <div className={`text-3xl font-bold ${latestScore >= 70 ? "text-green-600" : latestScore >= 40 ? "text-yellow-600" : "text-red-600"}`}>
              {latestScore}
            </div>
            <div className="text-xs text-gray-400">Health Score</div>
          </div>
        )}
      </div>

      <WeatherWidget zip={yard.zipCode} />

      <div className="grid grid-cols-2 gap-3">
        <Link href="/analyze">
          <Button className="w-full bg-green-600 hover:bg-green-700 h-12">
            <Camera className="mr-2 w-4 h-4" /> Analyze Lawn
          </Button>
        </Link>
        <Link href="/yard/setup">
          <Button variant="outline" className="w-full h-12">
            <Plus className="mr-2 w-4 h-4" /> Add Yard
          </Button>
        </Link>
      </div>

      <div>
        <h2 className="font-semibold text-lg mb-3">Your Tasks</h2>
        {yard.tasks.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-gray-500 text-sm mb-3">No tasks yet. Analyze your lawn to get started.</p>
              <Link href="/analyze">
                <Button className="bg-green-600 hover:bg-green-700">Analyze My Lawn</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <TaskList tasks={yard.tasks} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Write landing page `app/page.tsx`**

```typescript
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CheckCircle } from "lucide-react";

const FEATURES = [
  "AI-powered lawn diagnosis from photos",
  "Personalized care schedules by grass type",
  "Exact product amounts and spreader settings",
  "Weather-aware recommendations",
  "Issue detection: weeds, grubs, fungus & more",
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50">
      <nav className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
        <span className="text-xl font-bold text-green-700">🌿 Yard Buddy</span>
        <div className="flex gap-2">
          <Link href="/login"><Button variant="ghost">Sign in</Button></Link>
          <Link href="/register"><Button className="bg-green-600 hover:bg-green-700">Get started free</Button></Link>
        </div>
      </nav>
      <div className="max-w-4xl mx-auto px-6 py-20 text-center">
        <h1 className="text-5xl font-bold text-gray-900 mb-4 leading-tight">
          Your AI lawn expert,<br />
          <span className="text-green-600">always on call.</span>
        </h1>
        <p className="text-xl text-gray-500 mb-8 max-w-xl mx-auto">
          Stop guessing. Upload a photo, get a diagnosis, and know exactly what to apply, when, and how much.
        </p>
        <Link href="/register">
          <Button size="lg" className="bg-green-600 hover:bg-green-700 text-lg px-8 h-14">
            Start for free — no credit card
          </Button>
        </Link>
        <div className="mt-12 grid sm:grid-cols-1 gap-3 text-left max-w-md mx-auto">
          {FEATURES.map((f) => (
            <div key={f} className="flex items-center gap-3 text-gray-600">
              <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
              <span>{f}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Verify full flow**

```bash
npm run dev
```

Full happy path test:
1. Visit http://localhost:3000 — landing page renders
2. Register a new account → redirected to /login
3. Sign in → redirected to /dashboard → redirected to /yard/setup (no yards yet)
4. Complete 4-step yard setup → redirected to /dashboard
5. Dashboard shows yard name, weather widget, empty task list with "Analyze My Lawn" CTA
6. Click Analyze → upload a photo of grass → wait ~10 seconds → see health score, issues, recommendations
7. Return to dashboard → tasks now appear from the analysis
8. Check a task off → it moves to completed section

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "feat: add dashboard with task list, weather widget, and landing page"
```

---

## Task 9: TypeScript and Lint Pass

**Files:** All `*.ts` and `*.tsx` files

- [ ] **Step 1: Run TypeScript check**

```bash
npx tsc --noEmit
```

Fix any type errors. Common fixes:
- Add `"use client"` to components that use hooks
- Add `declare module "*.png"` if using local images
- Ensure `session.user.id` is typed in `next-auth.d.ts`

- [ ] **Step 2: Create `types/next-auth.d.ts`**

```typescript
import NextAuth from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
```

- [ ] **Step 3: Run ESLint**

```bash
npm run lint
```

Fix any reported issues. The most common: missing `alt` on images, unescaped HTML entities.

- [ ] **Step 4: Run production build**

```bash
npm run build
```

Expected: Build completes with no errors. Warnings about non-critical items are acceptable.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "fix: resolve TypeScript errors and lint warnings"
```

---

## Task 10: Deployment

**Files:**
- Create: `vercel.json` (optional)

- [ ] **Step 1: Push to GitHub**

```bash
gh repo create yard-buddy --public --source=. --remote=origin --push
```

- [ ] **Step 2: Deploy to Vercel**

```bash
npx vercel --prod
```

Or connect via https://vercel.com/new — import the GitHub repo.

Set all environment variables from `.env.example` in Vercel's environment variable settings.

- [ ] **Step 3: Set `NEXTAUTH_URL` to production URL**

In Vercel env vars: `NEXTAUTH_URL=https://your-app.vercel.app`

- [ ] **Step 4: Verify production deploy**

Visit the production URL:
- Register an account
- Complete yard setup
- Upload a photo and get analysis
- Confirm tasks appear on dashboard

- [ ] **Step 5: Final commit**

```bash
git add .
git commit -m "feat: production deployment configuration"
git push
```

---

## Self-Review

**Spec coverage check:**
- [x] Auth login / register with security — Task 3
- [x] Yard profile (grass type, size, zip, spreader) — Task 4
- [x] Weather integration — Task 5
- [x] Claude AI recommendations — Task 6
- [x] Photo upload and analysis — Task 7
- [x] Issue detection (grubs, weeds, fungus, etc.) — Task 6/7
- [x] Task list with product, rate, spreader setting — Tasks 7/8
- [x] Mobile + desktop responsive UI — Tasks 8 (mobile nav, tailwind responsive)
- [x] Landing page — Task 8
- [x] Deployment — Task 10
- [ ] Soil moisture / pH device recommendations — Deferred to Phase 2
- [ ] Product pricing / where to buy cheapest — Deferred to Phase 3
- [ ] Payment details / Stripe — Deferred to Phase 4
- [ ] Push notifications / periodic photo reminders — Deferred to Phase 2
- [ ] Seed amount recommendations — Partial (applicationRate field exists, Phase 3 adds pricing)

**Type consistency:** `GrassType`, `LawnIssue`, `RecommendationItem`, `AnalysisResult` all defined in `types/index.ts` and used consistently. `YardProfileInput` from Zod schema used in both form and API. Task status/priority strings match Prisma schema defaults.
