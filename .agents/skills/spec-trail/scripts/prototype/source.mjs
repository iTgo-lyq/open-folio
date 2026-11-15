// One object-based traversal for remote readers and synchronous local tooling.
import { safePath, commitHash } from "./contract.mjs";
const require = (value, message) => {
  if (!value) throw Error(message);
};
export const withinPackage = (path, directory) =>
  safePath(path) && (!directory || path.startsWith(directory + "/"));
export const inPackage = (directory, path) =>
  directory && path ? `${directory}/${path}` : directory || path;
export const sameRepository = (a,b) => moduleUrl(a,'').replace(/\.git$/,'')===moduleUrl(b,'').replace(/\.git$/,'');
export function moduleUrl(value, parent) {
  require(typeof value === "string" &&
    value &&
    !/[\s\\\u0000-\u001f\u007f]/u.test(value), "子模块仓库地址不合法");
  const scp = /^git@([^/:]+):(.+)$/.exec(value);
  if (scp) value = `https://${scp[1]}/${scp[2]}`;
  if (value.startsWith("ssh://")) {
    const ssh = new URL(value);
    require(ssh.username === "git" &&
      !ssh.password &&
      !ssh.port &&
      !ssh.search &&
      !ssh.hash, "子模块 SSH 地址不合法");
    value = `https://${ssh.hostname}${ssh.pathname}`;
  }
  const url = /^https:\/\//.test(value)
    ? new URL(value)
    : new URL(value, moduleUrl(parent, "").replace(/\/$/, "") + "/");
  require((/^https:\/\//.test(value) || /^\.\.?\//.test(value)) &&
    url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash &&
    !url.port, "子模块地址不受当前连接支持");
  return url.href.replace(/\/$/, "");
}
export function treeRows(raw) {
  return String(raw)
    .split("\0")
    .filter(Boolean)
    .map((row) => {
      const tab = row.indexOf("\t"),
        [mode, kind, oid, size] = row.slice(0, tab).trim().split(/\s+/);
      return { mode, kind, oid, bytes: Number(size), path: row.slice(tab + 1) };
    });
}
export function moduleMapping(raw, path) {
  const groups = new Map();
  for (const record of String(raw).split("\0").filter(Boolean)) {
    const newline = record.indexOf("\n"),
      key = record.slice(0, newline),
      value = record.slice(newline + 1);
    const match = /^submodule\.(.+)\.(path|url)$/.exec(key);
    require(match && newline > 0, ".gitmodules 格式不合法");
    const group = groups.get(match[1]) ?? {name:match[1]};
    require(!Object.hasOwn(group, match[2]), ".gitmodules 存在重复配置");
    group[match[2]] = value;
    groups.set(match[1], group);
  }
  const matches = [...groups.values()].filter((group) => group.path === path);
  require(matches.length === 1 &&
    matches[0].url, `子模块 ${path} 缺少唯一有效的 .gitmodules 地址`);
  return matches[0];
}
export const moduleAddress = (raw,path) => moduleMapping(raw,path).url;
/** @returns {Generator<any, any, any>} */
export function* packageSource(source, revision, path, repository) {
  require(commitHash(revision) && safePath(path), "原型来源版本或路径不合法");
  let prefix = "",
    mount = "",
    rest = path.split("/");
  const links = [];
  while (rest.length) {
    prefix = inPackage(prefix, rest.shift());
    const rows = treeRows(
      yield { source, args: ["ls-tree", "-lz", revision, "--", prefix] },
    );
    const row = rows.find((item) => item.path === prefix);
    if (!row)
      return {
        source,
        revision,
        packagePath: [prefix, ...rest].join("/"),
        mount,
        links,
      };
    if (row.mode === "040000" && row.kind === "tree") continue;
    if (
      !rest.length &&
      ["100644", "100755"].includes(row.mode) &&
      row.kind === "blob"
    )
      return { source, revision, packagePath: prefix, mount, links };
    require(row.mode === "160000" &&
      row.kind === "commit" &&
      commitHash(
        row.oid,
      ), `原型路径 ${inPackage(mount, prefix)} 不是常规目录或 gitlink`);
    const modules = treeRows(
      yield { source, args: ["ls-tree", "-lz", revision, "--", ".gitmodules"] },
    )[0];
    require(["100644", "100755"].includes(modules?.mode) &&
      modules.kind === "blob" &&
      modules.bytes <=
        256 *
          1024, `子模块 ${inPackage(mount, prefix)} 的 .gitmodules 缺失、非法或超限`);
    const raw = yield {
      source,
      args: [
        "config",
        "--no-includes",
        "--blob",
        `${revision}:.gitmodules`,
        "--null",
        "--get-regexp",
        "^submodule\\..*\\.(path|url)$",
      ],
    };
    const mapping=moduleMapping(raw,prefix);
    const url = moduleUrl(mapping.url, repository);
    mount = inPackage(mount, prefix);
    const link = { path: mount, repository: url, commit: row.oid };
    links.push(link);
    source = yield { enter: link, source, localPath: prefix, moduleName:mapping.name };
    repository = url;
    revision = row.oid;
    prefix = "";
  }
  return { source, revision, packagePath: prefix, mount, links };
}
