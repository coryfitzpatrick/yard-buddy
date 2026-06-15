import type { Product } from "./types";

export const PRODUCTS: Product[] = [
  // ── Lime products (composition is the most commonly mis-classified attribute) ──
  {
    name: "Pennington Fast Acting Lime",
    brand: "Pennington",
    category: "lime",
    limeType: "calcitic",
    containsMg: false,
    notes: "Calcium carbonate with carrier. Use as default calcitic option. Do NOT classify as dolomitic.",
  },
  {
    name: "Greenview Mag-I-Cal",
    brand: "Greenview",
    category: "lime",
    limeType: "ca-mg",
    containsMg: true,
    notes:
      "Calcium-MAGNESIUM product. Functionally dolomitic-style — only recommend when a soil test confirms Mg deficiency. Do NOT classify as calcitic.",
  },
  {
    name: "Jonathan Green MAG-I-CAL Pro for Acidic Soil",
    brand: "Jonathan Green",
    category: "lime",
    limeType: "ca-mg",
    containsMg: true,
    notes:
      "Calcium-magnesium for acidic soils. Recommend only if soil test confirms Mg deficiency; otherwise prefer a calcitic source.",
  },
  {
    name: "Old Castle Pelletized Dolomitic Lime",
    brand: "Old Castle",
    category: "lime",
    limeType: "dolomitic",
    containsMg: true,
    notes: "Calcium magnesium carbonate. Use ONLY when Mg deficiency confirmed by soil test.",
  },
  {
    name: "Hi-Yield Dolomitic Lime",
    brand: "Hi-Yield",
    category: "lime",
    limeType: "dolomitic",
    containsMg: true,
    notes: "Use ONLY when Mg deficiency confirmed by soil test.",
  },
  {
    name: "Generic pelletized calcitic lime",
    category: "lime",
    limeType: "calcitic",
    containsMg: false,
    notes: "Default calcitic option for low-pH correction when Mg status is unknown.",
  },

  // ── Broadleaf herbicides (formulation drives temperature minimums) ──
  {
    name: "Speed Zone",
    brand: "PBI/Gordon",
    category: "broadleaf-herbicide",
    activeIngredients: ["2,4-D", "MCPP", "dicamba", "carfentrazone-ethyl"],
    tempMinF: 45,
    tempNotes:
      "FOUR-WAY product containing carfentrazone (PPO inhibitor) — retains contact activity at ~45–50°F daytime highs. Do NOT lump with pure three-ways for cold-weather guidance. Spot-spray only on dormant warm-season turf.",
  },
  {
    name: "Speed Zone Southern",
    brand: "PBI/Gordon",
    category: "broadleaf-herbicide",
    activeIngredients: ["2,4-D", "MCPP", "dicamba", "carfentrazone-ethyl"],
    tempMinF: 45,
    tempNotes:
      "Four-way with carfentrazone, labeled for warm-season turf including St. Augustine and centipede. Effective at ~45–50°F daytime highs.",
  },
  {
    name: "Surge",
    brand: "PBI/Gordon",
    category: "broadleaf-herbicide",
    activeIngredients: ["2,4-D", "MCPP", "dicamba", "sulfentrazone"],
    tempMinF: 50,
    tempNotes:
      "Four-way with sulfentrazone. Cold-tolerant down to ~50°F daytime. Treat like Speed Zone for winter spot-spray strategy.",
  },
  {
    name: "Trimec Classic",
    brand: "PBI/Gordon",
    category: "broadleaf-herbicide",
    activeIngredients: ["2,4-D", "MCPP", "dicamba"],
    tempMinF: 60,
    tempNotes:
      "PURE three-way (no carfentrazone). UGA Extension: defer until daytime highs consistently exceed 60°F. Below 60°F: poor uptake and translocation.",
  },
  {
    name: "Ortho Weed-B-Gon",
    brand: "Ortho",
    category: "broadleaf-herbicide",
    activeIngredients: ["2,4-D", "MCPP", "dicamba"],
    tempMinF: 60,
    tempNotes: "Pure three-way. Same 60°F minimum as Trimec Classic.",
  },
  {
    name: "Bayer All-In-One Lawn Weed & Crabgrass Killer",
    brand: "Bayer",
    category: "broadleaf-herbicide",
    activeIngredients: ["2,4-D", "MCPP", "dicamba", "quinclorac"],
    tempMinF: 60,
    tempNotes: "Three-way + quinclorac for crabgrass. 60°F minimum.",
  },
  {
    name: "MSM Turf",
    brand: "Quali-Pro",
    category: "broadleaf-herbicide",
    activeIngredients: ["metsulfuron-methyl"],
    tempMinF: 55,
    tempNotes: "Sulfonylurea. 55°F daytime minimum; respect freeze-window restriction.",
  },
  {
    name: "Tenacity",
    brand: "Syngenta",
    category: "broadleaf-herbicide",
    activeIngredients: ["mesotrione"],
    bannedFor: ["bermuda"],
    notes:
      "PHYTOTOXIC to bermuda — causes severe bleaching and turf damage; not labeled for bermuda. NEVER recommend Tenacity on bermuda lawns.",
  },

  // ── Centipede-banned fertilizers (over-fert causes centipede decline) ──
  {
    name: "Pennington UltraGreen 30-0-4",
    brand: "Pennington",
    category: "fertilizer",
    bannedFor: ["centipede"],
    notes:
      "Banned on centipede: too high N concentration — impossible to apply the 0.5 lb N/1,000 sq ft per-application limit accurately. Causes centipede decline.",
  },
  {
    name: "Pennington UltraGreen 30-0-10",
    brand: "Pennington",
    category: "fertilizer",
    bannedFor: ["centipede"],
    notes: "Banned on centipede: see UltraGreen 30-0-4. Causes centipede decline.",
  },
  {
    name: "Lesco Stressgard",
    brand: "Lesco",
    category: "fertilizer",
    bannedFor: ["centipede"],
    notes: "Banned on centipede: N too high; causes centipede decline.",
  },
  {
    name: "Scotts Turf Builder",
    brand: "Scotts",
    category: "fertilizer",
    bannedFor: ["centipede"],
    notes: "Banned on centipede (any formulation): N too high; causes centipede decline.",
  },
  {
    name: "Scotts WinterGuard 32-0-10",
    brand: "Scotts",
    category: "fertilizer",
    bannedFor: ["centipede"],
    notes:
      "Banned on centipede. Also: 32% N is high — calibration warning for any grass type; recommend lower-N alternatives for typical homeowner spreaders.",
  },

  // ── Pre-emergent herbicides (label rate windows + activation) ──
  {
    name: "Andersons Barricade 0.5G",
    brand: "Andersons",
    category: "pre-emergent",
    activeIngredients: ["prodiamine"],
    notes:
      "Granular prodiamine 0.5%. Homeowner label rate range: 2.3–4.6 lbs per 1,000 sq ft (residual length varies with rate). Water in 0.25–0.5\" within 3–5 days for barrier activation.",
  },
  {
    name: "Scotts Halts",
    brand: "Scotts",
    category: "pre-emergent",
    activeIngredients: ["pendimethalin"],
    notes:
      "Granular pendimethalin 1.71%. Apply at label rate (typically 2.875 lbs per 1,000 sq ft). Water in within 14 days for activation.",
  },
  {
    name: "Gallery 75 DF",
    brand: "Dow",
    category: "pre-emergent",
    activeIngredients: ["isoxaben"],
    notes:
      "Broadleaf pre-emergent (chickweed, henbit, spurge). DF = Dry Flowable — a WETTABLE GRANULE formulation: mix with water and apply as a SPRAY via backpack or pump sprayer. Label rate range: 0.66–1.33 oz of product per 1,000 sq ft (equivalent to 1.0–2.0 lbs product per acre, or 0.022–0.045 lb active ingredient per 1,000 sq ft). Consult the specific product label for your target weed and residual length. Do NOT describe Gallery 75 DF as a broadcast-spreader granular product. Irrigation within 21 days for incorporation is standard; do NOT cite a strict 48-hour dry window.",
  },
  {
    name: "Dimension 0.10%",
    brand: "Dow",
    category: "pre-emergent",
    activeIngredients: ["dithiopyr"],
    notes:
      "Granular dithiopyr. Has very short post-emergent activity on early crabgrass. Water in 0.5\" within 7 days.",
  },
  {
    name: "Lesco Stonewall",
    brand: "Lesco",
    category: "pre-emergent",
    activeIngredients: ["benefin", "trifluralin"],
    notes:
      "Granular benefin + trifluralin combination (Team-style chemistry) — NOT prodiamine. Do NOT cite as a prodiamine product. Spring annual grass pre-emergent on cool-season and warm-season turf; weaker residual than prodiamine.",
  },

  // ── Soil acidifier / iron (high-pH correction errors) ──
  {
    name: "Espoma Garden Sulfur",
    brand: "Espoma",
    category: "soil-acidifier",
    activeIngredients: ["elemental sulfur"],
    notes:
      "GRANULAR elemental sulfur. Appropriate for soil pH acidification at 1–2 lbs per 1,000 sq ft per application; max 5 lbs in any single application. Requires soil temps >55°F for microbial oxidation (Acidithiobacillus etc.) — DO NOT recommend in cold soil.",
  },
  {
    name: "Bonide Sulfur Plant Fungicide",
    brand: "Bonide",
    category: "soil-acidifier",
    activeIngredients: ["wettable sulfur"],
    notes:
      "Fine-particle FUNGICIDE-grade powder — NOT designed for soil pH acidification. Do NOT recommend for lowering soil pH. Use Espoma Garden Sulfur or generic granular elemental sulfur instead.",
  },
  {
    name: "Hi-Yield Wettable Dusting Sulfur",
    brand: "Hi-Yield",
    category: "soil-acidifier",
    activeIngredients: ["wettable sulfur"],
    notes:
      "Fungicide-grade dust. Do NOT recommend for soil pH correction. Recommend granular elemental sulfur instead.",
  },
  {
    name: "Sequestar 6% Fe EDDHA",
    brand: "Sequestar",
    category: "iron",
    activeIngredients: ["Fe-EDDHA"],
    notes:
      "FeEDDHA chelate — STABLE up to pH 9.0. Correct iron choice for high-pH (calcareous) soils where FeEDTA degrades.",
  },
  {
    name: "Southern Ag Chelated Liquid Iron",
    brand: "Southern Ag",
    category: "iron",
    activeIngredients: ["Fe-EDTA"],
    notes:
      "FeEDTA — degrades above approximately pH 6.5 in soil. Do NOT recommend for high-pH soils; use FeEDDHA (e.g., Sequestar) above pH ~7.",
  },

  // ── Insecticide / Fungicide product-name corrections (image-path R01 finding) ──
  {
    name: "Scotts GrubEx",
    brand: "Scotts",
    category: "insecticide",
    activeIngredients: ["chlorantraniliprole"],
    notes:
      "Current Scotts GrubEx formulation uses CHLORANTRANILIPROLE (not trichlorfon). It is a PREVENTIVE grub product — apply May–July before egg hatch for season-long control. Do NOT recommend GrubEx as a curative for active late-stage grubs (curative = Dylox/trichlorfon, separate product). Do NOT cite GrubEx as a trichlorfon product — this is a common AI confusion.",
  },
  {
    name: "Scotts DiseaseEx",
    brand: "Scotts",
    category: "fungicide",
    activeIngredients: ["azoxystrobin"],
    notes:
      "DiseaseEx is a FUNGICIDE containing azoxystrobin (a QoI fungicide). Do NOT cite as bifenthrin (which is an insecticide in completely different products). Effective against brown patch, dollar spot, gray leaf spot at label rates.",
  },
  {
    name: "Bonide Infuse Systemic Disease Control",
    brand: "Bonide",
    category: "fungicide",
    activeIngredients: ["propiconazole"],
    notes:
      "Propiconazole is a DMI fungicide effective against brown patch, dollar spot, leaf spot, rust. PYTHIUM IS NOT A TRUE FUNGUS — it's an oomycete and propiconazole is INEFFECTIVE against Pythium blight. Do NOT recommend Bonide Infuse or propiconazole for Pythium control. For Pythium specifically, use mefenoxam (Subdue) or fosetyl-Al — those are oomycete-targeting actives.",
  },
  {
    name: "BioAdvanced Fungus Control for Lawns",
    brand: "BioAdvanced",
    category: "fungicide",
    activeIngredients: ["propiconazole"],
    notes:
      "Same active as Bonide Infuse (propiconazole). Same Pythium ineffectiveness — do NOT recommend for Pythium / damping-off. Effective against brown patch, dollar spot, rust.",
  },
];
