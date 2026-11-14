// prototype group, documented in references/prototype/prototype.md. Implementations load on
// demand so the help also works where prototype commands cannot run.
import { resolve } from "node:path";
import { define } from "../define.mjs";
import { assert, readJson, stateCommand } from "../state/context.mjs";
import { requireStage } from "../state/guards.mjs";
import { checkPreviews } from "./hooks.mjs";

const shared = {
  package: { value: "path", text: "Prototype package path relative to the repository (default: workflow prototype.packagePath, else packages/prototype)" },
  hosting: { choices: ["openfolio", "custom", "git"], text: "Prototype hosting saved in workflow.json" },
  "openfolio-url": { value: "url|none", text: "OpenFolio service root URL saved as workflow openfolioUrl; none saves null" },
  "upload-url": { value: "url", text: "Upload URL provided by the OpenFolio administrator or custom host; requires --hosting" },
  request: { value: "file", text: "Publish request written by prototype prepare (keep it outside the repository)" },
  result: { value: "file", text: "Publish result file from the host (keep it outside the repository)" },
  entry: { value: "id", text: "Prototype entry id from prototype.json" },
};

const prototypeSetup = (command, summary, example) =>
  define(async (values) => (await import("./setup.mjs")).runPrototypeSetup(command, values), {
    summary,
    optional: ["package", "design", "hosting", "openfolio-url", "upload-url", "repo"],
    booleans: ["fetch-upload-url"],
    shared,
    help: {
      design: { value: "file", text: "Existing design standard in the repository that DESIGN.md should reference instead of copying" },
      "fetch-upload-url": { text: "Fetch and save the upload URL with OPENFOLIO_ADMIN_PASSWORD; use with --hosting openfolio instead of --upload-url" },
    },
    notes: [
      "accept, decline, enable and configure share these options and save any hosting options given.",
      "accept stays pending until package.json has a build script; then run enable.",
      "--design applies to accept; --package applies to accept, enable and a first configure; decline only records disabled.",
    ],
    example,
  });
const publication = (command, summary, { required = [], optional = [], help, notes, example }) =>
  define(async (values) => (await import("./publish.mjs")).runPrototypePublication(command, values), {
    summary, required, optional: [...optional, "repo"], shared, help, notes, example,
  });

export const commands = {
  accept: prototypeSetup(
    "accept",
    "Create the package files (no build) in an empty or missing directory, or check an existing package and enable it",
    "--package packages/prototype --hosting git",
  ),
  decline: prototypeSetup("decline", "Disable prototype tracking; existing files are kept"),
  enable: prototypeSetup(
    "enable",
    "Re-validate a pending or enabled package (package.json with a build script, AGENTS.md, DESIGN.md, prototype.json or Git previews) and enable it",
  ),
  configure: prototypeSetup(
    "configure",
    "Save the hosting choice and service URLs in workflow.json without touching the package",
    '--hosting openfolio --openfolio-url https://folio.example.com --upload-url "$OPENFOLIO_UPLOAD_URL"',
  ),
  validate: define(async (values) => (await import("./validate.mjs")).runPrototypeValidation(values), {
    summary: "Check current prototype entries statically, and in a browser with --browser",
    optional: ["package", "playwright", "repo"],
    booleans: ["browser"],
    help: {
      package: { value: "path", text: "Validate this package directly (frontend repository; . for its root) instead of reading workflow.json" },
      playwright: { value: "path", text: "Playwright module to import (default: @playwright/test resolved from the repository)" },
      browser: { text: "Also load each entry once in headless Chromium (default viewport); fails on page or console errors and HTTP 400+" },
    },
    example: "--browser",
  }),
  prepare: publication("prepare", "Write a publish request for a built prototype from a clean commit", {
    required: ["directory", "entries", "repository", "out"],
    optional: ["package"],
    help: {
      directory: { value: "dir", text: "Built artifact directory, e.g. packages/prototype/dist" },
      entries: { value: "file", text: 'JSON file such as [{"id":"orders","entryPath":"index.html","hash":"#/orders"}]' },
      repository: { value: "url", text: "Repository URL recorded in the request" },
      out: { value: "file", text: "Request file to create outside the repository; must not exist" },
      package: { value: "path", text: "Package path inside a frontend repository (submodule publishing; . for its root)" },
    },
    example: "--directory packages/prototype/dist --entries /tmp/entries.json --repository https://example.org/team/project.git --out /tmp/request.json",
  }),
  upload: publication("upload", "Upload a prepared request to OpenFolio, then register current entries and optional Change previews", {
    required: ["request", "result"],
    optional: ["change", "upload-url", "openfolio-url"],
    help: {
      result: { value: "file", text: "Result file to write outside the repository" },
      change: { value: "id", text: "Also link the published entries to this Change" },
      "upload-url": { value: "url", text: "Frontend publishing only: upload URL (default: OPENFOLIO_UPLOAD_URL)" },
      "openfolio-url": { value: "url", text: "Frontend publishing only: OpenFolio root (default: OPENFOLIO_URL)" },
    },
    notes: ["Requires enabled openfolio hosting in workflow.json, except for frontend (submodule) requests."],
    example: "--request /tmp/request.json --result /tmp/result.json --change example",
  }),
  register: publication("register", "Register a custom host result or a Git preview as the current entry and optional Change preview", {
    optional: ["git-entry", "request", "result", "change", "package", "repository"],
    help: {
      "git-entry": { value: "id", text: "Entry id whose <package>/preview/<id>/index.html is the Git fallback" },
      change: { value: "id", text: "Also link the registered entries to this Change" },
      package: { value: "path", text: "Package path inside a frontend repository (submodule publishing)" },
      repository: { value: "url", text: "Repository URL for a Git entry in a frontend repository" },
    },
    notes: ["Provide --git-entry, or both --request and --result."],
    example: "--request /tmp/request.json --result /tmp/result.json --change example",
  }),
  associate: publication("associate", "In the parent repository, link committed frontend (submodule) prototype entries to a Change", {
    required: ["change"],
    optional: ["entry"],
    help: { entry: { value: "id", text: "Associate only this entry (default: all current entries)" } },
    example: "--change example --entry orders",
  }),
  recover: publication("recover", "Roll back an interrupted multi-file registration to its previous files; stops on newer edits or commits", {
    notes: ["Rerun register or upload afterwards; recover does not complete the registration."],
  }),
  previews: stateCommand("Replace the prototype previews linked to the Change (requirement to execution)", {
    required: ["file"],
    help: { file: { value: "file", text: "JSON file holding the PreviewEntry array; a relative path resolves against --repo" } },
    example: " --file /tmp/previews.json",
    run(ctx) {
      requireStage(ctx, "requirement", "technical", "plan", "execution");
      const previews = readJson(resolve(ctx.cwd, ctx.need("file")));
      assert(Array.isArray(previews), "--file must contain a preview array");
      checkPreviews(ctx, previews);
      ctx.state.previews = previews;
    },
  }),
};
