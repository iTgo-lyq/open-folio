# Tree / Hierarchy

**Best for:** org charts, dependency trees, taxonomy, file trees, decision breakdowns, skill trees. For hierarchical, ID-addressable block decomposition with per-block I/O, constraints, and implementation traceability, load [`semantic-patterns.md`](semantic-patterns.md) § Traceable block decomposition first — it specializes this layout without changing it.

## Layout conventions
- Root at top, children fan out below (or root at left, children to right).
- Nodes are small labeled rectangles (`rx=6`), `node-name` role 12px 600 name + optional `sublabel` role 10px. Width 120–180px, height 40–52px.
- **Connectors are orthogonal (elbow-style), never diagonal.** Parent drops a short vertical line, then a horizontal bus connects siblings, then each child has a short vertical drop into its top edge. 1px muted stroke.
- Leaf indicator: thinner stroke (0.8) or different fill — OR let terminal position do the work.
- Start with 4 levels and 5 nodes per level; expand while ancestry remains easy to follow.
- accent on **one** node: root OR critical leaf. Not both.
- Draw connectors before nodes.

## Anti-patterns
- Deep or wide trees whose ancestry cannot be followed at the intended size.
- Nodes of wildly varying widths — pick 2 widths max.
- Diagonal connector lines.
- Skipped levels (parent connected to grandchild with no middle).
- accent on root AND a leaf.
