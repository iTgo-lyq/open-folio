import test from "node:test";
import assert from "node:assert/strict";
import { symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { imageMime, hash } from "../src/server/git.ts";
import { DEFAULT_LIMITS } from "../src/lib/model.ts";
import { fixture } from "./fixture.ts";
import { diagramSvg, isolatedSvg } from "./svg-fixture.ts";

test("SVG detection requires well-formed UTF-8 XML with an SVG root", () => {
  for (const source of [
    diagramSvg,
    "\uFEFF" + diagramSvg,
    '<!-- diagram --><s:svg xmlns:s="http://www.w3.org/2000/svg"/>',
    isolatedSvg,
  ])
    assert.equal(imageMime(Buffer.from(source)), "image/svg+xml");
  for (const source of [
    "",
    "<svg/>",
    '<svg xmlns="https://www.w3.org/2000/svg"/>',
    '<html xmlns="http://www.w3.org/1999/xhtml"><svg xmlns="http://www.w3.org/2000/svg"/></html>',
    '<svg xmlns="http://www.w3.org/2000/svg"><rect></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"/><svg xmlns="http://www.w3.org/2000/svg"/>',
    '<svg xmlns="http://www.w3.org/2000/svg">&unknown;</svg>',
    '<!DOCTYPE svg SYSTEM "https://example.test/external.dtd"><svg xmlns="http://www.w3.org/2000/svg"/>',
    '<!DOCTYPE svg [<!ENTITY x "expanded">]><svg xmlns="http://www.w3.org/2000/svg">&x;</svg>',
    '<?xml-stylesheet href="https://example.test/style.css"?><svg xmlns="http://www.w3.org/2000/svg"/>',
    diagramSvg.replace("UTF-8", "UTF-16"),
    diagramSvg.replace('version="1.0"', 'version="1.1"'),
  ])
    assert.equal(imageMime(Buffer.from(source)), undefined, source);
  assert.equal(
    imageMime(Buffer.concat([Buffer.from(diagramSvg), Buffer.from([0xff])])),
    undefined,
  );
  assert.equal(imageMime(Buffer.from(diagramSvg, "utf16le")), undefined);
});

test("SVG scans enforce blob and size limits and upgrade unchanged legacy caches", async (t) => {
  const f = await fixture();
  t.after(f.cleanup);
  const prefix = "docs/project/specs/platform/";
  await f.put(prefix + "diagram.SVG", diagramSvg);
  await f.put(prefix + "broken.svg", "<html>not SVG</html>");
  await f.put(prefix + "large.svg", diagramSvg + " ".repeat(4000));
  await symlink("diagram.SVG", join(f.author, prefix + "linked.svg"));
  f.commit();
  const limits = { ...DEFAULT_LIMITS, imageBytes: 2000 };
  const first = await f.store.refresh(f.project, limits);
  const diagram = first.documents.find((d) => d.path.endsWith("diagram.SVG"))!;
  assert.equal(diagram.kind, "image");
  assert.equal(diagram.mime, "image/svg+xml");
  assert.equal(diagram.readable, true);
  assert.equal(
    (await f.store.document(f.project, diagram.id, first.id)).body.toString(),
    diagramSvg,
  );
  for (const [name, code] of [
    ["broken.svg", "IMAGE_FORMAT"],
    ["large.svg", "FILE_SIZE"],
    ["linked.svg", "FILE_MODE"],
  ]) {
    const doc = first.documents.find((d) => d.path.endsWith(name))!;
    assert.equal(doc.readable, false);
    assert.equal(doc.diagnostics[0].code, code);
    await assert.rejects(f.store.document(f.project, doc.id, first.id), {
      code: "DOCUMENT_UNREADABLE",
    });
  }
  // Simulate a pre-SVG cache with identical remote refs and limits.
  first.scanFingerprint = hash(JSON.stringify([1, limits]));
  diagram.kind = "unsupported";
  diagram.readable = false;
  delete diagram.mime;
  await writeFile(
    join(f.store.directory(), "snapshots", first.id + ".json"),
    JSON.stringify(first),
  );
  const upgraded = await f.makeStore().refresh(f.project, limits);
  assert.notEqual(upgraded.id, first.id);
  assert.equal(
    upgraded.documents.find((d) => d.id === diagram.id)?.readable,
    true,
  );
  assert.equal(
    upgraded.documents.find((d) => d.id === diagram.id)?.mime,
    "image/svg+xml",
  );
});
