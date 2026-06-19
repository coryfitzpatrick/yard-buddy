// Runs `fn` over each item with at most `limit` concurrent in-flight calls.
// Preserves input order in the returned array. Errors propagate; the caller
// should put try/catch inside `fn` if per-item failures shouldn't abort the
// whole batch (the cron routes do).
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index]);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}
