import { readFileSync } from "node:fs";

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
