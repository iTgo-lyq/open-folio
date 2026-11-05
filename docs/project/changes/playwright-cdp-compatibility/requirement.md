# 修复仓库 Playwright 的共享 Chrome 连接

仓库验收脚本连接常驻 Chrome 时，应能跳过缺少 `browserContextId` 的扩展后台进程，并继续操作自己的标签页。

将 `playwright` 和 `@playwright/test` 固定为包含上游修复的同一版本。采用已发布的 `1.65.0-beta-1793840934000`，该版本已包含跳过异常目标的修复，当前正式版 `1.64.1` 仍保留断言。同步服务端截图渲染器的缓存版本，已发布截图继续使用其固定产物。[上游修复](https://github.com/microsoft/playwright/pull/43674)

使用仓库自身依赖验证共享 Chrome 的异常目标处理、独立标签页读取和清理。验证带沙箱的 Chromium 截图、原型浏览器回归和生产构建。
