# 个人工作台技术方案

依据：[Requirement](./requirement.md)、[Research](./research.md)。公开版本仅交付 GitHub.com，保留平台适配边界；应用继续是单 Node 进程、单实例和持久磁盘上的只读工作台。正式实现仍需本方案确认后再编写 Plan。

[打开个人工作台交互原型](https://pub-cc623a99ce8e4606a3491cc2d4b4436c.r2.dev/open-folio/e68119ca94424024c1b6b6fb667ce143e9ee2bcf8b5530f462647981225a066f/personal-workbench/index.html)。顶部可切换首次连接、发现中、空结果、部分失败、连接过期、分享无权限和公开预览；表单输入 `demo` 体验流程，使用示例数据。

## 方案总览

采用“个人会话 → 代码托管连接 → 仓库身份 → 受保护的读取上下文”。连接保存用户凭据和经平台验证的身份，平台适配器统一输出账号、仓库、权限和接入诊断；工作台与索引不依赖 GitHub 原始字段。GitHub 首版使用 REST API 发现与探测，使用 Git HTTPS 采集已推送内容。

工程记录读取始终携带一个当前会话拥有的连接。公开原型使用独立的已发布产物目录与最小展示数据；匿名入口没有平台客户端或 GitReader，不会触发带凭据的远端操作。

```text
浏览器的会话 Cookie
  → 个人连接（服务端保管 token）
  → 平台适配器：验证身份 / 枚举仓库 / 检查读取权限
  → 经授权的仓库上下文
      → GitReader → 不可变快照 → Specs / Changes / 文档
      → 已登记原型校验与准备 → 公开产物目录

匿名原型链接 → 公开产物目录 → 展示页面 / 静态文件 / 截图
```

## 平台适配契约

### 注册与依赖方向

平台适配器在服务端显式注册。公开版本注册 `github`，实例固定为 `github.com`；客户端只收到受支持连接方式的描述，不接受任意模块路径、接口主机或可执行配置。内部版本可以增加适配器及其注册，不改核心会话、快照、文档和原型服务。测试使用虚构的第二适配器证明扩展，不放入其他真实平台的接口或占位 UI。

以下类型是契约草案，字段均做长度和格式校验：

```ts
type ProviderIdentity = {
  providerId: string;
  instanceId: string;
  subjectId: string;
  login: string;
  displayName: string;
};
type RepositoryIdentity = {
  providerId: string;
  instanceId: string;
  repositoryId: string;
  fullName: string;
  displayName: string;
  webUrl: string;
  cloneUrl: string;
  defaultBranch: string | null;
};
type Page<T> = { items: T[]; nextCursor: string | null };
type ProbeResult =
  | { kind: "file"; commit: string; bytes: Uint8Array }
  | { kind: "missing"; commit: string }
  | { kind: "empty-repository" }
  | { kind: "unavailable"; reason: string; retryAfter?: string };
interface RepositoryProvider {
  id: string;
  describeConnection(): ConnectionDescriptor;
  authenticate(
    secret: SecretHandle,
    signal: AbortSignal,
  ): Promise<ProviderIdentity>;
  listRepositories(
    context: ProviderContext,
    cursor: string | null,
  ): Promise<Page<RepositoryIdentity>>;
  resolveRepository(
    context: ProviderContext,
    selector: RepositorySelector,
  ): Promise<RepositoryIdentity>;
  assertRead(context: ProviderContext, repo: RepositoryIdentity): Promise<void>;
  probeWorkflow(
    context: ProviderContext,
    repo: RepositoryIdentity,
  ): Promise<ProbeResult>;
  gitTransport(
    context: ProviderContext,
    repo: RepositoryIdentity,
  ): Promise<GitTransport>;
}
```

`ProviderContext` 含已验证身份、只在服务端存在的凭据句柄和取消信号；`GitTransport` 只返回经过主机校验的 HTTPS URL 与临时鉴权材料。`SecretHandle` 不可序列化为客户端 DTO。`ConnectionDescriptor` 说明表单字段、生成令牌的官方入口和权限提示，业务组件不检查 token 前缀推断平台。

适配器负责实例网络策略、分页游标校验、原始字段归一化和平台错误翻译。公共层负责会话归属、连接版本、资源限制、Git 进程隔离与响应范围；适配器不能绕过这些检查。错误统一为身份失效、读取被拒、发现权限不足、限流、网络失败、不支持和数据异常，不把平台原始响应直接返给浏览器。

### GitHub 首版映射

| 能力       | GitHub 行为                                                                                                                                                                                                                        |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 身份       | `GET https://api.github.com/user`；`id` 转字符串作为 subjectId，login 只作展示与 Git 用户名。token 失效时不能通过公开仓库读取成功绕过。                                                                                            |
| 发现       | `GET /user/repos?affiliation=owner,collaborator,organization_member&per_page=100`；处理 Link 分页，仅允许下一页仍位于同一 API 主机和此列表路径。                                                                                   |
| 仓库身份   | REST 返回的 repository id 作为稳定身份，full_name 只作名称与路径。使用已发现的 id→路径映射查询仓库并核对 id；映射过期时重新枚举当前连接可见仓库定位同一 id，不依赖未公开的按 id 查询接口，不自动跟随重定向。改名不创建新仓库身份。 |
| 工作流探测 | 固定默认分支当前提交，读取 `docs/project/workflow.json`。只接受普通文件；通过 Git tree 的 mode/type 核对路径，拒绝目录、符号链接与子模块，不采用 Contents API 对符号链接的隐式跟随。                                               |
| Git 鉴权   | `https://github.com/<owner>/<repo>.git`，经验证的 login 与用户 token 构成 HTTPS Basic；API 使用同一 token 的 Bearer。URL、持久 Git 配置和命令参数中不放秘密。                                                                      |
| 生成令牌   | Fine-grained PAT：选择资源所有者与仓库，Contents Read-only；Metadata 随之具备。组织审批、所选仓库和到期时间均会影响可见范围。                                                                                                      |

首版引导 fine-grained PAT，不通过 token 字符串形状判断有效性；输入是否可用由身份、仓库发现和实际读取结果决定。只有读取能力时不要求写权限。平台适配的官方依据见 Research，GitHub 的 API 版本请求头固定为已核对文档版本，并在适配器测试中验证。

默认分支名从 API 和远端 HEAD 获取，不硬编码 `main`。探测绑定提交，避免读取配置与树时混用不同版本。目标路径 404 只有在仓库身份与读取权限仍成立、同一提交的树证实路径缺失时才归类为未接入；限流、Contents 权限不足、树响应截断和未知错误均为检查失败。大树不依靠一次递归响应，按根目录到目标路径逐层查询有限的目录树。

Specs 默认来源仍须属于 workflow 声明的守护分支。现有原型读取将写死 `main` 的当前配置／清单基线改为仓库实际默认分支：默认分支为 main 的已有项目行为一致，其他默认分支可正常使用。准备当前原型固定版本时，验证其清单提交属于该默认分支历史；Change 固定交付继续按 Change 主来源和归档标签解析，不把它改为当前分支内容。对应产品 Spec 和原型协作说明在验收后同步此来源约定，并增加非 main 仓库回归。

## 会话与凭据

### 个人工作台身份

个人工作台是一个浏览器会话拥有的连接集合，不新增平台无关的用户账号表。首次连接成功才建立会话；Cookie 内为随机 256-bit 不透明值，服务端仅以其摘要寻址。默认有效期 30 天，token 过期或被撤销可提前失效；刷新页面和服务重启不要求再次粘贴 token。主动退出删除会话和所属连接，清 Cookie；重新连接可重新发现仓库，不恢复跨设备偏好。

Cookie 使用 HttpOnly、SameSite=Lax，HTTPS 使用 Secure；远程部署要求 HTTPS，loopback 本地开发保留 HTTP。新连接和凭据替换成功时轮换会话 Cookie。所有写会话操作要求同源校验，校验 Origin／Fetch Metadata；响应 `private, no-store`。连接表单大小上限 16 KiB，token 长度上限 4096 字符，去除首尾空白后拒绝控制字符；日志不记录请求体。

每个连接有随机 connectionId、独立 credentialRevision、平台身份、用户可选标签及能力状态。相同 GitHub 账号的多个 token 可以并存，因为它们可能针对不同资源所有者或仓库范围；不会按 login 自动覆盖。默认标签使用账号名及连接序号。替换连接要求仍为同一 subjectId；验证为其他账号时提示添加新连接。进入仓库时明确选中连接，失败不会自动换用同账号的另一个 token。

### 持久化与撤销

会话及连接存于数据目录的新版本目录，复用原子写入与进程锁。token 用 AES-256-GCM 加密；每次写入使用独立随机 nonce，AAD 绑定 schema、sessionId、connectionId 与 credentialRevision。加密密钥来自 `OPENFOLIO_CREDENTIAL_KEY_FILE`，首次初始化且没有已有密文时私有生成默认 `credential-key`；已有密文但密钥缺失或解密失败时拒绝恢复连接，不生成新密钥覆盖现场。目录 0700、秘密文件 0600。密钥与数据的备份／轮换说明进入部署文档；不宣称磁盘加密能抵御已控制同一运行账号的攻击者。

客户端只收到连接标签、账号名、状态及发现进度，永不读回 token。原值不进入 localStorage、Git、错误、URL 或响应。连接替换先完成验证，再原子替换密文并递增 revision；失败保留原连接。移除、退出或 revision 变化取消该版本的发现和采集；在途响应交付前复核会话、connectionId 与 revision。

会话到期后拒绝读取，惰性清理已到期密文和任务；公开原型不与会话一起删除。普通用户没有管理全局部署配置或获取上传密钥的权限。

## 仓库发现与读取

### 发现作业

连接验证完成后创建所属会话的发现作业；页面轮询进度，先呈现已完成结果。作业只为用户显式连接或重新发现而运行，不增加后台轮询全部仓库的守护任务。

初始并发限制为每连接最多 4 个探测，服务全局最多 8 个；单请求超时 20 秒，作业可取消。处理平台分页、限流与 Retry-After，限制达到时暂停并保留 continuation，不把截断结果当成完整发现。不执行无限重试；一次连接的故障不取消其他连接。进程重启将未完成作业标记为已中断，用户重试后继续检查，不显示成功。

候选检查结果为 `ready / attention / not-integrated / unavailable`：有效 workflow 且来源可读为 ready；配置非法或来源异常为 attention；证实缺少配置为 not-integrated；权限／网络等检查失败为 unavailable。仅 ready 和 attention 进入个人仓库目录，后两类在检查结果中提供解释。无 Specs／Change 内容不等于未接入。

发现只取得仓库元数据、配置和必要 ref，不完整 fetch 每个仓库。选择仓库后才执行现有采集。初次进入无快照的仓库自动采集，之后用户手动刷新。用户可在“找不到仓库”中提交 GitHub HTTPS 地址；服务端解析 owner/repo，再由适配器核实仓库身份，绝不直接信任或执行输入 URL。

### 授权不由缓存代替

每个受保护的请求建立 `ReadContext(sessionId, connectionId, credentialRevision, repositoryIdentity)`。开始读取时重新向平台验证当前 token 身份及仓库读取能力，并使用指定 token 执行 `ls-remote` 证明 Git 内容访问可用。私有仓库 Metadata API 成功不代表 Contents 读取一定被授予；公开仓库 Git 成功也不代表 token 本身有效，因此两类检查都保留。

授权结果只在同一请求内部复用，不跨请求设正向 TTL。长耗时采集、截图准备或其他读取在提交结果前重新检查远端授权，以及本地会话和连接 revision。平台不可达不能确认权限时返回可恢复错误，不返回工程记录缓存；在检查完成到传输之间的外部撤权无法实现跨平台事务，因此只承诺已观察到撤权后的新请求不会继续成功。

个人仓库列表也不能照搬旧发现结果：每次列表请求验证当前连接；先展示发现进度，不显示尚未重新确认读取权限的旧仓库。列表按页检查并增量呈现，避免为一个请求无界验证所有仓库。元数据没有自动授予内容访问能力。

### GitReader 与缓存

`GitReader` 接收只在当前操作有效的 `GitTransport`，无凭据的生产构造不允许访问远端。本地测试的 file transport 由测试工厂注入，不开放给 HTTP 输入。

Git 子进程使用受控环境白名单，独立、空的配置／凭据查找目录；不修改服务父进程或开发者本机配置。禁用系统和全局 Git 配置、credential helper、交互 askpass、SSH agent、继承的鉴权头、客户端证书及 trace。必要代理和 CA 由部署者配置并明确保留，不能通过关闭 TLS 校验解决网络问题。仓库级配置由服务生成并核对；旧 bare 缓存的未知配置不带入新读取域。

token 经子进程私有环境内的 Git 配置注入仓库 URL 作用域的 Authorization header，不写 argv、磁盘或 remote URL；清理子进程结果中的鉴权片段并只向客户端输出标准错误。仅允许 HTTPS，禁止重定向、子模块递归、hooks 和来源脚本执行。平台返回的 clone URL 仍须匹配适配器允许的主机和路径。

仓库导航身份为 `hash(providerId, instanceId, repositoryId)`；读取缓存域进一步包含 connectionId 和 credentialRevision。首版隔离各连接的 refs、快照、错误与并发任务，不跨用户合并刷新；同仓库的协作者仍可按相同提交读取一致内容。将来共享不可变 blob 可作为优化，不能提前共享授权或 refs 状态。

复用现有 bare Git、分支／归档标签采集、快照原子发布、清理和固定 blob 读取逻辑。取消或授权失败不能发布新快照。Git 内容不 checkout、不执行仓库脚本；文档响应 `private, no-store`，GET／HEAD 同样检查权限。

## 公开原型

### 准备与匿名读取

新增独立 `public-previews` 存储与公开预览路由。公开记录只包含原型标题、适配、固定版本、产物摘要、已批准静态文件或 hosted URL、截图及展示所需信息；不复制完整 Change、workflow、仓库列表、上传地址或文档附件。

有权限用户成功采集后可准备已登记的原型；打开或分享尚未准备的固定引用时，在当前 ReadContext 下校验并准备。Git 产物仍须满足普通文件、自包含 HTML、来源可达、固定引用和大小限制。先写临时版本，内容校验通过后原子发布。标识绑定仓库稳定身份、入口、源码／引用版本和摘要；同标识不能覆盖不同字节。

原型固定链接采用 `/preview/<publicationId>`，静态文件与截图通过显式清单寻址；不接受仓库路径或任意 Git ref。匿名 GET／HEAD 只读取该目录，不构造 ReadContext、不发平台 API 或 Git 请求。未准备版本返回未就绪，不能借用上一次发布者的 token 自动 fetch。公开目录独立于私有快照清理和会话有效期。

Git 截图可在已发布的 HTML 基础上离线生成，不需要仓库凭据；继续使用独立受限 Chromium、网络拦截和固定渲染缓存键。HTML 保持 CSP sandbox 与 opaque-origin iframe，公开不等于允许访问宿主 DOM 或会话。

### hosted 兼容与公开生命周期

内置 `/prototype-assets/<version>/<path>` 继续公开读取，专用上传地址仍是写入凭据。外部 hosted 继续由浏览器匿名加载，服务不代理第三方登录；只有展示必需的 URL 与元数据进入公开记录。用户无需 GitHub 账号便能打开预览页与资源。

仓库原型开关决定后续是否准备新版本，以及工作台是否继续列出入口；已经发布的固定版本保留公开，与原有静态托管版本一致。仓库移除条目、用户退出或 token 失效不自动删除旧产物。部署者可以通过运维方式撤回本实例的公开记录并返回 410；远端已经下载或公开托管的字节无法回收，外部产物撤回由其宿主管理。产品和迁移说明会明确这个生命周期变化，不声称匿名预览每次都重新读取远端开关。

## 接口与 UI

### 工作台接口边界

| 接口族                                                               | 职责与限制                                                                                 |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `GET /api/session`                                                   | 当前会话安全摘要、连接描述；无会话返回未连接，不列出任何仓库。                             |
| `POST /api/connections`、`PATCH/DELETE /api/connections/:id`         | 连接、替换、移除；归属检查、同源校验、限长和凭据不回显。                                   |
| `DELETE /api/session`                                                | 退出当前工作台，取消所属操作并撤销会话。                                                   |
| `POST /api/connections/:id/discovery`、`GET …/discovery`             | 启动／重试和读取有界进度，不依赖 SSE 或额外队列服务。                                      |
| `POST /api/connections/:id/repository-checks`                        | 检查用户输入的 GitHub 仓库地址；返回接入与读取诊断。                                       |
| `GET /api/repositories`                                              | 按当前连接授权增量返回目录，无全局项目列表。                                               |
| `/api/repositories/:repoKey/...`                                     | 现有 Specs、Changes、文档、搜索、刷新等能力；显式指定所属 connectionId，仓库标识不是授权。 |
| `POST /api/repositories/:repoKey/previews/prepare`                   | 在当前连接权限下准备已登记原型，返回公开链接。                                             |
| `/api/public-previews/:publicationId/...`、`/preview/:publicationId` | 公开最小元数据、产物和截图；不进入工程记录 API。                                           |

连接存在不自动授予仓库访问。每个记录接口同时核对会话、连接、仓库和快照／文档清单；不接受任意本地路径或可执行 ref 表达式。错误 DTO 为 `{code, message, recovery?, retryAfter?}`，code 可用于进入重新连接、重试或无权状态。

### 导航与分享

个人首页以仓库目录为主，延续既有 84px 侧轨、玻璃胶囊按钮与圆角白色工作面。胶囊提供我的仓库／Specs／Changes／原型，底部圆形入口进入我的连接；顶部保留仓库选择与当前模块，来源栏显示连接状态或仓库分支和分享入口。切换仓库保留模块、重置文档位置；无可用仓库时禁用阅读模块。侧栏可收起和恢复，手机沿用悬浮玻璃胶囊，目录通过来源栏打开。设置替换为“我的连接”，不展示部署文件路径、邀请码或全局读取限制。首版仅显示连接 GitHub，令牌生成说明紧邻输入；同账号多连接可添加便于区分的标签。

工程记录链接保存 provider、instance、平台仓库 id 及阅读位置，不包含 connectionId、token 或会话 id。接收者连接后，适配器按稳定 id 解析最新路径并检查权限；多个可用连接时要求明确选择，不静默串用。恢复原目标只允许本站受支持路由，防止开放重定向。首次发现、空结果、未接入、来源异常、权限不足、限流和过期分别提供恢复动作。

原型分享直接使用公开 publicationId，匿名页面不加载工程工作台的私有上下文。方案原型在既有 `packages/prototype` 中交付，全部状态为内存演示；顶部场景切换仅供评审，不进入正式产品。正式基础组件复用 `@open-folio/ui`，业务组合留在应用层。

## 旧配置迁移与部署

升级写入新 schema 的个人连接／会话目录，保留现有 config 的私有备份。全局 config 的读取限额和存储等运维设置继续使用；旧 projects／inviteCode 只作为迁移参考，不导入任意会话、不授予访问权限，也不向新访客返回旧项目名称。

旧邀请码、管理员 Cookie 和 `/api/access` 不用于工程记录授权。旧配置浏览器 API 不再维护项目；服务密码仅保留独立运维范围，用于现有内置托管上传地址获取与部署管理，不接入 ReadContext。SpecTrail 的 setup 获取上传地址协议可以继续工作，管理员身份不会成为仓库阅读旁路。

旧项目深链接在用户连接后，以私有迁移表解析候选仓库，再经本人连接验证后映射到稳定仓库身份；鉴权前不泄露映射内容。旧 fragment 中的邀请码只清除，不再兑换。映射不存在时显示重新选择入口。旧原型链接只有对应公开产物已准备后可映射，否则显示未就绪，不用宿主凭据补采集。

保留旧 Git／快照目录，不信任其 config 或授权结果；新连接首次采集写入隔离缓存。旧记录无需破坏性转换，回退使用备份配置和旧应用版本；回退不会恢复已退出的新会话，也不会撤回已公开的原型。升级、回退前停止当前单实例，避免两个版本同时写同一目录；生产构建遵循现有产物目录约定。

## 验证与就绪性

### 已有证据

- 已验证：用户 GitHub PAT 可识别账号、读取指定私有仓库元数据，匿名 `ls-remote` 失败、指定 PAT 成功。本轮 `/user/repos` 返回 200 与稳定仓库 id，包含目标仓库；返回数量小于请求页大小，此实验不证明跨页处理。
- 已验证的失败样本：指定仓库工作流文件请求返回 404；不能仅凭这个结果认定未接入，正式适配器需按上文核对树与权限。
- 官方契约已核对：身份、个人仓库列表、Contents、分页以及 Git credential／HTTP 配置。Git Trees 官方契约已核对普通文件、目录、符号链接和子模块的 mode/type；具体解析与错误分类在实施时以契约测试和真实 GitHub 读取补证。
- 合理方案：本地加密会话、按连接隔离缓存和独立公开原型复用现有单实例持久化、GitReader、SnapshotStore、静态托管与截图基础；它们仍是待实现设计，不作为已接通能力报告。

### 实施验收路径

1. 会话／密文测试覆盖替换失败保留原连接、nonce 与 AAD、Cookie 轮换、过期、退出、跨会话访问及请求取消；检查响应和日志不回显 token。
2. 适配器测试覆盖 GitHub 字段归一化、同账号多 token、分页及重复／恶意 continuation、限流、文件缺失与无权限区分、树模式和截断。虚构第二适配器运行同一发现／读取契约。
3. Git 集成在受控测试远端上记录实际鉴权，故意放置有效宿主 helper／netrc，确认缺少或错误的用户 token 仍失败；分别验证 refs、fetch、缓存命中、HEAD、进行中撤权和跨用户隔离。
4. 在用户提供的 GitHub 凭据可用期间，对已授权测试仓库完成实际发现、工作流探测与 Git fetch；凭据通过临时内存或私有文件注入，CI 无真实秘密。失效时继续模拟验证并记录真实联调缺口，不能宣称完整验收。
5. 公开原型测试覆盖三种来源、匿名 GET／HEAD、截图、固定版本、断网和发布者 token 失效；匿名路由调用 Git／平台客户端即测试失败。验证公开 DTO 不含工程正文和秘密。
6. 迁移 fixture 包含旧邀请码、管理 Cookie、旧缓存与上传设置；确保无权限旁路、运维获取上传地址仍受保护、可按备份回退。
7. Playwright 覆盖连接、发现、筛选、阅读、分享、连接管理与异常恢复，检查桌面／平板／手机和 320px 窄屏、键盘、历史导航及可见焦点；复用既有阅读、Change 聚合、固定引用回归。原型先构建并交互验证，再登记固定公开预览。

技术确认涉及的关键取舍是：首版只支持 GitHub；浏览器会话组织个人连接；每请求重新确认工程记录权限；按连接隔离读取缓存；原型准备后独立公开并保留固定版本；全局管理能力仅留在运维边界。方案确认后再按完整验收路径编写分阶段 Plan，不提前创建实现任务。
