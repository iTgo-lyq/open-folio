# 实施证据

## T1 建立可扩展的 GitHub 仓库适配契约

新增服务端 Provider 契约、不可 JSON 序列化且调试输出脱敏的 SecretHandle、稳定仓库键与显式注册表。公开版本仅注册 GitHub；实现身份、分页、稳定 id 重新定位、Contents 读取检查、固定提交树遍历和 HTTPS 传输描述。HTTP 请求只向 GitHub API 主机发送指定 token，禁用重定向与缓存，设置超时、响应上限和统一错误。

工作流探测逐级检查普通目录／文件，树证实缺失才返回 missing；符号链接、子模块与非法位置返回 WORKFLOW_INVALID，留给发现层归类。API 版本采用本轮核对的官方 REST 示例版本 `2026-03-10`；[仓库接口](https://docs.github.com/en/rest/repos/repos#list-repositories-for-the-authenticated-user)与[Git Trees](https://docs.github.com/en/rest/git/trees#get-a-tree)作为映射依据。

验证：`node --conditions=react-server --test tests/providers.test.ts`，8 项通过；`npm run typecheck` 通过。测试覆盖前向分页与恶意 continuation、稳定身份改名、缺失与权限失败区分、普通文件／符号链接／子模块、树截断、空仓库、身份过期、限流、秘密不可序列化及虚构第二适配器。真实 GitHub fetch 和发现服务集成随 T2／T4／T5 验证，此处不报告完整联调。

## T2 让 Git 读取只使用指定连接的 token

GitReader 接收显式 GitTransport。HTTPS 没有凭据时在启动 Git 前拒绝；子进程使用环境白名单、临时空 HOME／XDG／CURL 目录，关闭系统／全局配置、helper、交互、trace、重定向和非指定协议。Authorization 只经子进程环境注入精确 URL 作用域，不进入参数或磁盘。缓存仅接受服务生成的无凭据 Git config，未知旧配置拒绝复用；可信代理和 CA 保留，TLS 校验始终启用。

新增真实 HTTPS Git fixture，通过 git-http-backend 验证 refs 和 fetch；故意提供有效宿主 helper、netrc、继承鉴权头，错误 token 仍失败，helper 与 trace 均未执行。并发两连接分别发送各自凭据；远端撤权、取消和被污染的本地 config 均拒绝。

验证：`npm run typecheck` 通过；`node --conditions=react-server --test tests/git-credentials.test.ts tests/store.test.ts tests/changes.test.ts tests/previews.test.ts`，27 项通过。真实 GitHub 联调通过关闭回显的 stdin 临时注入用户此前提供的 token，未使用本机 Git 登录态；指定 runweft 仓库身份、发现、refs 与 fetch 均成功，读取 2 个分支和 507 个受限文档。工作流探测由目录树确认 missing，不能作为已接入正向样本；后续发现／工作台仍需正向联调。临时 Git 目录已删除，秘密未落盘。

## T3 提供个人会话与连接生命周期

新增个人会话、连接创建／替换／移除与退出接口。Cookie 为随机 256-bit 值，服务端只保存摘要，默认 30 天；创建／替换成功轮换 Cookie。token 使用 AES-256-GCM、独立 nonce 与绑定会话／连接／revision 的 AAD 加密；密钥和状态文件为 0600，目录为 0700。缺失密钥或密文验证失败时保留现场并拒绝恢复。相同账号允许多个连接，替换为其他账号被拒绝。

跨请求操作通过 connection lease 校验所属会话和 revision，移除、替换、退出及过期取消在途操作。写接口要求同源、远程 HTTPS、有限 JSON 输入，公共 DTO 不含密文或原 token。连接成功后的自动发现由 T4 接入；正式页面在 T7 交付。

验证：`node --conditions=react-server --test tests/personal-sessions.test.ts`，7 项通过；`npm run typecheck` 通过。覆盖重启恢复、独立 nonce、Cookie 轮换、同账号多连接、失败替换回滚、跨用户拒绝、取消与到期、密文调换、密钥丢失、同源／输入边界、秘密不回显及同进程多存储实例并发写入。

## T4 自动发现并诊断 SpecTrail 仓库

连接验证成功后启动后台发现；分页和未完成队列按连接 revision 持久化，单批最多 4 个检查、进程总计最多 8 个，单仓库设超时。完整工作流 schema、普通文件类型、默认分支提交与守护分支共同决定 ready／attention；缺失、损坏、来源异常和暂时失败分别呈现，未完成扫描不会成为完整空结果。目录分页返回前重新验证身份、仓库 Contents 权限和指定 token 的 Git refs。补充地址检查通过 Provider 解析，发现进行时提示稍后重试，避免与后台目录写入竞争。

验证：发现服务 6 项测试通过，覆盖六类样本、多页、限流续传、重启中断、并发合并与上限、撤权目录过滤、连接移除取消、跨会话拒绝和 HTTP 自动发现。连同 Provider／会话 20 项先前测试及 `npm run typecheck` 通过；新加并发用例单独复验通过。发现仅执行元数据、workflow blob 与 refs 检查，不 fetch 候选仓库。真实 GitHub 已有 T2 的发现及未接入负向证据，正向 SpecTrail 识别和正文读取留待 T5 联调，不以受控样本宣称真实正向通过。

## T5 按个人仓库权限读取工程记录

新增 ReadContext 和个人仓库读取接口。每次请求在读取前与交付前验证 token 身份、稳定仓库 id、平台 Contents 与 Git refs；长刷新在发布 current 指针前再次检查。Git／快照按会话、连接、revision 隔离，刷新串行但不借用其他请求的授权。连接取消信号绑定到每个 Git 命令。旧 projects 工程接口与旧 Git 预览入口返回 410，管理员 Cookie 和邀请码不再能读取旧缓存。

复用 Specs、Changes、文档、搜索和图片读取，当前原型配置与清单改读实际默认分支，固定 Change 来源规则保留。双用户使用各自 token 得到共同提交，但不能读取对方快照；失败刷新保留旧指针，仅后续重新授权成功时可读。

验证：新增 3 项个人仓库集成测试，覆盖 GET／HEAD、正文、搜索、图片、历史快照、双用户、替换、交付前撤权和失败刷新。真实 HTTPS Git fixture 完成整个 HTTP 刷新与读取链路，并在已缓存后撤销 token 的 Git 权限，确认仍拒绝；所有捕获传输只含当前测试 token。既有 store／Changes／previews／prototypes 回归共 33 项及类型检查通过。

真实 GitHub 联调使用此前授权 token、关闭终端回显的临时 stdin 输入，仅调用 GitHub API 与显式凭据 GitReader：身份、单页完整仓库枚举、OpenFolio 工作流普通文件识别与 schemaVersion、refs、fetch 和 Specs 正文均通过；采集 22 个分支、1255 个受限文档。未修改远端，临时 Git 数据已删除。这补齐 T4 的真实正向识别证据。

## T6 独立交付可匿名访问的固定原型

新增已授权准备接口、独立 public-previews 目录、固定 publicationId 预览页，以及仅从显式清单读取的匿名元数据／HTML／截图接口。Git 准备沿用可达性、原型开关、自包含 HTML 与大小校验，离线生成适配截图，交付前重验授权并原子发布。固定标识绑定仓库身份、入口、引用提交与产物摘要；重复准备复用版本，静态响应重新核对字节摘要。内置和外部 hosted 保存最小固定引用，由浏览器匿名访问，不代理第三方登录。

公开读取不创建 ReadContext、不调用平台或 Git。退出、撤权和关闭后续准备开关不清理已发布内容；未知版本返回 404，运维撤回标记返回 410。公开 HTML 保留 CSP sandbox、opaque-origin iframe 与宿主隔离。旧多段 Git 预览链接目前返回未就绪，迁移映射随 T9 完成。

验证：12 项公开发布、内置上传与真实 Chromium 截图回归通过；覆盖三类来源、重复准备、撤权导致原子失败、摘要损坏、匿名 GET／HEAD、未知资源、断开发布者和平台、开关关闭后保留及撤回。匿名测试将平台和 Git 工厂替换为立即失败函数；读取仍通过。类型检查通过。公开页的完整交互与多设备浏览器检查随 T8 集成。

## T7 在玻璃外壳中完成连接与仓库发现流程

正式页面保留 84px 侧轨、玻璃胶囊按钮、圆角白色工作面和移动底部胶囊；添加仓库首页、首次 GitHub 连接、状态筛选／搜索、分页、地址检查及我的连接。表单使用现有 UI 包 Field／Input／Button，目录与说明复用 Tabs／Card／Badge。token 生成入口和最小只读权限说明就近呈现，提交后立即清空输入，不写浏览器存储。替换失败保留原连接；移除／退出更新会话并清除页面内容；多连接重新进入时明确选择，没有默认借用其他 token。

浏览器测试改为全新匿名会话。仅测试进程通过虚构 Provider 和真实 HTTPS Git 服务注入生产 HTTP handler，前端请求仍经过真实会话、发现和读取服务；生产代码没有测试开关、平台主机覆盖或后门路由。原有管理员全局 storageState 已移除。已有阅读浏览器用例在 T8 迁移。

验证：6 项 Playwright 场景通过，覆盖匿名连接、无效 token、会话恢复、地址检查、Escape 焦点恢复、侧栏收放、替换身份不符回滚、移除／退出、多连接显式选择及撤权后隐藏目录。桌面 1440、平板 834、手机 390 与 320px 无横向溢出，截图保存在 artifacts/personal-home-*.png；已实际查看桌面和 320px 截图确认玻璃外壳。`npm run typecheck` 通过；公共 UI 包未修改。

## T8 贯通仓库阅读与协作分享

Specs、Changes、原型目录／详情和截图统一使用当前连接的授权读取；来源栏、折叠目录、移动导航、前进后退和刷新反馈沿用玻璃外壳。分享工程记录仅保留稳定仓库身份及阅读参数，去除连接、快照与旧授权参数；接收者连接自己的账号后恢复原位置。原型准备完成后分享独立 publicationId 页面，支持设备、旋转、复制、沙箱交互和匿名截图。公开产物服务复用进程级截图队列，避免页面并发造成无限制浏览器任务。

验证：分组运行 Specs 5、Changes 12、原型目录 8、预览 5、工程 API 3、公开预览 API 3、截图 3、双用户分享 2，共 41 项浏览器用例，均复验通过；最后分享组在 320px 再次验证无横向溢出。7 项仓库／公开产物集成及类型检查通过。实际查看阅读、个人首页和公开原型截图；原型详情截图重试、固定版本、匿名退出后交互，以及协作者撤权后隐藏正文均有自动化证据。完整浏览器套件待 T9 迁移旧管理用例后统一运行。

## T9 完成旧部署迁移与运维边界收敛

运维配置改为 schemaVersion 2，仅保留资源限制；首次读取旧配置先将原始字节保存到私有摘要备份，再写不含邀请码的私有仓库定位映射，最后原子替换。并发迁移、重试、配置符号链接和坏文件均保留既有保护。旧缓存与静态托管不变，管理员登录只授予运维能力；项目邀请码验证返回 410，旧设置／邀请码 UI 和全局仓库服务已移除。

旧 project 深链接先校验所属连接，再解析映射，并通过同一仓库授权链路恢复阅读位置。旧 Git 原型仅映射已准备 publication，未准备返回 404，匿名 GET／HEAD 不调用平台或 Git；运维可经独立管理员接口撤回版本。README 已更新 token 使用、部署、数据备份、停机换密钥并重新连接、过期会话和缓存清理、升级与回退步骤；示例配置不再登记项目。

验证：28 项配置／权限／Git／快照／公开产物／上传定向测试通过，含私有原始备份、并发升级、重启、恢复旧文件再升级、无权不泄露映射、匿名旧链接、撤回权限和跨源拒绝。浏览器迁移与运维 5 项分组通过，覆盖旧 Cookie／旧工程 API、本人连接恢复、未知链接提示、管理员与个人权限分离以及内置上传和 skill CLI 协议。类型检查、格式检查通过。全量单元、浏览器、生产构建和独立评审作为整体验证继续执行。

## T10 修复整体验证与独立评审问题

独立评审并复验完整差异，确认并修复目录在途撤权、地址检查目标不在第一页、Git 原型诊断桥和诊断桥升级别名兼容问题；主执行者补充限流等待、公开组件方向与缓存图片状态竞态修复。具体复现与修复映射见 Review R1–R6。旧别名和字节保持固定，当前准备可生成新的诊断桥版本；匿名读取仍不进行远端操作。

验证：完整 `npm test` 119 项通过，`npm run test:e2e` 54 项通过，`npm run typecheck` 与 `npm run format:check` 通过。`OPENFOLIO_BUILD_DIR=.next-verify npm run build` 通过，运行中 `.next` 未覆盖；临时目录及新增类型引用已清理。独立评审者复验发现／公开产物 13 项通过，报告无剩余阻塞项。最终别名兼容修正另运行公开预览／分享浏览器回归，5 项通过。截图保存在 artifacts/personal-home-desktop.png、personal-home-320.png、specs-desktop.png、collaborator-reading.png 与 public-preview-mobile.png，已实际查看桌面与窄屏；UI 包源码未变化。

## 整体交付证据与限制

需求 1–7 由 Provider、会话、发现、受控真实 HTTPS Git 和仓库服务集成覆盖；T2／T5 已使用用户授权凭据完成真实 GitHub 身份、分页、接入识别、refs、fetch 和正文读取，未改变来源仓库、未落盘 token。需求 8–9 的双用户分享、匿名原型、玻璃导航及四种尺寸由浏览器覆盖；需求 10 的升级、重启、私有备份、旧权限失效与回退由 T9 覆盖；需求 11 的三类公开来源、匿名不触发远端、固定版本和撤回由公开产物及浏览器集成覆盖。

公开版本只支持 GitHub.com；其他 Provider 只验证扩展契约。部署保持单进程单实例；密钥轮换采用停机备份并要求用户重新连接，旧私有缓存按部署文档停机清理。远端授权与 HTTP 交付无法组成跨平台事务，保证观察到撤权后的请求失败；已下载内容无法收回。外部 hosted URL 的持续可用性由其宿主管理。当前代码在 Change 分支，未部署或合入 main；人工验收后再同步 Specs、归档。
