# Assistant V2 Chat Plan

Design document for a future conversational Assistant V2. **Not implemented in Sprint 7A.**

## Goals

- One question at a time, plain English
- Notes and answers feed the same cost engine (`calculateQuickEstimateV1`)
- Conversation history is auditable and links to estimate snapshots
- Mobile-first layout with estimate always visible

## Proposed `assistant_messages` table

```sql
create table assistant_messages (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id),
  project_id uuid not null references projects(id),
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  message_type text not null default 'text'
    check (message_type in ('text', 'question', 'answer', 'estimate_update', 'system')),
  -- Links to structured data when applicable
  scope_question_id uuid references scope_questions(id),
  scope_answer_id uuid references scope_answers(id),
  discovery_run_id uuid references discovery_runs(id),
  quick_estimate_snapshot_id uuid references quick_estimate_snapshots(id),
  metadata jsonb default '{}',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
```

Indexes: `(project_id, created_at)`, `(organisation_id, project_id)`.

## User message → facts / answers

1. User sends natural language (composer or voice later).
2. Message stored with `role = 'user'`.
3. `runAssistantAnalysis` (or a slim chat variant) extracts facts via discovery.
4. High-confidence facts auto-sync to `scope_answers` (existing `sync-discovery-facts-to-answers`).
5. Assistant stores a summary bubble: `role = 'assistant'`, `message_type = 'text'`.

## One question at a time

- `getNextPricingQuestion` remains the source of truth for the next unanswered high-impact fact.
- Assistant emits one `message_type = 'question'` row with `scope_question_id`.
- UI renders only the latest unanswered question card (no full questionnaire).
- After answer save, emit `message_type = 'answer'` and recalculate estimate.

## Estimate updates after each answer

1. `saveScopeAnswer` persists answer and calls `recalculateQuickEstimate`.
2. On success, insert `message_type = 'estimate_update'` with `quick_estimate_snapshot_id`.
3. Live estimate panel reads latest `quick_estimates` row (unchanged).

## Conversation history ↔ snapshots

- Each recalculation already writes `quick_estimate_snapshots` (Sprint 6).
- Chat messages reference `quick_estimate_snapshot_id` for “estimate changed” bubbles.
- Reset assistant clears messages for the project (alongside scopes/answers) but keeps project notes in `project_scope_builder_inputs`.

## Mobile layout

```
┌─────────────────────────┐
│ Header + completeness   │
├─────────────────────────┤
│ Chat thread (scroll)    │
│  - user notes           │
│  - what Quotr understood│
│  - one question         │
├─────────────────────────┤
│ Live estimate (sticky)  │
├─────────────────────────┤
│ Composer                │
└─────────────────────────┘
```

Desktop: chat ~70% width, estimate sidebar ~30% (current V2 shell).

## What not to build yet

- Full streaming chat UI / typing indicators
- RFQs, quote PDFs, client portal
- `assistant_messages` table migration (unless explicitly scheduled)
- Multi-turn LLM dialogue beyond discovery + structured Q&A
- Voice input
- File upload in chat (notes input remains separate)

## Dependencies on Sprint 7A

- V2 actions independent of `project-assistant` actions
- `submit-notes.ts` + `run-assistant-analysis.ts` as neutral core
- Targeted cache tags (`assistant-{id}`, `estimate-{id}`, etc.)
- Zod-validated discovery output before persist
