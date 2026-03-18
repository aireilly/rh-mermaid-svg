# rh-mermaid-svg

Generate Red Hat branded SVG diagrams from Mermaid definitions using [mermaid-cli](https://github.com/mermaid-js/mermaid-cli).

## Prerequisites

- Node.js (v18+)
- mermaid-cli: `npm install -g @mermaid-js/mermaid-cli`

## Quick start

```bash
mmdc -i <input>.mmd -o out/<output>.svg \
  -C rh-diagrams.css \
  -c mermaid-config.json \
  -I rh-diagram-svg

node post-process-svg.mjs out/<output>.svg
```

### Example

```bash
mmdc -i v1_process_architecture_tp2_dp4.mmd \
  -o out/v1_process_architecture_tp2_dp4.svg \
  -C rh-diagrams.css \
  -c mermaid-config.json \
  -I rh-diagram-svg

node post-process-svg.mjs out/v1_process_architecture_tp2_dp4.svg
```

## Files

| File | Description |
|------|-------------|
| `rh-diagrams.css` | Red Hat branded CSS for mermaid SVG output (colors, typography, nodes, edges, clusters) |
| `mermaid-config.json` | Mermaid configuration — forces native SVG `<text>` elements via `htmlLabels: false` |
| `post-process-svg.mjs` | Post-processing script — left-aligns cluster labels and sets inner cluster backgrounds/borders to white |
| `v1_process_architecture_tp2_dp4.mmd` | Example: vLLM process architecture (TP=2, DP=4) |
| `v1_process_architecture_tp4.mmd` | Example: vLLM process architecture (TP=4) |
| `out/` | Generated SVG output |

## Key flags

| Flag | Purpose |
|------|---------|
| `-C rh-diagrams.css` | Inject custom CSS into the SVG |
| `-c mermaid-config.json` | Use `htmlLabels: false` so text renders as native SVG `<text>` elements instead of `<foreignObject>` |
| `-I rh-diagram-svg` | Set the SVG element ID (CSS selectors are scoped to `#rh-diagram-svg` for specificity) |

## Design tokens

The CSS uses colors, typography, and spacing from the [Red Hat Design System](https://ux.redhat.com) (`@rhds/tokens`):

- **Typography**: Red Hat Display (labels/headings), Red Hat Text (body/edges)
- **Nodes**: Blue-10 fill (`#e0f0ff`), Blue-50 stroke (`#0066cc`)
- **Edges**: Gray-60 (`#4d4d4d`), 2px stroke
- **Clusters**: Gray-10 fill (`#f2f2f2`), Gray-30 border (`#c7c7c7`)
- **Text**: Gray-95 primary (`#151515`), Gray-60 secondary (`#4d4d4d`)

### Semantic node variants

Use `classDef` in your `.mmd` files to apply status colors to nodes:

```bash
classDef success fill:#e9f7df,stroke:#3d7317,color:#204d00
classDef danger  fill:#ffe3d9,stroke:#b1380b,color:#731f00
classDef warning fill:#fff4cc,stroke:#dca614,color:#73480b
classDef info    fill:#ece6ff,stroke:#5e40be,color:#21134d
classDef neutral fill:#f2f2f2,stroke:#4d4d4d,color:#151515
classDef brand   fill:#fce3e3,stroke:#ee0000,color:#5f0000
```

### Cluster / subgraph color variants

Use `style` statements to change subgraph container colors. Default clusters are grey.

| Name | CSS variable | Fill | Stroke | Usage |
|------|-------------|------|--------|-------|
| Blue | `--rh-blue-fill` / `--rh-blue-stroke` | `#e0f0ff` | `#0066cc` | Emphasizing components |
| Green | `--rh-green-fill` / `--rh-green-stroke` | `#e9f7df` | `#63993d` | Only when a third color is needed |
| Grey | `--rh-gray-fill` / `--rh-gray-stroke` | `#f2f2f2` | `#c7c7c7` | Default |

```bash
subgraph APIs["API Servers"]
    API0["API Server 0"]
end

subgraph External["External Services"]
    SVC0["Service 0"]
end

style APIs fill:#e0f0ff,stroke:#0066cc
style External fill:#e9f7df,stroke:#63993d
```

## Post-processing

The `post-process-svg.mjs` script fixes SVG issues that CSS alone cannot handle:

- **Left-aligned cluster labels** — repositions subgraph labels to the top-left of their container with `text-anchor: start`
- **Inner cluster styling** — uses geometric containment detection to find nested subgraphs and sets their fill and stroke to white, visually distinguishing them from outer (grey) clusters

Run it after every `mmdc` invocation. It modifies the SVG file in place.

## Limitations

Mermaid is best suited for **simple, schematic diagrams**. Keep these constraints in mind:

- **Layout control is limited** — Mermaid uses the dagre auto-layout engine. You cannot precisely position nodes, control spacing, or pin elements to specific coordinates.
- **Connector routing is coarse** — arrow paths are auto-routed. Options are limited to curve styles (`linear`, `step`, `stepBefore`, `stepAfter`). Fine-grained routing (e.g., forcing a connector to exit from a specific edge) is not supported.
- **Nested subgraphs are flattened in the DOM** — CSS selectors like `.cluster .cluster` don't work because mermaid renders all clusters as siblings. Geometric post-processing is required to distinguish inner from outer clusters.
- **No native left-alignment for cluster labels** — labels are always centered; post-processing is needed to reposition them.
- **Complex diagrams degrade quickly** — diagrams with many cross-connections, fan-out patterns, or deep nesting produce cluttered, hard-to-read layouts. If a diagram requires more than ~15–20 nodes or multiple levels of nesting, consider splitting it into separate diagrams or using a dedicated diagramming tool.
- **`htmlLabels: false` is required for portable SVGs** — without this flag, mermaid wraps labels in `<foreignObject>` elements that don't render in many SVG viewers. This disables HTML formatting (bold, italic, links) inside node labels.

**Best practice**: keep diagrams simple. One concept per diagram. Use subgraphs sparingly. Prefer a few clear connections over many overlapping ones.

## References

- [CCS Working with Technical Diagrams](https://docs.google.com/presentation/d/18QMc20pJlgLAfX_Obs6OBplfmjsfC0lSVGL6oE6EErc/) (Red Hat internal)
- [Red Hat Design System](https://ux.redhat.com)
- [Red Hat Design Tokens](https://github.com/RedHat-UX/red-hat-design-tokens)
- [Mermaid CLI](https://github.com/mermaid-js/mermaid-cli)
