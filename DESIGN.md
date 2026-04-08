# FinDash Design System

## Theme

Dark mode only (v1). Navy-based palette.

## Colors

### Base Palette (Tailwind Slate)
| Token | Hex | Usage |
|---|---|---|
| `bg-primary` | `#0F172A` | Page background (slate-900) |
| `bg-surface` | `#1E293B` | Cards, panels, sidebar (slate-800) |
| `bg-surface-hover` | `#334155` | Hover states (slate-700) |
| `border` | `#334155` | Borders, dividers (slate-700) |
| `text-primary` | `#F8FAFC` | Primary text (slate-50) |
| `text-secondary` | `#94A3B8` | Secondary text, labels (slate-400) |
| `text-muted` | `#64748B` | Muted text, placeholders (slate-500) |

### Accent Colors
| Token | Hex | Usage |
|---|---|---|
| `accent-positive` | `#22C55E` | Income, success (green-500) |
| `accent-negative` | `#EF4444` | Expenses, errors (red-500) |
| `accent-warning` | `#F59E0B` | Warnings, partial states (amber-500) |
| `accent-info` | `#3B82F6` | Links, active states (blue-500) |

### Category Colors
Defined in `src/config/categories.ts`. Each category has a unique hex color used for badges, chart segments, and indicators. Do not override these with generic colors.

## Typography

| Element | Font | Weight | Size | Notes |
|---|---|---|---|---|
| Page title | Inter | 600 | 24px / 1.5rem | |
| Section header | Inter | 600 | 18px / 1.125rem | |
| Body | Inter | 400 | 14px / 0.875rem | |
| Small/label | Inter | 500 | 12px / 0.75rem | uppercase for labels |
| KPI number | Inter | 700 | 32px / 2rem | `font-variant-numeric: tabular-nums` |
| Table data | Inter | 400 | 14px / 0.875rem | `font-variant-numeric: tabular-nums` |

All financial numbers use `tabular-nums` for aligned columns.

## Currency Formatting

| Currency | Format | Example |
|---|---|---|
| ARS | Dot thousands, comma decimal | ARS 1.234.567,89 |
| USD | Comma thousands, dot decimal | USD 4,250.00 |
| UYU | Dot thousands, comma decimal | UYU 125.430,50 |

Dashboard shows dual currency: primary (large) + secondary (small, muted).
Default view: USD. Toggle: ARS | USD | UYU.

## Spacing

Tailwind default scale (4px base). Key values:
- Card padding: `p-6` (24px)
- Section gap: `gap-6` (24px)
- KPI card gap: `gap-4` (16px)
- Sidebar width: `w-64` (256px), collapsed `w-16` (64px)

## Border Radius

`rounded-lg` (0.5rem / 8px) for cards and panels.
`rounded-md` (0.375rem / 6px) for buttons and inputs.
`rounded-full` for badges and avatars.

## Shadows

Minimal. No decorative shadows. Only `shadow-sm` on elevated elements (dropdowns, modals).

## Components (Shadcn/ui)

Use these Shadcn components as the standard vocabulary:
- **Card** — dashboard panels, KPI cards
- **Table** — transactions list, import history, category table
- **Button** — primary (blue-500), destructive (red-500), outline (border only)
- **Select** — period selector, source selector, currency toggle
- **Badge** — category badges (with category hex color), status badges
- **Input** — forms, search
- **Dialog** — confirmations, category assignment
- **Tabs** — settings page sections
- **Skeleton** — loading states for every data-fetching component
- **Toast** — success/error notifications (sonner)
- **DropdownMenu** — user menu, actions menu

## Navigation

Collapsible sidebar:
- **Desktop (1280+):** Full sidebar with labels + icons. 256px wide.
- **Tablet (768-1279):** Collapsed to icons only. 64px wide.
- **Mobile (< 768):** Bottom tab bar with 4 icons (Dashboard, Transactions, Import, Settings).

Sidebar contains:
1. App logo/name (top)
2. Nav links with Lucide icons
3. Separator
4. Household selector (bottom)
5. User avatar + name (very bottom)

Active state: `bg-surface-hover` + `text-primary` + left accent bar (2px, blue-500).

## Dashboard Layout

```
┌────────────────────────────────────────────────────────┐
│  [Period ◀ Marzo 2026 ▶]     [ARS | USD | UYU]        │
├────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐             │
│  │ TOTAL    │  │ FIJO /   │  │ TX COUNT │             │
│  │ USD 4,250│  │ VARIABLE │  │ 127      │             │
│  │ ARS 5.1M │  │ 45% / 55%│  │          │             │
│  └──────────┘  └──────────┘  └──────────┘             │
│                                                        │
│  ┌─────────────────┐  ┌───────────────────────────┐   │
│  │ CATEGORIES      │  │ MONTHLY TREND (6 months)  │   │
│  │ [donut chart]   │  │ [line chart]              │   │
│  │                 │  │ fixed / variable / total   │   │
│  └─────────────────┘  └───────────────────────────┘   │
│                                                        │
│  ┌────────────────────────────────────────────────┐   │
│  │ BY CATEGORY (table)                            │   │
│  │ Name      | Type  | Amount   | %    | Count   │   │
│  │ Alimenta. | Var   | USD 850  | 20%  | 34      │   │
│  │ Hogar     | Fijo  | USD 620  | 14%  | 8       │   │
│  └────────────────────────────────────────────────┘   │
│                                                        │
│  ┌────────────────────┐  ┌────────────────────────┐   │
│  │ BY MEMBER          │  │ BY SOURCE              │   │
│  │ Fernando: 72%      │  │ Cards: 85%             │   │
│  │ Other: 28%         │  │ Bank: 15%              │   │
│  └────────────────────┘  └────────────────────────┘   │
└────────────────────────────────────────────────────────┘
```

## Import Flow

1. Drop zone (dashed border, `border-dashed border-slate-600`)
2. Source selector (bank + product) + member selector
3. Upload → parsing progress
4. Results: auto-categorized (trust >= 0.7) collapsed, low-trust expanded with category dropdowns
5. "Import All" button

### Trust Score Mapping
| categoryMatchType | Trust | Display |
|---|---|---|
| `exact` | 1.0 | Auto-categorized (green badge) |
| `contains` | 0.8 | Auto-categorized (green badge) |
| `regex` | 0.7 | Auto-categorized (green badge) |
| `keyword` | 0.5 | Needs review (amber badge) |
| `uncategorized` | 0.0 | Needs review (red badge) |

## Empty States

Every empty state has:
1. An icon (Lucide, 48px, `text-muted`)
2. A heading ("No transactions yet")
3. A description (1 line, helpful)
4. A primary CTA button

Dashboard empty: "Import your first statement to see your finances here" + Import button.
Transactions empty: "No transactions for this period" + navigation arrows to last month with data.
Import history empty: "No imports yet. Drop a bank statement above to get started."

## Accessibility

- All interactive elements keyboard-navigable
- Focus ring: `ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-900`
- Min touch target: 44px
- Contrast: slate-50 on slate-900 = 15.3:1 (exceeds WCAG AAA)
- Charts: include text table alternative below each chart
- Screen reader: ARIA landmarks for sidebar, main content, navigation
