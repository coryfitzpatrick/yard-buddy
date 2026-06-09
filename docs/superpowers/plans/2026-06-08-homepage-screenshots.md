# Homepage Screenshots Plan

## Goal
Capture demo account screenshots that showcase the app's capabilities and entice users to sign up. The demo data is seeded via `scripts/seed-demo.ts` using the Henderson Property (Atlanta, GA) and Rivera Property (Austin, TX).

## Data Fixes Applied
Three inaccuracies were corrected in the seed file before screenshots:
- Milorganite application rate: `36 lbs / 2,200 sq ft` → `1 bag (36 lbs) covers 2,200–2,500 sq ft`
- Milorganite spreader setting: `7.5` → `5.5` (prior value exceeded recommended range)
- Zoysia soil pH (Rivera front yard): `6.9` → `6.4` (ideal range is 6.0–6.5; prior value went unremarked)

Re-run `npx tsx scripts/seed-demo.ts` with the demo account before capturing screenshots.

---

## Screenshots (Priority Order)

### 1. Section Detail — Henderson Front Yard ⭐ Priority 1
**Route:** `/yard/[id]/sections/[frontYardId]`

**What it shows:**
- Health score **88** (green) with the 32→74→88 trend chart — a before/after story in one view
- Professional AI analysis text flagging minor dollar spot in one corner
- Pending task card with fungicide product, dose, and scheduled date

**Crop:** Top half of the page (score + chart + analysis summary).

**Caption idea:** "AI monitors your lawn over time and tells you exactly what's wrong."

---

### 2. Section Detail — Task Area ⭐ Priority 2
**Route:** Same page as above, scrolled to the tasks section

**What it shows:**
- Summer fertilizer task: `Lesco 34-0-6 Slow-Release Fertilizer`
- Application rate: `2.94 lbs / 1,000 sq ft`
- Spreader setting: `4.0`
- Scheduled date 2 weeks out

**Why this matters:** This is the strongest differentiator — no competitor gives exact product + spreader setting per your specific spreader model.

**Caption idea:** "Exact products, exact amounts, exact spreader settings — for your spreader."

---

### 3. Yard Detail — Henderson Property ⭐ Priority 3
**Route:** `/yard/[id]`

**What it shows:**
- Four sections with color-coded health scores
- Health trend sparklines on each section card
- Weather widget for Atlanta
- Tasks summary section below

**Caption idea:** "Every section of your yard, organized in one place."

---

### 4. Section Detail — Rivera Back Yard (optional)
**Route:** `/yard/[id]/sections/[riveraBackId]`

**What it shows:**
- Health score **81** with early chinch bug detection
- Shows the app works in a different region (Austin, TX) and grass type (St. Augustine)
- Demonstrates pest detection capability

**Caption idea:** "Catches problems early, before they spread."

---

### 5. Dashboard (optional)
**Route:** `/dashboard`

**What it shows:**
- Two yards managed side by side
- High-level health and task summary

Only worth including if the dashboard UI is visually polished. Demonstrates multi-property management for power users.

---

## Recommended Final Selection for ScreenshotSection Component

Use 2–3 screenshots in `components/home/ScreenshotSection.tsx`:

| Slot | Screenshot | Hook |
|------|-----------|------|
| 1 (hero) | Health score + trend chart (Shot 1) | Emotional — shows progress over time |
| 2 | Task with spreader setting detail (Shot 2) | Rational — shows specificity competitors lack |
| 3 (optional) | Yard detail overview (Shot 3) | Breadth — shows full yard management |

All screenshots should use the "Example data" badge already built into the component.
