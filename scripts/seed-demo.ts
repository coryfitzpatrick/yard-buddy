/**
 * Seed realistic demo data for homepage screenshots.
 * Run with: npx tsx scripts/seed-demo.ts
 *
 * Creates (or reuses) a demo user and populates two full properties
 * with sections, analyses, and tasks that look great in screenshots.
 *
 * Set DEMO_EMAIL env var to target a specific account (default: demo@yardbuddy.app)
 * Set DEMO_YARD_NAME to customize the property name.
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const DEMO_EMAIL = process.env.DEMO_EMAIL ?? "demo@yardbuddy.app";
const DEMO_NAME = "Alex Henderson";
const YARD_NAME = "Henderson Property";
const YARD2_NAME = "Rivera Property";

const BASE_URL =
  "https://mdifuduuqpofnkqmlkgw.supabase.co/storage/v1/object/public/lawn-photos/demo/v2";

function daysAgo(n: number) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

async function main() {
  console.log(`Seeding demo data for ${DEMO_EMAIL}…`);

  // ── User ───────────────────────────────────────────────────────────────────
  const user = await db.user.upsert({
    where: { email: DEMO_EMAIL },
    update: { name: DEMO_NAME },
    create: { email: DEMO_EMAIL, name: DEMO_NAME },
  });
  console.log(`User: ${user.id}`);

  // Remove any existing demo yards so we start fresh each run
  await db.yard.deleteMany({ where: { userId: user.id, name: YARD_NAME } });
  await db.yard.deleteMany({ where: { userId: user.id, name: YARD2_NAME } });

  // ── Yard 1: Henderson Property (Atlanta, GA) ───────────────────────────────
  const yard = await db.yard.create({
    data: {
      userId: user.id,
      name: YARD_NAME,
      zipCode: "30338",
      streetAddress: "142 Maple Ridge Dr",
      city: "Atlanta",
      state: "GA",
      latitude: 33.9526,
      longitude: -84.3499,
      lotSqft: 12400,
      buildingSqft: 2800,
      spreaderType: "broadcast",
      spreaderModel: "Scotts Turf Builder EdgeGuard DLX",
    },
  });
  console.log(`Yard 1: ${yard.id}`);

  // ── Sections — Henderson ───────────────────────────────────────────────────
  const frontYard = await db.yardSection.create({
    data: {
      yardId: yard.id,
      name: "Front Yard",
      areaType: "front",
      grassType: "bermuda",
      yardSizeSqft: 2200,
      soilPh: 6.8,
      nitrogenPpm: 28,
      phosphorusPpm: 22,
      potassiumPpm: 142,
      organicMatterPct: 2.8,
      soilTestSource: "UGA Cooperative Extension Lab",
      soilMoisture: "moderate",
      notes: "Gets full sun all day. Slight slope toward the street drains well.",
    },
  });

  const backYard = await db.yardSection.create({
    data: {
      yardId: yard.id,
      name: "Back Yard",
      areaType: "back",
      grassType: "bermuda",
      yardSizeSqft: 3800,
      soilPh: 6.5,
      soilMoisture: "moderate",
      notes: "Full sun. Kids play area near the deck needs extra wear recovery.",
    },
  });

  const sideShadyYard = await db.yardSection.create({
    data: {
      yardId: yard.id,
      name: "Left Side Yard",
      areaType: "left_side",
      grassType: "tall_fescue",
      yardSizeSqft: 820,
      soilPh: 6.2,
      soilMoisture: "moist",
      notes: "Shaded by the neighbor's oak most of the day. Fescue holds better here than bermuda.",
    },
  });

  const backGarden = await db.yardSection.create({
    data: {
      yardId: yard.id,
      name: "Back Patio Border",
      areaType: "garden",
      grassType: "st_augustine",
      yardSizeSqft: 440,
      soilPh: 6.4,
      soilMoisture: "moderate",
      notes: "Decorative border around the patio. Partial shade in the afternoon.",
    },
  });

  console.log(`Sections: ${frontYard.id}, ${backYard.id}, ${sideShadyYard.id}, ${backGarden.id}`);

  // ── Analyses — Front Yard (3 months of history) ───────────────────────────
  const frontAnalysis1 = await db.lawnAnalysis.create({
    data: {
      yardSectionId: frontYard.id,
      imageUrls: [`${BASE_URL}/patchy.jpg`],
      healthScore: 62,
      issues: ["thin coverage near driveway edge", "early signs of crabgrass", "low nitrogen"],
      summary:
        "The bermuda is coming out of dormancy but showing low density near the driveway where salt runoff likely occurred over winter. There's early-stage crabgrass pressure on the south-facing slope — pre-emergent window is closing. Nitrogen levels are low for this growth stage; a starter application would accelerate green-up significantly. Overall health is fair, with a clear recovery path if treated in the next 2 weeks.",
      rawResponse: "",
      createdAt: daysAgo(82),
    },
  });

  const frontAnalysis2 = await db.lawnAnalysis.create({
    data: {
      yardSectionId: frontYard.id,
      imageUrls: [`${BASE_URL}/recovering.jpg`],
      healthScore: 74,
      issues: ["occasional dry patches near mailbox post", "minor thatch buildup"],
      summary:
        "Good recovery since the last analysis — nitrogen treatment clearly worked and coverage is much denser. The crabgrass pressure has been controlled. There are still occasional dry patches concentrated near the mailbox post, likely a compaction issue from foot traffic. A light core aeration pass in that zone would help. Thatch is starting to build at about 3/4 inch; keep an eye on it but not urgent yet.",
      rawResponse: "",
      createdAt: daysAgo(48),
    },
  });

  const frontAnalysis3 = await db.lawnAnalysis.create({
    data: {
      yardSectionId: frontYard.id,
      imageUrls: [`${BASE_URL}/healthy-front.jpg`],
      healthScore: 88,
      issues: ["minor dollar spot in low-drainage corner"],
      summary:
        "This bermuda is looking excellent — dense, uniform color, and strong recovery from the spring issues. Only concern is a small dollar spot cluster in the low corner where water pools after rain. The recent wet weather pattern has favored it. One fungicide application (Heritage or Spectracide Immunox) targeted to that corner should resolve it. All other areas are thriving; hold off on any more nitrogen until the dollar spot is cleared.",
      rawResponse: "",
      createdAt: daysAgo(12),
    },
  });

  // ── Analyses — Back Yard ───────────────────────────────────────────────────
  const backAnalysis1 = await db.lawnAnalysis.create({
    data: {
      yardSectionId: backYard.id,
      imageUrls: [`${BASE_URL}/back-yard.jpg`],
      healthScore: 79,
      issues: ["wear damage in play area", "uneven growth near fence line"],
      summary:
        "The back yard bermuda is healthy overall with a strong color and good density in most areas. The play zone near the deck shows predictable wear stress — a targeted overseeding or sod patch with bermuda plugs would restore it. The uneven growth along the north fence is likely from shading; consider trimming the fence line shrubs back 6–8 inches to improve light penetration. Good candidate for a balanced 16-4-8 fertilizer at 1 lb N/1,000 sq ft.",
      rawResponse: "",
      createdAt: daysAgo(34),
    },
  });

  // ── Analyses — Left Side (fescue history) ─────────────────────────────────
  const sideAnalysis1 = await db.lawnAnalysis.create({
    data: {
      yardSectionId: sideShadyYard.id,
      imageUrls: [`${BASE_URL}/side-yard.jpg`],
      healthScore: 71,
      issues: ["moss encroachment in densest shade", "low soil pH limiting nutrient uptake"],
      summary:
        "Tall fescue is the right call for this shaded side yard and it's performing reasonably well. Moss is starting to fill in the densest shade zones near the fence — this is typical for this pH and light level. Liming to raise the pH toward 6.5 will reduce moss competition. A slow-release fertilizer formulated for shade grass (lower nitrogen, higher potassium) would support root depth over top growth. Consider overseeding in early September with a shade-tolerant TTTF blend.",
      rawResponse: "",
      createdAt: daysAgo(55),
    },
  });

  console.log("Henderson analyses created.");

  // ── Tasks — Front Yard ────────────────────────────────────────────────────
  await db.lawnTask.createMany({
    data: [
      // Completed tasks (historical)
      {
        yardSectionId: frontYard.id,
        analysisId: frontAnalysis1.id,
        title: "Apply pre-emergent herbicide",
        description:
          "Apply Scotts Halts or Sta-Green Crabgrass Preventer at 2.87 lbs/1,000 sq ft before soil temp hits 55°F to close the crabgrass window. Use spreader setting 4.5 on your Scotts EdgeGuard DLX.",
        priority: "high",
        status: "completed",
        product: "Scotts Halts Crabgrass Preventer",
        applicationRate: "2.87 lbs / 1,000 sq ft",
        spreaderSetting: "4.5",
        scheduledStart: daysAgo(80),
        scheduledEnd: daysAgo(78),
        completedAt: daysAgo(79),
        createdAt: daysAgo(82),
        updatedAt: daysAgo(79),
      },
      {
        yardSectionId: frontYard.id,
        analysisId: frontAnalysis1.id,
        title: "Starter fertilizer for spring green-up",
        description:
          "Apply a 5-10-31 starter fertilizer at 1.5 lbs N/1,000 sq ft to jumpstart bermuda green-up. Milorganite 6-4-0 is a good organic option (~$18/bag at Lowe's) or use Scotts Turf Builder 30-0-4 for faster results (~$45 for 12,500 sq ft coverage).",
        priority: "high",
        status: "completed",
        product: "Milorganite 6-4-0 Organic Fertilizer",
        applicationRate: "36 lbs / 2,200 sq ft",
        spreaderSetting: "7.5",
        scheduledStart: daysAgo(75),
        scheduledEnd: daysAgo(73),
        completedAt: daysAgo(74),
        createdAt: daysAgo(82),
        updatedAt: daysAgo(74),
      },
      {
        yardSectionId: frontYard.id,
        analysisId: frontAnalysis2.id,
        title: "Core aerate near mailbox post",
        description:
          "Rent a core aerator for the driveway-adjacent 200 sq ft zone. Compaction from foot traffic is creating dry patches. Aerate when soil is slightly moist (not soggy) for best plug removal. Follow up with a light topdressing of compost.",
        priority: "medium",
        status: "completed",
        scheduledStart: daysAgo(44),
        scheduledEnd: daysAgo(44),
        completedAt: daysAgo(43),
        createdAt: daysAgo(48),
        updatedAt: daysAgo(43),
      },
      // Active / upcoming tasks
      {
        yardSectionId: frontYard.id,
        analysisId: frontAnalysis3.id,
        title: "Treat dollar spot fungus in NW corner",
        description:
          "Target the low-drainage corner (approx 150 sq ft) with a fungicide. Heritage G granular (~$28 at SiteOne) or Spectracide Immunox liquid (~$14 at Home Depot) both effective. Apply when temps are below 85°F, ideally in early morning. One application should clear it within 10-14 days.",
        priority: "high",
        status: "pending",
        product: "Spectracide Immunox Multi-Purpose Fungicide",
        applicationRate: "2 fl oz / gallon, 1 gallon / 150 sq ft",
        scheduledStart: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
        scheduledEnd: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        createdAt: daysAgo(12),
        updatedAt: daysAgo(12),
      },
      {
        yardSectionId: frontYard.id,
        analysisId: frontAnalysis3.id,
        title: "Summer fertilizer application",
        description:
          "Bermuda peak growth window. Apply a high-nitrogen slow-release fertilizer. Recommend Lesco 34-0-6 (professional grade, ~$28/50 lbs at SiteOne) at 1 lb N/1,000 sq ft, or Scotts Turf Builder 30-0-4 (~$22 at Walmart). Spreader setting 4.0 on your EdgeGuard DLX for the Lesco product.",
        priority: "medium",
        status: "pending",
        product: "Lesco 34-0-6 Slow-Release Fertilizer",
        applicationRate: "2.94 lbs / 1,000 sq ft",
        spreaderSetting: "4.0",
        scheduledStart: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        scheduledEnd: new Date(Date.now() + 16 * 24 * 60 * 60 * 1000),
        createdAt: daysAgo(12),
        updatedAt: daysAgo(12),
      },
    ],
  });

  // ── Tasks — Back Yard ─────────────────────────────────────────────────────
  await db.lawnTask.createMany({
    data: [
      {
        yardSectionId: backYard.id,
        analysisId: backAnalysis1.id,
        title: "Repair wear damage in play area",
        description:
          "The 200 sq ft high-traffic zone near the deck needs renovation. Options: (1) Bermuda plugs from a nursery, ~$35 for a tray that covers 200 sq ft — fastest visual result. (2) Bermuda seed (Pennington 1 lb, ~$8) — slower but more economical. Water twice daily for 3 weeks while establishing.",
        priority: "medium",
        status: "pending",
        product: "Bermuda Grass Plugs",
        scheduledStart: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        scheduledEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: daysAgo(34),
        updatedAt: daysAgo(34),
      },
      {
        yardSectionId: backYard.id,
        analysisId: backAnalysis1.id,
        title: "Balanced fertilizer — full back yard",
        description:
          "Apply a 16-4-8 balanced fertilizer at 1 lb N/1,000 sq ft across all 3,800 sq ft. Scotts Turf Builder with Moss Control (32-0-10, ~$38) works well here, or Jonathan Green 22-0-6 (~$41 at Ace Hardware) for a more even N release. Spreader setting 5.5 on the EdgeGuard DLX.",
        priority: "medium",
        status: "completed",
        product: "Jonathan Green 22-0-6 Summer Fertilizer",
        applicationRate: "4.5 lbs / 1,000 sq ft",
        spreaderSetting: "5.5",
        scheduledStart: daysAgo(30),
        scheduledEnd: daysAgo(28),
        completedAt: daysAgo(29),
        createdAt: daysAgo(34),
        updatedAt: daysAgo(29),
      },
    ],
  });

  // ── Tasks — Left Side Yard ────────────────────────────────────────────────
  await db.lawnTask.createMany({
    data: [
      {
        yardSectionId: sideShadyYard.id,
        analysisId: sideAnalysis1.id,
        title: "Lime application to raise soil pH",
        description:
          "Apply pelletized lime at 40 lbs/1,000 sq ft to raise pH from 6.2 toward the target 6.5 for tall fescue. Pennington Fast Acting Lime (~$12/30 lbs at Home Depot) or Espoma Organic Garden Lime (~$16 at Lowe's). One application; re-test in 60 days.",
        priority: "high",
        status: "completed",
        product: "Pennington Fast Acting Lime",
        applicationRate: "32.8 lbs / 820 sq ft",
        completedAt: daysAgo(50),
        scheduledStart: daysAgo(53),
        scheduledEnd: daysAgo(51),
        createdAt: daysAgo(55),
        updatedAt: daysAgo(50),
      },
      {
        yardSectionId: sideShadyYard.id,
        analysisId: sideAnalysis1.id,
        title: "Overseed with shade-tolerant tall fescue blend",
        description:
          "Best window: late August through September when soil is still warm but air temps are cooling. Use a shade-tolerant TTTF blend — Jonathan Green Black Beauty Ultra (~$42/7 lbs, covers 700 sq ft) or Pennington Smart Seed Tall Fescue (~$28/3 lbs). Scalp existing turf to 1.5 inches, aerate lightly, seed at 8 lbs/1,000 sq ft, keep moist for 3 weeks.",
        priority: "medium",
        status: "pending",
        product: "Jonathan Green Black Beauty Ultra Shade Mix",
        applicationRate: "8 lbs / 1,000 sq ft",
        scheduledStart: new Date(Date.now() + 75 * 24 * 60 * 60 * 1000),
        scheduledEnd: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        createdAt: daysAgo(55),
        updatedAt: daysAgo(55),
      },
    ],
  });

  console.log("Henderson tasks created.");

  // ── Yard 2: Rivera Property (Austin, TX) ──────────────────────────────────
  const yard2 = await db.yard.create({
    data: {
      userId: user.id,
      name: YARD2_NAME,
      zipCode: "78701",
      streetAddress: "2847 Shoal Creek Blvd",
      city: "Austin",
      state: "TX",
      latitude: 30.2849,
      longitude: -97.7341,
      lotSqft: 9200,
      buildingSqft: 1950,
      spreaderType: "broadcast",
      spreaderModel: "Earthway 2150 Commercial",
    },
  });
  console.log(`Yard 2: ${yard2.id}`);

  // ── Sections — Rivera ──────────────────────────────────────────────────────
  const rivera_front = await db.yardSection.create({
    data: {
      yardId: yard2.id,
      name: "Front Yard",
      areaType: "front",
      grassType: "zoysia",
      yardSizeSqft: 1800,
      soilPh: 6.9,
      soilMoisture: "moderate",
      notes: "Full sun, slight slope away from house. HOA requires uniform green coverage.",
    },
  });

  const rivera_back = await db.yardSection.create({
    data: {
      yardId: yard2.id,
      name: "Back Yard",
      areaType: "back",
      grassType: "st_augustine",
      yardSizeSqft: 3200,
      soilPh: 6.6,
      soilMoisture: "moderate",
      notes: "Covered patio takes up 400 sq ft. Rest gets partial afternoon shade from live oaks.",
    },
  });

  const rivera_right = await db.yardSection.create({
    data: {
      yardId: yard2.id,
      name: "Right Side",
      areaType: "right_side",
      grassType: "st_augustine",
      yardSizeSqft: 620,
      soilPh: 6.4,
      soilMoisture: "moist",
      notes: "Narrow strip between house and fence. Gets afternoon shade, tends to stay moist.",
    },
  });

  console.log(`Rivera sections: ${rivera_front.id}, ${rivera_back.id}, ${rivera_right.id}`);

  // ── Analyses — Rivera Front Yard ──────────────────────────────────────────
  const riveraFrontAnalysis = await db.lawnAnalysis.create({
    data: {
      yardSectionId: rivera_front.id,
      imageUrls: [`${BASE_URL}/zoysia.jpg`],
      healthScore: 68,
      issues: ["broadleaf weed pressure along HOA border", "drought stress from July heat", "thin coverage on slope"],
      summary:
        "The zoysia front yard is holding its own through the Austin summer heat but is showing drought stress along the slope where irrigation coverage is weakest. Broadleaf weeds — primarily dollar weed and spurge — are moving in along the HOA border strip. The HOA uniform-coverage requirement means we need to address the thin areas on the slope proactively. A targeted post-emergent and deep watering schedule adjustment will be the priority this cycle.",
      rawResponse: "",
      createdAt: daysAgo(45),
    },
  });

  // ── Analyses — Rivera Back Yard ───────────────────────────────────────────
  const riveraBackAnalysis = await db.lawnAnalysis.create({
    data: {
      yardSectionId: rivera_back.id,
      imageUrls: [`${BASE_URL}/back-yard-2.jpg`],
      healthScore: 81,
      issues: ["early chinch bug activity near patio edge"],
      summary:
        "St. Augustine is performing well under the live oaks — the partial shade is actually ideal for this grass type in the Austin heat. Early chinch bug signs are visible along the sunny patio edge where the grass transitions to full sun: yellowing in irregular patches that don't respond to watering. Catching this early is critical. A bifenthrin-based insecticide application now will prevent the kind of widespread damage that's common in Austin summers. Rest of the back yard looks healthy.",
      rawResponse: "",
      createdAt: daysAgo(20),
    },
  });

  // ── Analyses — Rivera Right Side ──────────────────────────────────────────
  const riveraRightAnalysis = await db.lawnAnalysis.create({
    data: {
      yardSectionId: rivera_right.id,
      imageUrls: [`${BASE_URL}/lush-lawn.jpg`],
      healthScore: 55,
      issues: ["shade stress causing thin coverage", "moss and algae encroachment", "poor drainage keeping soil too wet"],
      summary:
        "This narrow strip is struggling — the combination of afternoon shade from the fence and the house retaining moisture is creating conditions that favor moss and algae over St. Augustine. The grass is visibly thin, and in the dampest zones near the downspout, moss has taken over almost entirely. St. Augustine can handle shade better than most warm-season grasses, but this level of moisture plus shade is too much. Improving drainage with a channel near the downspout and treating moss with a ferrous sulfate solution will help, but realistic expectations: this area will always require more maintenance than open sections.",
      rawResponse: "",
      createdAt: daysAgo(20),
    },
  });

  console.log("Rivera analyses created.");

  // ── Tasks — Rivera Front Yard ─────────────────────────────────────────────
  await db.lawnTask.createMany({
    data: [
      {
        yardSectionId: rivera_front.id,
        analysisId: riveraFrontAnalysis.id,
        title: "Post-emergent broadleaf weed control",
        description:
          "Spot-treat dollar weed and spurge along the HOA border with a broadleaf herbicide safe for zoysia. Southern AG Lawn Weed Killer with Trimec (~$18 at Calloway's Nursery) or Ortho Weed B Gon Chickweed, Clover & Oxalis Killer (~$14 at Home Depot). Apply at 1.5 fl oz per gallon, use a backpack sprayer to avoid drifting onto ornamentals. Best applied when temps are under 90°F — early morning in Austin summer.",
        priority: "high",
        status: "completed",
        product: "Southern AG Lawn Weed Killer with Trimec",
        applicationRate: "1.5 fl oz / gallon",
        scheduledStart: daysAgo(40),
        scheduledEnd: daysAgo(38),
        completedAt: daysAgo(39),
        createdAt: daysAgo(45),
        updatedAt: daysAgo(39),
      },
      {
        yardSectionId: rivera_front.id,
        analysisId: riveraFrontAnalysis.id,
        title: "Adjust irrigation coverage on slope",
        description:
          "The slope area is getting inadequate irrigation — likely a head alignment issue. Run each zone manually and check for gaps on the downhill side. Adjust heads or add a rotary nozzle to the zone covering the slope. Target 1 inch/week in two split applications (0.5 inch twice weekly) to push water deeper without runoff. Rainbird 5000 rotary heads (~$8 each at SprinklerWarehouse) are a cost-effective upgrade for slope zones.",
        priority: "medium",
        status: "pending",
        product: "Rainbird 5000 Series Rotary Head",
        scheduledStart: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        scheduledEnd: new Date(Date.now() + 9 * 24 * 60 * 60 * 1000),
        createdAt: daysAgo(45),
        updatedAt: daysAgo(45),
      },
    ],
  });

  // ── Tasks — Rivera Back Yard ──────────────────────────────────────────────
  await db.lawnTask.createMany({
    data: [
      {
        yardSectionId: rivera_back.id,
        analysisId: riveraBackAnalysis.id,
        title: "Chinch bug treatment — patio perimeter",
        description:
          "Apply a granular bifenthrin insecticide to the 300 sq ft sunny transition zone at the patio edge where chinch bugs are active. Bifen LP Granules (~$35/25 lbs at Arbico Organics or SiteOne) applied at 1.15 lbs/1,000 sq ft and watered in immediately. Use your Earthway 2150 at setting 15. Follow up in 21 days if damage continues. Avoid applying within 48 hours of rain to prevent runoff into the creek buffer.",
        priority: "high",
        status: "pending",
        product: "Bifen LP Granules (7.9% Bifenthrin)",
        applicationRate: "1.15 lbs / 1,000 sq ft",
        spreaderSetting: "15",
        scheduledStart: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        scheduledEnd: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000),
        createdAt: daysAgo(20),
        updatedAt: daysAgo(20),
      },
    ],
  });

  // ── Tasks — Rivera Right Side ─────────────────────────────────────────────
  await db.lawnTask.createMany({
    data: [
      {
        yardSectionId: rivera_right.id,
        analysisId: riveraRightAnalysis.id,
        title: "Install drainage channel at downspout",
        description:
          "The downspout is depositing water directly onto the strip, keeping it saturated. Install a 6-foot NDS channel drain (~$45 at Home Depot) to redirect flow toward the back fence. Dig a 4-inch trench, set the channel with a slight grade toward the fence, and connect to a dry creek bed or pop-up emitter at the fence line. This is the single highest-impact fix for this section.",
        priority: "high",
        status: "pending",
        product: "NDS 6-ft Channel Drain Kit",
        scheduledStart: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        scheduledEnd: new Date(Date.now() + 11 * 24 * 60 * 60 * 1000),
        createdAt: daysAgo(20),
        updatedAt: daysAgo(20),
      },
      {
        yardSectionId: rivera_right.id,
        analysisId: riveraRightAnalysis.id,
        title: "Moss treatment with ferrous sulfate",
        description:
          "Apply ferrous sulfate (iron sulfate) at 3 oz per 1,000 sq ft mixed in 3 gallons of water over the mossy zones — approximately 200 sq ft. Bonide Moss & Algae Killer (~$16/qt at Calloway's) is a ready-to-spray option. Will blacken and kill moss within 1-2 weeks. Rake dead moss out and overseed bare patches with Floratam St. Augustine plugs (~$30/tray) once drainage is improved. Do not apply before the drainage fix — water pooling will bring moss back immediately.",
        priority: "medium",
        status: "pending",
        product: "Bonide Moss & Algae Killer (Ferrous Sulfate)",
        applicationRate: "3 oz / 1,000 sq ft",
        scheduledStart: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        scheduledEnd: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        createdAt: daysAgo(20),
        updatedAt: daysAgo(20),
      },
    ],
  });

  console.log("Rivera tasks created.");
  console.log("\n✓ Demo seed complete!");
  console.log(`  User:    ${DEMO_EMAIL}`);
  console.log(`  Yard 1:  ${YARD_NAME} (${yard.id})`);
  console.log(`           Sections: Front Yard, Back Yard, Left Side Yard, Back Patio Border`);
  console.log(`  Yard 2:  ${YARD2_NAME} (${yard2.id})`);
  console.log(`           Sections: Front Yard, Back Yard, Right Side`);
  console.log(`\nLog in with email ${DEMO_EMAIL} to see the data.`);
  console.log(`(No password set — use magic link or add one manually if needed.)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
