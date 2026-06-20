// lib/observability/client.ts
import { Axiom } from "@axiomhq/js";

// Lazy singleton — only constructed when first read so tests/dev without an
// AXIOM_TOKEN don't fail at import time.
let client: Axiom | null = null;

export function getAxiomClient(): Axiom | null {
  if (client) return client;
  const token = process.env.AXIOM_TOKEN;
  if (!token) return null;
  client = new Axiom({ token });
  return client;
}

export function getAxiomDataset(): string {
  return process.env.AXIOM_DATASET ?? "yard-analyzer";
}
