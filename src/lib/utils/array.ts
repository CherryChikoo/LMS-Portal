/**
 * Returns a deduplicated list of values, preserving first-seen order.
 * An optional `normalize` function converts each value to the key used
 * for equality checks, which is useful for case-insensitive or ID-based
 * deduplication while keeping the original display value.
 */
export function uniqueOptions<T>(
  values: (T | null | undefined)[],
  normalize?: (v: T) => string
): T[] {
  const seen = new Set<string>();
  return values.filter((v): v is T => {
    if (v == null) return false;
    const key = normalize ? normalize(v) : String(v);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
