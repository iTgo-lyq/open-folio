# 调查范围与结论

2026-10-09，基于已确认的 [Requirement](./requirement.md) 调查。调查分支为 `codex/project-ui-library`，已合入 `origin/main` 的 `314e3ed`；本轮仅修改 Change 文档，没有实施产品代码。

| 问题 | 证据与结论 | 结论等级 |
| --- | --- | --- |
| 当前原型是否已支持托管地址 | `src/server/previews.ts`、原型共享校验器只接受包内自包含 HTML；当前描述没有外部 URL、发布版本或源码提交字段 | 已确认，需要新增契约 |
| 当前总览是否只看 main | `src/server/prototypes.ts` 遍历各 Change 主记录，以 `kind:path` 聚合，按 Change 状态及 id 排序；不是 main 当前入口清单 | 已确认，需要替换目录来源 |
| 能否直接采集包内描述文件 | `src/server/git.ts` 当前采集范围为 `docs/project/`；新描述文件需在 main 固定提交中做受限读取 | 已确认，需要扩展采集 |
| 是否仍有旧链接需要保留 | 现有固定预览路由与 `spec-trail/archive/<id>` 标签共同保留 Git 交付；已有归档不能改写成新格式 | 已确认，保留兼容读取 |
| 当前截图器能否直接截图托管页面 | 截图 Chromium 采用离线环境与网络拦截，只接受指定 HTML；普通多资源托管页面无法直接复用 | 已确认，推荐宿主提供截图引用，Git 兜底保留现有截图器 |
| 当前原型是否可选 | 主 skill 允许无原型推进；子 skill 已区分未选择、disabled、pending、enabled；但交付协议仍强制单 HTML、禁止独立清单 | 已确认，调整建议和协议，保留可选性 |
| UI 包从什么地方开始复用 | 主应用已有按钮样式、Change 状态 Badge、通用 Empty；业务状态和数据仍由主应用决定 | 已确认，首批抽取基础组件，不引入业务层 |
| 前端规范从哪里建立 | 现有设计依据主要在应用样式与原型包 DESIGN；缺少独立 UI 包及统一前端开发入口 | 已确认，建立项目级指引，公共 token 和实际组件用法由 UI 包与预览示例承载 |

# 构建工具与依赖

当前项目声明 Node `>=24 <25`，调查环境为 Node `24.21.0`、npm `11.19.0`；主应用锁定 Next `16.3.7`、React/React DOM `19.3.0`、TypeScript `5.9.3`、Playwright `1.63.0`。

只读查询：

```bash
npm view vite version engines --json
npm view @vitejs/plugin-react version peerDependencies engines --json
npm view @vitejs/plugin-react@6.1.2 peerDependenciesMeta --json
```

结果：Vite `8.3.4` 与 React 插件 `6.1.2` 的 Node 要求均为 `^20.19.0 || >=22.12.0`；插件支持 Vite `^8.0.0`，另外列出的编译器相关 peer 均为可选。当前 Node 满足条件。采用这组精确版本作为独立 UI 预览的候选；尚未在本分支安装和运行构建，执行时必须通过真实安装、类型检查与生产预览验证。

按 AGENTS 要求读取主工作区已安装 Next 包内的 `transpilePackages`、Server/Client Components、CSS 指南：当前 Turbopack 会自动处理 workspace 包；不因为新增 workspace 就无条件增加 `transpilePackages`。公共 CSS 可以由应用入口导入；生产构建的 CSS 顺序仍需验证。UI 包的交互组件须正确保留客户端边界。

# 外部模块与 iframe 隔离实验

在两个随机本地 HTTP 端口分别启动父页面和静态原型页面，用现有 Playwright 的 Chromium 执行；启用 `chromiumSandbox: true`，没有关闭浏览器沙箱。子页面加载普通 ESM 文件，安装按钮事件，并检查是否能读取父页面 DOM、写入 localStorage。

| iframe 配置 | 静态 JS 响应 | 观察 |
| --- | --- | --- |
| `allow-scripts` | 无 CORS | 模块被浏览器拒绝，错误明确指出请求 Origin 为 `null`；未安装交互 |
| `allow-scripts` | `Access-Control-Allow-Origin: *` | 模块加载、按钮点击成功；父页面 DOM 与 localStorage 均不可访问 |
| `allow-scripts allow-same-origin` | 无 CORS，父子不同 origin | 模块与点击成功，父 DOM 不可访问，但子页面可使用 localStorage |

据此推荐保留 `allow-scripts`，由宿主为演示静态资源提供无需 Cookie 的 CORS 响应，不为消除构建配置问题直接扩大 sandbox 权限。实验验证的是普通 ESM 和局部交互，尚未证明具体宿主的 React 构建、字体、动态 chunk、CSP、登录或 CDN 配置可用；这些由发布契约和端到端验收覆盖。

浏览器不能把跨域 iframe 的 `load` 事件当作页面 HTTP 成功或应用可交互的证明。建议宿主可提供带请求标识的 ready/error 消息，工作台核对发送窗口、协议和版本；没有信号时明确显示未确认，不能误报 404、鉴权失败或成功。

# 一手资料

以下资料于 2026-10-09 读取，属于公开技术依据，不代表已接通具体宿主。

- [Vite Getting Started](https://vite.dev/guide/)：支持 React/TypeScript、workspace 外部源码解析和常规 dev/build/preview；结合 npm 精确版本查询选择候选工具链。
- [MDN iframe](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe)：sandbox 权限、同源能力与加载事件限制；与本地浏览器实验相互核对。
- 项目已安装 Next 文档：`node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/transpilePackages.md`、`01-app/01-getting-started/05-server-and-client-components.md`、`01-app/01-getting-started/11-css.md`。这是当前安装版本的行为依据，不以其他版本经验代替。

# 未覆盖的外部事实

宿主上传协议可使用独立测试宿主验证，但不能将该测试等同于某个生产存储已经接通；实际部署者需配置静态资源访问、允许嵌入的工作台来源、版本保留策略。任意私有登录系统与第三方 Cookie 流程不属于已经验证的能力。

基础阶段未依赖个人素材；后续用户追加授权试用 shadcn/shadcnuikit，结果见下。

# 2026-10-09 全局工具与组件适配实证

已确认：按 [官方 shadcn skill 指引](https://ui.shadcn.com/docs/skills) 安装 `shadcn-ui/ui@shadcn` 至个人全局 skills；按 [官方 MCP 指引](https://ui.shadcn.com/docs/mcp) 配置 stdio 服务。真实 initialize、tools/list、get_project_registries 调用成功。CLI info 定位 packages/ui，docs/view 返回 Card、Tabs；add 因本机 npm 用户级 allow-scripts 配置拒绝项目安装，使用 CLI view 的源代码适配入库。包的 Radix 依赖用独立 npm 用户配置安装成功，未修改用户 npm 配置。

已确认：[shadcnuikit MCP](https://shadcnuikit.com/mcp) 的 HTTPS/Bearer 接入成功，真实检索并取得 [card5](https://shadcnuikit.com/components/card/5) 和 [tabs1](https://shadcnuikit.com/components/tabs/1) 源码。这是组件区的基础示例，未导入付费 dashboard。源码适配后保留公共主题、可访问语义和来源；工具返回的 kit style 与项目不同，依其说明使用项目基础组件。个人配置中保存认证，仓库及产物扫描无密钥。

[Codex MCP 配置文档](https://developers.openai.com/codex/mcp) 确认个人配置由 App/CLI 共用。配置成功后，新会话或重启加载 MCP；本会话通过同一协议直接完成真实调用验证，不宣称工具已热加载至会话工具列表。

已验证：新增组件与独立预览生产构建通过；预览实际操作覆盖搜索、代码切换、方向键、跳过禁用项、异步状态和 320px 布局。Next 主应用生产构建和类型检查通过，确认公共入口中的客户端组件没有破坏主应用消费。
