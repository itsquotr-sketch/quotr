/**
 * Deterministic numeric extraction for contractor chat commands.
 * Runs before AI fallback — handles money, area, length, height, and percentages.
 */

export type ParsedDimension = {
  kind: "area_m2" | "length_m" | "height_m" | "width_m" | "depth_m" | "percent" | "money";
  value: number;
  raw: string;
};

export type ParsedLengthWidth = {
  length_m: number;
  width_m: number;
  area_m2: number;
  raw: string;
};

const AREA_PATTERN =
  /(\d+(?:\.\d+)?)\s*(?:m²|m2|sqm|square\s*met(?:re|er)s?)(?:\b|$)/gi;

const LENGTH_LONG_PATTERN =
  /(\d+(?:\.\d+)?)\s*(?:mm|m|met(?:re|er)s?|lm)?\s*long\b/gi;

const HEIGHT_HIGH_PATTERN =
  /(\d+(?:\.\d+)?)\s*(?:mm|m|met(?:re|er)s?)?\s*high\b/gi;

const WIDTH_WIDE_PATTERN =
  /(\d+(?:\.\d+)?)\s*(?:mm|m|met(?:re|er)s?|lm)?\s*(?:wide|width)\b/gi;

const GENERIC_LENGTH_PATTERN =
  /(\d+(?:\.\d+)?)\s*(?:m|met(?:re|er)s?|lm)\b/gi;

const PERCENT_PATTERN =
  /(\d+(?:\.\d+)?)\s*(?:percent|%)/gi;

const BARE_NUMBER_PATTERN =
  /(?:to|at|is|=|about|around|approximately|size\s+is|area\s+is)\s*(\d+(?:\.\d+)?)/i;

/** 7m wide by 3.5m long, 7m by 3.5m, 7m wide and 3.5m long */
const WIDE_BY_LONG_PATTERN =
  /(\d+(?:\.\d+)?)\s*(?:m|met(?:re|er)s?|lm)?\s*(?:wide|width)\s*(?:by|and|×|x)\s*(\d+(?:\.\d+)?)\s*(?:m|met(?:re|er)s?|lm)?\s*(?:long|length)?/gi;

/** 5m x 4m, 5 x 4 */
const MULTIPLY_DIMENSION_PATTERN =
  /(\d+(?:\.\d+)?)\s*(?:m|met(?:re|er)s?|lm)?\s*[x×]\s*(\d+(?:\.\d+)?)\s*(?:m|met(?:re|er)s?|lm)?/gi;

/** 7m by 3m */
const BY_DIMENSION_PATTERN =
  /(\d+(?:\.\d+)?)\s*(?:m|met(?:re|er)s?|lm)\s+by\s+(\d+(?:\.\d+)?)\s*(?:m|met(?:re|er)s?|lm)?/gi;

export const HEIGHT_CONTEXT_PATTERN =
  /\b(?:off\s+the\s+ground|above\s+ground|elevated|balcony|height|high\b|storey|story)\b/i;

export const WALKING_DISTANCE_PATTERN =
  /\b(?:walking|carting|carry(?:ing)?|access)\s*(?:distance)?\b/i;

export const ACCESS_TIGHT_PATTERN =
  /\b(?:access\s+is\s+)?tight\b|\brestricted\s+access\b|\bpoor\s+access\b/i;

const SIZE_HINT =
  /\b(?:area|size|square|sqm|m2|m²|deck|wall|floor|long|high|wide)\b/i;

function parseUnitNumber(raw: string, unitHint?: string): number | null {
  const cleaned = raw.replace(/,/g, "");
  const num = Number(cleaned);
  if (!Number.isFinite(num) || num <= 0) return null;

  if (unitHint === "mm") return num / 1000;
  if (/\bk\b/i.test(raw)) return num * 1000;
  return num;
}

export function parseLengthWidthDimensions(text: string): ParsedLengthWidth[] {
  const results: ParsedLengthWidth[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(WIDE_BY_LONG_PATTERN)) {
    const width = parseUnitNumber(match[1]!);
    const length = parseUnitNumber(match[2]!);
    if (width == null || length == null) continue;
    const raw = match[0];
    if (seen.has(raw)) continue;
    seen.add(raw);
    results.push({
      width_m: width,
      length_m: length,
      area_m2: Math.round(width * length * 100) / 100,
      raw,
    });
  }

  for (const match of text.matchAll(MULTIPLY_DIMENSION_PATTERN)) {
    const a = parseUnitNumber(match[1]!);
    const b = parseUnitNumber(match[2]!);
    if (a == null || b == null) continue;
    const raw = match[0];
    if (seen.has(raw)) continue;
    seen.add(raw);
    results.push({
      length_m: a,
      width_m: b,
      area_m2: Math.round(a * b * 100) / 100,
      raw,
    });
  }

  for (const match of text.matchAll(BY_DIMENSION_PATTERN)) {
    const a = parseUnitNumber(match[1]!);
    const b = parseUnitNumber(match[2]!);
    if (a == null || b == null) continue;
    const raw = match[0];
    if (seen.has(raw)) continue;
    seen.add(raw);
    results.push({
      length_m: a,
      width_m: b,
      area_m2: Math.round(a * b * 100) / 100,
      raw,
    });
  }

  return results;
}

export function hasAreaUnit(text: string): boolean {
  return /(\d+(?:\.\d+)?)\s*(?:m²|m2|sqm|square\s*met(?:re|er)s?)(?:\b|$)/i.test(
    text
  );
}

export function classifyMeasurementContext(text: string): {
  kind: "height" | "area" | "distance" | "ambiguous";
  value?: number;
} {
  const lower = text.toLowerCase();

  if (hasAreaUnit(text)) {
    const area = parseAreaM2(text);
    if (area != null) return { kind: "area", value: area };
  }

  if (HEIGHT_CONTEXT_PATTERN.test(lower)) {
    const match = lower.match(
      /(\d+(?:\.\d+)?)\s*(?:m|met(?:re|er)s?)\b/
    );
    if (match?.[1]) {
      const value = parseUnitNumber(match[1]);
      if (value != null) return { kind: "height", value };
    }
  }

  if (WALKING_DISTANCE_PATTERN.test(lower)) {
    const match = lower.match(
      /(?:around|about|approximately|~)?\s*(\d+(?:\.\d+)?)\s*(?:m|met(?:re|er)s?)\b/
    );
    if (match?.[1]) {
      const value = parseUnitNumber(match[1]);
      if (value != null) return { kind: "distance", value };
    }
  }

  const bareMatch = lower.match(
    /\b(?:deck|the\s+deck)\s+is\s+(\d+(?:\.\d+)?)\s*(?:m|met(?:re|er)s?)\b/
  );
  if (bareMatch?.[1] && !hasAreaUnit(text)) {
    const value = parseUnitNumber(bareMatch[1]);
    if (value != null) {
      if (HEIGHT_CONTEXT_PATTERN.test(lower)) {
        return { kind: "height", value };
      }
      if (WALKING_DISTANCE_PATTERN.test(lower)) {
        return { kind: "distance", value };
      }
      return { kind: "ambiguous", value };
    }
  }

  return { kind: "ambiguous" };
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
    /(\d+(?:\.\d+)?)\s*(?:m²|m2|sqm|square\s*met(?:re|er)s?)(?:\b|$)/i
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

  for (const lw of parseLengthWidthDimensions(text)) {
    results.push({ kind: "width_m", value: lw.width_m, raw: lw.raw });
    results.push({ kind: "length_m", value: lw.length_m, raw: lw.raw });
    results.push({ kind: "area_m2", value: lw.area_m2, raw: lw.raw });
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
  const measurementContext = classifyMeasurementContext(text);

  if (factKey.includes("height") || factKey.includes("deck.height")) {
    if (measurementContext.kind === "height" && measurementContext.value) {
      return String(measurementContext.value);
    }
    const height = dimensions.find((d) => d.kind === "height_m");
    if (height) return String(height.value);
  }

  if (factKey.includes("area") || unit === "m²") {
    const area = dimensions.find((d) => d.kind === "area_m2");
    if (area) return String(area.value);
    if (measurementContext.kind === "area" && measurementContext.value) {
      return String(measurementContext.value);
    }
    const bare = text.match(BARE_NUMBER_PATTERN);
    if (bare?.[1] && SIZE_HINT.test(text) && hasAreaUnit(text)) {
      return bare[1];
    }
  }

  if (factKey.includes("length") || (factKey.endsWith("_m") && factKey.includes("length"))) {
    const length = dimensions.find((d) => d.kind === "length_m");
    if (length) return String(length.value);
  }

  if (factKey.includes("width")) {
    const width = dimensions.find((d) => d.kind === "width_m");
    if (width) return String(width.value);
  }

  if (factKey.includes("carting") || factKey.includes("distance")) {
    if (measurementContext.kind === "distance" && measurementContext.value) {
      return String(measurementContext.value);
    }
    const length = dimensions.find((d) => d.kind === "length_m");
    if (length) return String(length.value);
  }

  if (unit) {
    const bare = text.match(BARE_NUMBER_PATTERN);
    if (bare?.[1]) return bare[1];
  }

  const areaMatch = text.match(
    /(\d+(?:\.\d+)?)\s*(?:m²|m2|sqm|square\s*met(?:re|er)s?)(?:\b|$)/i
  );
  if (areaMatch?.[1] && (factKey.includes("area") || unit === "m²")) {
    return areaMatch[1];
  }

  const lengthMatch = text.match(
    /(\d+(?:\.\d+)?)\s*(?:m|met(?:re|er)s?|lm)\b/i
  );
  if (lengthMatch?.[1] && (factKey.includes("length") || unit === "m")) {
    if (measurementContext.kind === "height") return null;
    return lengthMatch[1];
  }

  return null;
}

export function parseBareScopeNumber(
  text: string,
  scopeMentioned: boolean
): string | null {
  if (!scopeMentioned) return null;

  const context = classifyMeasurementContext(text);
  if (context.kind === "height" || context.kind === "distance") return null;
  if (context.kind === "ambiguous") return null;

  const match = text.match(
    /(?:size\s+is|area\s+is|is)\s*(\d+(?:\.\d+)?)(?:\s*(?:m²|m2|sqm))?/i
  );
  if (match?.[1]) return match[1];

  if (SIZE_HINT.test(text) && hasAreaUnit(text)) {
    const bare = text.match(/\b(\d+(?:\.\d+)?)\s*$/);
    if (bare?.[1]) return bare[1];
  }

  return null;
}
