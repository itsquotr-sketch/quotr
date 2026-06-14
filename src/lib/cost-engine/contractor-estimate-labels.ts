/**
 * Contractor-facing labels for the estimate panel.
 * Strips question phrasing, internal keys, and redundant modifiers.
 */

const QUESTION_PREFIX =
  /^(is|are|do|does|has|have|was|were|will|can|could|should)\s+/i;

function stripQuestionPhrasing(text: string): string {
  let result = text.trim();
  result = result.replace(/\?\s*/g, " ").trim();
  if (QUESTION_PREFIX.test(result)) {
    result = result.replace(QUESTION_PREFIX, "").trim();
  }
  return result;
}

function titleCase(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Remove percentage modifiers for summary cards; keep dollar amounts. */
function stripPercentModifier(text: string): string {
  return text
    .replace(/\s*\(\+\d+%\)/gi, "")
    .replace(/\s*\+\d+%/g, "")
    .replace(/\s*\(-\d+%[^)]*\)/gi, "")
    .trim();
}

function normalizeAllowanceName(text: string): string {
  let name = stripQuestionPhrasing(text);
  name = stripPercentModifier(name);
  name = name.replace(/:\s*(Typical|Low|High)\s*/gi, ": ");
  name = name.replace(/\brequired\b/gi, "").trim();
  name = name.replace(/:\s*\+/g, ": ");
  name = name.replace(/\s*:\s*$/g, "").trim();
  name = name.replace(/\s*\(user allowance\)/i, "");
  name = name.replace(/\s*allowance\s*allowance/i, " allowance");
  name = name.replace(/\s+/g, " ").trim();
  if (!/\ballowance\b/i.test(name) && !/\$\d/.test(name)) {
    name = `${name} allowance`;
  }
  return titleCase(name);
}

/** Format a line for "What this estimate covers". */
export function formatCoverageLine(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;

  if (/^\$\d/.test(trimmed) || /\$\d[\d,]*/.test(trimmed)) {
    const amountMatch = trimmed.match(/\$[\d,]+/);
    const namePart = trimmed
      .replace(/\$[\d,]+/g, "")
      .replace(/:\s*$/, "")
      .trim();
    const name = normalizeAllowanceName(namePart || trimmed);
    if (amountMatch && !name.includes(amountMatch[0])) {
      return `${name.replace(/\s*allowance$/i, "")} allowance: ${amountMatch[0]}`;
    }
    return name;
  }

  if (/\+?\d+%/.test(trimmed) && !/\$/.test(trimmed)) {
    const base = stripPercentModifier(stripQuestionPhrasing(trimmed));
    return titleCase(`${base} allowance`);
  }

  return titleCase(stripQuestionPhrasing(trimmed));
}

/** Format missing item for breakdown — short fact label only. */
export function formatMissingLabel(raw: string, scopeName?: string): string {
  let label = raw.trim();
  label = label.replace(/^Missing:\s*/i, "");
  if (scopeName) {
    label = label.replace(new RegExp(`^${scopeName}:\\s*`, "i"), "");
  }
  label = label.replace(/\s*not confirmed$/i, "");
  label = stripQuestionPhrasing(label);
  return titleCase(label);
}

/** Format assumption for breakdown section. */
export function formatAssumptionLabel(raw: string): string {
  let label = stripPercentModifier(raw.trim());
  label = stripQuestionPhrasing(label);
  if (!/\bassumed\b/i.test(label) && !/\bincluded\b/i.test(label)) {
    if (/client.supplied|excluded|labour only/i.test(label)) {
      return titleCase(label);
    }
    label = `${label} assumed`;
  }
  return titleCase(label);
}

/** Cost driver label — allowance/modifier without "assumed" suffix. */
export function formatCostDriverLabel(raw: string): string {
  let label = raw.trim();
  label = label.replace(/\s*assumed\s*(\(\+\d+%\))?/gi, "").trim();
  label = stripQuestionPhrasing(label);
  label = stripPercentModifier(label);
  if (!/\ballowance\b/i.test(label)) {
    const lower = label.toLowerCase();
    if (
      /stairs|pergola|balustrade|drainage|backfill|spoil|demolition|waterproof|plumbing|electrical|rubbish|engineering|access|elevated|tiling|fixtures/i.test(
        lower
      )
    ) {
      label = `${label} allowance`;
    }
  }
  return titleCase(label.replace(/\s+/g, " "));
}

function dedupeLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const line of lines) {
    const key = line.toLowerCase();
    if (!line || seen.has(key)) continue;
    seen.add(key);
    result.push(line);
  }
  return result;
}

export function buildWhatEstimateCovers(input: {
  scopeNames: string[];
  allowances: string[];
  constraints: string[];
}): string[] {
  const scopeLines = input.scopeNames.map((name) => titleCase(name.trim()));
  const allowanceLines = input.allowances.map(formatCoverageLine);
  const constraintLines = input.constraints
    .filter((c) => !input.scopeNames.some((s) => c.toLowerCase() === s.toLowerCase()))
    .map(formatCoverageLine);

  return dedupeLines([...scopeLines, ...allowanceLines, ...constraintLines]).slice(
    0,
    8
  );
}

export function buildScopeCostDrivers(input: {
  allowances: string[];
  constraints: string[];
  scopeName: string;
}): string[] {
  const fromAllowances = input.allowances.map(formatCostDriverLabel);

  const fromConstraints = input.constraints
    .filter(
      (c) =>
        c.toLowerCase().includes(input.scopeName.toLowerCase()) ||
        /access|rubbish|engineering|spoil|asbestos|carting|parking|occupied|urgent/i.test(
          c
        )
    )
    .map(formatCostDriverLabel);

  return dedupeLines([...fromAllowances, ...fromConstraints]).slice(0, 6);
}

export function buildScopeAssumptions(rawAssumptions: string[]): string[] {
  return dedupeLines(rawAssumptions.map(formatAssumptionLabel)).slice(0, 5);
}

export function buildScopeMissingLabels(
  rawMissing: string[],
  scopeName: string
): string[] {
  return dedupeLines(
    rawMissing.map((m) => formatMissingLabel(m, scopeName))
  ).slice(0, 5);
}

export function formatExclusionLabel(raw: string): string {
  return titleCase(stripQuestionPhrasing(raw.trim()));
}
