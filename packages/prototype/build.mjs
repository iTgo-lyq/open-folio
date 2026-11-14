import { mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import react from "@vitejs/plugin-react";
import { htmlIssues } from "../../.agents/skills/spec-trail/scripts/prototype/html.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const repository = resolve(root, "../..");
const manifest = JSON.parse(
  await readFile(join(root, "prototype.json"), "utf8"),
);
const boundaries = new Map(
  ["context.tsx", "personal-context.tsx", "api.ts", "prototype-frame.tsx"].map(
    (name) => [
      join(repository, "src/components", name),
      join(root, "src/mocks", name),
    ],
  ),
);
const boundaryPlugin = {
  name: "prototype-boundaries",
  enforce: "pre",
  async resolveId(source, importer) {
    if (source === "server-only" || source.startsWith("node:"))
      throw Error(`原型不得引用服务端模块：${source}`);
    const resolved = await this.resolve(source, importer, { skipSelf: true });
    if (!resolved) return null;
    if (resolved.id.startsWith(join(repository, "src/server") + "/"))
      throw Error(`原型不得引用服务端实现：${resolved.id}`);
    return boundaries.get(resolved.id) ?? null;
  },
};

const entries = await Promise.all(
  manifest.entries.map(async (entry) => {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id))
      throw Error(`无效入口：${entry.id}`);
    const source = await realpath(resolve(repository, entry.sourcePath));
    if (!source.startsWith(join(root, "src") + "/"))
      throw Error(`入口必须在原型包内：${entry.sourcePath}`);
    return { ...entry, source };
  }),
);
if (
  !entries.length ||
  new Set(entries.map((entry) => entry.id)).size !== entries.length
)
  throw Error("原型清单为空或包含重复入口");

const output = join(root, "dist");
await rm(output, { recursive: true, force: true });
for (const entry of entries) {
  const result = await build({
    configFile: false,
    root,
    base: "./",
    publicDir: false,
    plugins: [boundaryPlugin, react()],
    resolve: { alias: { "@": join(repository, "src") } },
    define: { "process.env.NODE_ENV": '"production"' },
    build: {
      write: false,
      sourcemap: false,
      cssCodeSplit: false,
      lib: {
        entry: entry.source,
        name: "PrototypeFragment",
        formats: ["iife"],
      },
      rolldownOptions: {
        onwarn(warning, warn) {
          if (warning.code !== "MODULE_LEVEL_DIRECTIVE") warn(warning);
        },
      },
    },
  });
  const files = (Array.isArray(result) ? result : [result]).flatMap(
    (item) => item.output,
  );
  const javascript = files
    .filter((file) => file.type === "chunk")
    .map((file) => file.code)
    .join("\n");
  const css = files
    .filter((file) => file.type === "asset" && file.fileName.endsWith(".css"))
    .map((file) => file.source)
    .join("\n");
  if (
    files.some(
      (file) => file.type === "asset" && !file.fileName.endsWith(".css"),
    )
  )
    throw Error(`${entry.id} 包含未内联资源`);
  const title = entry.title.replace(
    /[<>&"]/g,
    (character) => `&#${character.charCodeAt(0)};`,
  );
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${css.replace(/<\/style/gi, "<\\/style")}</style></head><body><div id="prototype-root"></div><script>${javascript.replace(/<\/script/gi, "<\\/script")}</script></body></html>`;
  const issues = htmlIssues(html);
  if (issues.length) throw Error(`${entry.id}: ${issues.join("; ")}`);
  await mkdir(join(output, entry.id), { recursive: true });
  await writeFile(join(output, entry.id, "index.html"), html);
  console.log(
    `${entry.id}: ${relative(repository, entry.source)} → self-contained HTML`,
  );
}
