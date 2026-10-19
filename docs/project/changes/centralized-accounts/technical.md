# 技术方案

## 实现方向

按 [Requirement](requirement.md) 将账号登录与 Token 使用分开：账号拥有绑定列表，设备保存当前选择。复用现有 Node.js Route Handler、单实例私有文件存储、凭据加密和读取 lease；整体视觉重构单独推进。

已核对现有会话、发现、仓库读取、密钥轮换及冒烟包装器，并阅读安装版 Next.js 16.3.7 的认证、Route Handler 和 Cookie 指南。沿用服务端逐请求授权，私有响应使用 `private, no-store`。

## 数据与归属

新状态保存在数据目录 `personal/state.json`，仅接受新格式 `schemaVersion: 1`。复用串行写锁和原子替换；目录 0700，状态与密钥 0600。关系与唯一性在提交前统一校验，损坏数据或缺失密钥返回错误，不覆盖重建。

| 实体          | 关键内容与约束                                                                                                             |
| ------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Account       | UUID、用户名及唯一规范化键、密码盐与哈希、创建时间                                                                         |
| Binding       | 工作台 UUID、accountId、平台身份、名称、加密 Token、匹配索引及工作台偏好；一条绑定对应一个工作台                           |
| DeviceSession | UUID、accountId、Cookie 摘要、当前 bindingId 或空值、revision、selectionRevision、设备标签及有效期；当前绑定须属于同一账号 |

账号、绑定、设备各最多 10,000 条，每个账号最多 32 个绑定和 32 台设备；达到上限拒绝新增，保留已有数据。

同账号、同平台实例、相同 Token 去重；匹配索引使用独立密钥，对 accountId、平台、实例和完整 Token 作 HMAC。AES-256-GCM 的 AAD 同时绑定账号、工作台和平台实例。同 Token 绑定到两个账号时生成不同工作台 UUID，发现、权限和私有缓存继续按工作台隔离。

凭据密钥默认位于 `personal/credential-key`，匹配密钥为 `personal/identity-key`；沿用外置凭据密钥配置。密钥轮换工具只处理新格式，保留账号、绑定、会话和工作台引用。

## 注册与账号会话

用户名去首尾空白后为 1–64 字符，拒绝控制字符；以 NFKC 归一化并转小写后的键检查重名，保留输入名称供展示。密码为 8–128 字符，不裁剪或改变内容。注册成功即登录；重复用户名返回 409，错误账号或密码统一返回 401。

密码采用 Node.js 内置异步 scrypt：16 字节随机盐、64 字节派生值，`N=2^17, r=8, p=1, maxmem=256 MiB`，使用等时比较；不存在的账号也执行一次派生。依据 [Node.js 文档](https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback)及 [OWASP 参数建议](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt)。本机 Node v24.21.0 的正确／错误密码实验通过，3 次派生共 956ms，仅作为可行性样本。

注册与登录共用有界入口：每进程最多 2 次派生并发、8 项等待；同规范化用户名 5 分钟内连续失败 5 次后暂缓重试，返回 429 与 `Retry-After`。计数过期清理并限制条目数，不信任客户端转发头识别来源。派生和远程 Token 验证不占用状态写锁，提交时复核唯一性及会话归属。

注册／登录签发新的 32 字节随机 `openfolio-account` Cookie，仅服务端保存摘要；替换当前浏览器原账号会话。Cookie 使用 HttpOnly、SameSite=Lax，HTTPS 下 Secure。沿用 30 天闲置、90 天绝对期限及每天至多一次的闲置续期；普通读取和退出不写 Cookie，避免晚到响应覆盖新登录。

账号登录只校验本地密码，列出绑定不批量验证 Token。新登录的设备不预选 Token；刷新、浏览器重开恢复该设备原选择。会话有效但未选绑定时 `authenticated=true, connected=false`。Token 失效只影响凭据使用，账号会话仍可管理绑定。

## 接口契约

| 接口                                                                                           | 行为                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/accounts/register`                                                                  | `{username,password}` 注册并签发会话                                                                                                                                                |
| `GET /api/session`                                                                             | 返回 `authenticated`、账号 `{id,username}`、全部 `connections`、当前 `workspace`、设备有效期、`browserRevision`、`selectionRevision` 及平台描述；摘要不含哈希或密文，匿名不返回绑定 |
| `POST /api/session` / `DELETE /api/session`                                                    | `{username,password}` 登录／退出当前设备                                                                                                                                            |
| `POST /api/connections`                                                                        | `{providerId,token,label?}` 验证后绑定并选用；重复 Token 恢复同一绑定                                                                                                               |
| `PATCH` / `DELETE /api/connections/[id]`                                                       | `{label}` 命名／账号级解绑                                                                                                                                                          |
| `POST /api/session/switch`                                                                     | `{connectionId}` 验证所属 Token 后切换当前设备选择                                                                                                                                  |
| `POST /api/session/token`                                                                      | 仅主动读取当前绑定的 Token，不接收目标 id                                                                                                                                           |
| `GET /api/session/devices`、`DELETE /api/session/devices/[id]`、`POST /api/session/logout-all` | 列出、撤销单台／全部账号设备；只返回必要设备摘要                                                                                                                                    |

偏好、仓库发现和读取沿用现有接口路径。删除旧 `identities` 响应与身份移除接口，旧 Token 登录请求按新输入契约拒绝。所有个人写入要求同源；已登录的修改操作携带 `X-OpenFolio-Revision`，冲突返回 409 后重新读取会话。

## 并发与撤销

每次操作先验证设备账号，再按 accountId 查绑定，不能仅凭工作台 id 或 Token 指纹取得授权。Token 远程验证前后复核会话、归属与 revision，退出或解绑后的在途添加／切换不能重新建立授权。

绑定列表变化增加该账号各设备的 revision；只有本设备选择变化才增加其 selectionRevision。解绑同时清空所有选中该绑定的设备选择，并增加各自选择代次。浏览器沿用 BroadcastChannel、focus 和定时会话检查；读取代次变化时清除旧上下文，晚到响应不能恢复正文。

设备读取 lease 绑定 accountId、会话、工作台和选择代次，交付前复验。共享发现与刷新只绑定所属账号的工作台：单设备退出停止本设备交付，解绑停止该绑定全部任务，全设备退出停止该账号全部任务。普通退出保留绑定，其他账号不受影响。

平台明确拒绝时清除不可读正文并提示重新绑定；网络故障或限流保留绑定与当前选择。选择目标验证失败时保留原选择。重绑采用解绑后重新添加，不修改另一绑定的密文或归属。

## 界面、部署与验证

沿用 `@open-folio/ui` 表单和现有工作台样式，提供用户自填账号密码的注册／登录表单、未绑定空态、Token 列表及账号设备管理。密码和 Token 提交后清空，不写浏览器持久存储。执行前在现有原型包演示这些流程并取得验收，不依赖整体视觉重构原型。

按 Q1 直接启用新模型，删除旧状态解析、浏览器身份集合及相关兼容测试；运行时不读取 `personal-v2`。正式更新停机后清理旧 `personal-v2`、旧私有仓库／发现缓存；范围不含运维配置和公开原型。新数据目录按正常持久数据管理，后续更新保留。

`withSmokeSession` 改为账号密码登录，每个浏览器独立调用，仍在回调内使用提供的 Cookie；结束时读取最新 revision、退出当前设备，并确认匿名且无可见绑定。绑定仍归账号保留。Agent 用注册接口准备专用验证账号，将 `OPENFOLIO_VERIFY_USERNAME`、`OPENFOLIO_VERIFY_PASSWORD` 仅写入忽略的本地环境配置，沿用现有验证 Token；不输出秘密或复用用户 Cookie。完整验证与交付顺序见 [Plan](plan.md)。

取舍复核：**保留**账号归属、加密、同源检查和读取代次，覆盖真实越权与并发场景；**合并**为一套状态事务与 lease；**删除**旧身份集合和兼容迁移路径。方案不依赖新增外部服务，验证账号在执行时准备。
