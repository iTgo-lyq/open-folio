# 验证记录

## T1：目录对齐

目录按钮覆盖全局居中样式，图标固定占位、标题可换行。`focused viewer` 浏览器回归通过，在桌面及 320px 抽屉逐项检查图标、标题左边界一致且不溢出，同时验证入口切换、历史恢复及抽屉关闭。CSS 与测试格式检查通过。

## T2：加载反馈

浏览器页面加载完成与可选 ready/error 回报独立记录。聚焦预览加载完成后移除正常状态条，Change 原型标签对未回报就绪的页面显示“页面已加载”；仅实际仍未完成加载时提示等待或较慢。明确 error 回报保持告警，重新加载重置当前状态。

- `npm run typecheck` 通过，包括应用及共享 UI。
- 四个修改代码/测试文件的 Prettier 检查通过，`git diff --check` 通过。
- `npm run test:e2e -- tests/browser/previews.spec.ts tests/browser/prototypes.spec.ts`：16 项全部通过。覆盖无桥接页面在超时后仍正常、带桥接 ready、加载后 error、重载清除旧错误、固定 URL 与沙箱、Git 脚本/CSP 错误、分享、缩放、设备、目录、历史与窄屏。

实现差异已由 Agent 自查：未改变发布协议、服务端或隔离策略，前一轮工作台简化改动全部保留。
