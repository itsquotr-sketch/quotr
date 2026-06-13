# Staged Rate Engine

Quotr estimates improve as contractors add more rate data. The engine progresses through five levels without forcing configuration upfront.

## Design principles

- **Always estimate first** — benchmark mode produces a draft range immediately.
- **Progressive accuracy** — each level adds data and narrows the range.
- **Transparent trace** — every estimate explains which level and sources were used.
- **No UI overload** — the estimate panel shows a single “Rate detail” line, not a configuration wizard.

---

## Level 0 — Benchmark Mode

**When:** No contractor rates exist for the work areas in the estimate.

**Inputs:**
- Scope template (deck, bathroom, retaining wall, etc.)
- Rough quantity from scope questions or discovery
- Finish level (budget / standard / premium)
- Site constraints

**Output:**
- Benchmark estimate range using Quotr regional/template rates
- Wide confidence band

**Confidence bonus:** Baseline (0 bonus)

**Trace example:** `Deck: 50 m² × $650/m² (template benchmark)`

**UI:** Rate detail shows **Benchmark estimate** with prompt: *Add your rates to make this estimate more accurate.*

---

## Level 1 — Scope Rate Mode

**When:** Contractor has simple scope-level rates (e.g. $/m² per work area).

**Inputs:**
- Organisation `scope_rates` per `scope_type_key`
- Finish level selects budget / standard / premium column
- Quantity from scope answers

**Output:**
- Contractor-specific central estimate per work area
- Narrower range than benchmark

**Confidence bonus:** +15 when all included work areas use scope rates

**Trace example:** `Deck: 50 m² × $720/m² (your Deck rate)`

**UI:** Rate detail shows **Uses your Deck rate** (or multiple lines if mixed).

---

## Level 2 — Component Rate Mode

**When:** Contractor has key component/trade rates (tiler, waterproofing, framing, etc.).

**Inputs:**
- `scope_components` catalogue (system seed + org overrides)
- Component rates mapped to trades/materials
- Scope quantities derived from component formulas

**Output:**
- Estimate built from summed components
- Allowances (rubbish, plumbing, etc.) as line items

**Confidence bonus:** +10 when ≥60% of components have org rates

**Trace example:** `Bathroom: floor tiling 12 m² × $95/m² + waterproofing 18 m² × $45/m²`

**UI:** Rate detail shows **Uses your tiler and waterproofing rates**.

**Foundation (Sprint 10A):** `scope_components` table seeded for bathroom, deck, retaining wall. Full component estimator not built yet.

---

## Level 3 — Labour + Material Mode

**When:** Contractor has labour hourly rates and material unit rates.

**Inputs:**
- `labour_rates`, `material_rates`
- Productivity assumptions per component
- Subcontractor bands where applicable

**Output:**
- Hours × labour rate + material quantities × material rate
- More tailored to contractor’s actual cost structure

**Confidence bonus:** +10 when labour and material rates exist for dominant trades

**Trace example:** `Carpenter 24 hr × $85/hr + decking boards 52 m² × $42/m²`

**UI:** Rate detail shows **Uses your carpenter, labourer and materials rates**.

---

## Level 4 — Historical Calibration Mode

**When:** Actual project costs have been recorded post-job.

**Inputs:**
- Completed project actuals vs estimated
- Variance by scope type and component
- Seasonal/regional adjustments

**Output:**
- Estimates calibrated to contractor’s historical performance
- Tighter sell ranges on repeat scope types

**Confidence bonus:** +15 when historical calibration data exists for the scope type

**Trace example:** `Deck: calibrated to your last 8 deck jobs (+4% vs template)`

**UI:** Rate detail shows **Calibrated to your recent projects**.

**Status:** Planned — not implemented in Sprint 10A.

---

## User allowances

Project-level allowances (`project_allowances`) sit **above** work-area calculations:

1. Sum work areas → apply constraints → apply finish level
2. Add active user allowances (rubbish removal, engineering, etc.)
3. Apply contingency and margin to produce cost/sell ranges

User allowances **replace** matching constraint-based fixed allowances (e.g. user rubbish allowance suppresses `rubbish-removal-required` constraint allowance to avoid double-counting).

Allowances appear in:
- Estimate trace
- Cost breakdown (“User allowances” row)
- Assistant “what’s included” responses

---

## Confidence and range width

| Level | Typical range width | Notes |
|-------|----------------------|-------|
| 0 | 30–50% | Benchmark, missing measurements |
| 1 | 20–35% | Scope rates, key questions answered |
| 2 | 15–25% | Component coverage |
| 3 | 10–20% | Labour + material detail |
| 4 | 8–15% | Historical calibration |

Confidence score (0–100) combines: measurements, finish level, rate level, constraints reviewed, budget context.

---

## Avoiding UI overwhelm

1. **Estimate panel** — one “Rate detail” line + optional prompt to add rates.
2. **Rates onboarding** — triggered only when benchmark rates are used; “Add my rate” for the primary scope.
3. **Chat commands** — natural language updates (allowances, finish, work areas) without opening rate screens.
4. **Component configuration** — deferred until contractor opts in via rates library; not shown during first estimate.

---

## Sprint 10A implementation status

| Item | Status |
|------|--------|
| Intent classification + command router | Done |
| `project_allowances` table + estimate integration | Done |
| `scope_components` seed data | Done |
| Staged rate detail in estimate panel | Done (Levels 0–1; 3 partial) |
| Full component estimator (Level 2) | Foundation only |
| Historical calibration (Level 4) | Design only |

---

## Related files

- `src/lib/cost-engine/resolve-staged-rate-detail.ts` — level detection for UI
- `src/lib/cost-engine/calculate-quick-estimate-v1.ts` — estimate pipeline
- `src/lib/cost-engine/rates/get-base-rate-for-scope.ts` — rate source priority
- `src/lib/assistant-v2/handle-assistant-message.ts` — command routing
- `supabase/migrations/032_project_allowances_scope_components.sql` — data model
