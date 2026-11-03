# SVG output spec — size, detail, audience

Set these three decisions before drawing. Defaults: `doc-inline`, `balanced`, and `mixed`. The deliverable is always a self-contained SVG. Infer choices from the request and clarify only material ambiguity.

## 2. Size

The preset sets the SVG `viewBox`. Every value below is divisible by 4, so the grid rule in SKILL.md §7 still holds.

| Preset | viewBox | Aspect | Type ramp | Use |
| --- | --- | --- | --- | --- |
| `doc-inline` (default) | `0 0 960 600` | 8:5 | standard | Body-width diagram in a post or README |
| `doc-wide` | `0 0 1280 720` | 16:9 | standard | Full-width docs, wiki pages |
| `slide-16x9` | `0 0 1280 720` | 16:9 | presentation | Deck slide, projected |
| `slide-4x3` | `0 0 1024 768` | 4:3 | presentation | Legacy deck templates |
| `social-og` | `0 0 1200 632` | ~1.9:1 | presentation | Link preview card |
| `social-square` | `0 0 1080 1080` | 1:1 | presentation | Feed post, carousel |
| `print-a4-landscape` | `0 0 1120 792` | ~1.41:1 | print | A4 landscape, ~10mm margins at 96dpi |
| `print-a3-landscape` | `0 0 1584 1120` | ~1.41:1 | print | A3 landscape, ~10mm margins at 96dpi |
| `print-letter-landscape` | `0 0 1056 816` | ~1.29:1 | print | US Letter landscape |
| `fit` | derived from content | any | standard | Vector hand-off; no fixed frame |

### Display dimensions

Set the SVG width and height consistently with its viewBox and intended display size. Keep text readable at that size. If a figure is too dense, split it or use an overview plus detail; do not reduce text size to fit.

### Deriving `fit`

Round the content bounding box **up** to the next multiple of 4, then add the fixed chrome: 40px outer margin on every side, plus 60px at the bottom for the legend strip. Never let the content touch the viewBox edge.

### Type sizes

Use [visual-style.md](visual-style.md) for colors, fonts, sizes and markers. Optional color inputs select a semantic role for any component, including a focal one; they do not change node roles, relationship kinds or layout formulas.

### Safe areas

- **All presets:** 40px outer margin; legend strip is the bottom 60px and nothing else lives there.
- **`social-og`:** keep the outer 64px clear on every side — link-card crops are unpredictable across platforms.
- **`slide-*`:** keep the bottom 80px clear if the deck template has a footer bar; ask if unsure.

---

## 3. Detail level

Choose content for the diagram's purpose.

| Level | What survives |
|---|---|
| `faithful` | Every distinct component and relationship; merge only exact duplicates. |
| `balanced` (default) | Components and relationships needed to explain the subject; aggregate incidental detail. |
| `simplified` | Capabilities and their sequence; retain boundaries and conditions that affect meaning. |

Apply SKILL.md §7 for density. Use labeled zones for useful responsibility or trust boundaries. A large source may remain one diagram when its labels and routes are readable at the intended size.

### Simplification

Remove decoration, merge identical replicas, then consider leaf clusters or incidental infrastructure. Preserve distinct behavior, failure paths and trust boundaries. In `faithful`, keep distinct content across detail diagrams if needed. Report material grouping or omissions (§5).

---

## 4. Audience level

Independent of the detail dial: the same 12 nodes get named differently for a platform team than for a steering committee. Detail selects content; audience sets wording.

| Audience | Node names | Sublabels | Edge labels | Never |
|---|---|---|---|---|
| `engineer` | exact service / component names | protocol, port, version, image tag | `POST /v2/orders`, `SQL`, `gRPC` | Vague verbs like "connects to" |
| `mixed` (default) | component names, expanded acronyms | technology only where it changes a decision | plain verbs — `verifies`, `writes`, `notifies` | Ports, versions, internal codenames |
| `executive` | capabilities and outcomes | none | business verbs — `approves`, `pays out` | Vendor names, infrastructure, protocols |

Worked example — the same node through all three:

| Audience | Node name | Sublabel |
|---|---|---|
| `engineer` | `Auth Service` | `JWT · RS256 · :8443` |
| `mixed` | `Auth Service` | `token check` |
| `executive` | `Sign-in` | — |

Two rules that hold at every audience level:

- **Never invent detail to fill a slot.** If an input names `svc-04` but provides no explanation, keep the identifier and ask rather than guessing a business name.
- **Keep the source's vocabulary for proper nouns.** Renaming `Kafka` to `Message Bus` is fine at `executive`; renaming it to `Event Grid` (a different product) is a factual error.

## 5. Content coverage

Report material grouping or omissions alongside the SVG, including which components or relationships they affect.

---

## 6. Checklist

Run alongside the SKILL.md §9 taste gate.

- [ ] All three dials set — explicitly requested, inferred from the destination, or defaulted and stated?
- [ ] `viewBox` matches the size preset exactly, values divisible by 4?
- [ ] SVG dimensions preserve readable text at the intended display size, with all content inside the viewBox?
- [ ] Type ramp matches the size class — not the standard ramp on a slide?
- [ ] 40px outer margin honoured (64px for `social-og`)?
- [ ] Detail matches the request; grouping, labels and routes remain readable at the intended size?
- [ ] Node names, sublabels, and edge labels all at the same audience level?
- [ ] CJK labels given a font fallback?
- [ ] Material grouping or omissions reported?
- [ ] Diagram `<svg>` has `role="img"`, resolving `aria-labelledby`, a non-empty first-child `<title>`, a non-empty `<desc>`, and per-diagram/variant prefixed IDs?
- [ ] Standalone SVG passes XML, accessibility and structural checks?
