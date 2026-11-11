# 实施与验证

## T1 修复窄屏顶栏覆盖并验证阅读入口交互

基线为最新 develop `301f364` 的产品实现，在完成文档规划与分支登记后，以 `b239a60`（产品代码未变）运行：

```bash
npm run test:e2e -- tests/browser/specs.spec.ts --grep 'reading settings persist' --reporter=line
```

结果 1 failed：较大字号与专注阅读后，320px 下点击能力目录按钮直到 30 秒超时；trace 记录「本页目录」按钮拦截点击。日志 `/tmp/openfolio-narrow-toolbar-baseline.log`，原始失败 trace 另存 `/tmp/openfolio-narrow-toolbar-baseline-results/`。

工作区复用已完成交付且干净的当前 checkout，分支已独立切换为 `codex/narrow-reader-toolbar`，主工作区继续保持 develop。此前 `.env`／`.env.local` 在主工作区存在；本次 fixture 使用独立模拟账号、端口 10682/10684 与 `.next-e2e`，无需复用真实服务配置。原生 Playwright 套件需要隔离账号与权限，沿用其独立 context，不操作共享 Chrome 默认 Cookie；不运行模型测试。
