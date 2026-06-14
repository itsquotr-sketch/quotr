# Adding a New Scope Template (Sprint 12A)

Quotr uses **canonical scope templates** under `src/lib/scopes/templates/`. Each scope is one TypeScript object following `ScopeTemplate` in `types.ts`. The assistant, cost engine, and estimate breakdown all read from this structure.

## When to add a template

Add a template when a work type needs:

- Recognition from project notes (aliases)
- Structured facts and follow-up questions
- Benchmark or saved-rate pricing
- Per-scope estimate breakdown (components, allocations, inclusions)

Work types without pricing support can be registered as **stubs** (`pricing.supported = false`) so the assistant recognises them without falsely pricing.

## Steps

### 1. Add scope template file

Create `src/lib/scopes/templates/<scope-name>.ts` exporting a `ScopeTemplate` object.

```ts
import type { ScopeTemplate } from "@/lib/scopes/templates/types";

export const kitchenRenovationScopeTemplate: ScopeTemplate = {
  scopeTypeKey: "kitchen_renovation",
  label: "Kitchen renovation",
  workAreaTypeKey: "Kitchen renovation",
  category: "renovation",
  aliases: ["kitchen", "kitchen renovation", "kitchen remodel"],
  // ... see skeleton below
};
```

Register it in `src/lib/scopes/templates/index.ts` → `ALL_CANONICAL_SCOPE_TEMPLATES`.

### 2. Define aliases

Lowercase phrases matched against notes and assistant commands:

```ts
aliases: ["kitchen", "kitchen renovation", "kitchen remodel", "kitchen reno"],
```

### 3. Define required / useful / optional facts

```ts
facts: {
  required: [
    { key: "kitchen.floor_area_m2", label: "Floor area", type: "number", unit: "m²" },
    { key: "kitchen.finish_level", label: "Finish level", type: "select" },
  ],
  useful: [
    { key: "kitchen.layout_changing", label: "Layout changing", type: "select" },
  ],
  optional: [
    { key: "kitchen.appliances_client_supplied", label: "Appliances client supplied", type: "select" },
  ],
},
```

Mirror fact keys in `src/lib/scopes/<scope>.ts` if you also maintain a `ScopeDefinition` for question seeding.

### 4. Define derived fields

When quantity is computed from dimensions:

```ts
quantity: {
  primaryUnit: "m²",
  requiredFields: ["kitchen.floor_area_m2"],
  derivedFields: [
    {
      key: "kitchen.floor_area_m2",
      label: "Floor area",
      formula: "length_m × width_m",
      sourceFields: ["kitchen.length_m", "kitchen.width_m"],
    },
  ],
},
```

### 5. Define benchmark rates

Used when no saved scope rate exists:

```ts
pricing: {
  supported: true,
  pricingMode: "hybrid",
  defaultRateUnit: "m²",
  benchmarkRates: { budget: 4000, standard: 6000, premium: 9000 },
  calculationType: "floor_area",
  // ...
},
```

Wire calculation in `src/lib/scope-templates/calculate.ts` if a new `calculationType` is needed.

### 6. Define allocations

Percentages must sum to **100**:

```ts
defaultAllocations: {
  labour: 25,
  materials: 30,
  subcontractors: 35,
  allowances: 5,
  contingency: 5,
},
```

These drive the **Cost allocation** section in the estimate breakdown.

### 7. Define components

Components appear in the per-scope breakdown. Do not invent line-item precision — use allowances and benchmark labels honestly.

```ts
components: [
  { key: "demolition", label: "Demolition", category: "allowance", defaultIncluded: true },
  { key: "joinery", label: "Joinery", category: "materials", defaultIncluded: true },
  { key: "plumbing", label: "Plumbing", category: "subcontractor", defaultIncluded: true },
],
```

Use `includeWhenFacts` / `excludeWhenFacts` to reflect client-supplied or excluded items.

### 8. Define constraints

```ts
constraints: {
  applicable: [
    { key: "live_house", label: "Occupied home", slug: "kitchen-live-house" },
  ],
},
```

### 9. Define assumptions / exclusions

```ts
assumptions: {
  default: ["Standard kitchen renovation sequence assumed."],
},
exclusions: {
  default: ["Appliances when client-supplied"],
},
```

These align with **Estimate includes** / **Not included** in the panel.

### 10. Define follow-up questions

```ts
followUps: {
  dependentQuestions: [
    {
      whenFactKey: "kitchen.layout_changing",
      whenValue: "yes",
      askFactKey: "kitchen.plumbing_relocation",
      questionText: "Is plumbing being relocated?",
    },
  ],
},
```

### 11. Add tests

Create or extend tests in `src/lib/scopes/templates/sprint-12a-estimate-breakdown.test.ts`:

- Template validation passes (`validateScopeTemplate`)
- Allocations sum to 100
- Estimate breakdown includes the new scope when priced
- Unsupported stubs are not included in quick estimate by default

### 12. Run build

```bash
npm run build
```

Fix any TypeScript errors before merging.

## Kitchen renovation skeleton

```ts
export const kitchenRenovationScopeTemplate: ScopeTemplate = {
  scopeTypeKey: "kitchen_renovation",
  label: "Kitchen renovation",
  workAreaTypeKey: "Kitchen renovation",
  category: "renovation",
  aliases: ["kitchen", "kitchen renovation", "kitchen remodel"],

  quantity: {
    primaryUnit: "m²",
    requiredFields: ["kitchen.floor_area_m2"],
  },

  facts: {
    required: [
      { key: "kitchen.floor_area_m2", label: "Floor area", type: "number", unit: "m²" },
      { key: "kitchen.finish_level", label: "Finish level", type: "select" },
    ],
    useful: [
      { key: "kitchen.layout_changing", label: "Layout changing", type: "select" },
    ],
    optional: [
      { key: "kitchen.appliances_client_supplied", label: "Appliances client supplied", type: "select" },
    ],
  },

  pricing: {
    supported: false, // set true when calculation is ready
    pricingMode: "not_supported",
    defaultRateUnit: "m²",
    benchmarkRates: { budget: 4000, standard: 6000, premium: 9000 },
    defaultAllocations: {
      labour: 25,
      materials: 35,
      subcontractors: 30,
      allowances: 5,
      contingency: 5,
    },
    components: [
      { key: "demolition", label: "Demolition", category: "allowance", defaultIncluded: true },
      { key: "joinery", label: "Joinery", category: "materials", defaultIncluded: true },
      { key: "plumbing", label: "Plumbing", category: "subcontractor", defaultIncluded: true },
      { key: "electrical", label: "Electrical", category: "subcontractor", defaultIncluded: true },
    ],
  },

  constraints: { applicable: [] },
  assumptions: { default: ["Standard kitchen renovation sequence assumed."] },
  exclusions: { default: ["Appliances when client-supplied"] },
  followUps: { dependentQuestions: [] },
  estimateBreakdown: {
    defaultLineGroups: [
      { key: "prep", label: "Preparation", componentKeys: ["demolition"] },
      { key: "fitout", label: "Fit-out", componentKeys: ["joinery", "plumbing", "electrical"] },
    ],
  },
};
```

## File checklist

| File | Purpose |
|------|---------|
| `src/lib/scopes/templates/types.ts` | Canonical type definitions |
| `src/lib/scopes/templates/<name>.ts` | Template object |
| `src/lib/scopes/templates/index.ts` | Registry |
| `src/lib/scopes/templates/validate-scope-template.ts` | Validation |
| `src/lib/scopes/templates/build-scope-components.ts` | Component resolution for breakdown |
| `src/lib/cost-engine/build-structured-estimate-breakdown.ts` | Standardised estimate trace |
| `src/lib/scope-templates/calculate.ts` | Cost calculation (when pricing enabled) |
| `src/lib/scopes/<name>.ts` | Optional ScopeDefinition for facts/questions |

## Architecture notes

- **scopeTypeKey** — stable identifier (`deck`, `bathroom_renovation`)
- **workAreaTypeKey** — display name in DB (`Deck`, `Bathroom renovation`)
- **structuredBreakdown** on `EstimateTrace` is the source of truth for breakdown UI
- Do not show fake line-item precision — use “Allocated from benchmark rate” when appropriate
- Stub templates (`pricing.supported = false`) are tracked but excluded from quick estimate unless the user adds a manual rate

## Validation

Run template validation:

```ts
import { validateAllScopeTemplates, ALL_CANONICAL_SCOPE_TEMPLATES } from "@/lib/scopes/templates";

const results = validateAllScopeTemplates(ALL_CANONICAL_SCOPE_TEMPLATES);
```

All issues should be empty arrays before shipping.
