# Quotr UX/UI Rules

**Status:** Source of truth for layout, navigation, and visual standards.

---

## Design system

| Item | Value |
|---|---|
| CSS framework | Tailwind CSS v4 |
| Component library | Shadcn UI (radix-sera style) |
| Icons | Lucide React |
| Fonts | Noto Sans (body), Playfair Display (headings) |
| Theme | CSS variables in `src/app/globals.css` |
| Class merging | `cn()` from `@/lib/utils` |

### Styling prerequisites (must pass before feature work)

- [ ] `src/app/globals.css` exists and imports Tailwind + Shadcn
- [ ] `globals.css` imported in `src/app/layout.tsx`
- [ ] `tailwind.config.ts` content paths include `src/app`, `src/components`, `src/lib`
- [ ] `postcss.config.mjs` uses `@tailwindcss/postcss`
- [ ] `@source` directives in `globals.css` for Tailwind v4 scanning
- [ ] All `components/ui/*` import `cn` from `@/lib/utils`
- [ ] `npm run build` passes

---

## Known issue — do not regress

The app previously rendered **unstyled, phone-width HTML on desktop**. Symptoms:

- No Tailwind styles applied (raw HTML appearance)
- Mobile bottom nav visible on desktop alongside or instead of sidebar
- Content centred in a narrow column on wide screens
- Duplicate navigation and duplicate CTAs

**This must not happen again.** If styling breaks, stop feature work and fix it first. See `00-ai-build-rules.md` §4.

---

## Responsive architecture

Two experiences, one codebase:

| Viewport | Experience | Nav |
|---|---|---|
| `< 768px` (mobile) | Field capture, simplified | Bottom nav only |
| `≥ 768px` (desktop) | Full control centre | Sidebar only |

**Never show both nav systems at the same time.**

---

## Desktop layout rules

### App shell (`components/layout/app-shell.tsx`)

```
┌──────────┬─────────────────────────────────────────────┐
│          │                                             │
│ Sidebar  │  PageContainer (max-w-7xl, centred)       │
│ (fixed   │                                             │
│  w-64)   │  Page content                               │
│          │                                             │
│ md:flex  │                                             │
└──────────┴─────────────────────────────────────────────┘
```

### Sidebar (`desktop-sidebar.tsx`)
- Fixed left, `w-64`, full viewport height
- Visible: `hidden md:flex` — hidden below md, flex at md+
- Background: `bg-sidebar` with `border-sidebar-border`
- Logo at top, nav links below
- Active link: `bg-sidebar-accent text-sidebar-accent-foreground`
- Icons + labels on every link — not icon-only

### Main content area
- Offset: `md:pl-64` to clear sidebar
- Container: `PageContainer` with `max-w-7xl mx-auto`
- Padding: `px-4 md:px-6 lg:px-8`, `py-6 md:pb-8`
- **No narrow phone-width centred layout on desktop**

### Desktop dashboard
- Header row: page title + description + "New Project" button (right-aligned)
- Four metric cards in `grid-cols-4`
- Recent Projects: table layout in a Card
- Quick Actions: sidebar card with outline buttons
- No duplicate "New Project" in Quick Actions

---

## Mobile layout rules

### Bottom nav (`mobile-bottom-nav.tsx`)
- Fixed bottom, full width
- Visible: `md:hidden` — only below md breakpoint
- Height: `h-16` + safe area padding (`pb-safe`)
- Items: icon + short label, evenly distributed
- Active item: `text-primary`
- Background: `bg-background/95 backdrop-blur`

### Mobile nav items
| Label | Route | Purpose |
|---|---|---|
| Home | `/dashboard` | Dashboard |
| Projects | `/projects` | Project list |
| Capture | `/projects/new` | New project / enquiry |
| Estimates | `/estimates` | Estimates |
| More | `/settings` + sub-pages | Settings, rates, etc. |

### Main content (mobile)
- Bottom padding: `pb-24` to prevent content sitting under nav
- Full-width primary CTAs (`w-full` buttons)
- Card-based lists, not tables
- Simplified status cards (2-column grid)

### Mobile dashboard
- Large full-width "New Project" button at top
- 2×2 metric status cards
- Recent projects as card list (not table)
- No Quick Actions card (desktop only)

---

## Navigation rules

### Do
- Use `nav-config.ts` as single source of nav items
- Use `isNavItemActive()` for active state detection
- Desktop nav: all main sections in sidebar
- Mobile nav: primary actions in bottom bar, secondary in Settings "More"

### Do not
- Add a second sidebar, hamburger menu, or top nav bar
- Render raw `<ul>` / `<ol>` link lists without Shadcn styling
- Duplicate nav items in page content (e.g. inline link lists that mirror sidebar)
- Add navigation inside page content that competes with the app shell
- Create separate mobile-only routes that duplicate desktop routes

---

## Page structure rules

### Standard page anatomy
```
PageContainer
└── PageHeader (title, description, optional back link, optional action)
└── Page content (cards, tables, forms)
```

### PageHeader
- Title: `text-2xl font-bold`
- Description: `text-sm text-muted-foreground`
- Action slot: right-aligned, one primary action per viewport
- Back link: only on detail/sub-pages

### PageContainer variants
| Variant | Max width | Use |
|---|---|---|
| `default` | `max-w-7xl` | Dashboard, lists, tables |
| `form` | `max-w-2xl` | Create/edit forms |
| `full` | No max width | Rare — full-bleed content |

---

## Component usage rules

### Always use Shadcn primitives
| Need | Component |
|---|---|
| Actions | `Button` |
| Content grouping | `Card`, `CardHeader`, `CardTitle`, `CardContent` |
| Status labels | `Badge` (via `StatusBadge` wrapper) |
| Data tables | `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableCell` |
| Form inputs | `Input`, `Textarea`, `Select`, `Label` |
| Loading | `Skeleton` |
| Empty states | `EmptyState` from `components/shared/` |
| Errors | `ErrorState` from `components/shared/` |
| Placeholder pages | `PlaceholderPage` from `components/shared/` |

### Do not
- Use raw `<button>`, `<input>`, `<table>` without Shadcn wrappers
- Inline styles or CSS modules for layout (use Tailwind)
- Custom colour values outside the theme variables
- Duplicate Shadcn components with custom implementations

---

## Form rules

- Server Actions for submission — no client-side `fetch` for mutations
- Zod validation in action, error messages returned to form
- `react-hook-form` + `@hookform/resolvers` for client forms
- Mobile: single column, full-width inputs, `font-size: 16px` minimum (prevents iOS zoom)
- Desktop: standard form width within `max-w-2xl` for create/edit pages
- File uploads: show preview, progress, and error states
- Required fields marked visually; validate on server regardless

---

## Visual standards

### Cards
- Use `rounded-xl` override on Cards for softer appearance
- Metric cards: icon in muted box, large number, label below
- List cards: border, hover state (`hover:bg-accent/50`)

### Buttons
- One primary CTA per page per viewport (mobile OR desktop, not both visible)
- Desktop header actions: `hidden md:inline-flex`
- Mobile full-width CTAs: `w-full md:hidden`
- Destructive actions: `variant="destructive"`, require confirmation

### Status badges
- Use `StatusBadge` component — not raw text or coloured spans
- Rounded pill style with `variant="secondary"`

### Typography
- Page titles: `text-2xl font-bold tracking-tight`
- Card titles: `text-base font-semibold` (override Shadcn uppercase default)
- Body: `text-sm` for secondary info, `text-muted-foreground`
- No ALL CAPS in user-facing labels (override Shadcn heading uppercase where needed)

### Spacing
- Page sections: `space-y-8` or `mb-8` between major blocks
- Card grids: `gap-3 md:gap-4` or `gap-6`
- Consistent padding: `p-4 md:p-5` inside cards

---

## Responsive patterns (copy-paste reference)

```tsx
// Show on desktop only
className="hidden md:block"
className="hidden md:flex"
className="hidden md:inline-flex"

// Show on mobile only
className="md:hidden"

// Sidebar offset
className="md:pl-64"

// Mobile bottom nav clearance
className="pb-24 md:pb-8"

// Responsive grid
className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4"
```

---

## Placeholder pages

Pages for unbuilt features (estimates, quotes, rates, assemblies, subcontractors, RFQs) use `PlaceholderPage` with:
- PageHeader (title + description)
- Dashed border empty state with icon
- "Coming soon" message

Do not build partial implementations on placeholder pages. Wait for the correct phase.

---

## Accessibility minimums

- Nav landmarks: `<nav aria-label="Main navigation">` on bottom nav
- Form labels linked to inputs
- Focus visible on interactive elements (Shadcn handles this)
- Sufficient colour contrast (theme handles this)
- Touch targets ≥ 44px on mobile

---

## What not to do (summary)

1. ❌ Phone-width layout on desktop
2. ❌ Both sidebar and bottom nav visible simultaneously
3. ❌ Raw unstyled HTML lists for navigation
4. ❌ Duplicate "New Project" buttons on the same viewport
5. ❌ Duplicate navigation systems
6. ❌ Building features on placeholder pages before their phase
7. ❌ Custom CSS files outside `globals.css`
8. ❌ Ignoring Tailwind content path configuration
9. ❌ Tables on mobile (use card lists instead)
10. ❌ Feature development while styling is broken
