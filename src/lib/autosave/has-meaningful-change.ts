/** Returns true when next should be persisted (not equal to previous). */
export function hasMeaningfulChange(
  previousValue: unknown,
  nextValue: unknown
): boolean {
  if (previousValue === nextValue) return false;
  if (previousValue == null && nextValue == null) return false;

  if (typeof previousValue === "object" || typeof nextValue === "object") {
    try {
      return (
        JSON.stringify(normaliseForCompare(previousValue)) !==
        JSON.stringify(normaliseForCompare(nextValue))
      );
    } catch {
      return String(previousValue) !== String(nextValue);
    }
  }

  return String(previousValue).trim() !== String(nextValue).trim();
}

function normaliseForCompare(value: unknown): unknown {
  if (Array.isArray(value)) {
    return [...value].map(normaliseForCompare).sort();
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return Object.keys(obj)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = normaliseForCompare(obj[key]);
        return acc;
      }, {});
  }
  if (typeof value === "string") return value.trim();
  return value;
}
