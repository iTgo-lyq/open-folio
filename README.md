# OpenFolio

基于中心 Git 已推送记录的 Specs 与 Changes 只读工作台。界面沿用雾蓝设计室，流程继续由仓库内的 SpecTrail skill 推进；Change 内可查看页面与组件原型，工作台不写入流程或构建原型。

## 启动

需要 Node.js 24、Git、持久磁盘和仓库读取权限；原型卡片截图还需要 Playwright Chromium 与可用的 OS 沙箱。

```bash
npm ci
npx playwright install --with-deps chromium
npm run build
npm start
```

打开 `http://127.0.0.1:10681`。开发时使用 `npm run dev`。空配置显示连接引导，构建不创建配置文件，也不连接远端仓库。首次打开已配置项目时自动读取一次，此后通过页面刷新获取最新已推送记录。

仓库地址必须是没有内嵌凭据的 HTTPS URL。认证使用运行服务的 OS 用户已有的 Git credential helper；不将密码、token 或私有配置提交到仓库。页面不接受任意仓库地址。

## 项目配置

不设置环境变量即可启动。`OPENFOLIO_DATA_DIR` 默认为运行服务用户的 `~/.local/share/open-folio`；配置文件默认位于该目录的 `config.json`。`OPENFOLIO_CONFIG` 可指定其他配置文件路径，相对路径以服务工作目录为基准，仍只接受路径。

首次读取配置时自动创建缺失的父目录和空文件 `{"schemaVersion":1,"projects":[]}`，不会覆盖已存在文件。路径错误、权限不足或已有文件损坏时显示错误，修复后重新加载。配置保存需要文件所在目录可写，采用原子替换；部署时可挂载整个数据目录，同时持久化配置和缓存。

例如：`OPENFOLIO_DATA_DIR=/var/lib/openfolio npm start` 使用 `/var/lib/openfolio/config.json`；同时设置 `OPENFOLIO_CONFIG=/etc/openfolio/config.json` 则使用指定文件，缓存仍在数据目录。

`openfolio.config.example.json` 展示必要字段。可以登记多个项目，`id` 必须唯一。可选配置示例：

```json
{
  "schemaVersion": 1,
  "projects": [
    {
      "id": "example",
      "name": "Example",
      "repositoryUrl": "https://github.com/owner/example.git",
      "specBranch": "main",
      "prototypeOrigins": ["https://static.example.com"]
    }
  ],
  "limits": { "refreshMs": 120000, "markdownBytes": 1048576 }
}
```

`specBranch` 必须是远端默认分支的 `docs/project/workflow.json` 所声明的守护分支；未配置时尝试远端 HEAD。不能确定基线时给出提示，仍允许显式选择已推送分支阅读。Changes 跨分支聚合，始终采用其声明主分支的记录。

默认仅监听 loopback。远程访问可通过反向代理提供，需要 IPv6 监听时可运行 `npx next start --hostname :: --port 10681`。此应用没有团队登录，访问控制由部署环境提供。

## 数据与运行边界

- 不使用数据库。服务维护独立 bare Git 缓存、按 blob 保存的正文和不可变快照；不会 checkout 或修改来源仓库。
- 单 Node 进程、单实例部署；数据目录有进程锁，多个服务需使用不同目录。服务重启可继续读取成功快照。
- 正文与状态绑定快照，保留最近三份。过期版本返回明确提示；刷新失败继续显示旧快照和原成功时间。
- 默认限制：120 秒刷新、1 MiB Markdown、256 KiB JSON、5 MiB 图片、256 分支、10,000 文档、64 MiB 去重正文。单文件超限仍保留来源说明，整体超限不发布部分结果。可通过 `limits` 调整同名字段。
- Git 缓存完整获取分支历史，首读成本随仓库大小增长，未启用自动 GC。停服务后可以移走整个数据目录并重新读取；历史缓存会丢失，但中心仓库不受影响。
- 仓库地址变化会隔离旧缓存；删除项目配置后 API 不再暴露其缓存。缓存包含私有仓库内容，应保留 OS 权限与磁盘访问控制。

## 阅读规则

Specs 从所选分支的 `docs/project/specs/<能力路径>/spec.md` 建立任意深度能力树。Change 状态只来自严格校验的 `change.json`；正文不覆盖流程事实。无主来源、多个主来源和非法主记录均保留诊断和原文入口。

Change 前置关系与父子关系来自 JSON，任务默认按编号数值递增串行，Plan 中的显式“执行顺序”表可覆盖默认安排；无效的显式表保留诊断。流程前提与 Git 祖先证据分开展示；未获得证据、squash 或缺失来源都不会被推定为交付可用。祖先存在也不证明代码未在之后撤销。

Markdown 不执行 HTML、MDX 或脚本。相对链接只在同一提交的工程文档清单中解析，支持普通文本和经过签名检查的仓库图片；外部图片、SVG 和未知文件不嵌入。URL 保存浏览条件，链接重新打开后读取该来源的最新缓存，而非永久固定历史。

## UI 组件库

`packages/ui` 导出 `@open-folio/ui` 组件与公共样式，主应用和独立组件预览共用源码。运行 `npm run ui:dev` 浏览组件，`npm run ui:build` 构建，`npm run ui:preview` 查看产物。预览无需 OpenFolio 服务或项目配置，也不进入原型总览；维护规则在根 AGENTS.md，包用法见 [UI README](packages/ui/README.md)。

## 项目页面与 Change 预览

「原型」总览只读取被管理项目 main 的 `<packagePath>/prototype.json`，按名称、说明和设备发现当前页面并直接打开。入口不需要关联 Change；删除 main 清单项后移出总览，开发分支和单独上传不会改变当前展示。无 main、配置未启用、清单缺失或损坏时明确提示，不从 Change 拼接列表。

原型协作通过 [SpecTrail 原型子 skill](.agents/skills/spec-trail/prototype/SKILL.md) 可选接入。宿主维护原型源码、mock 和构建，可使用 React 及自己的组件库；宿主实现发布协议并维护版本保留。OpenFolio 只读固定地址、版本、digest 和 sourceCommit，不安装依赖、不运行第三方构建、不接收上传。已登记参考原型不会因源码或样式变化而自动重新发布。

宿主地址必须是无凭据、无查询令牌的固定 HTTPS URL，并在服务项目的 `prototypeOrigins` 中批准。托管页面须使用独立于工作台的静态 origin。iframe 仅授予 `allow-scripts`，不开放同源、存储、弹窗或顶层跳转，使用 no-referrer。宿主须允许嵌入，并为 ESM、动态模块和字体提供适配不透明来源的 CORS；演示使用内存状态和 hash/memory 路由。工作台不代理登录或资源请求。可选就绪桥接确认应用可交互；超时仅提示未确认，保留画布及独立打开入口。

宿主可发布每个声明视口的 PNG/WebP 缩略图；浏览器直接加载批准来源，缺失或失败显示占位，仍可打开页面。OpenFolio 服务不联网截图远端页面。Git 自包含 HTML 是显式兜底：当前产物保存在包内 preview，Change 复制一份到自身 previews 目录，归档时一同移动。普通多文件 React dist 使用托管链路。

Change 页面的原型模块展示本次固定交付，未合入 main 也可分享。固定链接含记录提交和入口；总览的固定链接定位 main 历史中的清单提交。`spec-trail/archive-v2/<id>` 归档标签保留 Git 记录，宿主另行保证外部版本持续可用。当前 main 停用原型后，旧链接也停止展示；标签被改写不重新信任。

旧 HTML 引用使用子 skill 的 `migrate.mjs --change <id>` 一次性迁移：从原保留提交复制字节到 Change 存档，更新为 artifact 引用，提交后建立新的 archive-v2 标签。运行时不支持旧 previews.path；旧格式固定链接需换成迁移后的链接，原 Git 历史与标签仍保留。

当前仓库已登记三个既有 Git 原型作为示例，合入 main 后进入总览；UI 预览单独维护。宿主侧验证命令：

```bash
npm run build --workspace prototype
node .agents/skills/spec-trail/prototype/scripts/validate.mjs --browser
```

默认限制：`previewBytes` 单 HTML 10 MiB、`previewTotalBytes` 同提交相关目录去重 HTML 合计 100 MiB、`previewEntries` 2000；JSON 清单沿用受限读取。超限、LFS 指针和符号链接均不给可执行预览。快照格式为 3；版本 2 缓存升级时保留已观察的 archivePins，刷新后建立 main 清单，不清空 pin 来重新接受标签。

## Change 状态操作

Agent 使用主 skill 的语义脚本维护 `change.json`，由脚本生成统一的 UTC 毫秒时间、检查阶段前置并写入状态；工作台继续只读。完整命令与实际确认/验证要求见 [状态操作说明](.agents/skills/spec-trail/references/state-commands.md)。

```bash
node .agents/skills/spec-trail/scripts/change.mjs --help
node .agents/skills/spec-trail/scripts/change.mjs show --change 实际-change-id
```

## 验证

```bash
npm test
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
npm run format:check
```

浏览器测试用临时作者仓库、中心 bare 远端和独立缓存建立真实读取链路，运行在 10682，不依赖用户凭据。测试用 file 协议只能通过内部构造器注入，生产配置无法启用。已有 Chromium 时可用 `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 指定其路径。截图输出到忽略目录 `artifacts/`，测试数据不会出现在真实项目中。

### 原型截图缓存

Git 兜底卡片进入可视区域后，服务从同一固定 Git 版本读取 HTML，在空白、离线的 Chromium 沙箱中截图。页面按首个声明设备，组件按声明尺寸；设备筛选会同步图片与打开预览的尺寸。图片保持原始比例，仅显示首屏，不执行交互验收或整页长截图。截图不写回 Git，也不要求 Agent 提交图片。

服务按项目/仓库、HTML 内容、视口与渲染器版本缓存 JPEG，因此无关文档提交和服务重启可复用结果，内容或尺寸变化自动生成新图。同键请求合并，最多 2 个浏览器、24 个排队任务，排队 30 秒或生成 12 秒超时后可重试。失败退避 5 秒，单图最多 4 MiB；`OPENFOLIO_DATA_DIR/thumbnails` 为私有可重建缓存，总上限 100 MiB、闲置 7 天后按需清理。删去该目录可重建；缓存清理不改变原型历史。

图片响应使用私有 ETag 再验证。每次请求和生成完成后检查当前开关、关联与历史引用，缓存不绕过停用或项目权限。浏览器不带用户登录态，阻断网络、文件导航和持久存储，不运行仓库安装/构建脚本。Chromium 缺失或 OS 沙箱不可用时只显示截图失败，禁止改用 `--no-sandbox`；部署需安装浏览器依赖并允许非 root Chromium 沙箱。更新 Playwright/渲染设置时同步提升截图渲染器版本使旧缓存失效。
