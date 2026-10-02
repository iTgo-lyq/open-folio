# OpenFolio

基于中心 Git 已推送记录的 Specs 与 Changes 只读工作台。界面沿用雾蓝设计室，流程继续由仓库内的 SpecTrail skill 推进；当前版本不提供原型管理或流程写入。

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
