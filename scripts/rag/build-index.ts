/**
 * Read lib/rag/docs/*.md, parse YAML frontmatter, chunk by paragraph,
 * write lib/rag/index-data.json. Keyword + metadata retrieval — no embeddings.
 *
 * Usage: npx tsx scripts/rag/build-index.ts
 */
import * as fs from "fs";
import * as path from "path";
import type { Chunk, DocFrontmatter } from "../../lib/rag/types";

const DOCS_DIR = path.join(process.cwd(), "lib", "rag", "docs");
const INDEX_PATH = path.join(process.cwd(), "lib", "rag", "index-data.json");
const MAX_CHUNK_CHARS = 2000;

interface ParsedDoc {
  filename: string;
  frontmatter: DocFrontmatter;
  body: string;
}

function parseFrontmatter(raw: string, filename: string): ParsedDoc {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error(`${filename}: missing YAML frontmatter`);
  const yamlBlock = match[1];
  const body = match[2];

  const fm: Partial<DocFrontmatter> = {};
  for (const line of yamlBlock.split("\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    let val: string | string[] = line.slice(colon + 1).trim();
    if (val.startsWith("[") && val.endsWith("]")) {
      val = val.slice(1, -1).split(",").map((s) => s.trim().replace(/^["']|["']$/g, ""));
    } else {
      val = val.replace(/^["']|["']$/g, "");
    }
    (fm as Record<string, unknown>)[key] = val;
  }

  if (!fm.source || !fm.url || !fm.grassType || !fm.topic || !fm.region) {
    throw new Error(`${filename}: incomplete frontmatter (need source, url, grassType, topic, region)`);
  }
  return { filename, frontmatter: fm as DocFrontmatter, body: body.trim() };
}

function chunkBody(body: string): string[] {
  // Split on H2/H3 headings first (## or ###), then accumulate up to MAX_CHUNK_CHARS.
  const sections = body.split(/\n(?=#{2,3}\s)/);
  const chunks: string[] = [];
  for (const section of sections) {
    if (section.length <= MAX_CHUNK_CHARS) {
      chunks.push(section.trim());
      continue;
    }
    // Section too long — split on paragraph boundaries
    const paragraphs = section.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    let current = "";
    for (const p of paragraphs) {
      if (current.length + p.length + 2 > MAX_CHUNK_CHARS && current.length > 0) {
        chunks.push(current.trim());
        current = "";
      }
      current += (current ? "\n\n" : "") + p;
    }
    if (current.trim()) chunks.push(current.trim());
  }
  return chunks.filter((c) => c.length > 0);
}

function main(): void {
  if (!fs.existsSync(DOCS_DIR)) {
    console.error(`No docs directory: ${DOCS_DIR}`);
    process.exit(1);
  }
  const files = fs.readdirSync(DOCS_DIR).filter((f) => f.endsWith(".md")).sort();
  if (files.length === 0) {
    console.error("No .md docs found.");
    process.exit(1);
  }

  console.log(`Indexing ${files.length} documents...`);
  const results: Chunk[] = [];
  for (const filename of files) {
    const raw = fs.readFileSync(path.join(DOCS_DIR, filename), "utf8");
    const doc = parseFrontmatter(raw, filename);
    const chunks = chunkBody(doc.body);
    chunks.forEach((text, i) => {
      results.push({
        id: `${filename.replace(/\.md$/, "")}-${i}`,
        source: doc.frontmatter.source,
        url: doc.frontmatter.url,
        title: doc.frontmatter.title ?? filename.replace(/\.md$/, ""),
        grassType: doc.frontmatter.grassType,
        topic: doc.frontmatter.topic,
        region: doc.frontmatter.region,
        text,
      });
    });
    console.log(`  ${filename}: ${chunks.length} chunks`);
  }

  fs.writeFileSync(INDEX_PATH, JSON.stringify(results, null, 2));
  const totalChars = results.reduce((s, c) => s + c.text.length, 0);
  console.log(`\nWrote ${results.length} chunks to ${INDEX_PATH}`);
  console.log(`Total content: ${(totalChars / 1024).toFixed(1)} KB`);
  console.log(`Index file size: ${(fs.statSync(INDEX_PATH).size / 1024).toFixed(1)} KB`);
}

main();
