import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function parseVersion(value) {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)
  )
    throw Error("Invalid SpecTrail version; expected major.minor.patch");
  const parts = value.split(".").map(Number);
  if (!parts.every(Number.isSafeInteger))
    throw Error("SpecTrail version exceeds safe integer range");
  return parts;
}

export function readVersion(file) {
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  const value = JSON.parse(content)?.version;
  parseVersion(value);
  return value;
}

export function compareVersions(left, right) {
  const a = parseVersion(left),
    b = parseVersion(right);
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  }
  return 0;
}

export function nextVersion(current) {
  if (current === null) return "0.1.0";
  const parts = parseVersion(current);
  parts[2]++;
  const next = parts.join(".");
  parseVersion(next);
  return next;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    if (process.argv.length !== 3)
      throw Error("Usage: node version.mjs <version.json>");
    console.log(nextVersion(readVersion(process.argv[2])));
  } catch (error) {
    console.error(`SpecTrail version: ${error.message}`);
    process.exitCode = 1;
  }
}
