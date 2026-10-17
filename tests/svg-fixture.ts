export const diagramSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="320" height="160" viewBox="0 0 320 160">
  <title>架构示意</title>
  <style>.background { fill: #eaf2ff; } text { font: 20px sans-serif; fill: #172554; }</style>
  <defs>
    <linearGradient id="gradient"><stop stop-color="#00ff00"/><stop offset="1" stop-color="#0000ff"/></linearGradient>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10Z" fill="#172554"/></marker>
    <rect id="node" width="80" height="80" rx="8" fill="url(#gradient)"/>
  </defs>
  <rect class="background" width="320" height="160"/>
  <use xlink:href="#node" x="20" y="20"/>
  <path d="M120 60 H260" stroke="#172554" stroke-width="2" marker-end="url(#arrow)"/>
  <text x="20" y="140">仓库 → 工作台</text>
</svg>`;

// Intentionally active content. This tests browser isolation, not sanitization.
export const isolatedSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" onload="window.svgInjected = true">
  <script>window.svgInjected = true; fetch('/svg-probe-script');</script>
  <style>@import url('/svg-probe-style'); .node { fill: #22c55e; }</style>
  <rect class="node" width="100" height="100"/>
  <image href="/svg-probe-image" width="1" height="1"/>
  <foreignObject width="1" height="1"><iframe xmlns="http://www.w3.org/1999/xhtml" src="/svg-probe-frame"/></foreignObject>
</svg>`;
