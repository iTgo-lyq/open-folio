# T1：冒烟会话清理

新增 `scripts/smoke-session.ts`，用独立 Cookie 包装登录和检查回调；在统一 finally 中读取最新版本、退出或移除本测试浏览器记住的身份，并复查全部授权消失。失败最多尝试三轮，检查与清理同时失败用 AggregateError 保留两项原因。登录 Cookie 在响应解析前捕获，传输错误不输出可能包含凭据的请求诊断。浏览器可使用内存中的 browserCookie，正文与 Agent 约定已说明用法。

验证：

- `node --conditions=react-server --test tests/smoke-session.test.ts tests/credential-api.test.ts tests/browser-identities.test.ts`：36/36 通过，其中新增 12 项，覆盖检查成功、抛错、请求失败、登录 JSON 损坏、最新版本、多身份、版本冲突、退出响应丢失、假成功、永久失败与跨源拒绝。
- `npm run typecheck`：应用与 UI 均通过。
- 新增源码和测试的 Prettier 检查、`git diff --check` 通过。
- 真实服务 `http://127.0.0.1:11117`（运行提交 `62d154e`）：正常回调与故意失败回调分别建立 `51ba84d9`、`acb2b86d`，包装器返回／抛错后均已删除；原 sessions、browsers 与凭据密文、工作台偏好保持不变。
- 实际 Chromium 在开启沙箱的空白上下文中接受 browserCookie，认证读取确认属于测试会话 `0d774482`；故意抛错后关闭上下文并自动退出，最终仍只有 `Mac 浏览器 · a2c64e26`。

Agent 自查完整差异与验收项：检查内容仍由每次任务决定，清理只处理该调用的独立 Cookie，不调用退出全部设备，不直接改运行数据。清理失败显式阻止成功结论；强制终止、持续不可达或登录响应完全丢失的客户端限制已说明。未修改 Next 服务实现，无需重建或重启长期服务。
