# Quotr Product Vision

**Status:** Source of truth for product direction.

---

## What is Quotr?

Quotr is an **AI preconstruction assistant** for small builders and contractors. It helps builders turn messy early-stage project information into structured, quotable work.

**Input:** project enquiries, site visits, phone calls, emails, photos, notes, specifications, rough measurements.

**Output:** structured scopes of work, estimates, subcontractor pricing requests, and professional client quotes.

Quotr owns the path from **"someone called about a job"** to **"here is your quote"**.

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
3. Subcontractor pricing is chased via phone, email, and memory.
4. Quotes are rebuilt from scratch every time.
5. Field capture and office estimating use different mental models and tools.

Quotr compresses this into one workflow centred on **projects and scopes**.

---

## Core promise

> Turn enquiries into scoped, estimated, quotable work — faster and with less rework.

Quotr should make a builder feel:

- **On site:** "I captured everything in two minutes."
- **In the office:** "The scope is structured and ready to estimate."
- **At quote time:** "The numbers roll up from scopes, rates, and subbie pricing."

---

## What Quotr is NOT

| Quotr is not | Why |
|---|---|
| Job management software | No scheduling, site diaries, defect tracking, or handover |
| Accounting software | No invoicing, GST reconciliation, or payroll |
| Full project management | No Gantt charts, resource planning, or contract administration |
| A CRM | No lead pipelines, marketing automation, or cold outreach |
| A takeoff/CAD tool | No plan measurement or BIM integration (initially) |

Quotr focuses exclusively on **preconstruction**: understand scope → estimate → get subbie pricing → generate quote.

---

## Product hierarchy

```
Organisation (builder's business)
└── Users (profiles linked to auth)
└── Clients (optional linked records)
└── Projects (top-level opportunity / job)
    ├── Enquiry metadata (source, client, address, brief, notes)
    ├── Scopes of work (1..n per project)
    │   ├── Scope type (bathroom, kitchen, deck, etc.)
    │   ├── Capture: notes, photos, documents, measurements
    │   ├── AI questions and suggested items (later)
    │   ├── Estimate sections and items (later)
    │   └── Trade packages / RFQs (later)
    ├── Project-level estimate (rolls up scopes — later)
    └── Client quote (rolls up estimate — later)
```

**Project is the top-level object.** Everything hangs from it.

---

## Core workflow

```
Project / Opportunity
  → Capture information (phone, email, site visit, plans, photos, notes)
  → Scopes of work (bathroom, kitchen, deck, fence, etc.)
  → Scope-specific capture (notes, photos, documents, measurements)
  → AI questions and suggested estimate items (Phase 4)
  → Estimate (Phase 3)
  → Subcontractor RFQs (Phase 6)
  → Client quote (Phase 5)
```

### Capture is not a separate product area

"Capture" is an activity within a project — not a standalone module. A site visit is one **enquiry source** (`enquiry_source: site_visit`), not a top-level entity competing with projects.

### Scopes are the unit of estimation

Each scope of work may have:
- Its own measurements, photos, documents
- Its own AI questions and confidence
- Its own estimate items
- Its own trade packages for subcontractor pricing

The **project estimate and quote combine individual scopes**.

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
| `scoping` | Scopes of work being defined and captured |
| `estimating` | Estimate in progress |
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

Organisations may add their own scope types later.

---

## Two experiences, one product

### Desktop web app
Full control centre for estimating, admin, rates, assemblies, RFQs, and quotes. Used in the office.

### Mobile access
Simplified field capture for builders on site. Used to log enquiries, add scopes, upload photos, and record measurements.

These are **responsive variants of one web app**, not two separate products. Layout rules are in `04-ux-ui-rules.md`.

---

## Success metrics (future)

- Time from enquiry to scoped project
- Time from scoped project to sent quote
- Quote win rate
- Subcontractor pricing response time
- Scope completeness before estimating

---

## Guiding principles

1. **Project-first** — never let another entity compete with Project as the workflow root.
2. **Scope-driven estimation** — estimate at scope level, roll up to project.
3. **Capture in the field, refine in the office** — mobile for speed, desktop for depth.
4. **AI assists, builder decides** — AI suggests; builder approves.
5. **Preconstruction only** — resist feature creep into job delivery or accounting.
