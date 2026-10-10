# 原型管理调查依据

## 用户约束与项目决策

本次整理依据当前会话最后确定的方向：单项目单原型包，作为 monorepo 包使用；源码及静态产物由 Git 跟踪；关联和适配信息直接写入 Change；不要求截图；不提供模板服务；原型能力放在 SpecTrail 的 prototype 子目录，与 setup 子 skill 平级。

此前讨论过的忽略目录、独立上传服务、每页面完整工程、原型清单文件、独立顶层 skill 均不构成本方案要求。Impeccable 是可选开发工具，不作为协议基础。

用户在本次反馈中明确取消独立域名，确认保留归档 Git 标签和配置基线规则。为落实这一约束，本轮细化为同域同端口的 opaque iframe 沙箱，以及用户侧导出自包含 HTML；这一导出方式来自下面的浏览器实验，不将其表述为用户原话。

## 仓库调查：已确认

读取日期：2026-10-03。实现基线：`446c198`，包含已归档的工作台及小型 Change 流程优化；守护分支 `main` 当时为 `fcfa606`。新分支从最新 `origin/main` 创建，再快进纳入已交付基线，没有改写 main。

| 证据                                                                                    | 观察与影响                                                                                                                            |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `.agents/skills/spec-trail/SKILL.md`、`setup/SKILL.md`                                  | 已有主/子 skill 组织方式；现行 WorkflowConfig/ChangeState 没有原型字段。需要同步契约，不能提前写入现行状态 JSON。                     |
| `src/server/schema.ts`、`src/server/indexer.ts`                                         | Change 和 workflow 使用严格 schema；增加可选字段也会被旧实现拒绝。原型局部解析错误需与核心流程错误区分。                              |
| `src/server/git.ts`                                                                     | bare Git 采集只读 `docs/project/`，仅 fetch 分支且使用 no-tags；现有白名单不提供 HTML/JS。扩展须明确 preview 根、资源类型和归档引用。 |
| `src/server/store.ts`                                                                   | 磁盘原子快照，保留当前及两个旧快照；无法直接承诺长期历史预览。历史资源应从仍可达的 Git 引用重建。                                     |
| `src/server/config.ts`、`src/app/api/[...segments]/route.ts`                            | 主 API 的私有访问由部署网关承担；原型嵌入需要同时满足沙箱和网关认证条件。           |
| `src/components/changes.tsx`                                                            | 详情已有概览、任务、文档、证据等区域；新增 Change 内标签即可，不需要单独 Hub。                                                        |
| 本地 `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` | 当前安装 Next 文档支持 Route Handlers 自定义 Response；动态路由 params 为 Promise。实际实现仍应按安装版本指南核对路由及响应头。       |

## 一手协议资料：有条件可行

以下页面于 2026-10-03 读取。资料说明浏览器或 Git 的机制，不能代替本项目部署与端到端验证。

1. [MDN iframe](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe)：同源 iframe 同时允许脚本与保持 origin 存在逃逸父 sandbox 的风险。项目决策是不授予 allow-same-origin，并同时施加响应头限制；iframe load 事件不能证明内容成功加载。
2. [MDN 同源策略](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy)：协议、主机和端口共同决定 origin。只改 URL 路径不产生隔离。本方案的隔离来自 sandbox 形成的 opaque origin，不依赖第二个主机名或端口。
3. [MDN CSP sandbox](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/sandbox)：响应头 sandbox 可约束文档，去掉 allow-same-origin 会形成 opaque origin。本方案采用这一隔离方式，通过自包含 HTML 消除子资源网络依赖；不放宽主 API CORS。
4. [Vite 构建文档](https://vite.dev/guide/build.html)：多入口及相对基址可支持不同 HTML 入口共享构建资源。用户源码可继续采用这种结构，但本方案还要求本地离线导出为自包含 HTML；不声称 Vite 默认构建已经满足单文件交付。
5. [Git fetch](https://git-scm.com/docs/git-fetch)：分支和标签有不同的显式 refspec/自动跟随规则。项目需新增专用归档引用采集，不能假定当前 no-tags fetch 会保留已删除开发分支的原型版本。

## 同域浏览器实验：已验证机制

2026-10-03 使用当前工作区的 Node、Playwright 与 Chromium `153.0.8010.12` 运行两次独立探针。通过 `node --input-type=module` 启动临时 Node HTTP 服务器，随机绑定 loopback 端口；浏览器与服务器均在探针结束时关闭。没有改动正式应用、部署网关或原型工程，也没有生成截图。

第一次探针：父页面设置 `HttpOnly; SameSite=Lax; Path=/` 的测试登录 Cookie，iframe 使用同域 `/preview/index.html` 与 `sandbox="allow-scripts"`。记录服务器收到的请求头，比较普通 module、声明 use-credentials 的 module、默认 fetch、credentials:include fetch 和 WOFF2 字体请求。资源响应临时允许 CORS，仅用于观察，不是生产方案。

| 请求                   | 是否携带测试 Cookie | Origin / Fetch Metadata  |
| ---------------------- | ------------------- | ------------------------ |
| iframe 文档导航        | 是                  | same-origin / navigate   |
| 默认 module            | 否                  | null / cross-site / cors |
| use-credentials module | 否                  | null / cross-site / cors |
| 默认及 include fetch   | 否                  | null / cross-site / cors |
| 字体                   | 否                  | null / cross-site / cors |

结论：不能假设普通模块和字体沿用工作台登录；即使 CORS 允许读取，要求该 Cookie 的网关仍会拒绝请求。单纯给 iframe 去掉 allow-same-origin 不是完整部署方案。

第二次探针：同域 iframe 导航到需 Cookie 的自包含 HTML，脚本与样式内联，实际 WOFF2 字体和 SVG 图片使用 data URL，mock 状态在页面内存中。响应使用 Technical 中的 CSP sandbox 与 connect-src:none；无 CORS 许可。对同一资源再做匿名请求和有登录 Cookie 的直接打开测试。

| 断言                                                       | 结果       |
| ---------------------------------------------------------- | ---------- |
| 内联 module 执行、按钮计数由 0 变 1                        | 通过       |
| CSS 生效、真实字体完成加载、data 图片具有自然尺寸          | 通过       |
| 子 frame 读取父 DOM、Cookie、localStorage                  | 全部被拒绝 |
| 子 frame 的 frameElement 不可见，不能移除父 iframe sandbox | 通过       |
| fetch 工作台 API 被 CSP 阻断，服务器未收到该请求           | 通过       |
| 匿名访问 HTML                                              | 401        |
| 登录后直接打开 HTML，响应头沙箱仍限制存储访问              | 通过       |
| 整个原型运行过程请求额外资源                               | 0 次       |

这些断言验证了不增加域名或端口的可行机制。代价是要求用户侧导出内联资源、去除运行时外部模块及网络请求，且不能使用 localStorage 等 origin 存储。多个页面仍可共享源代码；独立导出 HTML 会重复部分构建内容，需要控制产物体积。这里未证明所有框架的默认输出都兼容。

## 尚未验证的实现边界

尚未实现新 schema、子 skill、正式原型导出、Git 资源端点或界面。上面的探针覆盖浏览器机制及模拟 Cookie 认证，不等于 Next.js 产品或现有私有网关的端到端验收；后续需验证真实框架导出、正式响应头和网关不覆盖 CSP、不公共缓存产物。保持一个域名、端口和原有认证入口，不再以双 Host 配置作为前置条件。

归档标签规则、基线开关与缓存可重建方案后续以真实临时远端仓库的推送、删除分支、删除标签和冷启动验证。测试失败应修订实现，不能把历史版本静默替换为当前版本，也不能通过加回 allow-same-origin 或关闭认证来容忍不符合约定的导出物。
