/**
 * Shared measurement resolver — parses dimensions from natural language
 * and derives related values (area, wall area, etc.).
 */

import {
  classifyMeasurementContext,
  hasAreaUnit,
  parseAreaM2,
  parseLengthWidthDimensions,
  HEIGHT_CONTEXT_PATTERN,
} from "@/lib/assistant-v2/facts/parse-numeric-command";

export type ResolvedMeasurements = {
  length_m?: number;
  width_m?: number;
  height_m?: number;
  area_m2?: number;
  floor_area_m2?: number;
  wall_area_m2?: number;
};

export type MeasurementFactUpdate = {
  factKeySuffix: string;
  value: string;
  unit?: string;
  reason: string;
};

/** Scope prefix → primary dimension suffix when a bare length is given. */
const PRIMARY_LENGTH_SUFFIX: Record<string, string> = {
  fence: "length_m",
  deck: "length_m",
  retaining_wall: "length_m",
};

const AREA_SUFFIX: Record<string, string> = {
  deck: "area_m2",
  bathroom: "floor_area_m2",
  kitchen: "floor_area_m2",
  painting: "floor_area_m2",
  flooring: "area_m2",
};

function parseBareLengthM(text: string): number | null {
  const longMatch = text.match(
    /(\d+(?:\.\d+)?)\s*(?:m|met(?:re|er)s?|lm)?\s*long\b/i
  );
  if (longMatch?.[1]) {
    const num = Number(longMatch[1]);
    if (Number.isFinite(num) && num > 0) return num;
  }

  const beforeHigh = text.split(/\bhigh\b/i)[0] ?? text;
  const match = beforeHigh.match(
    /(\d+(?:\.\d+)?)\s*(?:m|met(?:re|er)s?|lm)\b/i
  );
  if (!match?.[1]) return null;
  const num = Number(match[1]);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function parseBareHeightM(text: string): number | null {
  const highMatch = text.match(
    /(\d+(?:\.\d+)?)\s*(?:m|met(?:re|er)s?)?\s*high\b/i
  );
  if (highMatch?.[1]) {
    const num = Number(highMatch[1]);
    if (Number.isFinite(num) && num > 0) return num;
  }

  const context = classifyMeasurementContext(text);
  if (context.kind === "height" && context.value != null) {
    return context.value;
  }

  if (HEIGHT_CONTEXT_PATTERN.test(text)) {
    const elevatedMatch = text.match(
      /(?:elevated|off\s+the\s+ground|above\s+ground)\s*(?:at|by|around|~)?\s*(\d+(?:\.\d+)?)\s*(?:m|met(?:re|er)s?)?/i
    );
    if (elevatedMatch?.[1]) {
      const num = Number(elevatedMatch[1]);
      if (Number.isFinite(num) && num > 0) return num;
    }
  }

  return null;
}

/**
 * Parse all measurable values from text.
 */
export function resolveMeasurements(text: string): ResolvedMeasurements {
  const result: ResolvedMeasurements = {};

  const area = parseAreaM2(text);
  if (area != null) {
    result.area_m2 = area;
    result.floor_area_m2 = area;
  }

  const dims = parseLengthWidthDimensions(text);
  if (dims.length > 0) {
    const dim = dims[0]!;
    result.length_m = dim.length_m;
    result.width_m = dim.width_m;
    result.area_m2 = dim.area_m2;
    result.floor_area_m2 = dim.area_m2;
  }

  const height = parseBareHeightM(text);
  if (height != null) {
    result.height_m = height;
  }

  const lengthLong = text.match(
    /(\d+(?:\.\d+)?)\s*(?:m|met(?:re|er)s?|lm)?\s*long\b/i
  );
  if (lengthLong?.[1]) {
    const num = Number(lengthLong[1]);
    if (Number.isFinite(num) && num > 0) {
      result.length_m = num;
    }
  }

  const lengthOnly =
    result.length_m ??
    (dims.length === 0 && !hasAreaUnit(text) ? parseBareLengthM(text) : undefined);
  if (lengthOnly != null && result.length_m == null) {
    result.length_m = lengthOnly;
  }

  if (result.length_m != null && result.height_m != null) {
    result.wall_area_m2 =
      Math.round(result.length_m * result.height_m * 100) / 100;
  }

  return result;
}

/**
 * Build fact key updates for a scope prefix from resolved measurements.
 */
export function measurementsToFactUpdates(
  prefix: string,
  measurements: ResolvedMeasurements
): MeasurementFactUpdate[] {
  const updates: MeasurementFactUpdate[] = [];

  if (measurements.length_m != null) {
    const suffix = PRIMARY_LENGTH_SUFFIX[prefix] ?? "length_m";
    updates.push({
      factKeySuffix: suffix,
      value: String(measurements.length_m),
      unit: "m",
      reason: "Length parsed from message",
    });
  }

  if (measurements.width_m != null) {
    updates.push({
      factKeySuffix: "width_m",
      value: String(measurements.width_m),
      unit: "m",
      reason: "Width parsed from dimension phrase",
    });
  }

  if (measurements.height_m != null) {
    updates.push({
      factKeySuffix: "height_m",
      value: String(measurements.height_m),
      unit: "m",
      reason: "Height parsed from message",
    });
  }

  if (measurements.area_m2 != null) {
    const suffix = AREA_SUFFIX[prefix] ?? "area_m2";
    updates.push({
      factKeySuffix: suffix,
      value: String(measurements.area_m2),
      unit: "m²",
      reason:
        measurements.width_m != null
          ? `Calculated area ${measurements.length_m}m × ${measurements.width_m}m = ${measurements.area_m2}m²`
          : "Area parsed from message",
    });
  }

  if (measurements.wall_area_m2 != null && prefix === "retaining_wall") {
    updates.push({
      factKeySuffix: "wall_area_m2",
      value: String(measurements.wall_area_m2),
      unit: "m²",
      reason: `Wall area ${measurements.length_m}m × ${measurements.height_m}m`,
    });
  }

  return updates;
}

/** Fact keys that should not be asked when a derived value exists. */
const DERIVATION_RULES: {
  derivedSuffix: string;
  sourceSuffixes: string[];
}[] = [
  { derivedSuffix: "area_m2", sourceSuffixes: ["length_m", "width_m"] },
  { derivedSuffix: "floor_area_m2", sourceSuffixes: ["length_m", "width_m"] },
  { derivedSuffix: "wall_area_m2", sourceSuffixes: ["length_m", "height_m"] },
];

function factKeyMatchesSuffix(factKey: string, suffix: string): boolean {
  return factKey === suffix || factKey.endsWith(`.${suffix}`);
}

function hasAnsweredSuffix(
  answers: Record<string, string>,
  suffix: string
): boolean {
  for (const [key, value] of Object.entries(answers)) {
    if (!value?.trim() || value.trim() === "unknown") continue;
    if (factKeyMatchesSuffix(key, suffix)) {
      const num = Number(value);
      if (suffix.includes("_m") && Number.isFinite(num)) return num > 0;
      return true;
    }
  }
  return false;
}

/**
 * Returns true when a question should be suppressed because a derived value exists.
 */
export function shouldSuppressQuestionForDerivedValue(
  factKey: string,
  answers: Record<string, string>
): boolean {
  if (hasAnsweredSuffix(answers, factKey.split(".").pop() ?? factKey)) {
    return false;
  }

  for (const rule of DERIVATION_RULES) {
    if (!factKeyMatchesSuffix(factKey, rule.derivedSuffix)) continue;
    const allSourcesPresent = rule.sourceSuffixes.every((s) =>
      hasAnsweredSuffix(answers, s)
    );
    if (allSourcesPresent) return true;
  }

  return false;
}

export function resolveScopePrefix(workAreaTypeKey: string): string | null {
  const map: Record<string, string> = {
    Deck: "deck",
    "Retaining Wall": "retaining_wall",
    "Bathroom renovation": "bathroom",
    Fence: "fence",
    Painting: "painting",
    "Kitchen renovation": "kitchen",
    Flooring: "flooring",
  };
  return map[workAreaTypeKey] ?? null;
}
