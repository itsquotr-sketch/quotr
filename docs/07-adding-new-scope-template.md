# Adding a New Scope Template

Quotr uses **scope templates** to drive AI discovery, guided questions, constraints, trades, and quick estimate benchmarks. Each supported work type is defined as a TypeScript template under `src/lib/scope-templates/`.

## When to add a template

Add a template when a work type needs:

- Structured discovery (aliases, fact extraction, missing questions)
- Scope-specific constraints and likely trades
- Benchmark-based quick estimates with known calculation rules

Work types without templates still work via `custom_scope` and generic questions.

## Steps

### 1. Create the template file

Create `src/lib/scope-templates/<work-type>.ts` exporting a `ScopeTemplate` object.

Use snake_case for `key` (e.g. `fence`) and match `workAreaTypeKey` to the existing work area display name used elsewhere (e.g. `"Fence"`).

### 2. Add aliases

`aliases` are lowercase keywords/phrases matched against project notes during rule-based and AI discovery.

```ts
aliases: ["fence", "fencing", "boundary fence", "paling fence", "gate"],
```

### 3. Add required and optional facts

Facts define what can be **extracted from notes** and what the cost engine needs.

```ts
requiredFacts: [
  {
    key: "fence.length_m",
    label: "Fence length",
    unit: "m",
    required: true,
    extractionPatterns: [/fence\s*(\d+(?:\.\d+)?)\s*m/i],
    extractValue: (m) => m[1] ?? null,
  },
],
optionalFacts: [
  {
    key: "fence.has_gate",
    label: "Gate included",
    required: false,
    extractionPatterns: [/\bgate\b/i],
    extractValue: () => "yes",
  },
],
```

### 4. Add questions

Questions appear in Project Assistant Step 3. Set `required: true` for facts needed to narrow the estimate.

```ts
questions: [
  {
    questionKey: "fence.length_m",
    label: "Approximate fence length?",
    type: "number",
    unit: "m",
    required: true,
    affectsEstimate: true,
    placeholder: "e.g. 25",
  },
  {
    questionKey: "fence.height_m",
    label: "Fence height?",
    type: "number",
    unit: "m",
    required: true,
    affectsEstimate: true,
  },
  {
    questionKey: "fence.material_type",
    label: "Timber or aluminium?",
    type: "select",
    required: false,
    affectsEstimate: true,
    options: [
      { value: "timber", label: "Timber" },
      { value: "aluminium", label: "Aluminium" },
      { value: "unknown", label: "Not sure yet" },
    ],
  },
],
```

If a fact is extracted from notes with confidence ≥ 0.7, the question is **not** asked again — the answer is prefilled with source `discovery`.

### 5. Add constraints

Scope-specific site/programme modifiers (separate from measurement facts):

```ts
constraints: [
  {
    key: "steep_site",
    label: "Steep site",
    slug: "fence-steep-site",
  },
  {
    key: "neighbour_access",
    label: "Neighbour access required",
    slug: "fence-neighbour-access",
  },
],
```

Universal constraints (`tight_access`, `poor_parking`, etc.) live in `src/lib/scope-templates/shared.ts`.

### 6. Add likely trades

```ts
likelyTrades: ["Builder / Carpenter", "Labourer", "Gate supplier"],
```

### 7. Add benchmark rates

Per-unit NZD benchmarks used when no saved package rate exists:

```ts
benchmarkRates: {
  unit: "m",
  low: 180,
  typical: 280,
  high: 420,
},
```

### 8. Add estimate rules

Wire calculation in `src/lib/scope-templates/calculate.ts`:

```ts
estimateRules: {
  calculationType: "linear_length", // add new type in calculate.ts if needed
  requiredFactKeys: ["fence.length_m"],
  lowMultiplier: 0.85,
  highMultiplier: 1.25,
},
```

Extend `calculateFromTemplate()` with a `case` for your `calculationType`.

### 9. Register the template

Add the export to `src/lib/scope-templates/index.ts`:

```ts
import { fenceTemplate } from "@/lib/scope-templates/fence";

const ALL_TEMPLATES: ScopeTemplate[] = [
  bathroomRenovationTemplate,
  deckTemplate,
  retainingWallTemplate,
  fenceTemplate,
];
```

### 10. Add test notes

Manually verify discovery with sample notes, e.g.:

> Replace 25m timber boundary fence with gate. Tight side access. Client wants mid-range finish.

Expected:

- Work area matched to `fence` template
- `fence.length_m` extracted or asked
- `tight_access` constraint suggested
- Trades: Builder, Labourer, Gate supplier
- Quick estimate uses fence benchmark when length known

## File checklist

| File | Purpose |
|------|---------|
| `src/lib/scope-templates/<name>.ts` | Template definition |
| `src/lib/scope-templates/index.ts` | Registry |
| `src/lib/scope-templates/calculate.ts` | Cost calculation (if new logic) |
| `src/lib/scope-templates/discovery.ts` | Usually no change |
| `src/lib/scope-templates/prompt-context.ts` | Auto-includes registered templates |

## Architecture notes

- **Template key** (`fence`) — stable identifier for AI and cost engine
- **workAreaTypeKey** (`"Fence"`) — legacy display name used in scopes DB
- Discovery merges template matches with non-template scope suggestion rules
- AI prompt context is built from all registered templates via `buildTemplatePromptContext()`
- Do not add pricing invention in AI prompts — benchmarks stay in templates only
