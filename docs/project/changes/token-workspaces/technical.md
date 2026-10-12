# Token 工作台技术方案

本方案落实 [需求](./requirement.md)：平台实例内完全一致的 token 恢复同一工作台，设备会话独立，跨 token 缓存隔离，主动复制当前凭据。主流程由 `token-workspaces` 原型演示，固定预览见本 Change 的 previews 引用。

[打开交互原型](https://pub-cc623a99ce8e4606a3491cc2d4b4436c.r2.dev/open-folio/e21b69aa1a1a3e6d991ec6f67fa56fd64a3897a42191c6302f5c98561b4be3e8/token-workspaces/index.html)。顶部可切换新设备恢复、不同 token、凭据失效与旧连接迁移；示例用户名为 demo-user，示例 token 为 demo 或 demo-other。

## 方案

### 凭据工作台与设备会话

将现有“Session 内含多个 Connection”拆成持久工作台与设备会话，沿用文件原子写入、单实例锁、服务端加密和 ProviderRegistry，不引入数据库或 OAuth。

工作台使用随机 UUID 作为稳定 ID。内部匹配索引为 `HMAC-SHA256(identityKey, JSON.stringify([providerId, instanceId, normalizedToken]))`；token 的规范化只移除表单首尾空白，保持大小写与内部字节。摘要只用于服务端索引，不进入响应、URL 或目录名。identityKey 为独立的 32 字节私有密钥，避免 AES 密钥管理改变工作台身份。

| 记录            | 核心字段                                                                                                                     | 约束                                              |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Workspace       | id、credentialFingerprint、providerId、instanceId、identity、gitUsername、label、encryptedCredential、preferences、createdAt | 每个平台实例与 token 只有一个工作台；凭据不可替换 |
| DeviceSession   | id、cookieHash、workspaceId、createdAt、lastSeenAt、expiresAt、absoluteExpiresAt、displayLabel                               | 一个设备会话只属于一个工作台；Cookie 独立随机生成 |
| LegacySelection | 旧 Cookie 摘要、原 sessionId、connectionId 到 workspaceId 映射、expiresAt                                                    | 只用于有期限的迁移选择，不是普通工作台会话        |

新存储位于数据目录 `personal-v2/state.json`，单文件包含 schemaVersion、workspaces、sessions 与 legacySelections，使归属和会话撤销可以一次原子提交。目录 0700、状态和秘密文件 0600。工作台数量与设备会话数量各设置明确上限；沿用当前 10,000 总量等级，单工作台最多 32 个有效设备会话，达到上限提示用户先撤销旧会话。

token 用 AES-256-GCM 加密，随机 nonce，AAD 绑定新 schema、workspaceId、providerId 与 instanceId。加密密钥继续支持 OPENFOLIO_CREDENTIAL_KEY_FILE；默认新目录使用 credential-key，另保存 identity-key。已有新状态但任一必需密钥缺失时拒绝恢复，不生成替代密钥。密钥轮换保留工作台 UUID，并在停机状态重新加密、重建私有匹配索引；不把更换加密密钥等同于更换用户 token。

### 登录、恢复与切换

登录输入 `{ providerId, username, token, label? }`，实例由适配器配置决定。先验证输入和限额，再调用适配器验证 token；取得平台身份后核对适配器与实例边界，在存储锁下匹配或建立工作台，并创建独立设备会话。并发首次登录相同 token 必须收敛到同一个 workspaceId。

POST /api/session 承载登录与切换；GET /api/session 返回 `{ connected, workspace?, expiresAt?, providers, legacyChoices? }`，工作台摘要不包含指纹或密文。旧 POST／PUT /api/connections 的新增与替换入口退出使用，返回明确的重新登录提示，不保留按 subjectId 替换旧工作台的旁路。

用户名由适配器处理：增加可选登录输入字段及返回的有效 Git 用户名，ProviderContext 的 gitUsername 来自服务端验证结果，不信任浏览器直接提供的 GitTransport。GitHub 适配器使用平台返回的 login；表单填写其他用户名时给出明确不匹配错误，不因此创建另一个工作台。其他适配器可规范化传输用户名，通用存储不包含 GitHub 特有分支。用户名改名不改变凭据匹配索引。

恢复已有工作台仍要向平台验证当前 token，不接受仅凭本地摘要命中登录。普通 Cookie 恢复只返回安全摘要，真正读取继续走完整授权链；平台短暂失败不删除工作台或当前会话。

切换先完成新凭据验证和工作台建立，再在同一次状态提交中撤销当前设备旧会话并签发新 Cookie。旧会话的在途交付因此失效；其他设备的旧工作台会话保持有效。验证失败不提交任何切换。即使不同 token 返回同一个 subjectId，也分别匹配不同工作台，不沿用原有“同账号替换 Connection”行为。

工作台偏好只保存最近仓库与模块、侧栏折叠状态，不扩展为任意用户资料。PATCH /api/session/preferences 同源更新当前工作台的白名单字段，原子合并实际修改字段；相同 token 的设备共享这些偏好。正文与滚动位置仍是当前页面状态。偏好不能授予仓库读取权限，恢复时重新验证目标；切换清除旧页面状态。

### 会话有效期与撤销

Cookie 延续 openfolio-session、Path=/、HttpOnly、SameSite=Lax、HTTPS 下 Secure。默认 30 天未活动过期、90 天绝对有效期；已认证请求更新活动记录，以一天为写入与 Set-Cookie 节流间隔，续期不轮换其他设备 Cookie。绝对期限到达后要求重新提供 token。客户端定时发现请求也属于已认证活动，绝对期限保证不会无限延长。

GET /api/session 返回当前工作台摘要及有效期；会话过期时清 Cookie，不删除工作台。DELETE /api/session 只撤销当前设备。POST /api/session/logout-all 撤销该工作台所有会话。GET /api/session/devices 与 DELETE /api/session/devices/:id 仅列出或撤销当前工作台的设备；列表不返回 Cookie、摘要或详细网络指纹。

所有设备写操作复用现有 HTTPS 与同源校验。设备注销前先原子持久化撤销，随后中止该设备的读取请求；长操作 assertCurrent 同时检查设备会话、workspaceId 和工作台凭据，不能因为工作台仍存在就交付已撤销设备的响应。

### 发现、读取与缓存

ReadContext 包含 deviceSessionId、workspaceId、工作台连接摘要和 ProviderContext。每个工作台只有该 token 对应的稳定连接；客户端连接选择收敛为当前凭据工作台，API 中旧 connectionId 通过有归属校验的兼容映射处理，不用于跨工作台选取凭据。

发现状态与 Git／快照分别写入 discovery-v2/<workspaceId> 和 repositories-v2/<workspaceId>/<repositoryKey>，不包含设备会话 ID。不同 workspaceId 不共享 Git refs、快照、发现结果、错误、写锁或异步任务。公开原型的既有独立发布目录继续公开，不归入私有缓存。

相同 token 的发现与 Git 写入按工作台串行去重；并行设备读取仍使用各自有效会话验证与交付。共享发现任务归属于工作台，用该工作台 token 验证远端；单设备退出只取消该设备请求，不能中止其他设备正在使用的工作台任务。退出全部设备取消该工作台任务，但不删除已提交结果。主动重试可以恢复发现进度。

保留每次读取的身份、仓库 API、Git refs 校验及长操作交付前复验。权限无法确认不回退旧正文，也不借用不同 token 的工作台。token 不变但平台权限改变时，缓存所在域不变，读取资格立即重新判断。

### 主动复制 token

新增同源 POST /api/session/token，只接受当前设备 Cookie，不接受任意 workspaceId 或 connectionId。请求验证当前有效会话，解密其工作台凭据，响应前再次确认会话未撤销或切换，再返回 `{ token }`。沿用 private、no-store 与 nosniff 响应头；接口与请求日志不记录明文。

普通摘要始终不包含凭据。用户点击“复制 token”时才请求接口，再调用剪贴板 API；完成或失败后不把 token 放入组件长期状态。剪贴板权限不可用时，在本次操作弹层提供短暂的只读文本供手动复制，关闭或切换清除。复制动作可重复，按钮显示复制成功或失败；不复制设备 Cookie，不生成另一个登录秘密。

### 旧部署迁移与回退

新版本启动时，在独占写入锁内检查新状态是否存在。若已有新状态，只验证并使用新数据；若不存在且有 personal-v1，则先验证旧 schema、密钥及全部密文。迁移期间停止旧版本服务，避免两个版本同时写同一个部署。

按平台、实例和完整解密 token 匹配工作台；重复 token 取稳定的首次记录作为工作台元数据基线，归并来源映射。所有新密文重新生成 nonce 和 AAD，绝不只搬旧 JSON。默认 AES 密钥从已验证旧密钥复制到新私有目录；外部密钥保持原引用。identity-key 只在没有新状态时首次创建。

在受控 staging 目录构造新状态和发现／缓存，保存迁移映射与原始状态内容摘要。一个 token 多份旧缓存不拼接 Git refs 或不同快照：按同一仓库选择完整且更新时间最新的一份作为可恢复基线，其他历史保留在旧目录。旧 connectionId 和 revision 只用于证明来源属于同一 token，读回仍必须重新授权。遇到无法证明归属的文件只保留在备份，不挂入新工作台。

先完成并验证所有新文件，再原子发布 state.json，作为启用新 schema 的完成标记。中断可按映射幂等继续，已发布时不重新生成 workspaceId；原 personal-v1、repositories-v1、discovery-v1 保持受控备份，不在升级时删除。实施验证包括密钥缺失、中间失败、重复运行及错误归并负例。

单连接旧 Cookie 可兑换为对应新设备会话。多连接旧 Cookie 进入一次性的凭据选择页，摘要只包含原会话已拥有的连接；选择后用对应 token 重新验证，兑换为一个工作台会话并使旧选择凭证失效。其他工作台保留，之后用其 token 登录恢复；新设备输入某一个 token 不能看到旧会话其他 token 的选择列表。

POST /api/session/restore 只接受 legacyChoices 中的旧 connectionId，复核有效旧 Cookie、来源映射和当前 token 后完成兑换；不能凭 connectionId 单独登录。选择摘要请求不会解密后返回 token，移除旧选择凭证和签发新设备会话属于同一次提交。

回退必须停机，并保留新目录完整备份后恢复旧版本与其成套数据／密钥。新设备 Cookie 不自动转换为旧 Cookie，需要重新提供 token；不宣称回退能够携带新会话或合并新快照。正常清理必须先确认备份及旧引用不再需要，不作为升级步骤自动执行。

### 产品流程与原型

沿用现有玻璃导航和阅读工作面。登录页展示受信平台实例、Git 用户名、token 和登录动作；没有尚未支持的平台菜单。当前凭据页展示账号摘要、复制 token、切换凭据、设备会话、退出当前设备与退出全部设备。

同 token 新设备登录直接恢复工作台；不同 token 初次进入发现流程。切换时清空前一工作台客户端正文、列表与错误，防止旧响应覆盖新工作台。分享链接仍只包含仓库身份与阅读位置，原型保持公开。

交互原型只接受 demo 与 demo-other 两个示例 token，在内存演示恢复与隔离，不验证、保存、复制任何真实凭据，也不读取后端或浏览器持久存储。

## 影响与前置条件

- 改变个人存储 schema、设备退出语义、连接替换语义及主动读回秘密的边界；这些改动必须同步 README 和最终 Specs，不能以局部表单改动交付。
- 使用既有 Node.js 24、Next.js 16.3.7、Playwright、Git 与持久磁盘；框架认证指引已从安装包读取。原型沿用已配置的 custom R2 托管，不创建新存储服务。
- personal-workbench 交付提供所需实现，当前尚待人工验收。允许同分支规划，实施前必须完成其关闭与归档；不把本次需求认可记作前一交付的人工验收。
- 完全相同 token 由服务端指纹匹配的可行性来自现有 SecretHandle 和加密密钥设施；尚未实现新 schema、设备并发与迁移，验收前不描述为已接通。

## 验证

使用无真实凭据的测试适配器验证相同 token 并发收敛、不同 token／实例分离、用户名改名、重启恢复、独立会话续期／撤销、失败切换原会话保留、密文权限与缺失密钥拒绝恢复。

用现有 Git 集成夹具验证同 token 两设备复用已授权快照，不同 token 即使同账号同提交仍使用独立目录；测试撤权、HEAD、附件、历史快照和交付时撤销，覆盖共享发现及写锁。

迁移夹具包含一个连接、多连接、重复 token、多个 revision、同账号不同 token、不同平台实例和中断；断言来源映射、可恢复缓存、旧 Cookie 选择边界和备份完整。复制接口验证同源、设备会话归属、撤销竞争、no-store 及普通摘要无秘密。

浏览器用两个独立 context 演示登录恢复、切换隔离、复制、退出与响应过期；覆盖桌面、平板、手机和 320px。执行相称的类型、格式、单元／集成、生产构建和原有阅读／公开预览回归，整体验证按 large 进行独立评审。
