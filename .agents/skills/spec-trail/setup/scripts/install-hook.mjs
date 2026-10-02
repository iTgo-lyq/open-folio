#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("./pre-commit.js", import.meta.url));
const scriptPath = ".agents/skills/spec-trail/setup/scripts/pre-commit.js";
const command = `node "$(git rev-parse --show-toplevel)/${scriptPath}"`;
const body = `#!/bin/sh\nexec ${command} "$@"\n`;

function readHook(path) {
  if (!existsSync(path)) return undefined;
  if (!lstatSync(path).isFile()) throw new Error(`Inspect the existing hook before integrating: ${path}`);
  return readFileSync(path, "utf8");
}

try {
  const [repoArg = ".", ...extra] = process.argv.slice(2);
  if (extra.length) throw new Error("Usage: node install-hook.mjs [repo-dir]");
  if (Number(process.versions.node.split(".")[0]) < 20) throw new Error("Node.js 20 or newer is required.");
  let cwd = resolve(repoArg);
  const git = (args) => execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  if (git(["rev-parse", "--is-bare-repository"]) === "true") throw new Error("Choose a repository with a working tree.");
  cwd = git(["rev-parse", "--show-toplevel"]);
  const contractSource = fileURLToPath(new URL("../../prototype/scripts/contract.mjs", import.meta.url));
  const contractPath = join(cwd, ".agents/skills/spec-trail/prototype/scripts/contract.mjs");
  const contractBody = readFileSync(contractSource, "utf8");
  const existingContract = readHook(contractPath);
  if (existingContract !== undefined && existingContract !== contractBody) {
    console.log(`INTEGRATION_REQUIRED: existing prototype contract preserved: ${contractPath}`);
    process.exit(2);
  }
  const scriptBody = readFileSync(source, "utf8");
  const script = join(cwd, scriptPath);
  const existingScript = readHook(script);
  const hook = join(cwd, ".githooks/pre-commit");
  const existing = readHook(hook);
  if (existingScript !== undefined && existingScript !== scriptBody) {
    console.log(`INTEGRATION_REQUIRED: existing validation script preserved: ${script}\nInspect it before updating from ${source}.`);
    process.exitCode = 2;
  } else if (existing !== undefined && existing !== body) {
    console.log(`INTEGRATION_REQUIRED: existing tracked hook preserved: ${hook}\nInspect it and append the validation command after existing checks:\n${command}`);
    process.exitCode = 2;
  } else {
    mkdirSync(dirname(contractPath), { recursive: true });
    if (existingContract === undefined) writeFileSync(contractPath, contractBody, { flag: "wx", mode: 0o644 });
    mkdirSync(dirname(script), { recursive: true });
    if (existingScript === undefined) writeFileSync(script, scriptBody, { flag: "wx", mode: 0o644 });
    mkdirSync(dirname(hook), { recursive: true });
    if (existing === undefined) writeFileSync(hook, body, { flag: "wx", mode: 0o755 });
    chmodSync(hook, 0o755);
    const config = spawnSync("git", ["-C", cwd, "config", "--get", "core.hooksPath"], { encoding: "utf8" });
    if (config.error) throw config.error;
    if (![0, 1].includes(config.status)) throw new Error(config.stderr || "Could not read core.hooksPath.");
    const configured = config.stdout.trim();
    const active = git(["rev-parse", "--path-format=absolute", "--git-path", "hooks/pre-commit"]);
    const activeBody = readHook(active);
    const otherHooks = existsSync(dirname(active)) && readdirSync(dirname(active)).some((name) => name !== "pre-commit" && !name.endsWith(".sample"));
    if (configured === ".githooks" && activeBody === body) {
      console.log(`SpecTrail hook active: ${hook}`);
    } else if (config.status === 1 && activeBody === undefined && !otherHooks) {
      git(["config", "--local", "core.hooksPath", ".githooks"]);
      console.log(`SpecTrail hook installed and activated: ${hook}`);
    } else if (activeBody?.includes(command)) {
      console.log(`SpecTrail rules integrated in existing hook: ${active}`);
    } else {
      console.log(`INTEGRATION_REQUIRED: existing hooks and core.hooksPath preserved.\nRun this command after existing pre-commit checks and propagate failures:\n${command}\nEffective hook: ${active}\nPersist the existing hook integration; do not modify package scripts.`);
      process.exitCode = 2;
    }
  }
} catch (error) {
  console.error(`SpecTrail setup: ${error.message}`);
  process.exitCode = 1;
}
