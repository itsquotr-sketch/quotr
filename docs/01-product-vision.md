# Quotr Product Vision

**Status:** Source of truth for product direction.

---

## What is Quotr?

Quotr is primarily a **Rapid Estimating platform** — an AI-assisted preconstruction tool for small builders and contractors.

**Primary user outcome:**

> Help a contractor turn site notes into a profitable estimate in minutes.

**Input:** project enquiries, site visits, phone calls, emails, photos, notes, specifications, rough measurements.

**Output:** a fast ballpark (Quick Estimate), a refined scope and numbers (Detailed Estimate), subcontractor pricing requests, and a professional client quote.

Quotr owns the path from **"someone called about a job"** to **"here is your quote"** — with speed and margin protection at the centre.

---

## Target users

### Primary
- Small builders (1–15 staff) quoting residential and light commercial work
- Owner-operators who estimate and quote themselves
- Site supervisors who capture information in the field

### Secondary
- Estimators in small building companies
- Trade contractors who quote fixed-scope packages

### Not target users
- Large commercial construction firms with dedicated estimating departments
- Accountants or bookkeepers
- Project managers running full job delivery programs

---

## Core problem

Builders lose time and margin in preconstruction because:

1. Enquiry information arrives unstructured (calls, texts, photos, scribbled notes).
2. Scope is unclear until someone manually translates it into line items.
3. Ballpark pricing takes too long — or gets skipped and margin is lost later.
4. Subcontractor pricing is chased via phone, email, and memory.
5. Quotes are rebuilt from scratch every time.
6. Field capture and office estimating use different mental models and tools.

Quotr compresses this into one workflow centred on **projects, rapid estimates, and structured pricing**.

---

## Core promise

> Turn site notes into a profitable estimate in minutes — then refine, qualify, and quote with confidence.

Quotr should make a builder feel:

- **On site:** "I captured everything in two minutes and already have a ballpark."
- **In the office:** "The quick estimate flagged what I need to clarify before I commit."
- **At quote time:** "Every dollar rolls up from my rates, assemblies, allowances, and constraints — not AI guesswork."

---

## What Quotr is NOT

| Quotr is not | Why |
|---|---|
| Job management software | No scheduling, site diaries, defect tracking, or handover |
| Accounting software | No invoicing, GST reconciliation, or payroll |
| Full project management | No Gantt charts, resource planning, or contract administration |
| A CRM | No lead pipelines, marketing automation, or cold outreach |
| A takeoff/CAD tool | No plan measurement or BIM integration (initially) |
| An AI price generator | AI structures scope and asks questions; pricing comes from the builder's library |

Quotr focuses exclusively on **preconstruction**: capture → rapid estimate → qualify → detailed estimate → subbie pricing → quote.

---

## Product hierarchy

```
Organisation (builder's business)
└── Users (profiles linked to auth)
└── Clients (optional linked records)
└── Project (top-level opportunity / job)
    ├── Project Assistant (unified notes → work areas → questions → quick estimate)
    ├── Confirmed Work Areas (accepted scopes — UI label; stored as `project_scopes`)
    ├── Client Qualification (budget fit, scope clarity, go/no-go)
    ├── Detailed Estimate (line-item estimate from rates, assemblies, allowances)
    ├── RFQs (subcontractor pricing packages)
    └── Quote (client-facing document rolled up from estimate)
```

**Project is the top-level object.** Everything hangs from it.

The workflow stages are sequential in intent but not rigid gates — a builder may skip Client Qualification on repeat clients, or return to Capture after a Detailed Estimate reveals gaps.

---

## Core workflow

```
Project
  → Project Assistant (notes → identified work areas → targeted questions → quick estimate)
  → Client Qualification (budget check, scope clarity, proceed or pause)
  → Confirmed Work Areas (accepted scopes for detailed capture)
  → Detailed Estimate (rates, assemblies, allowances, constraints)
  → RFQs (trade packages to subcontractors)
  → Quote (client-facing roll-up)
```

### Project Assistant (user-facing)

**Project Assistant** is the primary experience on the project detail page. It replaces separate user-facing "Scope Builder" and "Quick Estimate" cards with one assistant-led flow:

1. Contractor tells Quotr what they know (notes).
2. Quotr identifies **work areas** (from `project_scope_suggestions`).
3. Contractor confirms work areas → stored as `project_scopes` (**Confirmed Work Areas** in UI).
4. Quotr asks **targeted questions** (rule-based now; AI later).
5. Quotr produces a **Quick Estimate** range for client qualification.

Internally the app still uses `project_scope_builder_inputs`, `project_scope_suggestions`, `quick_estimates`, `quick_estimate_answers`, and `project_scopes` — but the UI is unified under Project Assistant.

### Capture is not a separate product area

"Capture" is an activity within a project — not a standalone module. A site visit is one **enquiry source** (`enquiry_source: site_visit`), not a top-level entity competing with projects.

### Quick Estimate comes before Detailed Estimate

The builder's first pricing outcome is a **Quick Estimate** — fast, driver-based, good enough to qualify the job and set client expectations. **Detailed Estimate** is the line-item build-up used when the builder commits to quoting.

---

## Estimating architecture

### 1. Quick Estimate Engine

The Quick Estimate Engine turns captured site notes, photos, measurements, and scope type into a **ballpark estimate in minutes**.

How it works:

- Reads **estimate drivers** extracted or inferred from capture (e.g. bathroom size, fixture count, access difficulty, finish level).
- Applies the organisation's **rates**, **assemblies**, and **allowances** through driver formulas — not free-form AI pricing.
- Respects **constraints** (min/max margins, rounding rules, excluded trades, provisional sums).
- Produces a range or single figure with confidence indicators and flagged gaps.

Quick Estimate is the product's primary speed outcome. It must feel instant after capture.

### 2. Estimate Drivers

**Estimate drivers** are the measurable or categorical inputs that move a Quick Estimate up or down.

Examples:

| Driver | Example values |
|---|---|
| Scope type | Bathroom renovation, deck, kitchen |
| Floor area | 6 m², 12 m² |
| Fixture count | 1 WC, 1 basin, 1 shower |
| Finish level | Standard, mid-range, premium |
| Access / complexity | Ground floor, stairs, restricted |
| Structural work | None, minor, major |

Drivers are structured data — not prose. They may be entered manually, parsed from measurements, or suggested by AI from notes and photos. The Quick Estimate Engine maps drivers to pricing logic.

### 3. Constraints System

**Constraints** are business rules that bound how estimates are calculated and presented.

Examples:

- Minimum margin per job or per trade
- Rounding rules (round to nearest $50, $100)
- Excluded items ("owner supplies tiles")
- Provisional sums and PC items
- Maximum discount without approval
- Regional or licence-specific rules

Constraints apply to both Quick Estimate and Detailed Estimate. They ensure every number respects the builder's commercial rules — regardless of who triggered the calculation.

### 4. AI Question Engine

The **AI Question Engine** analyses capture data and identifies **gaps that affect estimate confidence**.

AI responsibilities:

- Generate clarifying questions from notes, photos, and measurements
- Flag missing drivers (e.g. "Is the subfloor timber or concrete?")
- Suggest scope items the builder may have overlooked
- Indicate confidence per driver and per line item

AI does **not** set prices. It improves the inputs and structure so the pricing engine can run accurately.

Questions flow: AI suggests → builder answers → drivers update → estimate recalculates.

### 5. Quick Estimate vs Detailed Estimate

| | Quick Estimate | Detailed Estimate |
|---|---|---|
| **Purpose** | Ballpark in minutes; qualify the job | Line-item build-up for quoting |
| **Speed** | Seconds to minutes | Minutes to hours |
| **Inputs** | Drivers + constraints + capture summary | Rates, assemblies, allowances, manual items |
| **Output** | Range or single ballpark with confidence | Sections, line items, subtotals, margins |
| **When** | Right after capture; before committing effort | After client qualification; before RFQs and quote |
| **Accuracy** | Directionally correct; flags gaps | Quote-ready; builder-reviewed |

Quick Estimate answers: *"Is this job worth pursuing and roughly what will it cost?"*

Detailed Estimate answers: *"What exactly are we quoting and what is every line worth?"*

### 6. Why AI never generates pricing directly

Quotr deliberately separates **AI interpretation** from **pricing calculation**.

Reasons:

1. **Trust** — Builders stake their reputation on every quote. They must own the numbers.
2. **Consistency** — The same scope with the same drivers must always produce the same price from the same rates library.
3. **Auditability** — Every dollar must trace to a rate, assembly, allowance, or constraint — not an opaque model output.
4. **Liability** — AI hallucinated prices create commercial and legal risk.
5. **Builder differentiation** — Margin, trade relationships, and pricing strategy live in the builder's library, not a generic model.

AI structures scope, extracts drivers, and asks questions. The **pricing engine** calculates from the builder's data.

### 7. Why pricing comes from rates, assemblies, allowances, and constraints

| Source | Role |
|---|---|
| **Rates** | Unit costs the builder trusts (labour, materials, plant per unit) |
| **Assemblies** | Pre-built bundles of rates for common scope packages (e.g. "standard bathroom rough-in") |
| **Allowances** | Fixed sums for unknowns or client-supplied items (provisional sums, PC items) |
| **Constraints** | Business rules that bound totals, margins, and presentation |

Together these form the **builder's pricing library** — the single source of truth for all estimates. Quick Estimate uses them through driver formulas; Detailed Estimate uses them line by line.

This model means:

- Prices improve as the builder refines their library — compounding value over time.
- Estimates are reproducible and explainable to clients and subcontractors.
- AI accelerates data entry and gap detection without replacing commercial judgment.

---

## Enquiry sources

A project records how the enquiry arrived:

| Source | Description |
|---|---|
| `site_visit` | Builder attended the site |
| `phone_call` | Initial contact by phone |
| `email` | Email enquiry |
| `website` | Web form or enquiry |
| `plans_specs` | Plans or specifications received |
| `referral` | Referred by another party |
| `other` | Other source |

---

## Project lifecycle statuses

| Status | Meaning |
|---|---|
| `enquiry` | New opportunity, information being gathered |
| `scoping` | Capture in progress; Quick Estimate may be running |
| `estimating` | Detailed Estimate in progress |
| `quoting` | Quote being prepared or sent |
| `won` | Client accepted |
| `lost` | Client declined |
| `on_hold` | Paused |

---

## Scope types (examples)

System-seeded scope types include:

- Bathroom renovation
- Kitchen renovation
- Deck
- Internal alteration
- Roofing
- Landscaping
- Electrical
- Plumbing
- Painting
- Fencing
- Other (custom)

Organisations may add their own scope types later. Scope type is a primary **estimate driver**.

---

## Two experiences, one product

### Desktop web app
Full control centre for rates, assemblies, detailed estimating, RFQs, and quotes. Used in the office.

### Mobile access
Simplified field capture and Quick Estimate for builders on site. Used to log enquiries, capture notes and photos, and get a ballpark before leaving the property.

These are **responsive variants of one web app**, not two separate products. Layout rules are in `04-ux-ui-rules.md`.

---

## Success metrics (future)

- Time from site capture to Quick Estimate
- Time from Quick Estimate to sent quote
- Quick Estimate accuracy vs final quoted price (variance tracking)
- Quote win rate
- Subcontractor pricing response time
- Driver completeness before Detailed Estimate

---

## Guiding principles

1. **Project-first** — never let another entity compete with Project as the workflow root.
2. **Speed first** — Quick Estimate is the primary outcome; optimise for minutes, not hours.
3. **Capture in the field, refine in the office** — mobile for speed and ballpark; desktop for depth.
4. **AI assists, builder decides** — AI structures scope and asks questions; builder owns pricing.
5. **Pricing from the library** — rates, assemblies, allowances, and constraints are the only pricing sources.
6. **Preconstruction only** — resist feature creep into job delivery or accounting.
