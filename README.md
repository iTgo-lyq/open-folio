# OpenFolio

基于中心 Git 已推送记录的 Specs 与 Changes 只读工作台。界面沿用雾蓝设计室，流程继续由仓库内的 SpecTrail skill 推进；Change 内可查看页面与组件原型，工作台不写入流程或构建原型。

## 启动

需要 Node.js 24、Git、持久磁盘和仓库读取权限。

```bash
npm ci
cp openfolio.config.example.json openfolio.local.json
export OPENFOLIO_CONFIG="$PWD/openfolio.local.json"
export OPENFOLIO_DATA_DIR="$HOME/.local/share/open-folio"
npm run build
npm start
```

打开 `http://127.0.0.1:10681`。开发时使用 `npm run dev`。没有配置时显示连接引导，构建不连接远端仓库。首次打开已配置项目时自动读取一次，此后通过页面刷新获取最新已推送记录。

仓库地址必须是没有内嵌凭据的 HTTPS URL。认证使用运行服务的 OS 用户已有的 Git credential helper；不将密码、token 或私有配置提交到仓库。页面不接受任意仓库地址。

## 项目配置

`openfolio.config.example.json` 展示必要字段。可以登记多个项目，`id` 必须唯一。可选配置示例：

```json
{
  "schemaVersion": 1,
  "projects": [
    {
      "id": "example",
      "name": "Example",
      "repositoryUrl": "https://github.com/owner/example.git",
      "specBranch": "main"
    }
  ],
  "allowedOrigins": ["https://your-private-preview.example"],
  "limits": { "refreshMs": 120000, "markdownBytes": 1048576 }
}
```

`specBranch` 必须是远端默认分支的 `docs/project/workflow.json` 所声明的守护分支；未配置时尝试远端 HEAD。不能确定基线时给出提示，仍允许显式选择已推送分支阅读。Changes 跨分支聚合，始终采用其声明主分支的记录。

默认仅监听 loopback。远程访问需使用带访问控制的私有反向代理，并将实际浏览器 Origin 登记到 `allowedOrigins`，保留请求 Host／Origin。需要 IPv6 代理时可运行 `npx next start --hostname :: --port 10681`。此应用没有团队登录，不应作为无鉴权公网服务。

## 数据与运行边界

- 不使用数据库。服务维护独立 bare Git 缓存、按 blob 保存的正文和不可变快照；不会 checkout 或修改来源仓库。
- 单 Node 进程、单实例部署；数据目录有进程锁，多个服务需使用不同目录。服务重启可继续读取成功快照。
- 正文与状态绑定快照，保留最近三份。过期版本返回明确提示；刷新失败继续显示旧快照和原成功时间。
- 默认限制：120 秒刷新、1 MiB Markdown、256 KiB JSON、5 MiB 图片、256 分支、10,000 文档、64 MiB 去重正文。单文件超限仍保留来源说明，整体超限不发布部分结果。可通过 `limits` 调整同名字段。
- Git 缓存完整获取分支历史，首读成本随仓库大小增长，未启用自动 GC。停服务后可以移走整个数据目录并重新读取；历史缓存会丢失，但中心仓库不受影响。
- 仓库地址变化会隔离旧缓存；删除项目配置后 API 不再暴露其缓存。缓存包含私有仓库内容，应保留 OS 权限与磁盘访问控制。

## 阅读规则

Specs 从所选分支的 `docs/project/specs/<能力路径>/spec.md` 建立任意深度能力树。Change 状态只来自严格校验的 `change.json`；正文不覆盖流程事实。无主来源、多个主来源和非法主记录均保留诊断和原文入口。

Change 前置关系与父子关系来自 JSON，任务前置来自 Plan 的唯一“执行顺序”表。流程前提与 Git 祖先证据分开展示；未获得证据、squash 或缺失来源都不会被推定为交付可用。祖先存在也不证明代码未在之后撤销。

Markdown 不执行 HTML、MDX 或脚本。相对链接只在同一提交的工程文档清单中解析，支持普通文本和经过签名检查的仓库图片；外部图片、SVG 和未知文件不嵌入。URL 保存浏览条件，链接重新打开后读取该来源的最新缓存，而非永久固定历史。

## Change 原型预览

项目只维护一个 Git 跟踪的 monorepo 原型包，默认 `packages/prototype/`。通过 [SpecTrail 原型子 skill](.agents/skills/spec-trail/prototype/SKILL.md) 接入，复用用户的设计规范和组件库；不提供模板服务。拒绝选择记入 `docs/project/workflow.json.prototype`，不会反复启用。当前仓库包含两个页面和一个组件作为交付样例：

```bash
npm run build --workspace prototype
node .agents/skills/spec-trail/prototype/scripts/validate.mjs --browser
```

`change.json.previews` 直接记录入口 id、标题、`<packagePath>/preview/<entry>` 文件夹、页面/组件类型和适配信息。页面声明 `pc-web`、`ipad`、`mobile` 中的设备；组件也可声明 `viewport: {width, height}`。工作台按真实 CSS 尺寸渲染，再缩放适应画布；设备选项是尺寸预设，不是硬件模拟器。

每个目录必须提供自包含 `index.html`：脚本、样式和 mock 内联，图片/字体为 data URL。基础包支持共享文件内联；用户可以用自己的开发框架完成导出。普通多文件构建需要额外打包，不支持外链、动态 chunk、网络接口、持久存储或真实后端。提交源码、关联与产物后，工作台从已推送的固定提交读取，不运行仓库构建脚本。

原型与工作台共用域名、端口和私有认证。iframe 仅授予 `allow-scripts`，响应头也强制沙箱；不给 `allow-same-origin` 或 CORS。局部交互运行在页面内存中，重载即重置。直接打开原型 URL 同样不能访问工作台存储与接口。

功能开关取服务项目 `specBranch`（未配置时为远端默认分支）的最新成功采集配置，固定版本中的配置决定当时的包路径。当前基线停用后，旧链接也停止预览。验收环境可以显式把 `specBranch` 指向验证分支；Specs 的默认基线仍遵守上面的守护分支规则，不因此把验证分支认作已发布 Specs。开关变化需要刷新采集，失败时保留旧快照并显示原成功时间。

固定链接记录完整 revision，不受最近三份文档快照的保留数量限制。带原型的 Change 归档后，由 skill 推送 `spec-trail/archive/<change-id>` 标签保留交付提交；分支删除后仍可回看。标签丢失或已观察的标签被改写会明确报错，不回退最新页面。标签与关联产物都要保留在中心仓库。

默认限制为 `previewBytes: 10485760`（单 HTML）、`previewTotalBytes: 104857600`（同提交 preview 根下所有 HTML 的去重合计）和 `previewEntries: 2000`；可在服务 `limits` 调整。超限、LFS 指针、符号链接或错误导出只影响原型，已有文档继续可读。

本版缓存格式升级为 2。升级服务后执行一次项目刷新重建快照；旧缓存格式错误不是原始文档丢失。原型字段需配套升级 skill、hook 和工作台，再推送启用配置；旧客户端的严格 schema 不支持直接读取这些新字段。

## Impeccable 源码

`vendor/impeccable` 是 [个人 fork](https://github.com/iTgo-lyq/impeccable) 的 Git submodule，上游为 [pbakaus/impeccable](https://github.com/pbakaus/impeccable)。父仓库固定具体提交，拉取项目后初始化：

```bash
git submodule update --init --recursive
git submodule status
```

子模块的 `origin` 指向个人 fork。`upstream` 是本地 Git 配置，不随克隆复制；需要追踪上游时，在尚未配置该 remote 的检出中执行一次：

```bash
git -C vendor/impeccable remote add upstream https://github.com/pbakaus/impeccable.git
```

初始化后子模块按父仓库记录的提交检出。修改时先在子模块创建工作分支，将补丁提交并推送至个人 fork，再在父仓库提交更新后的 gitlink；升级同样需要显式审阅并更新固定提交。`git submodule update --init --recursive` 用于恢复已记录版本，不自动追踪远端分支最新提交。

当前只接入源码，未安装 Impeccable 依赖或运行 Live / Agent。其源码、许可及声明保持原样，并排除在 OpenFolio 自身的 TypeScript 检查范围之外。

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
