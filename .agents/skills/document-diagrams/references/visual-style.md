# Visual style

Use a white canvas, light semantic fills, thin outlines, restrained corner radii and CJK-capable system fonts. These visual values apply to every type. The type references determine graph structure, geometry, connection meaning and complexity limits.

## Fonts and sizes

Declare the following stack in a local `<style>` or a `font-family` presentation attribute on the SVG or its text. When a type forbids style elements (such as Polar), use the presentation attribute:

```css
text {
  font-family: 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', system-ui, sans-serif;
}
```

Use the installed platform fallback; do not download fonts. The default sizes are:

| Role | SVG size |
|---|---|
| Title | 16px |
| Node/body text | 12px |
| Secondary text and annotations | 10px |

Resolve reference placeholders before emitting SVG: `{title-size}` = `16`, `{node-size}` = `12`, `{secondary-size}` = `10`. The font-role placeholders `{node-name}`, `{sublabel}`, `{eyebrow}`, `{arrow-label}`, `{title}` and `{callout}` all use the stack above. Do not retain serif headings, italic-serif asides or a blanket monospace style. Use legible sizes at the actual display scale; enlarge the whole type ramp for presentation output instead of compressing text to make content fit.

Preserve the supplied label casing and use normal spacing. Semantic notation remains intact: uppercase change codes such as `ADDED` and the italic abstract-class name in UML convey meaning, rather than decorative typography.

## Palette

| Role | Value |
|---|---|
| `paper` | `#ffffff` |
| `paper-2` / container background | `#f8fafc` |
| `ink` / primary text | `#1e293b` |
| `ink-strong` | `#1e293b` |
| `muted` / secondary text / default arrow | `#64748b` |
| `soft` / subdued line | `#94a3b8` |
| `rule` / `rule-solid` | `#94a3b8` |
| `accent` / `link` | `#3b82f6` |
| `accent-tint` | `#dbeafe` |
| `band-1` / `band-2` / `band-3` | `#dbeafe` / `#f8fafc` / `#d1fae5` |
| `band-label` | `#1e293b` |

| Semantic role | Fill | Stroke | Text |
|---|---|---|---|
| Input / primary | `#dbeafe` | `#3b82f6` | `#1e40af` |
| Processing / in progress | `#fef3c7` | `#f59e0b` | `#b45309` |
| Data / output | `#d1fae5` | `#22c55e` | `#166534` |
| Analysis | `#f3e8ff` | `#a855f7` | `#6b21a8` |
| Sensitive / warning | `#fce7f3` | `#ec4899` | `#9d174d` |

Use a consistent palette per role. Quantity, status, access and outcomes need text, shape, symbols or line conventions as well as color. Do not invent numerical meaning for decorative fills. A role plus opacity, such as `{ink @ 0.40}`, means the mapped color with that opacity; a text label must remain readable.

## Surfaces

Use ordinary node corners around `rx=6`, grouping corners `rx=8–12`, and thin strokes around 1–1.5px. Grouping containers use `#f8fafc` or no fill; dashed group borders can use `6,4`. Always paint a white background in standalone SVG. Omit dotted paper, dark variants, glow, shadows and decorative poster chrome. Place group labels in reserved space so they do not overlap children.

Layout gaps, grids, lanes, chart axes and type-specific constraints come from the chosen type. Size nodes for their content and padding; changing fonts requires checking the resulting geometry.

Type formulas describe topology, alignment and baseline layout. Treat label widths, badge sizes and text baselines as content-dependent: use at least 10px secondary text, fit the measured glyph bounds plus padding, and expand affected nodes, lanes, corridors and the canvas together. Never shrink text to fit a badge or truncate a semantic label. Keep chart data coordinates and area/length encodings fixed; move a label to a keyed legend when it cannot fit the quantitative mark.

For filled nodes, use the corresponding semantic fill/stroke/text triple. Neutral context uses a white node or gray grouping surface. Focal emphasis changes the border or weight; text uses the dark semantic text color, not a saturated stroke color. `soft` is a decorative line color, never a small-text color.

Named node treatments retain their meaning: `input` uses Input, `backend` uses Processing, `store` uses Data, `security` uses Sensitive, `external` uses neutral context, and `optional` adds the type's dashed outline to its role surface. `focal` highlights a chosen role; it does not replace that role. Preserve quantitative chart encodings (including opacity ramps, hollow/solid marks and area), with colors resolved through this palette and contrast checked after compositing.

## Arrow appearance

Use notched filled arrows. Define these gray and semantic variants in `<defs>` as needed:

```xml
<marker id="arrow" markerWidth="8" markerHeight="8" refX="2" refY="4" orient="auto" markerUnits="userSpaceOnUse">
  <path d="M0,0 L8,4 L0,8 L2,4 z" fill="#64748b"/>
</marker>
<marker id="arrow-accent" markerWidth="8" markerHeight="8" refX="2" refY="4" orient="auto" markerUnits="userSpaceOnUse">
  <path d="M0,0 L8,4 L0,8 L2,4 z" fill="#3b82f6"/>
</marker>
```

Additional arrow colors use the matching semantic stroke. The arrow tip extends 6px beyond the path endpoint: for 5px visual clearance from each box, begin the path 5px outside the source and end it 11px before the target. For reverse or vertical paths, apply the same offsets along the final direction. Recompute port endpoints in geometry examples for this marker; do not let a marker overlap its target.

Connection semantics take precedence over filled-marker appearance: asynchronous messages keep the open marker specified in the sequence reference, and ER/class relations retain their own end symbols. Orthogonal routing, lifelines, guards, return dashes, optional paths and crossing conventions remain those of the selected type. Visual styling never turns an async message into a synchronous call or a forbidden path into an allowed one.

## Series palette

`series-1` through `series-5` map to green `#22c55e`, blue `#3b82f6`, orange `#f59e0b`, pink `#ec4899`, and purple `#a855f7`. Use only the slots needed by the chart. If the focal series shares a hue, distinguish it with its required stroke weight, dots or shape, or choose an unused semantic hue. Measure contrast against the actual background: ordinary text needs 4.5:1 and graphical boundaries 3:1. Use primary or semantic dark text when secondary text does not pass on a tinted surface.
