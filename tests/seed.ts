import { symlink } from "node:fs/promises";
import { join } from "node:path";
import { fixture } from "./fixture.ts";
import { DEFAULT_LIMITS, type ChangeState } from "../src/lib/model.ts";
import { diagramSvg, isolatedSvg } from "./svg-fixture.ts";
export async function seed() {
  const f = await fixture();
  const at = "2026-10-02T08:00:00+08:00",
    confirmed = { at, summary: "已确认范围", source: "测试验收记录" };
  const make = (
    id: string,
    title: string,
    patch: Partial<ChangeState> = {},
  ): ChangeState => ({
    schemaVersion: 1,
    id,
    title,
    size: "large",
    status: "active",
    stage: "execution",
    branch: `change/${id}`,
    confirmations: {
      requirement: confirmed,
      technical: confirmed,
      plan: confirmed,
    },
    tasks: {
      T1: {
        title: "读取与校验项目来源",
        status: "done",
        verification: "隔离仓库测试通过",
      },
      T2: { title: "完成文档阅读体验", status: "doing" },
      T3: { title: "验收与交付", status: "todo" },
    },
    closure: {},
    ...patch,
  });
  await f.put(
    "docs/project/specs/platform/spec.md",
    "# 工程协作\n\n让已实现的能力、正在发生的变化与交付依据保持清晰。\n\n## 能力边界\n\n每个项目由一个中心仓库承载。工作台读取已推送记录，提供持续可追溯的工程文档。\n\n| 对象 | 职责 |\n| --- | --- |\n| Spec | 当前已实现且有效的能力 |\n| Change | 目标、实现过程与验收依据 |\n\n## 阅读方式\n\n- 以完整能力路径组织文档。\n- 页面保留分支和提交来源。\n- 内容仅通过工程流程更新。\n\n[阅读权限能力](./access/spec.md) · [缺失文档](./missing.md) · [危险链接](javascript:alert(1))\n\n## 重复标题\n\n第一节内容。\n\n## 重复标题\n\n第二节内容用于定位验证。\n\n<script>window.injected = true</script>\n\n![外部图片](https://example.test/track.png)\n\n![仓库示意](./pixel.png)\n",
  );
  // Keep SVG checks on their own capability so existing navigation fixtures stay stable.
  await f.put(
    "docs/project/specs/diagrams/spec.md",
    "# 图表阅读\n\n![架构示意](./diagram.svg)\n\n[打开架构图](./diagram.svg)\n\n![隔离示意](./isolated.svg)\n\n![损坏示意](./broken.svg)\n\n![外部示意](https://example.test/svg-probe-external.svg)\n",
  );
  await f.put("docs/project/specs/diagrams/diagram.svg", diagramSvg);
  await f.put("docs/project/specs/diagrams/isolated.svg", isolatedSvg);
  await f.put("docs/project/specs/diagrams/broken.svg", "<html>not SVG</html>");
  await f.put(
    "docs/project/specs/platform/pixel.png",
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aMfcAAAAASUVORK5CYII=",
      "base64",
    ),
  );
  await f.put(
    "docs/project/specs/platform/access/spec.md",
    "# 访问与来源\n\n## 项目读取\n\n项目通过 HTTPS 从中心 Git 读取，保留可核对的来源。\n\n## 权限边界\n\n读取权限由当前凭据决定。\n\n[返回工程协作](../spec.md#能力边界)\n",
  );
  await f.put(
    "docs/project/specs/delivery/history/record/spec.md",
    "# 交付记录\n\n## 归档\n\n保留确认、验证与人工验收记录。",
  );
  await f.put(
    "docs/project/workflow.json",
    JSON.stringify({
      schemaVersion: 3,
      integrationBranch: "develop",
      releaseBranch: "main",
      prototype: {
        status: "enabled",
        packagePath: "packages/prototype",
      },
    }),
  );
  const sourceCommit = f.commit();
  const project = {
    ...f.project,
  };
  const plan =
    "# 实施计划\n\n## 执行顺序\n\n| 任务 | 前置任务 |\n| --- | --- |\n| T1 | 无 |\n| T2 | T1 |\n| T3 | T2 |\n";
  const records = [
    make("document-reader", "让工程文档成为清晰的阅读体验", {
      previews: [
        {
          id: "orders",
          title: "订单列表",
          kind: "page",
          artifact: {
            type: "git",
            path: "packages/prototype/preview/orders",
            sourceCommit,
          },
          devices: ["pc-web", "ipad", "mobile"],
        },
        {
          id: "detail",
          title: "订单详情",
          kind: "page",
          artifact: {
            type: "git",
            path: "packages/prototype/preview/detail",
            sourceCommit,
          },
          devices: ["pc-web"],
        },
        {
          id: "card",
          title: "价格卡片",
          kind: "component",
          artifact: {
            type: "git",
            path: "packages/prototype/preview/card",
            sourceCommit,
          },
          viewport: { width: 640, height: 320 },
        },
        {
          id: "missing",
          title: "待导出页面",
          kind: "page",
          artifact: {
            type: "git",
            path: "packages/prototype/preview/missing",
            sourceCommit,
          },
          devices: ["mobile"],
        },
        {
          id: "hosted",
          title: "托管 React",
          kind: "page",
          devices: ["pc-web", "mobile"],
          artifact: {
            type: "hosted",
            version: "v1",
            thumbnails: [
              {
                device: "pc-web",
                url: "https://127.0.0.1:10686/v1/pc-web.png",
              },
              {
                device: "mobile",
                url: "https://127.0.0.1:10686/v1/mobile.png",
              },
            ],
            url: "https://127.0.0.1:10686/v1/index.html",
            sourceCommit,
            digest: "sha256:" + "a".repeat(64),
          },
        },
        {
          id: "no-bridge",
          title: "未接就绪回报",
          kind: "page",
          devices: ["pc-web"],
          artifact: {
            type: "hosted",
            version: "v1",
            url: "http://127.0.0.1:10687/v1/index.html#no-bridge",
            sourceCommit,
            digest: "sha256:" + "a".repeat(64),
          },
        },
      ],
      dependsOn: ["source-connect"],
      waitingFor: { kind: "confirmation", summary: "等待阅读样式验收" },
      rework: {
        at,
        reason: "补充窄屏阅读",
        approach: "保持确认范围，完善布局",
      },
    }),
    make("source-connect", "接入中心仓库与来源追踪", {
      size: "small",
      status: "completed",
      stage: "close",
      tasks: { T1: { title: "读取已推送分支", status: "done" } },
      closure: {
        verification: {
          at,
          result: "passed",
          summary: "来源隔离与恢复验证通过",
        },
        acceptance: {
          at,
          result: "accepted",
          summary: "人工验收通过",
          source: "隔离测试项目",
        },
        specs: { at, result: "synced", summary: "已同步访问与来源" },
        archive: {
          at,
          result: "done",
          summary: "归档目录完整",
          path: "docs/project/archive/2026-10-02-source-connect",
        },
      },
    }),
    make("reading-navigation", "文档阅读与导航", {
      size: "medium",
      stage: "technical",
      confirmations: { requirement: confirmed },
      tasks: {},
      waitingFor: { kind: "confirmation", summary: "等待技术与计划确认" },
    }),
    make("default-serial", "默认串行的任务安排", {
      size: "medium",
      stage: "close",
      tasks: {
        T1: {
          title: "交付默认顺序",
          status: "done",
          verification: "默认执行验证通过",
        },
      },
      closure: {
        verification: { at, result: "passed", summary: "默认串行验证通过" },
      },
      waitingFor: { kind: "confirmation", summary: "等待默认串行验收" },
    }),
    make("delivery-review", "统一交付验收记录", {
      stage: "requirement",
      confirmations: {},
      tasks: {},
    }),
    make("layout-experiment", "导航布局实验", {
      status: "cancelled",
      cancellation: { at, reason: "收敛为统一工作台" },
    }),
    make("workspace-rollout", "工程工作台整体交付", {
      size: "xlarge",
      stage: "technical",
      confirmations: { requirement: confirmed },
      children: ["mobile-reading", "future-child"],
      tasks: {},
      previews: [
        {
          id: "orders",
          title: "订单列表",
          kind: "page",
          artifact: {
            type: "git",
            path: "packages/prototype/preview/orders",
            sourceCommit,
          },
          devices: ["pc-web"],
        },
      ],
    }),
    make("mobile-reading", "支持手机端连续阅读", {
      previews: [
        {
          id: "mobile-orders",
          title: "订单列表 · 手机适配",
          kind: "page",
          artifact: {
            type: "git",
            path: "packages/prototype/preview/orders",
            sourceCommit,
          },
          devices: ["mobile"],
        },
      ],
      size: "small",
      parent: "workspace-rollout",
      tasks: {
        T1: {
          title: "手机端布局与键盘导航",
          status: "blocked",
          reason: "等待阅读区域尺寸确认",
        },
      },
    }),
    make("invalid-state", "需要核对的来源记录"),
  ];
  for (const record of records) {
    f.git(["checkout", "develop"]);
    f.git(["checkout", "-b", record.branch]);
    const dir =
      record.status === "completed"
        ? record.closure.archive!.path!
        : `docs/project/changes/${record.id}`;
    await f.put(
      `${dir}/change.json`,
      JSON.stringify(
        record.id === "invalid-state"
          ? { ...record, schemaVersion: 2 }
          : record,
        null,
        2,
      ),
    );
    await f.put(
      `${dir}/requirement.md`,
      `# ${record.title}\n\n## 背景与目标\n\n建立清晰、可追溯的工程阅读体验。\n\n## 能力范围\n\n参考 [工程协作](../../specs/platform/spec.md)。\n\n## 验收标准\n\n1. 来源信息完整可读。\n2. 所有状态遵循工程记录。\n`,
    );
    if (record.size !== "small")
      await f.put(
        `${dir}/plan.md`,
        record.id === "default-serial"
          ? "# 实施计划\n\n## 执行顺序\n\nT1 独立完成，无前置任务。\n"
          : plan,
      );
    if (record.stage !== "requirement")
      await f.put(
        `${dir}/technical.md`,
        "# 技术方案\n\n## 数据来源\n\n从已推送提交建立一致的文档快照。",
      );
    if (record.id === "document-reader") {
      await f.put(
        `${dir}/research.md`,
        "# 阅读体验调查\n\n附加 Markdown 文档可以通过材料链接直接阅读。",
      );
      await symlink("missing-review.md", join(f.author, dir, "review.md"));
      await f.put(
        `${dir}/assets/diagram.png`,
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5d0AAAAASUVORK5CYII=",
          "base64",
        ),
      );
      await f.put(
        `${dir}/technical.md`,
        "# 技术方案\n\n## 数据来源\n\n从已推送提交建立一致的文档快照。\n\n![范围示意](assets/diagram.png)",
      );
    }
    if (
      ["document-reader", "mobile-reading", "workspace-rollout"].includes(
        record.id,
      )
    ) {
      for (const id of record.id === "document-reader"
        ? ["orders", "detail", "card"]
        : ["orders"])
        await f.put(
          `packages/prototype/preview/${id}/index.html`,
          `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:24px;font:16px system-ui;background:#f5f4ef;color:#123}button{padding:12px}h1{font-size:28px}@media(max-width:500px){h1{font-size:20px}}</style></head><body><h1>${id === "orders" ? "订单列表原型" : id === "detail" ? "订单详情原型" : "价格卡片原型"}</h1><button id="increment">0</button><output id="value"></output><script type="module">document.querySelector('button').onclick=e=>{e.target.textContent=Number(e.target.textContent)+1};window.previewReady=true;</script></body></html>`,
        );
    }
    f.commit();
  }
  f.git(["checkout", "develop"]);
  f.git([
    "checkout",
    "change/document-reader",
    "--",
    "packages/prototype/preview",
  ]);
  const currentEntries = records[0]
    .previews!.filter((e) => e.id !== "no-bridge")
    .map((e) => ({
      id: e.id,
      title: e.title,
      kind: e.kind,
      devices: e.devices,
      viewport: e.viewport,
      sourcePath: `packages/prototype/src/${e.id}.tsx`,
      description:
        e.id === "orders"
          ? "订单检索、手机适配与批量操作"
          : `${e.title}的页面细节`,
      artifact: e.id === "missing" ? undefined : e.artifact,
    }));
  await f.put(
    "packages/prototype/prototype.json",
    JSON.stringify({ schemaVersion: 1, entries: currentEntries }),
  );
  f.commit();
  await f.register(Object.fromEntries(records.map((r) => [r.id, r.branch])));
  const snapshot = await f.store.refresh(project, DEFAULT_LIMITS);
  return { ...f, project, snapshot };
}
