import { YES_NO_UNSURE } from "@/lib/scopes/shared";
import type { ScopeDefinition } from "@/lib/scopes/types";

function toMetres(value: string, fullMatch: string): number | null {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  const idx = fullMatch.indexOf(value);
  const snippet = idx >= 0 ? fullMatch.slice(idx, idx + value.length + 6) : fullMatch;
  if (/\d\s*mm\b/i.test(snippet)) return num / 1000;
  return num;
}

function extractHigherHeight(match: RegExpMatchArray): string | null {
  const full = match[0];
  if (match[2] != null && match[1] != null) {
    const a = toMetres(match[1], full);
    const b = toMetres(match[2], full);
    if (a == null || b == null) return match[2] ?? match[1] ?? null;
    const higher = Math.max(a, b);
    return String(Math.round(higher * 10) / 10);
  }
  if (match[1] == null) return null;
  const single = toMetres(match[1], full);
  return single == null ? match[1] : String(Math.round(single * 10) / 10);
}

export const retainingWallScope: ScopeDefinition = {
  id: "retaining_wall",
  name: "Retaining Wall",
  workAreaTypeKey: "Retaining Wall",
  category: "Outdoor",
  aliases: [
    "retaining wall",
    "retaining",
    "block wall",
    "timber retaining",
    "concrete retaining",
  ],
  description:
    "Retaining wall construction including drainage, backfill and spoil removal.",
  requiredFacts: [
    {
      key: "retaining_wall.length_m",
      label: "Wall length",
      type: "number",
      unit: "m",
      required: true,
      affectsEstimate: true,
      affectsConfidence: true,
      questionText: "Approximate wall length?",
      placeholder: "e.g. 12",
      extractionPatterns: [
        /retaining\s*wall\s*(?:around|about|approx(?:imately)?\.?|is)?\s*(\d+(?:\.\d+)?)\s*(?:m|met(?:re|er)s?|lm)\s*long/i,
        /(?:over|about|approx(?:imately)?\.?|around)\s*(\d+(?:\.\d+)?)\s*(?:m|met(?:re|er)s?|lm)\s*long/i,
        /(\d+(?:\.\d+)?)\s*(?:m|met(?:re|er)s?|lm)\s*(?:long|length)?\s*(?:retaining\s*)?wall/i,
      ],
      extractValue: (m) => m[1] ?? null,
    },
    {
      key: "retaining_wall.height_m",
      label: "Wall height",
      type: "number",
      unit: "m",
      required: true,
      affectsEstimate: true,
      affectsConfidence: true,
      questionText: "Approximate wall height?",
      placeholder: "e.g. 1.2",
      extractionPatterns: [
        /(?:rakes?|raking)\s+from\s+(\d+(?:\.\d+)?)\s*(?:mm|m|met(?:re|er)s?)?\s+to\s+(\d+(?:\.\d+)?)\s*(?:mm|m|met(?:re|er)s?)/i,
        /height\s+varies\s+from\s+(\d+(?:\.\d+)?)\s*(?:mm|m|met(?:re|er)s?)?\s+to\s+(\d+(?:\.\d+)?)\s*(?:mm|m|met(?:re|er)s?)/i,
        /between\s+(\d+(?:\.\d+)?)\s*(?:mm|m|met(?:re|er)s?)?\s+and\s+(\d+(?:\.\d+)?)\s*(?:mm|m|met(?:re|er)s?)\s*high/i,
        /(\d+(?:\.\d+)?)\s*(?:mm|m|met(?:re|er)s?)\s+to\s+(\d+(?:\.\d+)?)\s*(?:mm|m|met(?:re|er)s?)\s*high/i,
        /(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)\s*(?:mm|m|met(?:re|er)s?)\s*high/i,
        /(\d+(?:\.\d+)?)\s*(?:m|met(?:re|er)s?)?\s*(?:high|height|tall)\s+down\s+to\s+(\d+(?:\.\d+)?)\s*(?:m|met(?:re|er)s?|high|tall)?/i,
        /(?:varies|taper(?:s)?|rake(?:s)?)\s+between\s+(\d+(?:\.\d+)?)\s*(?:mm|m|met(?:re|er)s?)?\s+and\s+(\d+(?:\.\d+)?)\s*(?:mm|m|met(?:re|er)s?)?\s*(?:high|tall)?/i,
        /(?:varies|taper(?:s)?|rake(?:s)?)\s+from\s+(\d+(?:\.\d+)?)\s*(?:mm|m|met(?:re|er)s?)?\s+to\s+(\d+(?:\.\d+)?)\s*(?:mm|m|met(?:re|er)s?)?/i,
        /(\d+(?:\.\d+)?)\s*(?:m|met(?:re|er)s?)\s*(?:high|height|tall)\s*(?:retaining\s*)?wall/i,
      ],
      extractValue: (m) => extractHigherHeight(m),
    },
    {
      key: "retaining_wall.material",
      label: "Wall material",
      type: "select",
      required: true,
      affectsEstimate: true,
      affectsConfidence: true,
      questionText: "What material — timber, block or concrete?",
      options: [
        { value: "timber", label: "Timber" },
        { value: "block", label: "Block" },
        { value: "concrete", label: "Concrete" },
        { value: "unknown", label: "Not sure yet" },
      ],
      extractionPatterns: [
        /\btimber\s+retaining\b/i,
        /\bblock\s+wall\b/i,
        /\bconcrete\s+retaining\b/i,
      ],
      extractValue: (m) => {
        const text = m[0].toLowerCase();
        if (text.includes("timber")) return "timber";
        if (text.includes("block")) return "block";
        if (text.includes("concrete")) return "concrete";
        return null;
      },
    },
    {
      key: "retaining_wall.has_drainage",
      label: "Drainage",
      type: "select",
      required: true,
      affectsEstimate: true,
      affectsConfidence: true,
      questionText: "Is drainage required?",
      options: [...YES_NO_UNSURE],
      extractionPatterns: [/\bdrainage\b/i, /\bagg\s*pipe\b/i],
      extractValue: () => "yes",
    },
    {
      key: "retaining_wall.machine_access",
      label: "Machine access",
      type: "select",
      required: true,
      affectsEstimate: true,
      affectsConfidence: true,
      questionText: "Is machine access available?",
      options: [...YES_NO_UNSURE],
      extractionPatterns: [
        /\bno\s+digger\b/i,
        /\bmachine\s+access\s+limited\b/i,
      ],
      extractValue: () => "no",
    },
  ],
  optionalFacts: [
    {
      key: "retaining_wall.has_backfill",
      label: "Backfill",
      type: "select",
      required: false,
      affectsEstimate: true,
      affectsConfidence: true,
      questionText: "Is backfill required?",
      options: [...YES_NO_UNSURE],
      extractionPatterns: [/\bbackfill\b/i],
      extractValue: () => "yes",
    },
    {
      key: "retaining_wall.has_spoil_removal",
      label: "Spoil removal",
      type: "select",
      required: false,
      affectsEstimate: true,
      affectsConfidence: true,
      questionText: "Is spoil removal required?",
      options: [...YES_NO_UNSURE],
      extractionPatterns: [/\bspoil\b/i],
      extractValue: () => "yes",
    },
    {
      key: "retaining_wall.carting_distance_m",
      label: "Carting distance",
      type: "number",
      unit: "m",
      required: false,
      affectsEstimate: true,
      affectsConfidence: true,
      questionText: "What is the carting distance?",
      placeholder: "e.g. 15",
      extractionPatterns: [
        /haul\s+distance\s+(\d+(?:\.\d+)?)\s*(?:m|met(?:re|er)s?)/i,
        /haul\s+(\d+(?:\.\d+)?)\s*(?:m|met(?:re|er)s?)/i,
        /(\d+(?:\.\d+)?)\s*(?:m|met(?:re|er)s?)\s+haul/i,
        /cart\s+spoil\s+(\d+(?:\.\d+)?)\s*(?:m|met(?:re|er)s?)/i,
        /cart\s+(\d+(?:\.\d+)?)\s*(?:m|met(?:re|er)s?)\b/i,
        /(\d+(?:\.\d+)?)\s*(?:m|met(?:re|er)s?)\s+to\s+dump/i,
        /dump\s+(\d+(?:\.\d+)?)\s*(?:m|met(?:re|er)s?)\s+away/i,
        /trucking\s+distance\s+(\d+(?:\.\d+)?)\s*(?:m|met(?:re|er)s?)?/i,
        /(\d+(?:\.\d+)?)\s*(?:m|met(?:re|er)s?)\s+to\s+(?:remove|haul|carry)\b.*?(?:earth|spoil|backfill|tip)/i,
        /(?:distance\s+to\s+(?:remove|haul|carry)|(?:remove|haul|carry)\s+(?:earth|spoil|backfill))\b.*?(?:is\s+)?(\d+(?:\.\d+)?)\s*(?:m|met(?:re|er)s?)/i,
        /carting\s+distance\s+(?:is\s+)?(\d+(?:\.\d+)?)\s*(?:m|met(?:re|er)s?)/i,
        /(?:haul|carry)\s+(\d+(?:\.\d+)?)\s*(?:m|met(?:re|er)s?)\b/i,
        /(\d+(?:\.\d+)?)\s*(?:m|met(?:re|er)s?)\s+(?:away|to\s+tip)\b/i,
        /(?:remove|carry)\s+spoil\s+(\d+(?:\.\d+)?)\s*(?:m|met(?:re|er)s?)/i,
        /(\d+(?:\.\d+)?)\s*(?:m|met(?:re|er)s?)\s*carting/i,
      ],
      extractValue: (m) => m[1] ?? null,
    },
    {
      key: "retaining_wall.surcharge_loading",
      label: "Surcharge / loading risk",
      type: "select",
      required: false,
      affectsEstimate: true,
      affectsConfidence: true,
      questionText: "Is there surcharge or loading above the wall?",
      options: [...YES_NO_UNSURE],
      extractionPatterns: [
        /\bsurcharge\b/i,
        /\bloading\s+(?:above|on)\b/i,
        /\bdriveway\s+above\b/i,
      ],
      extractValue: () => "yes",
    },
  ],
  pricingDrivers: [
    "retaining_wall.length_m",
    "retaining_wall.height_m",
    "retaining_wall.material",
    "retaining_wall.has_drainage",
    "retaining_wall.machine_access",
    "retaining_wall.has_backfill",
    "retaining_wall.has_spoil_removal",
    "retaining_wall.carting_distance_m",
    "retaining_wall.surcharge_loading",
  ],
  constraints: [
    {
      key: "machine_access_limited",
      label: "Machine access limited",
      questionText: "Is machine access limited?",
      slug: "retaining-machine-access",
      driverSlug: "machinery-access-limited",
      hideWhenFactAnswered: "retaining_wall.machine_access",
    },
    {
      key: "engineering_consent_risk",
      label: "Engineering/consent risk",
      questionText: "Is there engineering or consent risk?",
      slug: "retaining-engineering-risk",
      followUp: {
        label: "Risk level",
        unit: "",
        valueKey: "severity",
        inputType: "select",
        options: [
          { value: "low", label: "Low" },
          { value: "typical", label: "Typical" },
          { value: "high", label: "High" },
        ],
      },
    },
    {
      key: "difficult_spoil_removal",
      label: "Difficult spoil removal",
      questionText: "Is spoil removal difficult?",
      slug: "retaining-difficult-spoil",
    },
  ],
  likelyTrades: ["Builder", "Earthworks", "Drainage", "Engineer", "Labourer"],
  assumptions: [
    "Standard retaining wall construction assumed.",
    "Engineering may be required for walls over 1.5m.",
  ],
  confidenceRules: {
    measurementFactKeys: [
      "retaining_wall.length_m",
      "retaining_wall.height_m",
      "retaining_wall.material",
      "retaining_wall.has_drainage",
      "retaining_wall.machine_access",
    ],
    highImpactOptionalKeys: [
      "retaining_wall.has_backfill",
      "retaining_wall.has_spoil_removal",
      "retaining_wall.carting_distance_m",
      "retaining_wall.surcharge_loading",
    ],
  },
  benchmarkRates: { unit: "m²", low: 550, typical: 850, high: 1300 },
  estimateRules: {
    calculationType: "wall_area",
    requiredFactKeys: [
      "retaining_wall.length_m",
      "retaining_wall.height_m",
      "retaining_wall.material",
      "retaining_wall.has_drainage",
      "retaining_wall.machine_access",
    ],
  },
};
