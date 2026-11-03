# Layout grid, per-type budgets, page layout, and summary cards

Routed from SKILL.md §7. Technical content counts and depth values are planning guides; retain semantic structure, focal limits and quantitative encodings.

## Layout & Spacing

### 4px grid

**Structural geometry, divisible by 4:** node origins, widths, heights, gaps, padding. Off-grid by design: type sizes (role ramp in `references/output-spec.md`), radii, data-derived positions, text baselines, arrow markers, `.5` offsets that keep 1px strokes crisp, stroke widths, opacity.

| Category | Allowed values |
|---|---|
| Node width / height | 80, 96, 112, 120, 128, 140, 144, 160, 180, 200, 240, 320 |
| Gap between nodes | 20, 24, 32, 40, 48 |
| Padding inside boxes | 8, 12, 16 |
| Border radius | 4, 6, 8 |

### Complexity budget (per diagram)

Use these counts to review grouping and readability at the intended display size (SKILL.md §7).

| Limit | Rule |
|---|---|
| Suggested components / relationships (architecture delta) | 8 / 10; ledger covers every change |
| Suggested admin bands / traffic scopes / nodes (architecture containment) | 2 / 4 / 8 |
| Suggested lifelines (sequence) | 5 |
| Suggested combined fragments (sequence) | Start with 1; add as needed for control flow |
| Suggested `alt` regions (sequence) | 2 |
| Suggested fragment nesting (sequence) | 1 |
| Suggested lanes (swimlane) | 5 |
| Max items (quadrant) | 12 |
| Suggested entities (ER) | 8 |
| Suggested nesting levels (nested) | 6 |
| Suggested tree depth | 4 |
| Suggested org chart depth | 4 |
| Suggested org chart nodes | 12 |
| Suggested layers (layer stack) | 6 |
| Max parts / levels / focal parts (exploded axonometric) | 5 / 5 / 1, three detail levels |
| Max tagged rooms or buildings / boxes / focal (axonometric plan) | 8 / 40 / 1 |
| Max circles (venn) | 3 |
| Max layers (pyramid) | 6 |
| Max radar axes | 5 |
| Max radar series | 5 |
| Max focal radar series | 1 |
| Max polar categories | 8 |
| Max polar series | 1 |
| Max focal polar categories | 1 |
| Max bars (bar chart) | 8 |
| Max bars (waterfall) | 8 incl. totals, 1 subtotal |
| Max cells (treemap) | 8 |
| Max series (line chart) | 5 |
| Max tasks (Gantt) | 12 |
| Max points (scatter plot) | 30 |
| Max stages / nodes / flows (sankey) | 3 / 8 / 12 |
| Max categories (fishbone) | 6 bones, 3 sub-causes each |
| Max components / links (wardley) | 9 / 12, 2 movement arrows |
| Max columns / cards (kanban) | 5 / 12 total, 4 per column |
| Max stages / rows (user journey) | 6 / 3, 2 pain markers |
| Max stages / layers (service blueprint) | 6 stages; required customer / frontstage / backstage; optional evidence / support; 1 focal cell |
| Suggested zones / nodes / paths (deployment) | 3 / 6 / 8, 9 artifacts |
| Suggested nodes / edges (dependency) | 9 / 14, 4 ranks, 1 cycle |
| Suggested classes / relationships (UML class) | 7 / 8, 5 members per compartment |
| Max activities / slices / cards (story map) | 5 / 3 / 12 |
| Suggested tables / columns / FKs (db schema) | 5 / 8 shown / 6 |

Split by subsystem or phase when separate views improve readability.
