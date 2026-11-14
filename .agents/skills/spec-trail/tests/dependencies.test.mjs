import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { externalScriptDependencies } from "./script-dependencies.mjs";

const skill = fileURLToPath(new URL("../", import.meta.url));

test("Skill scripts import only relative modules and node: built-ins", () => {
  const scripts = readdirSync(skill, { recursive: true })
    .filter(path => /\.[cm]?js$/.test(path) && !path.split(/[\\/]/).includes("node_modules"));
  assert.ok(scripts.includes(join("scripts", "setup", "pre-commit.mjs")));
  const found = scripts.flatMap(path =>
    externalScriptDependencies(readFileSync(join(skill, path), "utf8")).map(specifier => `${path}: ${specifier}`));
  assert.deepEqual(found, [], `use a relative path or node: built-in in ${relative(process.cwd(), skill)}`);
});

test("dependency scan finds direct imports and ignores text, comments and local helpers", () => {
  const safe = [
    'import {readFile} from "node:fs/promises";',
    'export {use} from "./local.mjs";',
    'import "../other.mjs";',
    'const local = import("./local.mjs");',
    'const computed = import("runtime-" + name);',
    '// import ignored from "comment-package";',
    'const text = "import ignored from \'text-package\'";',
    'const pattern = /import ignored from "regex-package"/;',
    'const from = "moduleType"; const options = { import: from };',
    'if (true) /import ignored from "regex-statement"/.test("ordinary text");',
    'if (true) {}\n/import ignored from "regex-after-block"/.test("ordinary text");',
    'function example() {}\n/import ignored from "regex-after-function"/.test("ordinary text");',
    'function local() { const require = value => value; return require("local-argument"); }',
    'function localParameter(require) { return require("local-parameter"); }',
    'function localAsync() { const require = async value => value; return require("local-async"); }',
  ].join("\n");
  const external = [
    'import value from "external-default";',
    'import "external-side-effect";',
    'export {thing} from "external-export";',
    'import(/* source */ "external-dynamic");',
    'import 工具 from "external-unicode";',
    'import \\u0066oo from "external-escaped-binding";',
    'import(`external-template`);',
    'const interpolation = `text ${import("external-interpolation")}`;',
    'function scoped() { function require(value) { return value; } }',
    'const helper = function require(value) { return value; };',
    'const require = createRequire(import.meta.url);',
    'require("external-commonjs");',
    'import "node:not-a-builtin";',
  ].join("\n");
  assert.deepEqual(externalScriptDependencies(safe), []);
  assert.deepEqual(new Set(externalScriptDependencies(`${external}\n${safe}`)), new Set([
    "external-default", "external-side-effect", "external-export",
    "external-dynamic", "external-template", "external-unicode", "external-interpolation", "external-escaped-binding",
    "external-commonjs", "node:not-a-builtin",
  ]));
});
