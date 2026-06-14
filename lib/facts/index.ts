import type { GrassType } from "@/types";
import type { LawnContext } from "@/lib/claude";
import { PRODUCTS } from "./products";
import { findRegionalTool } from "./regional-tools";
import type { Product, ProductCategory } from "./types";

type TopicHint =
  | "lime"
  | "broadleaf-herbicide"
  | "pre-emergent"
  | "fertilizer"
  | "soil-acidifier"
  | "iron";

function inferTopicHintsForFacts(profileText: string, notes: string | null | undefined): TopicHint[] {
  const text = `${profileText} ${notes ?? ""}`.toLowerCase();
  const hints: TopicHint[] = [];
  if (/(\blime\b|low\s*ph|acidic|raise\s*ph)/.test(text)) hints.push("lime");
  if (/(broadleaf|weed|dandelion|clover|chickweed|henbit|spurge|spot.?spray|2,4-d|dicamba|trimec|speed\s?zone)/.test(text)) {
    hints.push("broadleaf-herbicide");
  }
  if (/(pre.?emergent|prodiamine|pendimethalin|barricade|halts|gallery|crabgrass|poa\s*annua)/.test(text)) {
    hints.push("pre-emergent");
  }
  if (/(fertiliz|nitrogen|n-p-k|npk|\bfeed\b)/.test(text)) hints.push("fertilizer");
  if (/(\bsulfur\b|acidify|high\s*ph|alkaline|calcareous|sodic)/.test(text)) hints.push("soil-acidifier");
  if (/(\biron\b|chlorosis|yellow|eddha|edta|fe.{0,3}chelate)/.test(text)) hints.push("iron");
  return hints;
}

function relevantProducts(grassType: GrassType, hints: TopicHint[]): Product[] {
  const hintSet = new Set<ProductCategory>(hints as ProductCategory[]);
  const result: Product[] = [];

  for (const p of PRODUCTS) {
    if (p.bannedFor?.includes(grassType)) {
      result.push(p);
      continue;
    }
    if (hintSet.has(p.category)) {
      if (p.bannedFor && !p.bannedFor.includes(grassType)) continue;
      result.push(p);
    }
  }

  return result;
}

function formatProduct(p: Product): string {
  const bits: string[] = [`**${p.name}**`];
  if (p.category === "lime" && p.limeType) {
    bits.push(`(${p.limeType.toUpperCase()}${p.containsMg ? ", contains Mg" : ""})`);
  } else if (p.category === "broadleaf-herbicide" && p.activeIngredients) {
    bits.push(`(${p.activeIngredients.join(" + ")})`);
    if (p.tempMinF) bits.push(`— min ${p.tempMinF}°F daytime`);
  } else if (p.category === "pre-emergent" && p.activeIngredients) {
    bits.push(`(${p.activeIngredients.join(" + ")})`);
  } else if (p.category === "fertilizer" && p.bannedFor?.length) {
    bits.push(`(BANNED for ${p.bannedFor.join(", ")})`);
  } else if ((p.category === "soil-acidifier" || p.category === "iron") && p.activeIngredients) {
    bits.push(`(${p.activeIngredients.join(", ")})`);
  }
  let line = bits.join(" ");
  if (p.notes) line += `\n  ${p.notes}`;
  if (p.tempNotes && !line.includes(p.tempNotes)) line += `\n  ${p.tempNotes}`;
  return line;
}

export function getRelevantFacts(context: LawnContext): string {
  const profileText = [
    context.areaType,
    context.weatherSummary,
    context.notes,
    context.forecastText,
  ]
    .filter(Boolean)
    .join(" ");

  const hints = inferTopicHintsForFacts(profileText, context.notes);
  const products = relevantProducts(context.grassType, hints).slice(0, 10);
  const regional = findRegionalTool(context.zipCode);

  if (products.length === 0 && !regional) return "";

  const lines: string[] = [
    "## VERIFIED FACTS (deterministic; trust these over your general knowledge or other sources on these specific items)",
  ];

  if (products.length > 0) {
    lines.push("\n### Products");
    for (const p of products) {
      lines.push("- " + formatProduct(p));
    }
  }

  if (regional) {
    lines.push("\n### Regional resources");
    lines.push(
      `- Soil temperature network for ${regional.stateCode} (ZIP starting ${regional.zipPrefixes.join("/")}): **${regional.soilTempTool.name}** — ${regional.soilTempTool.url} (${regional.soilTempTool.ownedBy}). Do NOT recommend tools owned by other states' extensions for this homeowner.`
    );
  }

  lines.push("");
  return lines.join("\n");
}
