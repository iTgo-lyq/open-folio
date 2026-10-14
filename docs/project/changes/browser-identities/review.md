# 独立评审

评审 Agent identity_review 使用隔离上下文只读检查完整差异、需求、方案与验证证据，未修改文件或竞争浏览器／构建服务。初次证据为 161 项单元与 76 项浏览器检查通过。

## R1 延迟添加可恢复已经退出的登录（P1）

原 token 登录在平台验证后才读取浏览器集合；最后一个身份退出后集合消失，revision 校验跳过，延迟请求能创建新集合并写 Cookie，违背退出撤销及旧响应隔离要求。

T3 在平台验证前捕获浏览器 id 与 revision，提交时确认原集合仍存在且未变；缺失集合不能被已在途的登录重建。回归在 token 验证暂停期间移除最后身份，要求延迟登录返回 SESSION_CHANGED、不写 Cookie、保持无集合。

## R2 最终响应复核未绑定原选择（P2）

仓库与发现服务完成 lease 检查后，HTTP 层仍 await 会话更新；稳定 Cookie 在切换后仍 connected，原响应可能交付。普通仓库／发现请求没有隐式当前 revision 头，不能只判断 Cookie 仍有效。

T3 在私有 HTTP 操作前捕获设备授权 id 和 selectionRevision，最终更新会话后比较原选择，包含仓库、发现、列表与原型准备。回归在最终 get 阶段切换，同 Cookie 的原工作台／发现／列表响应必须拒绝，不返回旧正文。

## R3 同身份切回时丢失仓库第一页（P2）

无 BroadcastChannel 时由 focus／定时恢复 A → B → A，选择代次变化仅清空 items，cursor 仍停在第二页，重新读取会跳过首页。

T3 在选择代次变化时同时重置分页、发现和错误元数据；浏览器回归使用多页列表、禁用 BroadcastChannel，触发服务端 A → B → A 后 focus 恢复，要求从 cursor=0 重新读取第一页。

## R4 已提交登录的延迟响应可覆盖新 Cookie（P2）

初次复验发现登录在状态提交后仍等待发现启动，返回前没有检查原选择。等待期间退出最后身份并重新登录创建新集合时，旧请求仍可能写回已失效 Cookie，覆盖新登录；仅切换身份时也会返回旧摘要。

T3 在发现启动后、构建成功响应和 Set-Cookie 前复核登录结果的授权 id、selectionRevision、browserRevision 与 connected。变化时返回 SESSION_CHANGED，且无 Cookie 写入。两个确定性回归暂停 ensure，分别切换以及退出最后身份再登录新集合，要求旧响应 409、不写 Cookie，新身份仍有效。

## 独立复验结论

identity_review 再次只读检查完整差异及所有私有接口、Cookie 写入路径，确认 R1–R4 均已解决，无剩余可操作代码问题。集中单元 38 项通过；无 BroadcastChannel 的 A → B → A 分页浏览器回归 1 项通过。该浏览器回归首次运行因 fixture 第二页无样本而失败，修复为复用首页样本后通过。最终全量验证、生产构建与真实开发机证据继续记录在 execution.md。
