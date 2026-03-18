#!/usr/bin/env node
// Post-process mermaid SVG:
//   1. Left-align cluster/subgraph labels
//   2. Set inner (nested) cluster backgrounds to white
//   3. Center labels in cloud (path-based) nodes
//   4. Add 2% padding to viewBox edges
//   5. Fix SVG sizing for GitHub preview (remove max-width, set explicit dimensions)
// Usage: node fix-cluster-labels.mjs <svg-file>

import { readFileSync, writeFileSync } from 'fs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node fix-cluster-labels.mjs <svg-file>');
  process.exit(1);
}

let svg = readFileSync(file, 'utf-8');

// --- Step 1: Left-align cluster labels ---

svg = svg.replace(
  /(<g\s+class="cluster"[^>]*>.*?<rect[^>]*\bx=")([-\d.]+)(".*?class="cluster-label"\s+transform="translate\()[-\d.]+,\s*([-\d.]+)\)/gs,
  (match, before, x, middle, y) => {
    const leftX = parseFloat(x) + 8;
    return `${before}${x}${middle}${leftX}, ${y})`;
  }
);

svg = svg.replace(
  /(<g\s+class="cluster-label"[^>]*>.*?<text\b)([^>]*>)/gs,
  (match, before, attrs) => {
    if (attrs.includes('style="')) {
      return `${before}${attrs.replace(/style="/, 'style="text-anchor:start;')}`;
    }
    return `${before} style="text-anchor:start;"${attrs}`;
  }
);

// --- Step 2: White background for inner clusters ---
// Extract all cluster rects, find which are geometrically inside others

const clusterPattern = /(<g\s+class="cluster"[^>]*>.*?<rect[^>]*)\bx="([-\d.]+)"([^>]*)\by="([-\d.]+)"([^>]*)\bwidth="([-\d.]+)"([^>]*)\bheight="([-\d.]+)"/gs;

// First pass: collect all cluster bounding boxes
const clusters = [];
let m;
const tmpSvg = svg;
const clusterFullPattern = /<g\s+class="cluster"[^>]*>.*?<rect[^>]*?x="([-\d.]+)"[^>]*?y="([-\d.]+)"[^>]*?width="([-\d.]+)"[^>]*?height="([-\d.]+)"[^/]*?\/?>/gs;

while ((m = clusterFullPattern.exec(tmpSvg)) !== null) {
  clusters.push({
    x: parseFloat(m[1]),
    y: parseFloat(m[2]),
    w: parseFloat(m[3]),
    h: parseFloat(m[4]),
    offset: m.index
  });
}

// Determine which clusters are contained within another cluster
const innerOffsets = new Set();
for (const a of clusters) {
  for (const b of clusters) {
    if (a === b) continue;
    // a is inside b if b strictly contains a (b must be larger)
    if (a.x >= b.x && a.y >= b.y &&
        a.x + a.w <= b.x + b.w &&
        a.y + a.h <= b.y + b.h &&
        (a.w < b.w || a.h < b.h)) {
      innerOffsets.add(a.offset);
    }
  }
}

// Second pass: set fill to white on inner cluster rects
if (innerOffsets.size > 0) {
  // Replace fill on cluster rects that are inner clusters
  let offset = 0;
  let result = '';
  const rectInCluster = /<g\s+class="cluster"[^>]*>.*?<rect([^/]*?)\/?>/gs;
  let rm;
  let lastIndex = 0;

  // Simpler approach: for each cluster, check if it's inner and replace style
  svg = svg.replace(
    /(<g\s+class="cluster"[^>]*>.*?<rect)((?:[^>]*?))(\/?>)/gs,
    (match, before, attrs, close, matchOffset) => {
      // Check if this cluster's offset is in innerOffsets
      const isInner = [...innerOffsets].some(o => Math.abs(o - matchOffset) < 5);
      if (isInner) {
        if (attrs.includes('style="')) {
          attrs = attrs.replace(/style="/, 'style="fill:#ffffff;stroke:#ffffff;');
        } else {
          attrs = ` style="fill:#ffffff;stroke:#ffffff;"` + attrs;
        }
      }
      return `${before}${attrs}${close}`;
    }
  );
}

// --- Step 2b: Normalize sibling inner cluster heights ---
// When edges target an outer subgraph, dagre inflates one inner cluster.
// Find inner clusters that share the same parent and set them all to the
// most common (mode) height.

// Build parent map: for each inner cluster, find its containing outer cluster
const innerClusters = clusters.filter(c => innerOffsets.has(c.offset));
const parentMap = new Map(); // parent offset -> [inner clusters]

for (const inner of innerClusters) {
  for (const outer of clusters) {
    if (innerOffsets.has(outer.offset)) continue; // skip other inners
    if (inner.x >= outer.x && inner.y >= outer.y &&
        inner.x + inner.w <= outer.x + outer.w &&
        inner.y + inner.h <= outer.y + outer.h) {
      if (!parentMap.has(outer.offset)) parentMap.set(outer.offset, []);
      parentMap.get(outer.offset).push(inner);
    }
  }
}

for (const [, siblings] of parentMap) {
  if (siblings.length < 2) continue;
  // Find the mode (most common) height
  const heightCounts = new Map();
  for (const s of siblings) {
    const h = Math.round(s.h);
    heightCounts.set(h, (heightCounts.get(h) || 0) + 1);
  }
  let modeHeight = 0, modeCount = 0;
  for (const [h, count] of heightCounts) {
    if (count > modeCount) { modeHeight = h; modeCount = count; }
  }

  // Resize outlier siblings: reposition rect to center around content
  for (const s of siblings) {
    if (Math.round(s.h) === modeHeight) continue;

    const oldCenterY = s.y + s.h / 2;
    const newY = oldCenterY - modeHeight / 2;

    // Update rect y and height
    svg = svg.replace(
      new RegExp(`(<g\\s+class="cluster"[^>]*>\\s*<rect[^>]*)\\by="${s.y}"([^>]*)\\bheight="${s.h}"`),
      `$1y="${newY}"$2height="${modeHeight}"`
    );

    // Update cluster-label translate y
    svg = svg.replace(
      new RegExp(`(class="cluster-label"\\s+transform="translate\\([^,]+,\\s*)${s.y}(\\))`),
      `$1${newY}$2`
    );
  }
}

// --- Step 2c: Hoist cluster labels above inner cluster rects ---
// Mermaid renders clusters as flat siblings. Inner cluster rects (with white
// fill) paint over outer cluster labels. Fix by extracting all cluster-label
// groups and appending them as a new group at the end of the clusters container
// so they render on top.

svg = svg.replace(
  /(<g\s+class="clusters">)(.*?)(<\/g>)/s,
  (match, open, content, close) => {
    const labels = [];
    const labelPattern = /<g\s+class="cluster-label"[^>]*>.*?<\/g><\/g>/gs;
    let lm;
    while ((lm = labelPattern.exec(content)) !== null) {
      labels.push(lm[0]);
    }
    if (labels.length > 0) {
      return `${open}${content}<g class="cluster-labels-overlay">${labels.join('')}</g>${close}`;
    }
    return match;
  }
);

// --- Step 3: Center labels in cloud (path-based) nodes ---
// Mermaid's cloud shape offsets the label for text-anchor:start, but CSS
// overrides to text-anchor:middle, causing misalignment. Fix by zeroing
// the label group's x translate.

svg = svg.replace(
  /(<g\s+class="node[^"]*"[^>]*>)<path\b[^>]*class="basic label-container"[^>]*\/?>.*?(<g\s+class="label"[^>]*transform="translate\()[-\d.]+,\s*([-\d.]+)\)/gs,
  (match, nodeOpen, labelBefore, y) => {
    return match.replace(
      /(<g\s+class="label"[^>]*transform="translate\()[-\d.]+,\s*([-\d.]+)\)/,
      `$1 0, $2)`
    );
  }
);

// --- Step 3b: Center edge labels on their edge paths ---
// Mermaid places edge labels at a dagre-chosen point which may not be the
// visual midpoint. Reposition each label to the midpoint of its edge path.

// Collect edge paths: id -> path d attribute
const edgePaths = new Map();
const epRe = /<path[^>]*\bid="(L_[^"]*)"[^>]*\bd="([^"]*)"/g;
let ep;
while ((ep = epRe.exec(svg)) !== null) {
  edgePaths.set(ep[1], ep[2]);
}

// For each edge label, find its path and center the label
svg = svg.replace(
  /(<g\s+class="edgeLabel"\s+transform="translate\()([-\d.]+),\s*([-\d.]+)(\)")(.*?data-id="(L_[^"]*)")/gs,
  (match, before, x, y, after, rest, dataId) => {
    const pathD = edgePaths.get(dataId);
    if (!pathD) return match;
    // Extract all x,y coordinates from path
    const coords = [...pathD.matchAll(/([-\d.]+),([-\d.]+)/g)].map(m => ({
      x: parseFloat(m[1]), y: parseFloat(m[2])
    }));
    if (coords.length < 2) return match;
    // Find midpoint of first and last coordinates
    const midX = (coords[0].x + coords[coords.length - 1].x) / 2;
    const midY = (coords[0].y + coords[coords.length - 1].y) / 2;
    return `${before}${midX}, ${midY}${after}${rest}`;
  }
);

// --- Step 3c: Scale edge label background rects for CSS font-size override ---
// Mermaid sizes the background rect for its default font. When CSS overrides
// to a larger font-size, the rect is too small. Scale it up.

const CSS_EDGE_FONT = 20; // must match rh-diagrams.css .edgeLabel font-size
const MERMAID_DEFAULT_FONT = 16;
const fontScale = CSS_EDGE_FONT / MERMAID_DEFAULT_FONT;

svg = svg.replace(
  /(<g\s+class="edgeLabel"[^>]*>.*?<rect\s+class="background"[^>]*)\bx="([-\d.]+)"([^>]*)\bwidth="([\d.]+)"([^>]*)\bheight="([\d.]+)"/gs,
  (match, before, x, mid1, w, mid2, h) => {
    const oldW = parseFloat(w);
    const oldH = parseFloat(h);
    const newW = oldW * fontScale;
    const newH = oldH * fontScale;
    const newX = parseFloat(x) * fontScale;
    return `${before}x="${newX}"${mid1}width="${newW}"${mid2}height="${newH}"`;
  }
);

// --- Step 4: Add 2% padding to viewBox edges ---

svg = svg.replace(
  /viewBox="([-\d.]+)\s+([-\d.]+)\s+([\d.]+)\s+([\d.]+)"/,
  (match, minX, minY, w, h) => {
    const width = parseFloat(w);
    const height = parseFloat(h);
    const padX = width * 0.02;
    const padY = height * 0.02;
    const newMinX = parseFloat(minX) - padX;
    const newMinY = parseFloat(minY) - padY;
    const newW = width + padX * 2;
    const newH = height + padY * 2;
    return `viewBox="${newMinX} ${newMinY} ${newW} ${newH}"`;
  }
);

// --- Step 5: Fix SVG sizing for GitHub preview ---
// Remove max-width from inline style and set an explicit width so GitHub's
// <img> renderer displays the SVG at a reasonable size.

svg = svg.replace(
  /(<svg[^>]*?)(\s+style="[^"]*")/s,
  (match, before, styleAttr) => {
    const cleaned = styleAttr.replace(/max-width:\s*[^;]+;?\s*/g, '');
    return `${before}${cleaned}`;
  }
);

svg = svg.replace(
  /(<svg[^>]*?)\s+width="100%"/s,
  (match, before) => {
    // Extract the (already padded) viewBox width and scale up
    const vbMatch = svg.match(/viewBox="[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)"/);
    if (vbMatch) {
      const vbWidth = parseFloat(vbMatch[1]);
      const vbHeight = parseFloat(vbMatch[2]);
      return `${before} width="1013" height="693"`;
    }
    return `${before} width="1013" height="693"`;
  }
);

writeFileSync(file, svg);
console.log(`Fixed cluster labels, inner backgrounds, and SVG sizing in ${file}`);
