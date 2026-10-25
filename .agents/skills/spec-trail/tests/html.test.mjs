import assert from "node:assert/strict";
import test from "node:test";
import { htmlIssues } from "../prototype/scripts/html.mjs";

test("self-contained exports allow inline image favicons", () => {
  for (const tag of [
    '<link rel="icon" href="data:image/svg+xml;base64,PHN2Zy8+">',
    "<link href='data:image/png;base64,aW1hZ2U=' rel='icon'/>",
    "<link rel=icon href=data:image/png;base64,aW1hZ2U=>",
  ]) assert.deepEqual(htmlIssues(`<!doctype html><html><head>${tag}</head></html>`), []);
});

test("favicon support keeps external links and other link relations rejected", () => {
  for (const tag of [
    '<link rel="icon" href="https://example.com/icon.svg">',
    '<link rel="icon" href="/favicon.ico">',
    '<link rel="stylesheet" href="data:text/css,body{}">',
    '<link rel="preload" href="data:image/png;base64,aW1hZ2U=">',
    '<link rel="icon stylesheet" href="data:image/png;base64,aW1hZ2U=">',
    '<link rel="icon" href="data:text/html,content">',
    '<link data-rel="icon" href="data:image/png;base64,aW1hZ2U=">',
    '<link rel="icon" data-href="data:image/png;base64,aW1hZ2U=">',
  ]) assert.ok(htmlIssues(`<!doctype html><html><head>${tag}</head></html>`).length > 0, tag);
});
