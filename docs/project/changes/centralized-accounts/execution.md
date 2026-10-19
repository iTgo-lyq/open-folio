# 执行证据

## T1

实现账号、账号绑定与设备会话的新格式；异步 scrypt、有界派生入口、随机账号 Cookie、账号归属的加密 Token 和读取 lease 已接入。注册与密码登录不调用 Git 平台；无 Token 的账号可登录及管理设备。旧状态解析、旧 Token 登录和浏览器身份集合接口已移除，没有兼容或迁移路径。

单元／接口验证：`node --conditions=react-server --test tests/personal-sessions.test.ts tests/credential-api.test.ts tests/workspace-preferences.test.ts tests/discovery.test.ts tests/repositories.test.ts`，34 项通过；覆盖注册唯一性、错密、限流、Cookie、私密摘要、加密、重启恢复、权限及仓库读取。完整 `npm test` 首轮 229 项通过。

浏览器 `personal.spec.ts` 5 项通过：自填注册 → 首次绑定 → 仓库阅读、刷新恢复、失效 Token、错误密码及退出后绑定恢复，以及 834／390／320px。绑定列表和设备的基础界面与状态事务同此次替换接入；跨浏览器并发验证继续由 T2 完成。
