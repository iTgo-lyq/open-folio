# 原型验证

入口为 `packages/prototype/src/pages/account-login.html`，复用现有外壳和设计规范。浏览器 A／B 为同页内存模拟，共享账号绑定、分别保存登录与 Token 选择；示例账号和 Token 见原型包 README。

运行 `npm run build --workspace prototype` 与一次性 Playwright 检查 `node /tmp/openfolio-account-prototype-check.mjs`。在 `sandbox="allow-scripts"` 和项目 CSP 下，九组检查通过：跨浏览器恢复与独立选择、命名及全设备解绑、无效输入与重复绑定及复制、单台／全台退出、自填注册与空态、账号隔离与错误密码及 Enter 提交、凭据失效与网络重试及晚到响应、Escape 与焦点及键盘页签、四种视口布局。

覆盖 1440×900、834×1194、390×844、320×720；没有横向溢出、脚本错误或外部资源请求。截图位于忽略的 `artifacts/account-login/`；发布卡片使用构建目录中的标准设备截图。
