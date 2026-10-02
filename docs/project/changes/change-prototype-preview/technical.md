# Change 原型关联与预览技术方案

## 方案

### 总体路径

依据 [Requirement](./requirement.md)，原型是项目内一个 Git 跟踪的 monorepo 包。用户 Agent 在其中开发并生成静态产物，`change.json.previews` 引用输出目录；OpenFolio 从已推送提交读取并通过独立 origin 展示。

```text
技术方案讨论 → 读取项目选择 → SpecTrail prototype 子 skill
                                  ↓ 用户同意后接入
单一 prototype 包：共享源码 → 本地构建 → preview/ → Git 提交并推送
                                                     ↓
Change 主来源提交 → 关联与包配置校验 → Git blob 静态读取
                                                     ↓
工作台 Change 详情 ← 版本与入口元数据     独立 origin iframe
```

服务端不 checkout 运行用户工程，不执行安装、构建、Git hooks 或 submodule 初始化。Git 是持久来源，磁盘缓存是可重建派生数据，不引入数据库。以下 JSON 是待实现契约示例，本次文档准备不把新字段写入现行配置或当前 Change 状态。

### 项目接入配置与子 skill

扩展已有 `docs/project/workflow.json`，保持 `schemaVersion: 1`，增加可选 `prototype`。缺失代表未选择；已有文件的守护分支字段与含义不变。

```ts
type PrototypeConfig =
  | { status: "disabled"; decision: Decision }
  | { status: "pending"; packagePath: string; decision: Decision }
  | { status: "enabled"; packagePath: string; decision: Decision };
type Decision = { at: string; summary: string; source?: string };
// at 使用带时区的 ISO 8601；summary 记录真实用户选择，不推断同意。
```

默认 `packagePath` 为 `packages/prototype`，可采用项目既有 workspace 布局。必须是仓库内规范相对目录，不可为仓库根、文档目录、依赖目录或符号链接；配置不支持多个包或模板 id。静态根固定为 `<packagePath>/preview`，避免维护两个可漂移的根目录。

本地 Agent 先读当前分支配置并与配置基线核对；如果已有拒绝决定，不得因为切换到旧分支而自动重新提议。项目配置基线使用服务端项目已有 `specBranch`，未指定时使用远端默认分支，来源须明确显示。OpenFolio 以最近成功采集的该基线决定是否开放追踪；基线缺失或非法时关闭预览并诊断，不能取任意分支的 enabled 兜底。新接入决定尚未推送到配置基线时，提示需要发布配置；实现验证可显式配置验证分支。

预览的包路径和契约仍从原型固定提交中的配置读取。当前基线的禁用决定是额外的访问开关，对历史版本同样生效，不篡改历史配置；重新启用后可读取旧提交中当时有效的包路径。这区分“当时的产物结构”和“当前是否启用追踪”，也避免旧链接绕过拒绝决定。配置仅为功能开关，私有权限仍由部署认证边界保证。

原型子 skill 位于 `.agents/skills/spec-trail/prototype/SKILL.md`，与 `setup/` 平级；配套基础材料与初始化/校验脚本放在子目录内。主 skill 增加技术阶段入口和共享类型摘要，通过相对路径加载完整规则；分发 SpecTrail 时连同子目录交付，不安装新的顶层 skill。

接入按如下状态转换进行：

| 当前配置        | 用户或操作                                 | 结果                                                                |
| --------------- | ------------------------------------------ | ------------------------------------------------------------------- |
| 缺失            | 明确拒绝                                   | 写 disabled 与选择依据；停止接入及重复提议。                        |
| 缺失或 disabled | 明确同意或要求重新启用                     | 写 pending，确定唯一包位置，复用或初始化工程。                      |
| pending         | 包结构、设计规范引用和基础静态构建检查通过 | 写 enabled；与相关文件一起提交并推送。                              |
| pending         | 初始化或验证失败                           | 保留 pending 和现场，向用户说明失败；不写 enabled、不覆盖已有工程。 |
| enabled         | 后续技术方案需原型                         | 直接使用原包，不重复安装或创建第二套标准。                          |
| enabled         | 用户明确停用                               | 写 disabled；保留历史源码、关联和产物。                             |

初始化幂等：先检查目录、workspace、包名和已有规范，已有兼容工程只补充缺失约定；内容冲突先报告具体差异，不重写用户文件。共享设计规范作为 `DESIGN.md` 引用的权威来源，包内只补充原型约束。源码优先 workspace 依赖现有组件库；需要后端或运行时耦合的组件使用轻量适配/mock，且注明差异，不伪称原组件已验证。

### 原型包与静态产物

```text
packages/prototype/
  package.json                 # 独立 workspace 包；不成为生产应用运行依赖
  AGENTS.md                    # 开发、构建、关联及交付规则
  DESIGN.md                    # 引用项目规范，补充原型特有约束
  src/                         # 用户自行组织；页面、组件、主题可复用
  preview/
    assets/                    # 多入口共享的构建资源
    order-list/index.html
    order-detail/index.html
    price-card/index.html
```

源码目录和构建工具不属于运行时协议。基础示例可使用 Vite 多入口构建和相对 base；现有工程只需符合相同输出约定。普通 HTML 也有效，不强制 React、组件库或 Impeccable。

所有运行依赖均在 preview 根内，使用相对 URL；允许 `../assets/` 等经浏览器解析后仍在根内的引用。使用 hash/memory 路由或真实静态 HTML，服务不实现任意路径回退。模拟数据内联或随包输出，禁止依赖开发服务器、真实业务接口、外部 CDN、密钥和环境变量注入。产物必须能脱离源码目录运行。

Git 跟踪源码、锁文件、必要设计文档和 preview 输出；不跟踪 node_modules、工具缓存、开发日志和 sourcemap。构建后由 Agent 检查关联目录、资源与已声明视口，并提交源码和产物。未改动的输出可以沿用；服务不能仅根据提交时间判断构建过期，也不声称证明了源码与产物一致。整包构建时保留仍被其他活动 Change 引用的入口；删除入口前检查引用，历史版本由归档提交保留。

### Change 关联契约

```json
{
  "previews": [
    {
      "id": "order-list",
      "title": "订单列表",
      "path": "packages/prototype/preview/order-list",
      "kind": "page",
      "devices": ["pc-web", "ipad", "mobile"]
    },
    {
      "id": "price-card",
      "title": "价格卡片",
      "path": "packages/prototype/preview/price-card",
      "kind": "component",
      "viewport": { "width": 640, "height": 320 }
    }
  ]
}
```

`previews` 可省略或为空；非空数组保留展示顺序。id 为 Change 内唯一 kebab-case，标题非空，path 为仓库相对目录且必须在已配置 preview 根下，目录中必须有常规 blob `index.html`。拒绝绝对路径、URL、查询串、fragment、反斜杠、控制字符、空段、`.`、`..` 和目录外引用。不提供自定义远程预览 URL。

`kind` 仅为 page/component。page 必须有非空且去重的 devices；component 在 devices 与 viewport 中二选一。viewport 的 width/height 是 1–4096 的整数 CSS 像素，禁止同时声明两种显示模式。设备枚举仅支持 pc-web、ipad、mobile，显示名为 PC Web、iPad、移动设备。默认画布分别为 1440×900、834×1194、390×844 CSS px，设备内可切换横竖方向；这些是预览预设，不能宣称模拟了真实硬件、触控或浏览器。

关联字段、已发布的 skill 类型、hook 校验和服务 schema 同步扩展。hook 校验暂存版本的字段、配置和入口存在性，不读取未暂存工作区来证明可交付；资源超限等服务部署约束由服务明确诊断。禁用或 pending 时拒绝新增或改写非空关联，允许删除旧关联及编辑普通流程字段，不因停用就锁死后续 Change 推进。历史关联仍可被读取为元数据，不能触发实际预览。

已知扩展字段单独解析：原型字段非法时保留 Change 核心流程、文档和原始数据入口，报告具体关联错误并禁用该入口，不让整个 Change 从工作台消失；原有未知核心字段仍严格校验。不以 Markdown 修复或覆盖 JSON 关联。

### Git 版本固定与归档

活动预览在服务采集时先选定 Change 主来源分支及完整 commit id，再从同一提交读取 Change、workflow 和 preview 树。包内所有资源固定到这个提交；UI 刷新后只通过新的入口描述整体切换，不在文件请求时重新解析分支 HEAD。

固定链接表达 project、Change id、完整 revision、preview id 以及设备/视口选项，不接受任意仓库 URL。历史 revision 必须可从该项目当前已拉取的允许分支或专用归档引用到达，并在该提交中找到匹配的合法 Change；只知道 SHA 不是读取权限。超出允许来源或丢失的版本明确不可用。

对携带非空关联的 Change，归档子流程创建保留引用 `refs/tags/spec-trail/archive/<change-id>`，指向同时包含归档 JSON、配置及静态产物的归档提交。标签不是另一份原型元数据，所有原型详情仍在该提交的 Change 中。无关联的旧 Change 不要求补标签。

标签首次创建后禁止自动覆盖；同名且同提交可幂等重试，同名异提交报告冲突。分支与标签优先原子推送；远端不支持时按分支、标签顺序推送并验证，任一步失败不得报告完成归档交付，也不伪造远端状态。OpenFolio 对非空关联的归档记录只有在标签目标包含一致的 id、归档路径及 completed 记录时才接受其预览版本。标签缺失时普通归档文档仍可读，但预览显示缺少固定引用。

扩展现有 fetch：分支保持原策略，显式只拉取 `refs/tags/spec-trail/archive/*` 到服务专用远端命名空间，不自动拉取全部标签。每次成功刷新核对远端引用清单，已删除引用不因本地残留或缓存而继续被接受。服务不向用户仓库写标签；创建和推送属于 Agent 的归档流程。共享源码继续演进不改变标签目标，归档目录只读。人工强删或改写远端引用无法保证永久回看，应诊断而非回退最新版。

### Git 资源采集与缓存

采用两阶段读取：先沿用文档快照确定配置和 Change 关联，再按有效关联收集对应提交中的完整 preview 树。保留共同资源根，不把单个入口目录当资源边界，否则 `../assets/` 会失效。不会为了预览抓取源码、依赖或整个仓库文件系统。

仅读取常规 Git blob，拒绝 symlink、gitlink 和 Git LFS 指针代替实际资源。资源类型明确允许 HTML、CSS、JS/MJS、JSON、常见图片及 WOFF/WOFF2/TTF/OTF 字体；不提供任意文本、源码、配置、压缩包、执行文件或目录列表。SVG 作为受限图片资源，直接打开同样施加文档安全头。类型与 nosniff 一起保证浏览器不猜测执行格式。

增加可配置的资源限额，初始默认单 blob 10 MiB、单提交 preview 根 100 MiB、2000 个文件；超限只使对应原型不可用，不拖垮全部文档刷新。读取受现有 Git 超时、并发与错误脱敏约束。入口缺失、LFS 指针、非法资源和超限均给出项目/入口级诊断。

缓存键包含仓库指纹、完整提交、包根、blob id 和缓存格式版本，文件权限沿用私有缓存。新旧快照原子切换。历史预览缓存可按容量回收，需要时从仍可达的 Git 引用重建，不依赖当前仅保留三个文档快照的策略。每次响应先核对项目仍配置、原型功能仍允许、提交仍属于合法来源；撤销配置、仓库替换和最新成功刷新确认的引用删除优先于缓存命中。刷新失败可保留先前成功快照并标记时间，不宣称获得最新撤销信息。

### 内建静态服务与浏览器隔离

复用一个 OpenFolio 应用和 Git 缓存，通过独立 origin 提供只读资源，不另发一个原型服务包。服务端配置新增可选 `preview.origin`，必须与所有工作台 origin 不同。工作台 Host 只提供现有 UI/API；预览 Host 只提供预览路由和必要健康检查，其他路径包括工作台、`/_next` 与 `/api` 均拒绝。必须在路由之前按受信配置分流，不能仅靠某个 API 的 Origin 校验。反向代理不得把两类 Host 归一为同一个浏览器 origin。

本地开发可将 `127.0.0.1:10681` 作为工作台，`localhost:10681` 作为显式预览 Host，二者到达同一个进程；启用后预览 Host 从工作台默认允许列表移除，启动检查冲突。云端采用两个 HTTPS 主机名指向同一应用。外部 `Host`/转发头的信任边界写入部署约定，不接受客户端任意伪造的转发 origin。没有有效隔离配置时文档功能仍可用，原型显示配置缺失，不降级成同源执行。

私有云部署必须让两个 Host 经过认证，且采用 host-only、HttpOnly 的认证 cookie，不向原型泄露工作台凭据；当前单用户实例内的项目共用既有访问边界，不新增租户权限模型。本地无认证模式仅绑定 loopback。跨站点第三方 cookie 限制可能使嵌入登录失败，部署推荐同站点不同子域；必要时提供由工作台发起的预览域登录入口，不能开放匿名资源来绕过登录问题。

工作台 API 继续拒绝预览 origin 和跨站写入，不为预览放宽 CORS。静态路由仅接受 GET/HEAD，不提供修改操作；直接访问也经过部署认证与资源范围校验。URL 形如 `/preview/<project>/<revision>/<change>/<preview-id>/<root-relative-asset>`，入口描述返回落在该前缀下的 `order-list/index.html`，相对共享路径落在同一前缀。目录归一化与校验先于缓存读取；原始编码越界、双重编码、反斜杠等单独拒绝，不进行跨边界重定向。

iframe 使用 `sandbox="allow-scripts allow-same-origin"`，只在与工作台不同的 origin 上允许脚本保持其自身 origin，以支持标准构建的 module、字体及同源 mock 读取。HTML 响应同时设置 CSP sandbox，不能仅由 iframe 属性保证。CSP 基线如下，实际来源由部署配置精确生成：

```text
sandbox allow-scripts allow-same-origin;
default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self';
object-src 'none'; frame-src 'none'; worker-src 'none';
base-uri 'none'; form-action 'none'; frame-ancestors <workbench-origins>;
```

不启用 unsafe-eval、弹窗、下载、顶层导航、业务网络调用或 Service Worker；资源端额外拒绝 Service Worker 脚本请求。Permissions-Policy 禁用相机、麦克风、定位等设备能力。全部静态响应使用正确 MIME、`X-Content-Type-Options: nosniff`、`Referrer-Policy: no-referrer` 和 `Cache-Control: private, no-store`，不放入 Next public 目录或公共 CDN。Git 缓存可以复用，浏览器与代理不得绕过访问门槛缓存私有产物。

此隔离保护工作台，不把任意原型变成可信应用，也不承诺阻止原型自身在 iframe 内导航或防御浏览器漏洞。原型包不得放秘密；界面不接收原型消息来执行父页面操作。预览域只提供同一私有实例授权范围内的静态产物。

### 工作台入口与可读错误

在 Change 详情现有标签中增加“原型”，入口列表取关联数组顺序，首次选第一项，后续从 URL 恢复。URL 增加 preview/device/orientation/revision 查询参数；失效的选择回到第一个有效项并说明，不错误套用其他 Change 的入口。无关联时显示空态；项目拒绝或待初始化时说明原因，不提供可绕过选择的启用按钮。

页面固定 iframe 的 CSS 宽高，再通过外层缩放适应画布。工具栏同时显示设备/自定义尺寸和缩放比例，提供适应画布与 100% 查看；组件居中，超过容器可滚动。使用可访问的 iframe title 和键盘控件，保留原抽屉的返回与焦点行为。

入口描述由受保护的主 API 返回：包含提交、关联、视口和经过校验的预览 URL/不可用原因。先完成元数据和资源存在性检查，再创建 iframe。iframe load 不作为构建成功或运行验证的证据；运行错误由浏览器验证与原型包交付检查发现。入口加载、认证失败、配置缺失、产物不可用分别展示，不自动构建或改写 Change。

## 影响与取舍

原有 `schemaVersion: 1` 增加可选字段，新客户端读取旧数据；旧版本严格 schema 不兼容新增字段，发布需先升级主 skill、hook 和服务，再启用配置并写入关联。回退旧应用前移除或恢复旧契约提交，不能声称任意降级兼容。缓存格式升级可丢弃旧派生缓存重建，归档 Git 引用保留。

项目级启用基线与 Change 来源分支分开，避免一个旧分支重启被拒绝的功能；代价是首次接入需把配置发布到服务认定的基线。独立 origin 增加一个主机名配置，但复用同一服务与认证设施，避免同源执行风险及 opaque origin 对模块、字体和认证的额外兼容问题。

归档标签保留一次交付的所有静态资源，也保留整包当时的源码；代价是 Git 历史持续占用空间。首版不引入制品清理、存储去重产品、构建证明清单或原型版本数据库。服务可做 blob 缓存去重，不改变仓库协议。

停用原型功能时只关闭入口和资源响应，保留现有文档读取；源码、产物和关联不自动删除。正式实现完成并验收后再同步 Specs；本次不将计划能力写成已实现事实。

## 验证

| 对应验收 | 验证路径                                                                                                                                                                                                |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1、A2   | 用临时 Git 仓库覆盖缺省、拒绝、pending、初始化成功/失败、重复初始化、已有设计库和显式重新同意；检查状态依据及无意覆盖。验证旧分支不能绕过配置基线。                                                     |
| A3、A9   | 同一组有效/非法 fixtures 同时检查 skill 示例、staged hook 和服务解析；覆盖多入口、跨 Change 复用、重复 id、空列表、两种组件模式互斥、旧无字段文档和原型局部错误。                                       |
| A4       | 浏览器实际测量 iframe innerWidth/innerHeight，验证设备切换、方向、组件固定尺寸、外层缩放、深链接及抽屉键盘行为，不以截图替代断言。                                                                      |
| A5       | 用真实构建产物验证多 HTML 入口、ES module、共享 chunk、CSS、图片、字体、相对 JSON mock、hash 路由和静态深路径；在本地及带认证双 Host 部署各运行一次。                                                   |
| A6       | 临时中心仓库完整走提交推送、固定版本、更新共享组件、归档标签、删分支、冷缓存重启；验证所有 blob 属于同一提交。另测标签冲突、推送失败、引用删除、旧快照淘汰与不可达 SHA。                                |
| A7、A8   | 覆盖路径编码穿越、symlink、LFS、任意源码/仓库请求、项目移除、资源限额、刷新失败。双 origin 验证父 DOM/存储/API/刷新隔离、主 Host 禁预览、预览 Host 禁主应用、匿名认证失败、CSP 与 Service Worker 拦截。 |
| A9       | 回归现有 Spec/Change 核心与浏览器测试、类型检查和生产构建；对严格 schema 的升级顺序做兼容 fixture 验证。                                                                                                |

实现前先完成双 Host 的实际浏览器与私有认证验证；若部署网关不允许所需 Host/认证分流，保留功能未启用并修订部署方案，不以同源放宽作为替代。当前协议调研支持方案可行，但该部署验证尚未发生，证据边界见 [Research](./research.md)。large Change 的独立评审覆盖字段一致性、历史可达性和安全边界，问题解决后再进入人工验收；不把本次文档检查登记为产品验证通过。
