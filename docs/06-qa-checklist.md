# Quotr QA Checklist

**Status:** Source of truth for manual and technical quality checks.

Run relevant sections before marking a phase complete or deploying to production.

---

## How to use

1. Identify the current phase in `05-build-roadmap.md`.
2. Run **Global checks** on every release.
3. Run **Phase-specific checks** for the current phase.
4. Mark items pass/fail. Do not deploy with failing critical checks.

---

## Global checks (every release)

### Build and type safety
- [ ] `npm run build` completes with zero errors
- [ ] `npm run lint` passes (or no new lint errors introduced)
- [ ] No TypeScript errors in IDE
- [ ] No `console.log` debug statements left in production code
- [ ] No `@ts-ignore` without comment explaining why

### Styling and layout
- [ ] `globals.css` imported in root `layout.tsx`
- [ ] Tailwind styles visible on login page (not raw HTML)
- [ ] Desktop (≥768px): sidebar visible, bottom nav hidden
- [ ] Mobile (<768px): bottom nav visible, sidebar hidden
- [ ] Desktop content uses full workspace width (`max-w-7xl`), not phone-width column
- [ ] Mobile content has bottom padding clearing the nav (`pb-24`)
- [ ] No duplicate navigation systems on any page
- [ ] No duplicate primary CTAs on the same viewport

### Git and secrets
- [ ] No `.env` or `.env.local` in git staging
- [ ] No `SUPABASE_SERVICE_ROLE_KEY` in client code
- [ ] No `NEXT_PUBLIC_` variables containing secrets
- [ ] No hardcoded API keys in source files

---

## Auth

### Signup
- [ ] `/signup` renders styled form
- [ ] Valid signup creates user in Supabase Auth
- [ ] Profile row auto-created via trigger
- [ ] Redirects to `/onboarding` after signup
- [ ] Validation errors shown for invalid email/password
- [ ] Password minimum length enforced

### Login
- [ ] `/login` renders styled form
- [ ] Valid credentials redirect to `/dashboard` (if onboarded) or `/onboarding`
- [ ] Invalid credentials show error message
- [ ] Unauthenticated access to `/dashboard` redirects to `/login`

### Logout
- [ ] Sign out button on Settings page works
- [ ] After logout, accessing `/dashboard` redirects to `/login`

### Session
- [ ] Session persists across page refresh
- [ ] Session refreshes via middleware (no unexpected logouts)
- [ ] Auth callback route (`/auth/callback`) handles OAuth/magic link if enabled

---

## Onboarding

- [ ] `/onboarding` accessible only when authenticated without organisation
- [ ] Form collects: name, job title, business name, business type, trade, company size, quoting volume, location
- [ ] Successful submission creates `organisations` row
- [ ] `profiles.organisation_id` set correctly
- [ ] Redirects to `/dashboard` after completion
- [ ] User with organisation cannot access `/onboarding` (redirects to dashboard)
- [ ] Validation errors shown for missing required fields

---

## Organisation

- [ ] All data queries return only current organisation's data
- [ ] User cannot see another organisation's projects by manipulating URLs
- [ ] `get_user_organisation_id()` returns correct ID in RLS policies
- [ ] Settings page shows correct organisation details
- [ ] Settings page shows correct user profile details

---

## Desktop layout

Test at viewport width ≥ 1024px:

- [ ] Left sidebar visible and fixed
- [ ] Sidebar shows: Dashboard, Projects, Estimates, Quotes, Rates, Assemblies, Subcontractors, RFQs, Settings
- [ ] Active nav item highlighted correctly on each page
- [ ] Logo links to `/dashboard`
- [ ] Bottom nav NOT visible
- [ ] Main content offset from sidebar (`md:pl-64`)
- [ ] Dashboard: 4-column metric cards
- [ ] Dashboard: Recent Projects table visible
- [ ] Dashboard: Quick Actions card visible
- [ ] Dashboard: "New Project" in header only (not in Quick Actions)
- [ ] Projects: "New Project" in header only

---

## Mobile layout

Test at viewport width < 768px (or device emulation):

- [ ] Bottom nav visible with 5 items: Home, Projects, Capture, Estimates, More
- [ ] Sidebar NOT visible
- [ ] Active bottom nav item highlighted
- [ ] Content does not sit under bottom nav
- [ ] Dashboard: full-width "New Project" button
- [ ] Dashboard: 2×2 metric cards (not 4-column)
- [ ] Dashboard: recent projects as card list (not table)
- [ ] Dashboard: no Quick Actions card
- [ ] Settings "More" section shows links to Quotes, Rates, Assemblies, Subcontractors
- [ ] Forms are usable on mobile (no horizontal scroll, inputs not zoomed on iOS)

---

## Projects (Phase 1)

### Create project
- [ ] `/projects/new` renders styled form
- [ ] Required fields: title, client name, site address, enquiry source
- [ ] Optional fields: phone, email, brief, notes, priority
- [ ] Successful create redirects to project detail
- [ ] Project appears in projects list
- [ ] Project appears on dashboard recent projects
- [ ] Validation errors shown for missing required fields

### List projects
- [ ] `/projects` shows all organisation projects
- [ ] Projects ordered by created date (newest first)
- [ ] Empty state shown when no projects
- [ ] Each project card shows title, client, status badge, date
- [ ] Clicking project navigates to detail page

### Project detail
- [ ] `/projects/[id]` shows project metadata
- [ ] Scopes list shown
- [ ] "Add scope" action available
- [ ] Invalid project ID shows not-found page
- [ ] Project from another organisation returns not-found or redirect

### Edit project (when built)
- [ ] Can update project fields
- [ ] Changes persist after refresh
- [ ] Validation enforced

---

## Scopes (Phase 1)

### Create scope
- [ ] `/projects/[id]/scopes/new` renders styled form
- [ ] Scope type selection works (system types loaded)
- [ ] Custom scope option works
- [ ] Required fields enforced
- [ ] Successful create redirects to scope detail
- [ ] Scope appears in project scopes list

### Scope detail
- [ ] `/projects/[id]/scopes/[scopeId]` shows scope metadata
- [ ] Measurements displayed
- [ ] Photos displayed
- [ ] Documents displayed

### Scope capture
- [ ] Can add measurements (label, value, unit)
- [ ] Can upload photos (appears in scope after upload)
- [ ] Can upload documents (appears in scope after upload)
- [ ] Upload works on mobile viewport
- [ ] Large files handled gracefully (error message, not crash)

### Edit/delete scope (when built)
- [ ] Can edit scope fields
- [ ] Can delete scope photos/documents
- [ ] Changes persist after refresh

---

## Uploads and storage

- [ ] Photos upload to `scope-photos` bucket
- [ ] Documents upload to `scope-documents` bucket
- [ ] Storage path includes organisation ID as first folder segment
- [ ] `scope_photos` / `scope_documents` rows created with correct metadata
- [ ] User cannot access another organisation's files by guessing paths
- [ ] Uploaded images render correctly in scope detail

---

## RLS and security

### Data isolation
- [ ] Create two test accounts in different organisations
- [ ] Account A cannot see Account B's projects (via URL or API)
- [ ] Account A cannot see Account B's scopes
- [ ] Account A cannot see Account B's uploaded files

### RLS policies
- [ ] All tables in `03-data-model.md` have RLS enabled
- [ ] No table accessible without authentication (except public routes)
- [ ] `organisation_id` enforced on insert (cannot insert into another org)

### Server Actions
- [ ] All actions validate input with Zod
- [ ] All actions derive `organisation_id` from session (not from client input)
- [ ] Actions return meaningful error messages
- [ ] No service role key used in Server Actions

### Middleware
- [ ] Unauthenticated users cannot reach `(app)` routes
- [ ] Users without organisation redirected to `/onboarding`
- [ ] Legacy routes redirect correctly (`/jobs` → `/projects`)

---

## Placeholder pages

Verify these show "Coming soon" styled placeholder (not broken or unstyled):

- [ ] `/estimates`
- [ ] `/quotes`
- [ ] `/rates`
- [ ] `/assemblies`
- [ ] `/subcontractors`
- [ ] `/rfqs`

---

## Build checks (technical)

```bash
# Run before every deploy
npm run build

# Optional
npm run lint
```

- [ ] Build output shows no errors or warnings (except known non-blocking warnings)
- [ ] No missing environment variables in build
- [ ] All routes compile successfully
- [ ] First Load JS sizes reasonable (no accidental large imports)

---

## Git checks (before deploy)

- [ ] Changes committed with clear message (when user requests commit)
- [ ] No secrets in diff
- [ ] No unintended files staged (`.env`, `node_modules`, `.next`)
- [ ] Migration files included if schema changed
- [ ] `src/types/database.ts` updated if schema changed

---

## Phase 1 completion gate

Phase 1 is complete when all of the following pass:

- [ ] All **Global checks** pass
- [ ] All **Auth** checks pass
- [ ] All **Onboarding** checks pass
- [ ] All **Organisation** checks pass
- [ ] All **Desktop layout** checks pass
- [ ] All **Mobile layout** checks pass
- [ ] All **Projects** checks pass
- [ ] All **Scopes** checks pass
- [ ] All **Uploads and storage** checks pass
- [ ] All **RLS and security** checks pass
- [ ] All **Build checks** pass

---

## Regression watchlist

Issues that have occurred before — check these specifically:

| Issue | Check |
|---|---|
| Unstyled HTML on desktop | Tailwind CSS loads, classes applied |
| Phone-width layout on desktop | Content uses `max-w-7xl`, not `max-w-md` |
| Both navs visible | Sidebar `md:flex`, bottom nav `md:hidden` |
| Duplicate New Project buttons | One CTA per viewport |
| Duplicate navigation | Only app shell nav, no inline nav lists |
| `md:` utilities missing | Responsive layout works at 768px breakpoint |
| Port conflict / stale dev server | Restart dev server after config changes |

---

## Reporting issues

When a check fails, record:

1. **Check item** — which checkbox failed
2. **Steps to reproduce**
3. **Expected vs actual**
4. **Viewport** — desktop or mobile
5. **Browser** — Chrome, Safari, etc.
6. **Phase** — which phase was being tested

Fix before proceeding to the next phase.
