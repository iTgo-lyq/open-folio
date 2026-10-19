# 原型验证

入口为 `packages/prototype/src/pages/account-login.html`，复用现有外壳和设计规范。浏览器 A／B 为同页内存模拟，共享账号绑定、分别保存登录与 Token 选择；示例账号和 Token 见原型包 README。

运行 `npm run build --workspace prototype` 与一次性 Playwright 检查 `node /tmp/openfolio-account-prototype-check.mjs`。在 `sandbox="allow-scripts"` 和项目 CSP 下，九组检查通过：跨浏览器恢复与独立选择、命名及全设备解绑、无效输入与重复绑定及复制、单台／全台退出、自填注册与空态、账号隔离与错误密码及 Enter 提交、凭据失效与网络重试及晚到响应、Escape 与焦点及键盘页签、四种视口布局。

覆盖 1440×900、834×1194、390×844、320×720；没有横向溢出、脚本错误或外部资源请求。截图位于忽略的 `artifacts/account-login/`；发布卡片使用构建目录中的标准设备截图。

固定[预览入口](https://pub-cc623a99ce8e4606a3491cc2d4b4436c.r2.dev/open-folio/cdc2cda4422525ad7a4c476145f53bb751462abb8c558159e0f78a8fd6fd06a9/index.html)用于账号流程评审；`#login` 直达登录。源码提交为 `d59c6a3`，R2 适配器已验证 HTML 及三种标准设备截图的公开读取与字节一致性，引用登记在项目清单和本 Change。

`validate.mjs --browser` 验证全部 7 个原型入口通过。通过 `withSmokeSession` 登录真实工作台并刷新项目后，逐项切换 PC、iPad、手机筛选，确认新卡片 `img.complete && naturalWidth > 0`，图片地址与发布结果一致；从卡片进入嵌入原型，以 Enter 完成示例账号登录。卡片截图保存在 `artifacts/account-login/gallery-*.png`。浏览器在回调内关闭，包装器已验证退出且无残留浏览器授权。
