#!/usr/bin/env node
// Post-process mermaid SVG:
//   1. Left-align cluster/subgraph labels
//   2. Set inner (nested) cluster backgrounds to white
//   3. Fix SVG sizing for GitHub preview (remove max-width, set explicit dimensions)
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

// --- Step 3: Fix SVG sizing for GitHub preview ---
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
    // Extract the viewBox width and scale up
    const vbMatch = svg.match(/viewBox="[\d.\-]+\s+[\d.\-]+\s+([\d.]+)\s+([\d.]+)"/);
    if (vbMatch) {
      const vbWidth = parseFloat(vbMatch[1]);
      const vbHeight = parseFloat(vbMatch[2]);
      const scale = Math.max(1, Math.min(1200 / vbWidth, 4));
      const width = Math.round(vbWidth * scale);
      const height = Math.round(vbHeight * scale);
      return `${before} width="${width}" height="${height}"`;
    }
    return `${before} width="1200"`;
  }
);

writeFileSync(file, svg);
console.log(`Fixed cluster labels, inner backgrounds, and SVG sizing in ${file}`);
