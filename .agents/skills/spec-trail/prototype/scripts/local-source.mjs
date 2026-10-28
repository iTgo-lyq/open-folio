import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  packageSource,
  inPackage,
  withinPackage,
  treeRows,
  sameRepository,
} from "./source.mjs";
import { validateManifest, safePath } from "./contract.mjs";
export const gitObject = (root, args, keepIndex = false) => {
  const env = { ...process.env };
  if (!keepIndex) delete env.GIT_INDEX_FILE;
  return execFileSync("git", ["-C", root, ...args], {
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 16 * 1024 * 1024,
  }).trimEnd();
};
const assert = (value, message) => {
  if (!value) throw Error(message);
};
function childDirectory(root,path){
  let at=root;
  for(const part of path.split('/')){
    at=join(at,part);
    assert(existsSync(at)&&lstatSync(at).isDirectory()&&!lstatSync(at).isSymbolicLink(),`子模块 ${path} 尚未初始化`);
  }
  assert(realpathSync(gitObject(at,['rev-parse','--show-toplevel']))===realpathSync(at),`子模块 ${path} 未初始化为独立仓库`);
  return at;
}
export function localPackage(root, revision, path, { index = false, worktree = false, historical = false } = {}) {
  root = realpathSync(root);
  const roots = [{ root, commit: revision, path: "" }];
  if(path==='')return {source:root,revision,packagePath:'',mount:'',links:[],roots};
  let repository = "";
  try {
    repository = gitObject(root, ["remote", "get-url", "origin"]);
  } catch {}
  const steps = packageSource(root, revision, path, repository);
  let step = steps.next();
  while (!step.done) {
    const op = step.value;
    let value;
    if (op.enter) {
      let at;
      if(historical&&safePath(op.moduleName)){
        const directory=resolve(op.source,gitObject(op.source,['rev-parse','--git-path',`modules/${op.moduleName}`]));
        if(existsSync(directory)&&lstatSync(directory).isDirectory()&&!lstatSync(directory).isSymbolicLink())at=directory;
      }
      at??=childDirectory(op.source,op.localPath);
      try {
        assert(
          gitObject(at, ["cat-file", "-t", op.enter.commit]) === "commit",
          "not commit",
        );
      } catch {
        throw Error(
          `子模块 ${op.enter.path} 缺少固定对象 ${op.enter.commit}；请在该仓库获取此版本后重试`,
        );
      }
      roots.push({ root: at, commit: op.enter.commit, path: op.enter.path });
      value = at;
    } else if (index && op.source === root) {
      if (op.args[0] === "ls-tree") {
        const path = op.args.at(-1);
        const rows = gitObject(
          root,
          ["ls-files", "--stage", "-z", "--", path],
          true,
        )
          .split("\0")
          .filter(Boolean)
          .map((row) => {
            const tab = row.indexOf("\t"),
              [mode, oid, stage] = row.slice(0, tab).split(" ");
            return { mode, oid, stage, path: row.slice(tab + 1) };
          });
        assert(
          rows.every((row) => row.stage === "0"),
          `暂存路径 ${path} 存在合并冲突`,
        );
        const row = rows.find((row) => row.path === path);
        value = row
          ? `${row.mode} ${row.mode === "160000" ? "commit" : "blob"} ${row.oid} ${row.mode === "160000" ? "-" : gitObject(root, ["cat-file", "-s", row.oid])}\t${row.path}\0`
          : rows.length
            ? `040000 tree ${revision} -\t${path}\0`
            : "";
      } else {
        const args = [...op.args];
        args[args.indexOf("--blob") + 1] = ":.gitmodules";
        value = gitObject(root, args, true);
      }
    } else value = gitObject(op.source, op.args);
    if(worktree && op.args?.[0]==='ls-tree')value=treeRows(value).map(row=>{
      if(row.mode==='160000')row.oid=gitObject(childDirectory(op.source,row.path),['rev-parse','HEAD']);
      return `${row.mode} ${row.kind} ${row.oid} ${Number.isFinite(row.bytes)?row.bytes:'-'}\t${row.path}\0`;
    }).join('');
    step = steps.next(value);
  }
  return { ...step.value, roots };
}
export function packageManifest(root,commit,packagePath){
  const source=localPackage(root,commit,'');
  source.packagePath=packagePath;
  const path=inPackage(packagePath,'prototype.json'),row=treeRows(gitObject(root,['ls-tree','-lz',commit,'--',path]))[0];
  assert(row?.path===path&&['100644','100755'].includes(row.mode)&&row.bytes<=256*1024,'Manifest must be a committed regular JSON file within size limits');
  const manifest=JSON.parse(gitObject(root,['show',`${commit}:${path}`]));
  assert(!validateManifest(manifest).length,'固定来源的原型清单不合法');
  return {...source,manifest,standalone:true};
}
export function verifyOwnerSource(owner,commit,id,provenance){
  assert(owner.packagePath===provenance.packagePath,'原型源码包路径与清单不匹配');
  const repository=owner.links.at(-1)?.repository??gitObject(owner.source,['remote','get-url','origin']);
  assert(sameRepository(repository,provenance.repository),'原型源码仓库身份与子模块不匹配');
  try{gitObject(owner.source,['merge-base','--is-ancestor',commit,owner.revision]);}
  catch{throw Error('原型源码提交不属于该子模块清单版本的历史');}
  const source=packageManifest(owner.source,commit,provenance.packagePath);
  assertSourceEntry(source,id);
  return source;
}
export function sourceManifest(root, commit) {
  assert(
    gitObject(root, ["cat-file", "-t", commit]) === "commit",
    "Unknown source commit",
  );
  const workflow = JSON.parse(
    gitObject(root, ["show", `${commit}:docs/project/workflow.json`]),
  );
  const path = workflow.prototype?.packagePath;
  assert(
    workflow.prototype?.status === "enabled" && path,
    "构建基线尚未启用原型协作",
  );
  const source = localPackage(root, commit, path);
  const manifest = JSON.parse(
    gitObject(source.source, [
      "show",
      `${source.revision}:${inPackage(source.packagePath, "prototype.json")}`,
    ]),
  );
  assert(!validateManifest(manifest).length, "固定来源的原型清单不合法");
  return { ...source, manifest };
}
export function assertSourceEntry(source, id) {
  const entry = source.manifest.entries.find((entry) => entry.id === id);
  assert(
    entry && withinPackage(entry.sourcePath, source.packagePath),
    "Source must stay in the prototype package",
  );
  const row = treeRows(
    gitObject(source.source, [
      "ls-tree",
      "-lz",
      source.revision,
      "--",
      entry.sourcePath,
    ]),
  )[0];
  assert(
    row &&
      row.path === entry.sourcePath &&
      ["100644", "100755"].includes(row.mode) &&
      row.kind === "blob",
    "Source must be a committed regular file in its owning repository",
  );
  return entry;
}
export function assertCheckout(source, generated = false) {
  for (const [i, owner] of source.roots.entries()) {
    const head = gitObject(owner.root, ["rev-parse", "HEAD"]);
    const excludes = [];
    if (generated) {
      if (i === 0 && !source.standalone) excludes.push("docs/project");
      if (i === source.roots.length - 1) {
        const manifest =
          source.manifest ??
          JSON.parse(
            gitObject(owner.root, [
              "show",
              `${owner.commit}:${inPackage(source.packagePath, "prototype.json")}`,
            ]),
          );
        assert(!validateManifest(manifest).length, "Invalid source manifest");
        excludes.push(
          inPackage(source.packagePath, "prototype.json"),
          ...manifest.entries.map((entry) =>
            inPackage(source.packagePath, `preview/${entry.id}/index.html`),
          ),
        );
        for (const entry of manifest.entries) {
          assert(
            !gitObject(owner.root, [
              "status",
              "--porcelain",
              "--untracked-files=normal",
              "--",
              entry.sourcePath,
            ]),
            "Declared source has uncommitted changes",
          );
          assert(
            !gitObject(owner.root, [
              "diff",
              "--name-only",
              owner.commit,
              head,
              "--",
              entry.sourcePath,
            ]),
            "Declared source changed since the publication baseline",
          );
        }
      }
      if (i + 1 < source.roots.length)
        excludes.push(
          source.roots[i + 1].path.slice(
            owner.path ? owner.path.length + 1 : 0,
          ),
        );
      gitObject(owner.root, [
        "merge-base",
        "--is-ancestor",
        owner.commit,
        head,
      ]);
    } else
      assert(
        head === owner.commit,
        `子模块 ${owner.path || "主仓库"} 检出版本与 gitlink 不符：需要 ${owner.commit}，实际 ${head}`,
      );
    const scope = ["--", ".", ...excludes.map((path) => `:(exclude)${path}`)];
    assert(
      !gitObject(owner.root, [
        "status",
        "--porcelain",
        "--untracked-files=normal",
        ...scope,
      ]),
      "Source or dependencies have uncommitted changes; commit sources and match the recorded gitlink",
    );
    if (generated)
      assert(
        !gitObject(owner.root, [
          "diff",
          "--name-only",
          owner.commit,
          head,
          ...scope,
        ]),
        "Source or dependencies changed since the publication baseline",
      );
  }
}
export function verifyPrototypeSource(root, commit, id, provenance = undefined, options = {}) {
  if(provenance){
    const revision=options.revision??gitObject(root,['rev-parse','HEAD']);
    const path=inPackage(provenance.submodulePath??'',provenance.packagePath);
    const binding=provenance.bindingCommit??revision;
    try{gitObject(root,['merge-base','--is-ancestor',binding,revision]);}
    catch{throw Error('原型父仓库映射基线不属于交付历史');}
    const owner=localPackage(root,binding,path,{historical:true});
    assert(owner.mount===(provenance.submodulePath??''),'原型来源挂载路径与 gitlink 不匹配');
    if(provenance.catalogCommit){
      assert(gitObject(owner.source,['cat-file','-t',provenance.catalogCommit])==='commit','原型清单版本不可用');
      owner.revision=provenance.catalogCommit;
    }
    if(options.index){
      const staged=localPackage(root,revision,path,{index:true});
      assert(staged.mount===owner.mount&&staged.revision===owner.revision&&sameRepository(staged.links.at(-1)?.repository??gitObject(root,['remote','get-url','origin']),provenance.repository),'暂存 gitlink 与已关联的原型清单版本不匹配；请将 gitlink 与 Change 一起暂存');
    }
    return verifyOwnerSource(owner,commit,id,provenance);
  }
  assert(
    gitObject(root, ["cat-file", "-t", commit]) === "commit",
    "Unknown source commit",
  );
  let workflow;
  try {
    workflow = JSON.parse(
      gitObject(root, ["show", `${commit}:docs/project/workflow.json`]),
    );
  } catch {
    return;
  }
  if (workflow.prototype?.status !== "enabled") return;
  const source = localPackage(root, commit, workflow.prototype.packagePath);
  if (source.links.length) assertSourceEntry(sourceManifest(root, commit), id);
}
