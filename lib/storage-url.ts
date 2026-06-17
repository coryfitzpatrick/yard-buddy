// Public lawn-photo URLs look like:
//   {SUPABASE_URL}/storage/v1/object/public/lawn-photos/{userId}/{timestamp}.{ext}
// We allowlist that exact prefix when validating photo URLs coming from the
// client — without this, /api/analyze and /api/identify-grass would happily
// forward arbitrary URLs to Anthropic and burn credits.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

export function lawnPhotoPrefixFor(userId: string): string {
  if (!SUPABASE_URL) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  return `${SUPABASE_URL}/storage/v1/object/public/lawn-photos/${userId}/`;
}

export function isOwnedLawnPhotoUrl(url: unknown, userId: string): url is string {
  if (typeof url !== "string") return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (!SUPABASE_URL) return false;
  const expected = new URL(lawnPhotoPrefixFor(userId));
  if (parsed.origin !== expected.origin) return false;
  if (!parsed.pathname.startsWith(expected.pathname)) return false;
  // Block traversal segments just in case Supabase ever normalizes inputs differently.
  if (parsed.pathname.includes("..")) return false;
  return true;
}
