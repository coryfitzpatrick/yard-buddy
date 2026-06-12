# Validation Score History

Each row is one committed run. Commit the prompt after each run to create a restore point.

Score interpretation: **90+ = releasable** | 85–89 = mostly trustworthy | 78–84 = supplementary | <75 = not ready

## Summary Table

| Run | Commit | Date | P1 (pass/9) | P2 (pass/165) | P3 Mean | Notes |
|-----|--------|------|-------------|---------------|---------|-------|
| baseline | — | 2026-06-11 | — | — | 78.9 | Sonnet 4.6, no domain tuning |
| 1 | — | 2026-06-11 | — | — | 81.7 | Opus (worse than Sonnet) |
| 2 | — | 2026-06-11 | — | — | 83.6 | Sonnet wins, domain v1 |
| 3 | — | 2026-06-12 | 8/9 | 159/165 | 80.4 | Mid-session, several rule false positives |
| 4 | — | 2026-06-12 | 9/9 | 163/165 | 83.3 | Fixed rule assertions |
| 8 | 04e0771 | 2026-06-12 | 8/9 | 165/165 | 82.5 | P2 clean; P1 sqft-zero bug (fixed in 9189ebd after run start); centipede 52 regression |
| 9 | 9189ebd | 2026-06-12 | 8/9 | 163/165 | 82.2 | centipede 72 (improved from 52); SA mowing still 2" in P2; stochastic drops in kbg, ryegrass, bermuda-drought |
| 10 | d65d281 | 2026-06-12 | — | — | pending | All fixes: centipede gray leaf spot, Poa annua, SA mowing constraint, atrazine rain, bermuda mowing, pre-emergent timing, irrigation volumes |

## Scenario Scores by Run

| Scenario | R3 | R4 | R8 | R9 | R10 |
|----------|----|----|----|----|-----|
| fall-preemergent | 82 | 88 | 88 | 82 | — |
| kbg-july-heat | 91 | 91 | 91 | 82 | — |
| ryegrass-spring | 82 | 82 | 82 | 72 | — |
| tall-fescue-low-ph | 72 | 82 | 82 | 82 | — |
| drought-cool | 92 | 91 | 82 | 88 | — |
| grub-damage | 88 | 88 | 91 | 88 | — |
| high-ph | 62 | 62 | 82 | 82 | — |
| overwatering | 91 | 82 | 91 | 91 | — |
| recently-seeded | 62 | 62 | 82 | 88 | — |
| sparse-profile | 72 | 91 | 91 | 88 | — |
| bermuda-dormancy | 82 | 72 | 82 | 82 | — |
| bermuda-drought | 88 | 91 | 82 | 72 | — |
| centipede-summer | 82 | 91 | 52 | 72 | — |
| st-augustine-summer | 78 | 88 | 78 | 82 | — |
| zoysia-spring | 82 | 88 | 82 | 82 | — |

## Key Fixes by Run

**Run 8 commits (04e0771 and prior):**
- fungicide rule skips prohibitive mentions
- cool-season grass climate suitability in Zone 8+
- Houston zone 9b correction
- waterlogged soil constraint for drainage scenarios
- centipede N-only rates, dormancy summer annuals, lime/dolomitic
- starter fertilizer timing - only day 0-3
- simplify recently-seeded constraint
- high-pH soil management with iron chlorosis diagnosis
- drought mowing height + lower temp threshold to 80°F
- mowing height range fixes (SA 3", ryegrass cap 3.5")
- overseedSoilTemp rule: skip past-seeding scenarios
- preEmergentSoilTemp rule: skip prohibitive mentions
- invalid yard size Pillar 1 constraint (9189ebd)

**Run 10 commits (165ed35..7804843):**
- Centipede: gray leaf spot primary disease (not dollar spot); max 1 lb N/yr per Clemson HGIC; NEVER product weight in lbs; Clemson HGIC ref for SC
- Bermuda common: mowing 1.5–2.5" per UGA (was 1–2")
- SA: atrazine defer when rain <48h or soil wet/moist; chinch bug threshold 20–25 per sqft (UF/IFAS)
- Lime + low pH: forbid ammonium sulfate alongside lime (acidifying contradiction)
- Poa annua: classified as grassy weed — broadleaf herbicides don't work
- Invalid pH boundary: test now verifies schema rejects pH=14 (not AI uncertainty)
- Crabgrass pre-emergent: apply at 50–53°F window (not at 55°F which is too late)
- Winter annual pre-emergent: apply at/below 70°F (not waiting for 55°F)
- Granular pre-emergent activation: always cite 0.5" water requirement
- Phoenix bermuda irrigation: 1.5–2.5"/WEEK total, not per session
- Hydretain: no unsupported efficiency claims
- Zoysia spring: defer broadleaf herbicides until 50%+ green; no premature irrigation
- SA mowing buildContextWarnings: hard 3" minimum constraint at runtime
- SA pre-emergent: must always cite soil temperature (65–70°F in fall)

## Known Remaining Issues

| Scenario | Issue | Source |
|----------|-------|--------|
| centipede-summer | Dollar spot (wrong disease), product weight in lbs, mustNotInclude match | Run 8 judge |
| st-augustine-summer | Atrazine with rain forecast; chinch bug threshold 20–25 not 15–20 | Run 8 judge |
| tall-fescue-low-ph | Ammonium sulfate + lime contradiction; buffer pH URL; 3–4 week lime timeline optimistic | Run 8 judge |
| bermuda-dormancy | Mowing height 1–2" (UGA recommends 1.5–2.5" for common bermuda) | Run 8 judge |
| ryegrass-spring | Pre-emergent threshold framing (50–55°F for 3–5 days vs "before 55°F") | Run 8 judge |
| zoysia-spring | Poa annua grouped as broadleaf; irrigation resumed too early in green-up | Run 8 judge |
