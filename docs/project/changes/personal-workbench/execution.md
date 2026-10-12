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
