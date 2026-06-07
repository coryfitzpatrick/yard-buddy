export function deduplicateRecommendations<T extends { title: string }>(recs: T[]): T[] {
  const seen = new Set<string>();
  return recs.filter((r) => {
    const key = r.title.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).slice(0, 3).join(" ");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
