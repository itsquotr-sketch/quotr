# Quotr AI Build Rules

**Status:** Source of truth for Cursor, Claude, and all AI agents working on Quotr.

Read this document before writing any code. If a task conflicts with these rules, stop and ask the user.

---

## 1. Mandatory pre-flight

Before every coding session:

1. Read `docs/05-build-roadmap.md` and identify the **current phase**.
2. Confirm the requested work belongs in the current phase.
3. Read relevant docs: `01-product-vision.md`, `02-system-architecture.md`, `03-data-model.md`, `04-ux-ui-rules.md`.
4. If the task spans multiple phases, implement only what the current phase allows.

**Never assume.** If scope is unclear, ask before building.

---

## 2. Phase gating — hard stops

Do not build these until their phase is active and the prior phase definition of done is met:

| Feature area | Earliest phase |
|---|---|
| AI scope assistant, AI questions, OpenAI calls | Phase 4 |
| Subcontractor RFQ sending/workflow | Phase 6 |
| Quote PDF generation/export | Phase 5 |
| Payments, invoicing, accounting | Phase 8 |
| Native mobile app | Phase 7 |
| Rates library (full CRUD) | Phase 2 |
| Assemblies library (full CRUD) | Phase 2 |
| Estimate engine (calculations, roll-ups) | Phase 3 |

**If the user asks for a gated feature during an earlier phase:** explain the phase constraint and offer foundation work that unblocks it instead.

---

## 3. No uncontrolled feature creep

- Build only what the user explicitly requested **and** what the current phase allows.
- Do not add "helpful" extras: analytics, notifications, chat, CRM, job scheduling, timesheets, accounting, inventory, or generic admin tools.
- Do not create new top-level entities that compete with **Project** as the workflow root.
- Do not resurrect `site_visits` as a parallel workflow. Site visit is an **enquiry source**, not a top-level object.
- Do not add duplicate navigation, duplicate CTAs, or parallel implementations of the same workflow.

---

## 4. Styling and layout first

If the UI is unstyled, broken, or using a phone-width layout on desktop:

1. **Stop feature development.**
2. Fix styling, layout, and responsive shell before adding features.
3. Verify Tailwind/Shadcn are loading (`globals.css` imported, content paths configured).
4. Verify desktop sidebar and mobile bottom nav are mutually exclusive.

See `04-ux-ui-rules.md` for exact layout requirements.

---

## 5. Database rules

- **Every schema change must be a migration** in `supabase/migrations/`.
- Never edit production schema by hand in the Supabase dashboard without a matching migration file.
- Never change the database schema during styling-only or documentation tasks unless explicitly requested.
- After a migration: update `src/types/database.ts` to match.
- Prefer additive migrations. Avoid destructive changes without explicit user approval.
- Seed data belongs in migrations or dedicated seed scripts — not in application code.

---

## 6. Security rules

- **Never expose the Supabase service role key** in client code, env files committed to git, or logs.
- **Never bypass RLS.** All data access goes through the authenticated Supabase client with RLS enforced.
- Use `createClient()` from `@/lib/supabase/server` in Server Components and Server Actions.
- Use `createClient()` from `@/lib/supabase/client` only in Client Components that need realtime or client-side reads.
- Organisation scoping is mandatory: every query and mutation must respect `organisation_id`.
- Storage uploads must use org-scoped paths: `{organisation_id}/...`.
- Do not store secrets in `NEXT_PUBLIC_*` variables.

---

## 7. Application architecture rules

### Server Actions for mutations
- All create/update/delete operations use Server Actions in `src/actions/`.
- Actions must: validate with Zod, check auth, check organisation, return clear errors.
- Do not use client-side `fetch` to custom API routes for CRUD unless there is a documented exception.

### Validation
- All form inputs and action payloads validated with Zod schemas in `src/lib/validations/`.
- Never trust client-submitted `organisation_id` or `created_by` — derive from session.

### Data fetching
- Server Components fetch data directly via Supabase server client.
- Do not duplicate the same query in both a page and a child component unless cached/shared intentionally.

### File structure
```
src/
  app/           # Next.js App Router pages and layouts
  actions/       # Server Actions (mutations)
  components/
    layout/      # App shell, sidebar, bottom nav, page container
    ui/          # Shadcn primitives
    projects/    # Project/scope feature components
    shared/      # Reusable non-feature components
  lib/
    validations/ # Zod schemas
    constants/   # Enums and label maps
    supabase/    # Client factories and middleware
```

---

## 8. UI rules summary

- **Desktop (md+):** fixed left sidebar, full-width workspace, `max-w-7xl` content area.
- **Mobile (<md):** bottom nav only, no sidebar, capture-focused flows, bottom padding for nav.
- **Never show both nav systems simultaneously.**
- Use Shadcn components (`Button`, `Card`, `Badge`, `Table`, `Input`, etc.) — not raw unstyled HTML lists.
- Use `cn()` from `@/lib/utils` for conditional classes.
- One primary CTA per context (e.g. one "New Project" per page viewport).

Full rules: `04-ux-ui-rules.md`.

---

## 9. Build and quality gates

Before marking any major change complete:

```bash
npm run build
```

- Build must pass with zero errors.
- Fix all TypeScript errors — do not suppress with `@ts-ignore` unless documented.
- Run `npm run lint` when touching multiple files.
- After layout changes: verify desktop and mobile in browser.

---

## 10. Git and commit rules

- Do not commit unless the user explicitly asks.
- Never commit `.env`, `.env.local`, or credential files.
- One logical change per commit when committing.
- Do not force-push to main.

---

## 11. Naming and domain language

Use consistent product language in code and UI:

| Use | Do not use |
|---|---|
| Project | Job (except legacy route redirects) |
| Scope of work / Scope | Trade package (for scope level) |
| Enquiry | Lead (in UI) |
| Estimate | Quote (until Phase 5) |
| Organisation | Company (in code) |

Legacy routes `/jobs` and `/site-visits` redirect to `/projects`. Do not build new features on these routes.

---

## 12. What to do when stuck

1. Re-read the current phase in `05-build-roadmap.md`.
2. Check `03-data-model.md` for table relationships.
3. Check existing patterns in `src/actions/` and `src/components/`.
4. Prefer extending existing code over creating parallel implementations.
5. Ask the user if the task requires a phase change.

---

## 13. Document maintenance

When a phase is completed or architecture changes:

1. Update `05-build-roadmap.md` phase status.
2. Update `03-data-model.md` if tables change.
3. Update `06-qa-checklist.md` if new checks are needed.

AI agents must treat `/docs` as authoritative over chat history or assumptions.
