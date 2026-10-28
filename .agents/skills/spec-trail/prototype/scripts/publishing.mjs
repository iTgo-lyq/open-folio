import { validateRequest, validateResult, requestIdentity, resultArtifact } from "./publication-contract.mjs";
export { validateRequest, validateResult } from "./publication-contract.mjs";
import { digestPrefix } from "./upload-protocol.mjs";
// Host-side publishing primitives. Never imported by the OpenFolio server.
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  renameSync,
  rmSync,
  realpathSync,
} from "node:fs";
import { dirname, join, resolve, relative } from "node:path";
import { hostname } from "node:os";
import {
  validateManifest,
  validatePreviews,
  validateArtifact,
  currentPreview,
  safePath,
  hostedUrl,
  commitHash,
  entryPath,
} from "./contract.mjs";
import {
  validateChange,
  validateWorkflow,
} from "../../scripts/state-schema.mjs";
import { htmlIssues } from "./html.mjs";
import { localPackage, sourceManifest, packageManifest, assertSourceEntry, assertCheckout, verifyOwnerSource, verifyPrototypeSource } from './local-source.mjs';
import { moduleUrl, treeRows } from './source.mjs';
import { inPackage, withinPackage } from './source.mjs';
const fail = (condition, message) => {
  if (!condition) throw Error(message);
};
export const git = (root, args) =>
  execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 16 * 1024 * 1024,
  }).trim();
const json = (value) => JSON.stringify(value, null, 2) + "\n";
export function checkedPath(root, path) {
  fail(safePath(path), "Unsafe repository path");
  let at = root;
  for (const part of path.split("/")) {
    at = join(at, part);
    try {
      fail(!lstatSync(at).isSymbolicLink(), "Symbolic links are not allowed");
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }
  return at;
}
export function artifactDigest(directory) {
  fail(
    !lstatSync(directory).isSymbolicLink() &&
      lstatSync(directory).isDirectory(),
    "Artifact directory must be regular",
  );
  const h = createHash("sha256"),
    files = [];
  let bytes = 0;
  const walk = (at, prefix = "") => {
    for (const name of readdirSync(at).sort()) {
      const path = prefix + name,
        full = join(at, name),
        stat = lstatSync(full);
      fail(safePath(path) && !stat.isSymbolicLink(), "Unsafe artifact file");
      if (stat.isDirectory()) walk(full, path + "/");
      else {
        fail(stat.isFile(), "Artifact must contain regular files");
        bytes += stat.size;
        files.push(path);
        fail(
          files.length <= 2000 && bytes <= 100 * 1024 * 1024,
          "Artifact exceeds limits",
        );
        const body = readFileSync(full);
        h.update(digestPrefix(path, body.length)).update(body);
      }
    }
  };
  walk(directory);
  fail(files.length > 0, "Artifact is empty");
  return { digest: `sha256:${h.digest("hex")}`, files };
}
function configuration(root, packagePath = undefined) {
  const standalone=packagePath!==undefined;
  if(packagePath==='.')packagePath='';
  fail(!standalone||packagePath===''||safePath(packagePath),'Invalid prototype package path');
  const workflow = standalone? {prototype:{status:'enabled',packagePath}} : JSON.parse(
    readFileSync(checkedPath(root, "docs/project/workflow.json"), "utf8"),
  );
  fail(
    (standalone || !validateWorkflow(workflow).length) &&
      workflow.prototype?.status === "enabled",
    "Prototype collaboration must be enabled",
  );
  const source = localPackage(root, git(root,['rev-parse','HEAD']), standalone?'':workflow.prototype.packagePath);
  fail(!source.mount,'Publish in the frontend repository with --package, then associate the committed catalog in the parent');
  if(standalone)source.packagePath=packagePath;
  const path = inPackage(workflow.prototype.packagePath, 'prototype.json'),
    manifest = JSON.parse(readFileSync(checkedPath(root, path), "utf8"));
  fail(
    !validateManifest(manifest).length,
    validateManifest(manifest).join("; "),
  );
  for (const e of manifest.entries)
    fail(
      withinPackage(e.sourcePath, source.packagePath),
      "Source must stay in the prototype package",
    );
  return { workflow, path, manifest, source, standalone };
}
/** @param {string | undefined} [packagePath] */
export function prepare(root, directory, entries, repository, packagePath = undefined) {
  root = realpathSync(root);
  const config=configuration(root,packagePath),{manifest}=config;
  const source = config.standalone?packageManifest(root,git(root,['rev-parse','HEAD']),config.source.packagePath):sourceManifest(root, git(root,['rev-parse','HEAD']));
  assertCheckout(source);
  fail(
    !git(root, ["status", "--porcelain", "--untracked-files=normal"]),
    "Commit sources and metadata before preparing a publication",
  );
  const artifactDirectory = checkedPath(root, directory),
    { digest, files } = artifactDigest(artifactDirectory);
  const request = {
    schemaVersion: 1,
    repository,
    sourceCommit: git(root, ["rev-parse", "HEAD"]),
    artifactDirectory,
    digest,
    entries: [...entries].sort((a, b) => a.id.localeCompare(b.id)),
    requestId: "",
    ...(config.standalone?{packagePath:config.source.packagePath}:{}),
  };
  request.requestId = requestIdentity(request);
  validateRequest(request);
  for (const e of request.entries) {
    const entry = manifest.entries.find((p) => p.id === e.id);
    fail(
      entry && files.includes(e.entryPath),
      "Missing declared entry or output",
    );
    assertSourceEntry(source, e.id);
  }
  return request;
}
function paths(root) {
  const common = git(root, [
    "rev-parse",
    "--path-format=absolute",
    "--git-common-dir",
  ]);
  return {
    lock: join(common, "spec-trail-state.lock"),
    journal: join(common, "spec-trail-prototype-transaction.json"),
  };
}
export function withLock(root, fn) {
  const { lock } = paths(root);
  try {
    mkdirSync(lock);
  } catch (error) {
    if (error.code === "EEXIST")
      throw Error(
        `Another state operation holds ${lock}. Inspect owner.json (if present), the owning process and worktree; only remove a confirmed stale lock, then run publish.mjs recover. Never remove an active or unverified lock.`,
      );
    throw error;
  }
  try {
    writeFileSync(join(lock, "owner.json"), json({
      pid: process.pid, hostname: hostname(), root: realpathSync(root), startedAt: new Date().toISOString(),
    }), { flag: "wx", mode: 0o600 });
    return fn();
  } finally {
    rmSync(lock, { recursive: true });
  }
}
function withLocks(roots, fn) {
  const ordered=[...new Set(roots.map(root=>realpathSync(root)))].sort((a,b)=>paths(a).lock.localeCompare(paths(b).lock));
  const run=i=>i===ordered.length?fn():withLock(ordered[i],()=>run(i+1));
  return run(0);
}
function rollback(root, journal) {
  fail(
    journal.root === root && Array.isArray(journal.files),
    "Transaction belongs to another worktree",
  );
  for (const owner of journal.repositories ?? []) {
    const directory=owner.path?checkedPath(root,owner.path):root;
    fail(git(directory,['rev-parse','HEAD'])===owner.head,'Transaction recovery conflicts with newer repository commits or changed submodule checkout');
  }
  // Check every file before restoring any, so concurrent edits are not overwritten.
  for (const f of journal.files) {
    const p = checkedPath(root, f.path),
      actual = existsSync(p) ? readFileSync(p).toString("base64") : null;
    fail(
      actual === f.before || actual === f.after,
      "Transaction recovery conflicts with newer edits",
    );
  }
  for (const f of journal.files) {
    const p = checkedPath(root, f.path);
    if (f.before === null) rmSync(p, { force: true });
    else writeFileSync(p, Buffer.from(f.before, "base64"));
  }
}
export function recover(root) {
  root = realpathSync(root);
  if(!existsSync(paths(root).journal))return withLock(root,()=>fail(false,'No pending transaction'));
  const initial=JSON.parse(readFileSync(paths(root).journal,'utf8'));
  return withLocks([root,...(initial.repositories??[]).map(owner=>owner.path?checkedPath(root,owner.path):root)], () => {
    const { journal } = paths(root);
    fail(existsSync(journal), "No pending transaction");
    rollback(root, JSON.parse(readFileSync(journal, "utf8")));
    rmSync(journal);
  });
}
export function transaction(root, files, participants = [{root}]) {
  const { journal } = paths(root);
  fail(
    !existsSync(journal),
    "Recover the unfinished prototype transaction first",
  );
  const changes = files.map((f) => {
    const p = checkedPath(root, f.path);
    fail(
      !existsSync(p) || lstatSync(p).isFile(),
      "Target is not a regular file",
    );
    return {
      ...f,
      before: existsSync(p) ? readFileSync(p).toString("base64") : null,
      after: Buffer.from(f.body).toString("base64"),
    };
  });
  const repositories=participants.map(owner=>({path:relative(root,owner.root).split('\\').join('/'),head:git(owner.root,['rev-parse','HEAD'])}));
  writeFileSync(
    journal,
    json({
      root,
      ...(repositories.length?{repositories}:{}),
      files: changes.map(({ path, before, after }) => ({
        path,
        before,
        after,
      })),
    }),
    { flag: "wx", mode: 0o600 },
  );
  try {
    for (const f of changes) {
      const p = checkedPath(root, f.path);
      mkdirSync(dirname(p), { recursive: true });
      const tmp = p + `.${randomUUID()}.tmp`;
      try {
        writeFileSync(tmp, f.body);
        renameSync(tmp, p);
      } finally {
        rmSync(tmp, { force: true });
      }
    }
    rmSync(journal);
  } catch (e) {
    rollback(root, { root, files: changes, repositories });
    rmSync(journal);
    throw e;
  }
}
function assertSource(root, commit) {
  fail(
    commitHash(commit) && git(root, ["cat-file", "-t", commit]) === "commit",
    "Invalid source commit",
  );
  git(root, ["merge-base", "--is-ancestor", commit, "HEAD"]);
}
function changeRecord(root, id, branch) {
  fail(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id), "Invalid Change id");
  const path = `docs/project/changes/${id}/change.json`,
    state = JSON.parse(readFileSync(checkedPath(root, path), "utf8"));
  fail(
    !validateChange(state).length &&
      state.id === id &&
      state.status === "active" &&
      state.branch === branch,
    "Use the active Change's own branch",
  );
  return { path, state };
}
/** @param {string} root @param {{request?: any, result?: any, change?: string, gitEntry?: string, packagePath?: string, repository?: string}} options */
export function register(root, { request, result, change, gitEntry, packagePath, repository }) {
  root = realpathSync(root);
  packagePath=packagePath??request?.packagePath;
  const prepared = configuration(root,packagePath);
  fail(!prepared.standalone||!change,'Publish the frontend catalog first; use associate in the parent to attach a Change');
  return withLock(root, () => {
    fail(
      !existsSync(paths(root).journal),
      "Recover the unfinished prototype transaction first",
    );
    const { workflow, path, manifest, source: currentSource, standalone } = configuration(root,packagePath);
    let branch;
    try{branch=git(root,['symbolic-ref','--short','HEAD']);}catch{fail(standalone,'Use an attached Change branch');}
    fail(JSON.stringify(prepared.source.roots)===JSON.stringify(currentSource.roots),'Prototype repository changed before registration; retry without overwriting edits');
    fail(
      standalone || workflow.releaseBranch !== branch,
      "Register on a working branch, not a protected branch",
    );
    // A cancelled record freezes its branch, even for a current-only publication.
    const activeDir = standalone ? undefined : checkedPath(root, "docs/project/changes");
    if (!standalone && existsSync(activeDir))
      for (const id of readdirSync(activeDir)) {
        const p = checkedPath(root, `docs/project/changes/${id}/change.json`);
        if (existsSync(p)) {
          const s = JSON.parse(readFileSync(p, "utf8"));
          fail(
            !(s.branch === branch && s.status === "cancelled"),
            "Cancelled Change branch is frozen",
          );
        }
      }
    const target = change ? changeRecord(root, change, branch) : null,
      files = [],
      updates = [];
    if (gitEntry) {
      const entry = manifest.entries.find((p) => p.id === gitEntry);
      fail(entry, "Unknown current entry");
      const sourceCommit = git(root, ["rev-parse", "HEAD"]);
      assertSource(root, sourceCommit);
      const source=standalone?packageManifest(root,sourceCommit,currentSource.packagePath):sourceManifest(root,sourceCommit);
      const original=assertSourceEntry(source,entry.id);
      fail(original.sourcePath===entry.sourcePath,'Source path changed since publication baseline; commit it and update the parent gitlink first');
      if(standalone)assertCheckout(source,true);
      fail(
        standalone || !git(root, [
          "status",
          "--porcelain",
          "--",
          ".",
          ":(exclude)docs/project",
          `:(exclude)${workflow.prototype.packagePath}/prototype.json`,
          `:(exclude)${workflow.prototype.packagePath}/preview`,
        ]),
        "Source or dependencies have uncommitted changes",
      );
      const artifact = {
        type: "git",
        path: inPackage(currentSource.packagePath, `preview/${entry.id}`),
        sourceCommit,
        ...(standalone?{source:{repository:moduleUrl(repository??git(root,['remote','get-url','origin']),''),packagePath:currentSource.packagePath}}:{}),
      };
      const full = checkedPath(currentSource.source, artifact.path + "/index.html");
      fail(
        lstatSync(full).isFile() && lstatSync(full).size <= 10 * 1024 * 1024,
        "Invalid fallback HTML",
      );
      const body = readFileSync(full);
      fail(
        !htmlIssues(new TextDecoder("utf-8", { fatal: true }).decode(body))
          .length,
        "Git fallback requires self-contained UTF-8 HTML",
      );
      entry.artifact = artifact;
      const preview = currentPreview(entry);
      if (target) {
        preview.artifact = {
          ...artifact,
          path: `docs/project/changes/${change}/previews/${entry.id}`,
        };
        files.push({ path: preview.artifact.path + "/index.html", body });
      }
      updates.push(preview);
    } else {
      validateResult(request, result);
      assertSource(root, request.sourceCommit);
      const source=standalone?packageManifest(root,request.sourceCommit,currentSource.packagePath):sourceManifest(root,request.sourceCommit);
      if(standalone) {
        fail(request.packagePath===currentSource.packagePath,'Prototype package changed since publication');
        assertCheckout(source,true);
      }
      const relativeDirectory = relative(
        root,
        resolve(request.artifactDirectory),
      );
      fail(
        artifactDigest(checkedPath(root, relativeDirectory)).digest ===
          request.digest,
        "Build output changed since publication request",
      );
      // Inspect all known historical references to reject known immutable URL collisions.
      const known = manifest.entries.map((e) => e.artifact);
      for (const folder of standalone?[]:["changes", "archive"]) {
        const dir = checkedPath(root, `docs/project/${folder}`);
        if (!existsSync(dir)) continue;
        for (const name of readdirSync(dir)) {
          const p = checkedPath(
            root,
            `docs/project/${folder}/${name}/change.json`,
          );
          if (existsSync(p)) {
            const s = JSON.parse(readFileSync(p, "utf8"));
            for (const e of s.previews ?? []) known.push(e.artifact);
          }
        }
      }
      for (const e of result.entries) {
        const entry = manifest.entries.find((p) => p.id === e.id);
        fail(entry, "Unknown current entry");
        const original=assertSourceEntry(source,e.id);
        fail(original.sourcePath===entry.sourcePath,'Source path changed since publication');
        const artifact = resultArtifact(result, e, request);
        for (const old of known)
          if (old?.type === "hosted" && old.url === artifact.url)
            fail(
              old.digest === artifact.digest &&
                old.version === artifact.version,
              "Cannot overwrite a known immutable URL",
            );
        entry.artifact = artifact;
        updates.push(currentPreview(entry));
      }
    }
    fail(
      !validateManifest(manifest).length,
      validateManifest(manifest).join("; "),
    );
    if (target) {
      target.state.previews = [
        ...(target.state.previews ?? []).filter(
          (p) => !updates.some((e) => e.id === p.id),
        ),
        ...updates,
      ];
      fail(
        !validateChange(target.state).length,
        validateChange(target.state).join("; "),
      );
      files.push({ path: target.path, body: json(target.state) });
    }
    files.push({ path, body: json(manifest) });
    transaction(root, files);
    return updates;
  });
}
/** @param {{change:string,entry?:string}} options */
export function associate(root,options){
  const {change,entry:id}=options;
  root=realpathSync(root);
  return withLock(root,()=>{
    fail(!existsSync(paths(root).journal),'Recover the unfinished prototype transaction first');
    const workflow=JSON.parse(readFileSync(checkedPath(root,'docs/project/workflow.json'),'utf8'));
    fail(!validateWorkflow(workflow).length&&workflow.prototype?.status==='enabled','Prototype collaboration must be enabled');
    const target=changeRecord(root,change,git(root,['symbolic-ref','--short','HEAD']));
    const owner=localPackage(root,git(root,['rev-parse','HEAD']),workflow.prototype.packagePath,{index:true,worktree:true});
    fail(owner.mount,'Association requires a submodule prototype package');
    for(const repository of owner.roots.slice(1))fail(!git(repository.root,['status','--porcelain','--untracked-files=normal']),'Commit the frontend catalog and sources before association');
    const manifest=packageManifest(owner.source,owner.revision,owner.packagePath).manifest;
    const known=sourceManifest(root,git(root,['rev-parse','HEAD'])).manifest.entries.map(entry=>entry.artifact);
    for(const folder of ['changes','archive']){
      const directory=checkedPath(root,`docs/project/${folder}`);
      if(!existsSync(directory))continue;
      for(const name of readdirSync(directory)){
        const file=checkedPath(root,`docs/project/${folder}/${name}/change.json`);
        if(existsSync(file))for(const entry of JSON.parse(readFileSync(file,'utf8')).previews??[])known.push(entry.artifact);
      }
    }
    const selected=manifest.entries.filter(entry=>entry.artifact&&(!id||id===entry.id));
    fail(selected.length,'No published prototype entry selected');
    const updates=[],files=[];
    for(const entry of selected){
      const preview=currentPreview(entry),artifact=preview.artifact;
      if(artifact.type==='hosted')for(const old of known)if(old?.type==='hosted'&&old.url===artifact.url)fail(old.digest===artifact.digest&&old.version===artifact.version,'Cannot overwrite a known immutable URL');
      fail(withinPackage(entry.sourcePath,owner.packagePath),'Source must stay in the prototype package');
      if(artifact.source){
        verifyOwnerSource(owner,artifact.sourceCommit,entry.id,artifact.source);
        const bindingCommit=git(root,['rev-parse','HEAD']);
        const binding=localPackage(root,bindingCommit,workflow.prototype.packagePath);
        fail(binding.mount===owner.mount&&binding.packagePath===owner.packagePath&&binding.links.at(-1)?.repository===owner.links.at(-1)?.repository,'Commit the submodule mapping as part of initial setup before associating a publication');
        artifact.source={repository:artifact.source.repository,packagePath:artifact.source.packagePath,submodulePath:owner.mount,catalogCommit:owner.revision,bindingCommit};
      }else verifyPrototypeSource(root,artifact.sourceCommit,entry.id);
      if(artifact.type==='git'){
        fail(artifact.path.startsWith(inPackage(owner.packagePath,'preview')+'/'),'Git artifact must stay in the prototype preview directory');
        const path=artifact.path+'/index.html',row=treeRows(git(owner.source,['ls-tree','-lz',owner.revision,'--',path]))[0];
        fail(row?.path===path&&['100644','100755'].includes(row.mode)&&row.bytes<=10*1024*1024,'Missing regular fixed Git HTML');
        const html=execFileSync('git',['-C',owner.source,'cat-file','blob',row.oid],{stdio:['ignore','pipe','pipe'],maxBuffer:10*1024*1024+1024});
        fail(!htmlIssues(new TextDecoder('utf-8',{fatal:true}).decode(html)).length,'Git fallback must be self-contained HTML');
        artifact.path=`docs/project/changes/${change}/previews/${entry.id}`;
        files.push({path:artifact.path+'/index.html',body:html});
      }
      updates.push(preview);
    }
    target.state.previews=[...(target.state.previews??[]).filter(p=>!updates.some(entry=>entry.id===p.id)),...updates];
    fail(!validateChange(target.state).length,'Invalid Change association');
    files.push({path:target.path,body:json(target.state)});
    transaction(root,files);
    return updates;
  });
}
