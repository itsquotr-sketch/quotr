# Sprint 5D — Conversational Assistant Design (No UI)

## Objective

Reuse the existing estimator engine (`buildQuickEstimateInput` → `calculateQuickEstimateV1`) to power a future chat interface without duplicating pricing logic.

## Core principle

**One engine, two surfaces.** The conversational UI is a different presentation of the same facts, questions, and estimate trace.

## Architecture

```
User message
    ↓
Discovery / fact extraction (existing)
    ↓
Scope SSOT (required + optional facts)
    ↓
Missing facts = required − known
    ↓
Next pricing question (highest impact, unanswered)
    ↓
calculateQuickEstimateV1 → EstimateTrace + ranges
    ↓
Assistant reply (question OR estimate update)
```

## Example flow

### Turn 1 — User

> 50m² timber deck, standard finish

**Engine**

- Work area: Deck
- Known: `deck.area_m2=50`, `deck.material_type=timber`, finish `standard`
- Missing required: `deck.level_type`
- Optional gaps: stairs, balustrade

**Assistant**

> I found a deck project (~50m², timber, standard finish). Is it ground level or elevated?

### Turn 2 — User

> Elevated

**Engine**

- Merge answer: `deck.level_type=elevated`
- Apply elevated modifier (+15%)
- Missing optional: stairs, balustrade

**Assistant**

> Will stairs be required?

### Turn 3 — User

> No

**Engine**

- `deck.has_stairs=no`
- Recalculate → e.g. cost $36k–$42k, sell with margin

**Assistant**

> Current estimate: **$36,000 – $42,000** (medium quality). Missing balustrade detail — range may tighten if you confirm.

## Component mapping (future)

| Current UI component | Conversational role |
|---------------------|---------------------|
| `ProjectAssistantShell` | Session orchestrator |
| `DiscoveryPanel` | “What I found” message block |
| `PricingQuestionsPanel` | Single follow-up question per turn |
| `QuickEstimatePanel` | Estimate summary message |
| `EstimateTracePanel` | “Show working” on demand |

## Question selection rules

1. Only ask facts from scope definitions where `affectsEstimate` or `affectsConfidence`.
2. Skip if `isFactKnownForScope` (saved answer or discovery).
3. Prioritise required facts before optional high-impact facts.
4. Never re-ask area/access if extracted from notes.

## State model

Each turn persists:

- `scope_answers` (auto-save, existing)
- `project_estimate_driver_values` (constraints)
- `quick_estimates` (ranges + trace JSON in `notes`)

The chat layer reads the same tables; it does not maintain a parallel fact store.

## Response templates

| State | Response type |
|-------|----------------|
| Missing required fact | One targeted question |
| Required complete, optional gaps | Estimate + optional tighten question |
| High quality estimate | Tight range + confidence statement |
| Low quality | Wide range + list top 2 missing items |

## Estimate trace in chat

When the user asks “how did you get that?”:

- Surface `EstimateTrace` fields (base calc, finish, constraints, margin).
- Do not expose raw template internals by default.

## Non-goals (this sprint)

- No chat UI, websockets, or message history table.
- No new pricing rules — only validation of existing engine.
- No multi-work-area conversational branching (v1: one active scope at a time).

## Sprint 5E recommendation

1. Implement `getNextPricingQuestion()` pure function from scope SSOT.
2. Add lightweight chat API route that calls existing recalculate pipeline.
3. Mobile-first single-question card UI reusing `PricingQuestionsPanel` field renderers.
4. Voice-to-notes → same discovery path as today.
