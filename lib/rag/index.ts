import * as fs from "fs";
import * as path from "path";
import type { Chunk, RagTopic, RetrievalContext } from "./types";
import type { GrassType } from "@/types";

const INDEX_PATH = path.join(process.cwd(), "lib", "rag", "index-data.json");

let _chunks: Chunk[] | null = null;

function loadChunks(): Chunk[] {
  if (_chunks) return _chunks;
  if (!fs.existsSync(INDEX_PATH)) {
    _chunks = [];
    return _chunks;
  }
  const raw = fs.readFileSync(INDEX_PATH, "utf8");
  _chunks = JSON.parse(raw) as Chunk[];
  return _chunks;
}

function matchesGrass(chunk: Chunk, grassType: GrassType): boolean {
  if (chunk.grassType === "any") return true;
  return chunk.grassType.includes(grassType);
}

// Stopwords to filter out from the query for keyword scoring.
// Includes grass-type terms — we already filter by grass type metadata,
// so including them in keyword scoring biases retrieval toward grass-specific
// docs even when the scenario is really about a different topic (e.g.,
// grub-damage on KBG would prefer KBG-specific docs over the grub-control doc).
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "in", "on", "at", "to", "for", "with",
  "is", "are", "was", "were", "be", "been", "being", "have", "has", "had",
  "do", "does", "did", "will", "would", "should", "could", "may", "might",
  "this", "that", "these", "those", "it", "its", "by", "as", "from", "but",
  "not", "no", "yes", "all", "any", "some", "what", "which", "who", "when",
  "where", "why", "how", "i", "you", "he", "she", "we", "they", "them",
  "their", "our", "my", "your", "his", "her", "lawn", "grass", "turf",
  // grass-type terms — already filtered by metadata
  "kentucky", "bluegrass", "bermuda", "zoysia", "fescue", "tall", "fine",
  "ryegrass", "centipede", "augustine", "buffalo", "unknown", "kbg", "prg",
  "type", "season", "warm", "cool",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

function stem(token: string): string {
  // Crude stemming: handles common plural/verb tenses so "grubs" matches "grub".
  if (token.length <= 4) return token;
  if (token.endsWith("ing") && token.length > 5) return token.slice(0, -3);
  if (token.endsWith("ies") && token.length > 5) return token.slice(0, -3) + "y";
  if (token.endsWith("es") && token.length > 4) return token.slice(0, -2);
  if (token.endsWith("ed") && token.length > 4) return token.slice(0, -2);
  if (token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
}

function keywordOverlap(chunk: Chunk, queryTokens: string[]): number {
  const chunkText = chunk.text.toLowerCase();
  let score = 0;
  const seen = new Set<string>();
  for (const token of queryTokens) {
    const root = stem(token);
    if (seen.has(root)) continue;
    seen.add(root);
    // Prefix match so "grub" matches "grub", "grubs", "grubby"; "fertiliz" matches "fertilize", "fertilizer", "fertilization"
    const pattern = new RegExp(`\\b${escapeRegex(root)}[a-z]{0,4}\\b`, "g");
    const matches = (chunkText.match(pattern) ?? []).length;
    score += Math.min(matches, 5);
  }
  return score;
}

function topicScore(chunk: Chunk, hints: RagTopic[] | undefined): number {
  if (!hints || hints.length === 0) return 0;
  const overlap = chunk.topic.filter((t) => hints.includes(t)).length;
  // Reward focus: a doc with 1 topic that matches scores higher per-match than a broad
  // doc with 5 topics where 1 matches. This pushes laser-focused docs (grub control,
  // pre-emergent catalog) to the top for matching scenarios.
  const focusBonus = chunk.topic.length === 1 ? 4 : 0;
  return overlap * 10 + focusBonus;
}

export function retrieveRelevant(ctx: RetrievalContext): Chunk[] {
  const chunks = loadChunks();
  if (chunks.length === 0) return [];

  const queryTokens = tokenize(ctx.scenarioText);

  const scored = chunks
    .filter((c) => matchesGrass(c, ctx.grassType))
    .map((c) => ({
      chunk: c,
      score: keywordOverlap(c, queryTokens) + topicScore(c, ctx.topicHints),
    }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  const k = ctx.k ?? 5;
  return scored.slice(0, k).map((s) => s.chunk);
}

export function formatChunksForPrompt(chunks: Chunk[]): string {
  if (chunks.length === 0) return "";
  const blocks = chunks.map((c, i) =>
    `### Source ${i + 1}: ${c.source} — ${c.title}\n${c.text}\n(${c.url})`,
  );
  return `## Extension publication sources (factual ground truth — cite these where they apply; they override your training data on the topics covered)\n\n${blocks.join("\n\n---\n\n")}\n`;
}

export function inferTopicHints(profileText: string, notes: string | null | undefined): RagTopic[] {
  const text = `${profileText} ${notes ?? ""}`.toLowerCase();
  const hints: RagTopic[] = [];
  if (/pre.?emergent|crabgrass|poa annua|chickweed|fall application/.test(text)) hints.push("pre-emergent");
  if (/fertiliz|nitrogen|n-p-k|npk|\bfeed\b/.test(text)) hints.push("fertilization");
  if (/mow|height|cut|blade/.test(text)) hints.push("mowing");
  if (/water|irrigat|rainfall/.test(text)) hints.push("irrigation");
  if (/drought|dry|wilt|hydrophobic/.test(text)) hints.push("drought");
  // Detect specific pH direction from "soil pH: N.N" pattern in text
  const phMatch = text.match(/soil\s*ph\s*[:=]?\s*(\d+(?:\.\d+)?)/);
  if (phMatch) {
    const ph = parseFloat(phMatch[1]);
    if (ph < 6.5) hints.push("soil-ph-acidic");
    else if (ph > 7.0) hints.push("soil-ph-alkaline");
  } else if (/acidic|lime\b/.test(text)) {
    hints.push("soil-ph-acidic");
  } else if (/alkaline|\bsulfur\b|chlorosis/.test(text)) {
    hints.push("soil-ph-alkaline");
  }
  if (/fungic|disease|patch|leaf spot|brown patch|dollar spot|pythium|rust|red thread|gray leaf/.test(text)) hints.push("disease");
  if (/grub|chinch|armyworm|\bpest\b|insect|aphid/.test(text)) hints.push("pest");
  if (/weed|broadleaf|herbicide|2,4-d|dicamba|glyphosate/.test(text)) hints.push("weed-control");
  if (/seed|overseed|germinat/.test(text)) hints.push("overseeding");
  if (/aerat|core|compact|plug/.test(text)) hints.push("aeration");
  if (/winter|dormant|dormancy|first frost/.test(text)) hints.push("winter-care");
  if (/green.?up|spring transition/.test(text)) hints.push("spring-green-up");
  return hints;
}
