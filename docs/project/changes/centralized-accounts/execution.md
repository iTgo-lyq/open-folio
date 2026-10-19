# 执行证据

## T1

实现账号、账号绑定与设备会话的新格式；异步 scrypt、有界派生入口、随机账号 Cookie、账号归属的加密 Token 和读取 lease 已接入。注册与密码登录不调用 Git 平台；无 Token 的账号可登录及管理设备。旧状态解析、旧 Token 登录和浏览器身份集合接口已移除，没有兼容或迁移路径。

单元／接口验证：`node --conditions=react-server --test tests/personal-sessions.test.ts tests/credential-api.test.ts tests/workspace-preferences.test.ts tests/discovery.test.ts tests/repositories.test.ts`，34 项通过；覆盖注册唯一性、错密、限流、Cookie、私密摘要、加密、重启恢复、权限及仓库读取。完整 `npm test` 首轮 229 项通过。

浏览器 `personal.spec.ts` 5 项通过：自填注册 → 首次绑定 → 仓库阅读、刷新恢复、失效 Token、错误密码及退出后绑定恢复，以及 834／390／320px。绑定列表和设备的基础界面与状态事务同此次替换接入；跨浏览器并发验证继续由 T2 完成。

## T2

绑定列表按账号共享，命名、去重、选择及全设备解绑已接通；账号设备可单台或全部退出，绑定保留。每台设备的选择和读取代次独立，绑定列表变化只更新列表版本；共享任务按账号工作台隔离。

`account-connections.test.ts` 与 `repositories.test.ts` 合计 25 项通过，包含两个账号绑定完全相同 Token 时的实际复制目标限制、偏好及私有快照隔离；在途绑定和切换遇到退出、解绑或代次变化均不能恢复授权。浏览器定向 13 项通过，覆盖账号跨浏览器恢复、独立选择、同浏览器标签页晚到响应、A → B → A、复制、设备及 R2 Unicode 修复。独立评审及修复见 [Review](review.md)。

另补两项浏览器用例通过：其他浏览器解绑后晚到正文无法返回；正在使用的 Token 被平台撤销时清除正文，但账号保持登录且可选其他绑定。临时平台故障保留上下文由既有 `automatic-refresh.spec.ts` 及新的受控会话测试覆盖。
