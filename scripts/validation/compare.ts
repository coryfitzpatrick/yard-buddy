/**
 * Compare two validation result JSON files side-by-side.
 * Usage: npx tsx scripts/validation/compare.ts <baseline.json> <candidate.json>
 *        npx tsx scripts/validation/compare.ts        # auto-picks the 2 newest result files
 */
import * as fs from "fs";
import * as path from "path";

interface PillarResult {
  pillar: number;
  results: Array<{ scenarioId?: string; score?: number; pass?: boolean; flags?: string[] }>;
  mean?: number;
}

interface Run {
  timestamp: string;
  pillars: PillarResult[];
}

function pickLatestTwo(): [string, string] {
  const dir = path.join(__dirname, "results");
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}-\d+\.json$/.test(f))
    .map((f) => path.join(dir, f))
    .sort();
  if (files.length < 2) throw new Error("Need at least 2 timestamped result files");
  return [files[files.length - 2], files[files.length - 1]];
}

function load(file: string): Run {
  return JSON.parse(fs.readFileSync(file, "utf8")) as Run;
}

function indexJudge(run: Run): Map<string, { score: number; flags: string[] }> {
  const p3 = run.pillars.find((p) => p.pillar === 3);
  const m = new Map<string, { score: number; flags: string[] }>();
  for (const r of p3?.results ?? []) {
    if (r.scenarioId) m.set(r.scenarioId, { score: r.score ?? 0, flags: r.flags ?? [] });
  }
  return m;
}

function indexP2(run: Run): Map<string, number> {
  const p2 = run.pillars.find((p) => p.pillar === 2);
  const counts = new Map<string, { pass: number; total: number }>();
  for (const r of p2?.results ?? []) {
    if (!r.scenarioId) continue;
    const c = counts.get(r.scenarioId) ?? { pass: 0, total: 0 };
    c.total += 1;
    if (r.pass) c.pass += 1;
    counts.set(r.scenarioId, c);
  }
  return new Map(Array.from(counts).map(([k, v]) => [k, v.pass - v.total]));
}

function main(): void {
  const [baseFile, candFile] = process.argv.slice(2).length === 2
    ? [process.argv[2], process.argv[3]]
    : pickLatestTwo();

  console.log(`Baseline:  ${path.basename(baseFile)}`);
  console.log(`Candidate: ${path.basename(candFile)}\n`);

  const base = load(baseFile);
  const cand = load(candFile);

  const baseJudge = indexJudge(base);
  const candJudge = indexJudge(cand);
  const baseP2 = indexP2(base);
  const candP2 = indexP2(cand);

  const ids = Array.from(new Set([...baseJudge.keys(), ...candJudge.keys()]));

  let baseSum = 0;
  let candSum = 0;
  let baseN = 0;
  let candN = 0;

  console.log(`${"Scenario".padEnd(22)} ${"P2".padStart(6)} ${"Base".padStart(6)} ${"Cand".padStart(6)} ${"Δ".padStart(6)}  Notes`);
  console.log("─".repeat(80));
  for (const id of ids) {
    const b = baseJudge.get(id);
    const c = candJudge.get(id);
    const p2 = candP2.get(id) ?? baseP2.get(id);
    const bScore = b?.score ?? 0;
    const cScore = c?.score ?? 0;
    if (b && bScore > 0) { baseSum += bScore; baseN += 1; }
    if (c && cScore > 0) { candSum += cScore; candN += 1; }
    const delta = cScore - bScore;
    const deltaStr = delta > 0 ? `+${delta}` : `${delta}`;
    const p2Str = p2 === undefined ? "—" : p2 === 0 ? "ok" : `${p2}`;
    const notes = bScore === 0 ? "(base err)" : cScore === 0 ? "(cand err)" : "";
    console.log(
      `${id.padEnd(22)} ${p2Str.padStart(6)} ${bScore.toString().padStart(6)} ${cScore.toString().padStart(6)} ${deltaStr.padStart(6)}  ${notes}`,
    );
  }

  const baseMean = baseN > 0 ? baseSum / baseN : 0;
  const candMean = candN > 0 ? candSum / candN : 0;
  console.log("─".repeat(80));
  console.log(`Mean (non-zero only):  base ${baseMean.toFixed(1)} (n=${baseN})  cand ${candMean.toFixed(1)} (n=${candN})  Δ ${(candMean - baseMean).toFixed(1)}`);

  const regressions = ids.filter((id) => {
    const b = baseJudge.get(id)?.score ?? 0;
    const c = candJudge.get(id)?.score ?? 0;
    return b > 0 && c > 0 && c < b;
  });
  const wins = ids.filter((id) => {
    const b = baseJudge.get(id)?.score ?? 0;
    const c = candJudge.get(id)?.score ?? 0;
    return b > 0 && c > 0 && c > b;
  });
  console.log(`Wins: ${wins.length}  Regressions: ${regressions.length}  Stable: ${ids.length - wins.length - regressions.length}`);
}

main();
