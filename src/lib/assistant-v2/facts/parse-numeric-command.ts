/**
 * Deterministic numeric extraction for contractor chat commands.
 * Runs before AI fallback — handles money, area, length, height, and percentages.
 */

export type ParsedDimension = {
  kind: "area_m2" | "length_m" | "height_m" | "width_m" | "depth_m" | "percent" | "money";
  value: number;
  raw: string;
};

const AREA_PATTERN =
  /(\d+(?:\.\d+)?)\s*(?:m²|m2|sqm|square\s*met(?:re|er)s?)\b/gi;

const LENGTH_LONG_PATTERN =
  /(\d+(?:\.\d+)?)\s*(?:mm|m|met(?:re|er)s?|lm)?\s*long\b/gi;

const HEIGHT_HIGH_PATTERN =
  /(\d+(?:\.\d+)?)\s*(?:mm|m|met(?:re|er)s?)?\s*high\b/gi;

const WIDTH_WIDE_PATTERN =
  /(\d+(?:\.\d+)?)\s*(?:mm|m|met(?:re|er)s?)?\s*(?:wide|width)\b/gi;

const GENERIC_LENGTH_PATTERN =
  /(\d+(?:\.\d+)?)\s*(?:m|met(?:re|er)s?|lm)\b/gi;

const PERCENT_PATTERN =
  /(\d+(?:\.\d+)?)\s*(?:percent|%)/gi;

const BARE_NUMBER_PATTERN =
  /(?:to|at|is|=|about|around|approximately|size\s+is|area\s+is)\s*(\d+(?:\.\d+)?)/i;

function parseUnitNumber(raw: string, unitHint?: string): number | null {
  const cleaned = raw.replace(/,/g, "");
  const num = Number(cleaned);
  if (!Number.isFinite(num) || num <= 0) return null;

  if (unitHint === "mm") return num / 1000;
  if (/\bk\b/i.test(raw)) return num * 1000;
  return num;
}

export function parseMoneyAmount(text: string): number | null {
  const kMatch = text.match(/([\d,]+(?:\.\d{1,2})?)\s*k\b/i);
  if (kMatch?.[1]) {
    const num = Number(kMatch[1].replace(/,/g, ""));
    if (Number.isFinite(num) && num > 0) return num * 1000;
  }

  const patterns = [
    /\$\s*([\d,]+(?:\.\d{1,2})?)/,
    /(?:to|at|of|=)\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i,
    /([\d,]+(?:\.\d{1,2})?)\s*dollars?\b/i,
    /\b([\d,]+(?:\.\d{1,2})?)\b/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    const parsed = parseUnitNumber(match[1]);
    if (parsed != null) return parsed;
  }

  return null;
}

export function parsePercentAmount(text: string): number | null {
  const match = text.match(/(\d+(?:\.\d+)?)\s*(?:percent|%)/i);
  if (!match?.[1]) return null;
  const num = Number(match[1]);
  return Number.isFinite(num) && num > 0 && num <= 100 ? num : null;
}

export function parseAreaM2(text: string): number | null {
  const match = text.match(
    /(\d+(?:\.\d+)?)\s*(?:m²|m2|sqm|square\s*met(?:re|er)s?)/i
  );
  if (!match?.[1]) return null;
  return parseUnitNumber(match[1]);
}

export function parseDimensions(text: string): ParsedDimension[] {
  const results: ParsedDimension[] = [];

  for (const match of text.matchAll(AREA_PATTERN)) {
    const value = parseUnitNumber(match[1]!);
    if (value != null) {
      results.push({ kind: "area_m2", value, raw: match[0] });
    }
  }

  for (const match of text.matchAll(LENGTH_LONG_PATTERN)) {
    const value = parseUnitNumber(
      match[1]!,
      match[0].toLowerCase().includes("mm") ? "mm" : undefined
    );
    if (value != null) {
      results.push({ kind: "length_m", value, raw: match[0] });
    }
  }

  for (const match of text.matchAll(HEIGHT_HIGH_PATTERN)) {
    const value = parseUnitNumber(
      match[1]!,
      match[0].toLowerCase().includes("mm") ? "mm" : undefined
    );
    if (value != null) {
      results.push({ kind: "height_m", value, raw: match[0] });
    }
  }

  for (const match of text.matchAll(WIDTH_WIDE_PATTERN)) {
    const value = parseUnitNumber(
      match[1]!,
      match[0].toLowerCase().includes("mm") ? "mm" : undefined
    );
    if (value != null) {
      results.push({ kind: "width_m", value, raw: match[0] });
    }
  }

  if (results.length === 0) {
    for (const match of text.matchAll(GENERIC_LENGTH_PATTERN)) {
      const value = parseUnitNumber(match[1]!);
      if (value != null) {
        results.push({ kind: "length_m", value, raw: match[0] });
      }
    }
  }

  for (const match of text.matchAll(PERCENT_PATTERN)) {
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > 0) {
      results.push({ kind: "percent", value, raw: match[0] });
    }
  }

  const money = parseMoneyAmount(text);
  if (money != null) {
    results.push({ kind: "money", value: money, raw: String(money) });
  }

  return results;
}

export function parseNumericForFact(
  text: string,
  factKey: string,
  unit?: string
): string | null {
  const dimensions = parseDimensions(text);

  if (factKey.includes("area") || unit === "m²") {
    const area = dimensions.find((d) => d.kind === "area_m2");
    if (area) return String(area.value);
    const bare = text.match(BARE_NUMBER_PATTERN);
    if (bare?.[1] && SIZE_HINT.test(text)) return bare[1];
  }

  if (factKey.includes("length") || factKey.endsWith("_m") && factKey.includes("length")) {
    const length = dimensions.find((d) => d.kind === "length_m");
    if (length) return String(length.value);
  }

  if (factKey.includes("height")) {
    const height = dimensions.find((d) => d.kind === "height_m");
    if (height) return String(height.value);
  }

  if (factKey.includes("carting") || factKey.includes("distance")) {
    const length = dimensions.find((d) => d.kind === "length_m");
    if (length) return String(length.value);
  }

  if (unit) {
    const bare = text.match(BARE_NUMBER_PATTERN);
    if (bare?.[1]) return bare[1];
  }

  const areaMatch = text.match(
    /(\d+(?:\.\d+)?)\s*(?:m²|m2|sqm|square\s*met(?:re|er)s?)/i
  );
  if (areaMatch?.[1] && (factKey.includes("area") || unit === "m²")) {
    return areaMatch[1];
  }

  const lengthMatch = text.match(
    /(\d+(?:\.\d+)?)\s*(?:m|met(?:re|er)s?|lm)\b/i
  );
  if (lengthMatch?.[1] && (factKey.includes("length") || unit === "m")) {
    return lengthMatch[1];
  }

  return null;
}

const SIZE_HINT =
  /\b(?:area|size|square|sqm|m2|m²|deck|wall|floor|long|high|wide)\b/i;

// Fix reference to fact.type - remove that erroneous branch
export function parseBareScopeNumber(
  text: string,
  scopeMentioned: boolean
): string | null {
  if (!scopeMentioned) return null;
  const match = text.match(
    /(?:size\s+is|area\s+is|is)\s*(\d+(?:\.\d+)?)(?:\s*(?:m²|m2|sqm))?/i
  );
  if (match?.[1]) return match[1];

  if (SIZE_HINT.test(text)) {
    const bare = text.match(/\b(\d+(?:\.\d+)?)\s*$/);
    if (bare?.[1]) return bare[1];
  }

  return null;
}
