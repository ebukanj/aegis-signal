# Aegis Signal — Design System

**Version:** 2.0 (Production polish)
**Owner:** Frontend (`apps/web`)
**Governed by:** [AGENTS.md](../AGENTS.md)
**Related:** [04-PROJECT_PRD.md §9](04-PROJECT_PRD.md), [01-PRODUCT_BIBLE.md §10](01-PRODUCT_BIBLE.md)

> Every screen answers one question. Every color communicates meaning. Every number is readable.

---

## 1. Principles

1. **Dark-first.** Dark is the default and reference theme. Light is a token-level peer, never an afterthought override.
2. **Neutrals are tinted, never grey.** Every neutral carries chroma (0.015–0.03) toward a cool slate-blue. A grey with no colour in it reads as *paper*, and paper does not feel like a trading terminal. This is the single change that took the light theme from "whitish" to a product.
3. **Color is semantic.** No decorative colors. Emerald = brand/primary action, green = positive/long, red = negative/short/error, amber = warning, blue = information.
4. **Numbers are first-class.** All prices, percentages, and metrics render in a monospaced face with tabular numerals so columns align like a terminal.
5. **Density with hierarchy.** High information density comes from spacing, weight, and type scale — never from more colors or boxes.
6. **Motion is purposeful.** Fast (≤200ms), subtle, and only where it clarifies a state change. `prefers-reduced-motion` collapses it globally.

---

## 1a. The mark

`components/layout/aegis-mark.tsx` — drawn, not borrowed. It carries the product's
two ideas in one shape:

- **The shield** — protection. The Risk Engine's veto; the thing that says no.
- **The signal** — a pulse rising *through* it and breaking its upper edge.

The order is the argument: the platform protects first, then speaks. A generic
shield icon says "security product"; this says what Aegis actually does.

---

## 2. Color Tokens

All tokens are defined as CSS custom properties in `apps/web/src/app/globals.css` (OKLCH) and mapped into Tailwind via `@theme inline`. Components must **only** use token classes (`bg-background`, `text-success`, `border-border`…), never raw palette values.

### Surfaces (dark theme)

| Token | Role | Approx |
|---|---|---|
| `--background` | App background — near black, cool tint | `#0B0D10` |
| `--card` | Cards / panels — dark slate | `#14171C` |
| `--popover` | Menus, dropdowns, overlays | slightly above card |
| `--secondary` / `--muted` / `--accent` | Raised & hover surfaces | slate steps |
| `--border` | Hairline borders | white @ 8% |
| `--input` | Form control borders | white @ 10% |

### Semantic colors

| Token | Meaning | Usage |
|---|---|---|
| `--primary` | Emerald — brand, primary actions, focus | Buttons, active nav, links |
| `--success` / `--long` | Positive outcome / long direction | PnL up, wins, LONG badges |
| `--destructive` / `--short` | Error / negative / short direction | Failures, PnL down, SHORT badges |
| `--warning` | Amber — caution, degraded state | Risk warnings, strategy health |
| `--info` | Blue — neutral information | Info banners, watchlist |

### Charts

`--chart-1 … --chart-5` — reserved series colors (emerald, blue, amber, violet, rose). Long/short chart marks always use `--long` / `--short`.

**Rule:** if a color does not map to one of these tokens, it does not ship.

---

## 3. Typography

| Face | Token | Usage |
|---|---|---|
| **Inter** (variable) | `--font-sans` | All UI text |
| **JetBrains Mono** | `--font-mono` | Prices, quantities, percentages, timestamps, IDs, code |

Rules:
- Numeric data always uses `font-mono tabular-nums` (helper class: `.font-numeric`).
- Type scale: `text-xs` for dense table metadata, `text-sm` default UI, `text-base`+ reserved for headings and hero numbers.
- Headings use tight tracking (`tracking-tight`); uppercase labels use `text-xs uppercase tracking-wider text-muted-foreground`.

---

## 4. Spacing, Radius, Elevation

- Base unit 4px (Tailwind scale). Card padding: `p-4`/`p-6`. Page gutter: `px-4 md:px-6`.
- Radius: `--radius: 0.5rem`. Cards `rounded-lg`, controls `rounded-md`. Nothing pill-shaped except badges.
- Elevation comes from **surface steps + hairline borders**, not heavy shadows. Overlays may add a soft shadow.

---

## 5. Iconography

- **Lucide** only. Default size 16px (`size-4`) inline, 18–20px in navigation.
- Icons support meaning; never decorative. Icon-only controls require an accessible label/tooltip.

---

## 6. Components

- **shadcn/ui is the only component base.** Extend via composition and `className`; never fork or duplicate a ui primitive.
- Shared app-level compositions live in `src/components/` (`layout/`, `shared/`); feature-specific components live in `src/features/<feature>/components/`.

### Shared component kit (`src/components/shared/`)

| Component | Purpose |
|---|---|
| `PageHeader` | Workspace page title + context + actions |
| `MetricCard` | KPI stat tile with delta direction and loading skeleton |
| `StatusBadge` | Semantic status chip (`success/warning/error/info/long/short/neutral`) |
| `DataTable` | Generic sortable table (TanStack Table) with loading + empty states |
| `EmptyState` / `ErrorState` | Standard list/table fallbacks |
| `Loader` | Suspense/pending spinner |
| `SearchInput` | Controlled search field with clear affordance |
| `CommandPalette` | Global Ctrl/⌘+K navigation search |
| `Breadcrumbs` | Path-derived breadcrumbs for nested pages |
| `ThemeSwitcher` | Dark (default) / Light / System, persisted |
| `StatusPage` | Full-page 404 / 403 / maintenance screens |

---

## 7. Motion

- **Framer Motion** for enter/exit and layout transitions; CSS transitions for hover/focus.
- Durations: 120–200ms; ease-out. No parallax, no bounce, no attention-seeking loops.
- Respect `prefers-reduced-motion`.

---

## 8. Accessibility

- Text contrast ≥ 4.5:1 against its surface (muted text ≥ 4.5:1 on `--background` and `--card`).
- Never encode meaning by color alone — pair with icon, label, or direction glyph (▲/▼).
- All interactive elements keyboard-reachable with visible `--ring` focus.

---

## 9. File Map

| Concern | Location |
|---|---|
| Tokens & theme | `apps/web/src/app/globals.css` |
| Fonts | `apps/web/src/app/layout.tsx` (next/font) |
| ui primitives | `apps/web/src/components/ui/` (shadcn) |
| App shell | `apps/web/src/components/layout/` |
| Navigation config | `apps/web/src/config/navigation.ts` |
