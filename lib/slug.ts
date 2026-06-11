export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function uniqueSlug(
  base: string,
  existingSlugs: string[],
  currentId?: string
): string {
  const slug = slugify(base) || "section";
  if (!existingSlugs.includes(slug)) return slug;
  let n = 1;
  while (existingSlugs.includes(`${slug}-${n}`)) n++;
  return `${slug}-${n}`;
}
