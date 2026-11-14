// What the main workflow asks of prototypes: Change previews at rework, archive
// and integration, and the prototype part of the commit check.
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { dirname, relative } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { currentPreview, entryPath, validateManifest, validatePreviews } from "./contract.mjs";
import { gitObject, localPackage, verifyOwnerSource, verifyPrototypeSource } from "./local-source.mjs";
import { inPackage, moduleAddress, treeRows, withinPackage } from "./source.mjs";

const assert = (value, message) => {
  if (!value) throw Error(message);
};
const regularFile = (row) => ["100644", "100755"].includes(row?.[0]);

/** Check previews about to be linked to the Change in `ctx` (see scripts/state). */
export function checkPreviews({ state, config, git, root, safe, liveDir }, previews) {
  if (config.prototype?.status !== "enabled") {
    assert(
      previews.every((p) => state.previews?.some((old) => isDeepStrictEqual(p, old))),
      "Enable prototype tracking before adding/updating associations",
    );
    return;
  }
  for (const p of previews) {
    if (p.artifact) {
      assert(p.artifact.source || git(["cat-file", "-t", p.artifact.sourceCommit]) === "commit", "Unknown source commit");
      verifyPrototypeSource(root, p.artifact.sourceCommit, p.id, p.artifact.source, {
        index: !state.previews?.some((old) => isDeepStrictEqual(old, p)),
      });
      if (p.artifact.type === "hosted") continue;
    }
    const path = entryPath(p, config.prototype, relative(root, liveDir));
    assert(
      path && existsSync(safe(path)) && lstatSync(safe(path)).isFile(),
      "Preview requires a regular index.html inside the configured preview directory",
    );
  }
}

/**
 * Fix Git previews to the Change's own snapshot directory before archiving.
 * Previews still in a shared directory are copied; returns the files to write.
 */
export function pinPreviews({ state, config, root, safe, liveDir }, archiveDir) {
  const live = relative(root, liveDir),
    copies = [];
  for (const entry of state.previews ?? []) {
    if (entry.artifact?.type !== "git") continue;
    const sourcePath = entryPath(entry, config.prototype, live);
    assert(sourcePath && lstatSync(safe(sourcePath)).isFile(), "Archive requires a regular prototype index.html");
    let path = entry.artifact.path;
    if (!path.startsWith(live + "/previews/")) {
      path = `${live}/previews/${entry.id}`;
      const target = safe(`${path}/index.html`),
        content = readFileSync(safe(sourcePath));
      if (existsSync(target))
        assert(lstatSync(target).isFile() && readFileSync(target).equals(content), `Archive prototype destination differs: ${path}`);
      else copies.push({ target, content });
    }
    entry.artifact.path = relative(root, archiveDir) + path.slice(live.length);
  }
  return copies;
}

/** Point Git previews of a restored archive back into the live Change directory. */
export function restorePreviews({ state, root, file, liveDir }) {
  const prefix = relative(root, dirname(file));
  for (const preview of state.previews ?? []) {
    if (preview.artifact.type !== "git") continue;
    assert(preview.artifact.path.startsWith(prefix + "/previews/"), "Invalid archived prototype path");
    preview.artifact.path = relative(root, liveDir) + preview.artifact.path.slice(prefix.length);
  }
}

/** Every preview of an archived record must be readable from `commit`. */
export function verifyArchivedPreviews(repo, record, commit, configuration) {
  for (const preview of record.state.previews ?? []) {
    if (!preview.artifact.source) {
      let found = true;
      try {
        repo.git(["rev-parse", "--verify", `${preview.artifact.sourceCommit}^{commit}`]);
      } catch {
        found = false;
      }
      assert(found, `Prototype source object is unavailable: ${preview.id}`);
    }
    verifyPrototypeSource(repo.root, preview.artifact.sourceCommit, preview.id, preview.artifact.source, { revision: commit });
    if (preview.artifact.type === "git") {
      const path = entryPath(preview, configuration, record.directory);
      assert(path?.startsWith(record.directory + "/previews/"), `Prototype path is outside the archived snapshot: ${preview.id}`);
      const row = repo.git(["ls-tree", commit, "--", path]);
      assert(/^(100644|100755) blob [a-f0-9]+\t/.test(row), `Prototype HTML is unavailable: ${preview.id}`);
    }
  }
}

/**
 * Prototype checks of a commit, read from the index Git is committing.
 * Returns "path: problem" lines; an empty list means the commit may proceed.
 */
export function stagedPrototypeIssues({ git, root, indexed, changedStateFiles, allChanged, workflow, committedWorkflow, branch, readState }) {
  const issues = [];
  const config = workflow?.prototype;
  for (const [path] of indexed) {
    if (!/^docs\/project\/changes\/[^/]+\/change\.json$/.test(path)) continue;
    const value = readState(`:${path}`);
    // Inherited entries retain old preview metadata. Their authoritative files
    // live on another branch, so local cross-file checks cannot validate them.
    if (workflow && branch && value?.branch !== branch) continue;
    if (!Array.isArray(value?.previews) || !value.previews.length) continue;
    const changed = changedStateFiles.includes(path);
    const previous = readState(`HEAD:${path}`)?.previews;
    const errors = [];
    if (config?.status !== "enabled") {
      if (changed && (!Array.isArray(previous) || !value.previews.every((preview) => previous.some((old) => isDeepStrictEqual(old, preview)))))
        errors.push("/previews: project prototype tracking is not enabled; remove associations or complete setup first");
    } else {
      for (const [i, preview] of value.previews.entries()) {
        if (validatePreviews([preview]).length) {
          errors.push(`/previews/${i}: invalid reference`);
          continue;
        }
        if (preview.artifact) {
          try {
            if (!preview.artifact.source && git(["cat-file", "-t", preview.artifact.sourceCommit]).trim() !== "commit") throw Error();
          } catch {
            errors.push(`/previews/${i}/sourceCommit: unknown source commit`);
          }
          if (changed && !previous?.some((old) => isDeepStrictEqual(old, preview)))
            try {
              verifyPrototypeSource(root, preview.artifact.sourceCommit, preview.id, preview.artifact.source, { index: true });
            } catch (error) {
              errors.push(`/previews/${i}/source: ${error.message}`);
            }
          if (preview.artifact.type === "hosted") continue;
        }
        const entry = entryPath(preview, config, path.slice(0, -12));
        const indexedEntry = entry && indexed.get(entry);
        if (!entry || !regularFile(indexedEntry) || indexedEntry[2] !== "0")
          errors.push(`/previews/${i}/path: entry must be a staged regular index.html inside the configured preview directory`);
      }
    }
    issues.push(...errors.map((error) => `${path}: ${error}`));
  }
  if (config?.status !== "enabled") return issues;
  const manifestPath = `${config.packagePath}/prototype.json`;
  if (indexed.has(manifestPath)) {
    const manifest = readState(`:${manifestPath}`),
      problems = validateManifest(manifest);
    if (!problems.length)
      for (const entry of manifest.entries) {
        if (!entry.sourcePath.startsWith(config.packagePath + "/")) problems.push("Source must stay in prototype package");
        if (entry.artifact?.type === "git") {
          const file = entryPath(currentPreview(entry), config);
          if (!file || !regularFile(indexed.get(file))) problems.push("Current Git entry must be a staged regular file");
        }
      }
    issues.push(...problems.map((problem) => `${manifestPath}: ${problem}`));
  }
  // A package in a submodule is checked from its committed gitlink.
  let mappingChanged = false;
  if (allChanged.includes(".gitmodules")) {
    const selectedLinks = [...indexed].filter(
      ([path, row]) => row[0] === "160000" && (config.packagePath === path || config.packagePath.startsWith(path + "/")),
    );
    try {
      const read = (ref) => git(["config", "--no-includes", "--blob", ref, "--null", "--get-regexp", "^submodule\\..*\\.(path|url)$"]);
      for (const [path] of selectedLinks)
        if (moduleAddress(read(":.gitmodules"), path) !== moduleAddress(read("HEAD:.gitmodules"), path)) mappingChanged = true;
    } catch {
      mappingChanged = true;
    }
  }
  const moduleRelevant =
    !isDeepStrictEqual(config, committedWorkflow?.prototype) ||
    mappingChanged ||
    allChanged.some((path) => config.packagePath === path || config.packagePath.startsWith(path + "/"));
  if (!indexed.has(manifestPath) && moduleRelevant)
    try {
      const source = localPackage(root, git(["rev-parse", "HEAD"]).trim(), config.packagePath, { index: true });
      if (source.links.length) {
        const manifest = JSON.parse(gitObject(source.source, ["show", `${source.revision}:${inPackage(source.packagePath, "prototype.json")}`]));
        const problems = validateManifest(manifest);
        if (!problems.length)
          for (const entry of manifest.entries) {
            if (!withinPackage(entry.sourcePath, source.packagePath)) problems.push("Source must stay in prototype package");
            else {
              const row = treeRows(gitObject(source.source, ["ls-tree", "-lz", source.revision, "--", entry.sourcePath]))[0];
              if (!row || row.path !== entry.sourcePath || !["100644", "100755"].includes(row.mode))
                problems.push(`Missing committed source: ${entry.sourcePath}`);
            }
            if (entry.artifact) {
              if (entry.artifact.source) verifyOwnerSource(source, entry.artifact.sourceCommit, entry.id, entry.artifact.source);
              else verifyPrototypeSource(root, entry.artifact.sourceCommit, entry.id, undefined, { index: true });
              if (entry.artifact.type === "git") {
                if (!entry.artifact.path.startsWith(inPackage(source.packagePath, "preview") + "/"))
                  problems.push("Current Git entry must stay in prototype preview");
                const row = treeRows(gitObject(source.source, ["ls-tree", "-lz", source.revision, "--", entry.artifact.path + "/index.html"]))[0];
                if (!row || row.path !== entry.artifact.path + "/index.html" || !["100644", "100755"].includes(row.mode))
                  problems.push("Current Git entry must be a committed regular file");
              }
            }
          }
        if (problems.length) throw Error(problems.join("; "));
      }
    } catch (error) {
      issues.push(`${manifestPath}: ${error.message}`);
    }
  return issues;
}
