# OpenFolio

基于中心 Git 已推送记录的个人工程工作台。连接自己的 GitHub token，自动发现接入 SpecTrail 的仓库，阅读 Specs、Changes 与原型。协作者各自使用 GitHub 仓库权限。界面保留窄侧轨、玻璃胶囊与圆角工作面。

## 启动与个人连接

需要 Node.js 24、Git、持久磁盘；Git 原型截图需要 Playwright Chromium 和可用的 OS 沙箱。

```bash
npm ci
npx playwright install --with-deps chromium
npm run build
npm start
```

打开 `http://127.0.0.1:10681`，开发使用 `npm run dev`。远程服务通过 HTTPS 反向代理提供，代理设置可信的 Host、X-Forwarded-Proto，防止客户端伪造；默认仅监听 loopback。单 Node 进程、单实例，不能让多个服务共享同一数据目录。

在登录页填写 token，用户名可选，仅作为工作台显示名称。留空时首次登录使用 Git 账号名，恢复已有工作台时保留原用户名；自行填写无需与 Git 账号一致。token 生成入口可选择需要读取的仓库并授予 **Contents: Read-only**（Metadata 为隐含权限）。组织可能要求管理员批准或 SSO 授权；token 必须可枚举目标仓库。公开版本只接入 GitHub.com；Provider 接口集中在 `src/server/providers`，其他实例或平台可通过独立适配器扩展，不接受用户输入任意 API 主机。

连接验证成功后自动分页发现仓库，检查默认分支的普通文件 `docs/project/workflow.json`、完整配置和守护分支。有效、有待处理、未接入和检查失败分别展示；限流或中断保留进度，重新发现可继续。也可输入 GitHub HTTPS 仓库地址检查。发现只采集必要元数据和 refs，选择仓库后才 fetch 工程记录；刷新获取最新已推送内容。

同一平台实例与完全一致的 token 恢复同一工作台；不同 token 即使属于同一账号也分别保存。用户名不参与鉴权或工作台匹配，Git 传输使用平台适配器返回的用户名。所有远程 API、`ls-remote` 和 `fetch` 只使用当前工作台的 token，不读取宿主 helper、netrc、SSH agent 或继承鉴权头，也不会失败后切换其他 token。仓库公开可见也要先验证 token 身份。token 在服务端加密保存，普通摘要不读回秘密；不要把真实 token 放进仓库。

## 开发机长期服务

Merlin 长期服务与上面的 10681 本地开发入口分开，监听端口以服务 checkout 的 `.env` / `.env.local` 为准，模板默认 10680。长期服务由项目脚本和 tmux 托管，需要 Node.js 24、Git 与 tmux；使用独立、干净的 checkout，固定已集成并验证的协作分支提交（默认 `develop`），主工作区用于规划。本机固定服务目录与实际端口见 [AGENTS.md](AGENTS.md#开发机服务与数据)。

以下命令在专用服务 checkout 中执行；已有环境文件沿用，仅首次配置时复制模板。脚本从自身位置定位项目，从其他目录调用时须指定该 checkout，例如 `npm --prefix /path/to/service-checkout run service:status`。

```bash
cp .env.example .env
chmod 600 .env
npm run service:update
npm run service:status
npm run service:stop
npm run service:start
```

`.env` 按模板配置监听地址、端口和 tmux 会话；默认监听 `::`、端口 10680、会话 `openfolio-preview`，沿用 Merlin 暴露方式。需要额外覆盖时也支持 `.env.local`。原型 R2 发布的五项 `R2_*` 配置也统一放在根目录 `.env`，发布脚本自动加载，步骤见[原型包 README](packages/prototype/README.md)。更改会话、端口或数据目录前先停止原服务。进程退出后会自动重启，日志在 `.openfolio/service.log`，运行与构建来源在 `.openfolio/runtime-version.json` 和 `build-version.json`。已有 tmux 会话或端口由其他进程占用时，脚本拒绝接管。

`service:update` 串行停止服务、构建 `.next`、启动并等待端口就绪；构建失败时保持停止，修复后重新更新。它只构建当前 checkout，不执行 Git 拉取、切换或自动部署。更新到新的协作提交时，先定向 fetch 并核对目标，停止服务后将干净服务 checkout 定位到该提交，按需安装依赖，再运行更新和验证。detached HEAD 用于固定已验证的部署版本，不表示临时服务；关闭 Agent 会话不会切回旧服务，脚本未提供机器重启后的自启机制。

`.next` 是所在 checkout 的可重建构建产物，不代表某个分支，也不保存用户数据。切换分支不会自动替换已有产物，服务使用其运行目录里的 `.next`。迁移到独立服务目录后，原主工作区留下的旧 `.next` 不再承担长期服务。常规更新不创建回滚快照，也不备份或删除当前运行数据。构建来源记录提交与是否存在未提交的跟踪文件改动；直接启动来源未知的现有构建时，提交记录为空，不冒充当前 HEAD。

部署后由负责本次任务的 Agent 按实际改动选择冒烟检查；`OPENFOLIO_VERIFY_BASE_URL` 配置验证地址，`OPENFOLIO_VERIFY_TOKEN` 配置登录真实工作台的 Token。真实值只放 Git 忽略的 `.env` 或 `.env.local`，不要使用 `NEXT_PUBLIC_` 前缀或打印凭据；模板不包含真实 Token。不提供固定冒烟脚本。

`artifacts/` 仅保存可删除的验证产物，`.openfolio/` 仅保存可重建的服务元数据、日志和操作锁，正式脚本放 `scripts/` 或相应包内。当前工作台数据默认在 `~/.local/share/open-folio`，通常保留；只有破坏性更新或修复 bug 确有需要时针对必要范围处理。下方备份与回退说明用于确需保留数据的部署，不要求这台开发机每次更新都备份。

## 会话、权限与分享

在「当前凭据」添加多个身份后，可直接点选切换，无需再次输入 token；相同 token 不重复添加，同一账号的不同 token 仍为独立工作台。切换使用目标凭据验证平台身份，成功后才更改当前选择，失败保留原身份。浏览器刷新、重开和服务重启恢复有效身份列表及当前选择，同浏览器标签页同步身份，其他浏览器独立。

浏览器使用随机 HttpOnly、SameSite=Lax Cookie，HTTPS 下为 Secure。每条身份授权独立采用 30 天闲置、90 天绝对期限；普通活动每天至多续期当前身份一次，列表查看不续期其他身份，切换不重置绝对期限。Cookie 覆盖集合内授权的最晚绝对期限，添加或重新登录时更新保留期，日常读取、点选切换、移除与退出不写 Cookie，避免延迟响应覆盖新登录。授权过期、被撤销或 token 失效时需重新登录；清除 Cookie 后须重新添加各身份。

可单独移除本浏览器的身份，移除非当前身份保留当前阅读；移除或退出当前身份后仍可选择其他身份。退出与撤销同时取消记住授权；退出全部设备只撤销当前工作台的全部授权，其他工作台身份保留。工作台凭据与缓存不随移除或退出删除，相同有效 token 可恢复。旧版本登录不兼容，升级后重新添加身份，已有工作台 UUID、密文、密钥、偏好与缓存保留。

每个工程请求（含缓存、历史快照、图片和 HEAD）检查本地设备会话与工作台归属；远端仓库身份和内容权限按同一工作台、同一仓库固定复用 5 分钟，列表与正文共用，并发合并。首次、过期或服务重启后复验；活跃页面利用每分钟后台检查在到期后检查权限。私有刷新沿用相同周期，新增公开原型发布前即时复验。Git 读取失败主动检查是否失权，明确拒绝立即使权限状态失效，token 失效影响本人全部仓库；临时网络与限流保留已显示内容，过期复验失败不延长成功状态。

相同 token 的设备共享发现、权限检查、Git 与快照，不同 token 分别隔离。权限状态仅保存在进程内存。单设备退出立即取消本设备交付，共享任务继续供其他设备使用；退出全部设备取消工作台任务。已确认失权阻止在途交付，已下载到浏览器的字节无法收回。

当前凭据页的「复制 token」仅在主动点击时读取当前 token，响应不缓存；剪贴板失败提供临时只读文本，关闭或切换即清除。已登录设备列表支持退出单台、当前或全部设备。工作台在服务端只保存最近仓库／阅读模块和侧栏偏好，并按字段合并；明确阅读链接优先，恢复最近仓库仍按当前凭据工作台的权限检查周期读取。

「复制阅读链接」只包含稳定仓库身份和阅读位置。接收者连接自己的 token 后验证并恢复原位置，链接不携带授权。仓库改名后按稳定 id 重新解析，不把新路径下不同 id 的仓库当作原仓库。

原型链接全部公开。已授权用户先准备不可变版本，再分享 `/preview/<publicationId>`；匿名 HTML、截图和元数据只读已发布文件，绝不触发远端 Git 或 API。退出、token 撤销或后续停用仓库原型不删除已经公开的版本。未知版本返回未就绪，部署者主动撤回后为 410。公开原型不包含工程正文、连接或上传秘密；外部托管服务负责自己固定 URL 的持续可用性。

## 运维配置与备份

`OPENFOLIO_DATA_DIR` 默认为服务用户的 `~/.local/share/open-folio`，配置默认在 `config.json`；`OPENFOLIO_CONFIG` 可指定其他路径。首次读取缺失配置时创建私有空文件；损坏文件不覆盖。配置只含运维参数：

```json
{
  "schemaVersion": 2,
  "limits": { "refreshMs": 120000, "markdownBytes": 1048576 }
}
```

资源限制默认为：120 秒刷新、1 MiB Markdown、256 KiB JSON、5 MiB 图片、256 分支、10,000 文档、64 MiB 去重正文，单 HTML 10 MiB、相关 HTML 合计 100 MiB、2000 原型入口。`openfolio.config.example.json` 提供配置示例。配置 API 使用 revision 防止覆盖并发修改，资源超限不发布部分快照。Git 获取分支历史，首读成本随仓库大小增长。

管理密码仅用于资源配置、上传地址和公开版本撤回，不授予工程读取权限。使用 `OPENFOLIO_ADMIN_PASSWORD`，或首次需要管理凭据时创建的私有 `admin-password` 文件；独立签名密钥为 `access-secret`。个人 UI 不显示项目登记或管理密码表单。运维客户端通过 JSON `POST /api/access`（`{ "secret": "部署管理密码" }`）获得管理员 Cookie，再访问 `GET/PUT /api/config`、`GET /api/prototype-hosting` 或 `DELETE /api/public-previews/<publicationId>`。浏览器写请求须同源；CLI 沿用已有管理协议，不在命令行参数中传密码。更换管理密码会使旧管理员 Cookie 失效。

数据目录中的敏感内容应仅服务账号可读，整个目录使用 0700；加密 token、密钥和配置使用 0600。私有 Git 缓存包含仓库正文，不能作为静态文件目录公开。备份前停止服务，按一致时间点备份：

| 内容                                                       | 用途                                                                 |
| ---------------------------------------------------------- | -------------------------------------------------------------------- |
| `personal-v2/state.json`、`credential-key`、`identity-key` | 工作台密文、浏览器身份集合、设备授权与独立匹配索引密钥，必须配套保存 |
| `repositories-v2`、`discovery-v2`                          | 按 token 工作台隔离的私有 Git、快照与发现状态                        |
| `config.json`                                              | 运维资源配置                                                         |
| `public-previews`                                          | 已分享的固定版本，不能当缓存随意删除                                 |
| `prototype-artifacts`、`prototype-upload-key`              | 内置托管公开版本与上传授权                                           |
| `admin-password`、`access-secret`                          | 独立运维登录与签名密钥                                               |

可用 `OPENFOLIO_CREDENTIAL_KEY_FILE` 指定独立挂载的密钥文件，须为 32 字节、0600；备份与恢复时一并处理该外部文件。加密数据存在而密钥缺失或解密失败时拒绝恢复并保留现场，不能临时新建密钥覆盖。密钥和密文备份应放在访问受控且加密的离线存储。

密钥轮换必须停机并备份完整目录。运行 `node --conditions=react-server scripts/rotate-workspace-keys.ts <personal-v2路径> <全新待安装目录> [旧外置credential-key路径]`，生成配套的新加密密钥、身份密钥及状态；先验证全部原密文与索引，不修改源目录，保持工作台 UUID、设备和缓存引用。把原 `personal-v2` 移入受控备份，再将待安装目录改名为 `personal-v2`；外置密钥部署还需把新目录的 `credential-key` 安装到已配置位置（0600），保留旧配套文件供回退。不要混搭两套状态与密钥。轮换后既有缓存仍归原工作台，相同 token 登录不会新建 UUID。密钥疑似泄漏时另行撤销设备及平台 token；换一个平台 token 仍是独立工作台。

过期会话在下一次会话操作时清除设备授权，工作台密文与缓存保留。为回收私有缓存，可停机后移除 `repositories-v2`、`discovery-v2`，用户下次重新发现和 fetch；同时保留配套 `personal-v2`、`public-previews` 和 `prototype-artifacts`。该清理会丢失本地历史快照，中心 Git 不受影响。没有自动 Git GC 或跨 token 缓存复用；部署者需要监控总磁盘使用。

## 阅读规则

Specs 只从已登记为守护分支的仓库实际默认分支读取 `docs/project/specs/<能力路径>/spec.md`，不硬编码 main，也不提供开发分支切换。其他分支只扫描 Change 与归档目录；Changes 跨已推送分支聚合，状态只来自严格校验的 `change.json`，正文不覆盖流程事实。无主来源、多主来源和非法状态保留诊断与原文入口。

Specs 正文、目录和原型当前清单均从持久快照读取。刷新复用提交与扫描规则未变化的分支结果，主分支未变化时复用有效的原型清单；全部来源未变化时保留原快照。首次进入没有快照时自动采集，已有快照先显示内容，再后台检查远端；可见页面每分钟及回到前台时检查，同工作台同仓库合并刷新并复用一分钟内的成功检查。页面隐藏后暂停轮询，关闭页面后不常驻扫描。新版本生成后自动更新当前阅读页面，手动刷新可立即检查。

任务按编号排序，Plan 的有效执行顺序表可覆盖默认安排。依赖状态与 Git 祖先证据分别展示；未获得证据、squash 或缺失来源不推定为可用。正文、文档和状态绑定快照，保留最近三份；刷新失败保留成功指针，仅在重新授权成功时可读。

Markdown 不执行 HTML、MDX 或脚本。内部链接限定于快照中的工程文档清单：Spec 链接打开默认守护分支能力，其他文档保持同提交来源。仓库图片检查格式，支持 PNG、JPEG、GIF、WebP、AVIF 和 SVG；外部图片和未知文件不嵌入。阅读 URL 保存浏览条件，重新打开后读取目标来源，而非永久绑定历史缓存。

图表可保存为文档附近的 SVG 文件，再用 `![图表说明](./assets/architecture.svg)` 引用，也可通过普通 Markdown 链接打开图片查看器。SVG 需为 UTF-8、XML 1.0，根元素声明 `xmlns="http://www.w3.org/2000/svg"`，不含 DTD 或处理指令；建议设置 `viewBox` 并内置样式。文本、箭头、渐变和内部引用可以显示，脚本、外部字体与其他外部资源被隔离策略阻止。直接粘贴到 Markdown 的 `<svg>` 标签不会渲染。

## 原型与内置托管

当前原型总览读取已登记为守护分支的实际默认分支 `<packagePath>/prototype.json`，不从 Change 拼接列表；清单、开关和固定引用仍遵守仓库工作流。Change 原型绑定记录提交与入口，归档标签 `spec-trail/archive-v2/<id>` 保留 Git 记录。关闭开关只禁止后续准备，已经公开的产物仍可访问。

通过 [SpecTrail 原型 skill](.agents/skills/spec-trail/prototype/SKILL.md) 维护源码、mock 和构建。产物可选 OpenFolio 内置托管、外部托管或 Git 自包含 HTML；服务不安装仓库依赖、不执行仓库构建。

部署管理员可使用既有 skill 协议获取上传地址（密码通过环境安全注入）：

```bash
node .agents/skills/spec-trail/prototype/scripts/setup.mjs --configure --hosting openfolio --openfolio-url https://folio.example.com --fetch-upload-url
```

上传地址本身授权上传，不授权修改服务配置。每次上传最多 2000 文件、100 MiB，同时最多两次；反向代理须支持相应请求大小和时长。完整且摘要一致才发布，历史字节不覆盖。停机后轮换 `prototype-upload-key` 可撤销旧上传地址，已经公开的静态文件不受影响。

所有 iframe 仅授予 `allow-scripts`，保持不透明来源、no-referrer，不开放宿主 DOM、存储、弹窗或顶层跳转。托管服务须允许嵌入并为 ESM／字体提供适配不透明来源的 CORS。工作台不代理第三方登录，外部缩略图由浏览器直接读取。

Git 公开版本准备时从固定提交取自包含 HTML，用离线 Chromium 生成每个声明视口的 JPEG。截图队列最多 2 个浏览器、24 项等待，排队 30 秒／生成 12 秒超时，可重试。临时截图缓存在 `public-previews/screenshots`，100 MiB、闲置 7 天按需清理；已发布截图独立存入版本目录。截图不写 Git，不带用户凭据；禁用网络、文件导航和持久存储。Chromium 或 OS 沙箱不可用时明确失败，禁止 `--no-sandbox`。

## UI、流程与验证

`packages/ui` 导出共享组件与主题，业务组合在 `src/components`。运行 `npm run ui:dev` 查看组件，包约定见 [UI README](packages/ui/README.md)。本仓库原型发布步骤见[原型包 README](packages/prototype/README.md)。

Agent 使用 SpecTrail [语义命令](.agents/skills/spec-trail/references/state-commands.md) 更新 Change，工作台保持只读。

```bash
npm test
npm run typecheck
npm run build
npm run test:e2e
npm run format:check
```

浏览器测试在 10682，使用两个独立用户、虚构 Provider 与真实受控 HTTPS Git 远端，不依赖真实 token，也不在生产代码开放测试开关。测试 file transport 仅能由内部测试工厂注入。截图输出到忽略目录 `artifacts/`。生产与验证构建统一使用 `.next`，浏览器测试使用 `.next-e2e`，不新建其他 `.next-*` 目录。开发机允许短暂停机；构建 `.next` 前先停止使用该目录的服务，构建成功后再启动并验证，同目录的生产构建须串行。
