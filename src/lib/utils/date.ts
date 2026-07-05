export function toMillis(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isNaN(t) ? null : t;
  }
  if (typeof value === "string" || typeof value === "number") {
    const t = new Date(value).getTime();
    return Number.isNaN(t) ? null : t;
  }
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (typeof v.toMillis === "function") {
      try {
        const t = (v.toMillis as () => number)();
        return Number.isNaN(t) ? null : t;
      } catch {
        return null;
      }
    }
    if (typeof v.toDate === "function") {
      try {
        const d = (v.toDate as () => Date)();
        const t = d.getTime();
        return Number.isNaN(t) ? null : t;
      } catch {
        return null;
      }
    }
    if (typeof v.seconds === "number") {
      return v.seconds * 1000 + Math.floor(((v.nanoseconds as number) || 0) / 1_000_000);
    }
  }
  return null;
}

export function toDate(value: unknown): Date | null {
  const ms = toMillis(value);
  return ms === null ? null : new Date(ms);
}

export function formatTimestamp(
  value: unknown,
  options?: Intl.DateTimeFormatOptions
): string | null {
  const d = toDate(value);
  if (!d) return null;
  return d.toLocaleString([], options || { month: "short", day: "numeric", year: "numeric" });
}
