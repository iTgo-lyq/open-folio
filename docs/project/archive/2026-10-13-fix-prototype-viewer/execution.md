# 验证记录

## T1：目录对齐

目录按钮覆盖全局居中样式，图标固定占位、标题可换行。`focused viewer` 浏览器回归通过，在桌面及 320px 抽屉逐项检查图标、标题左边界一致且不溢出，同时验证入口切换、历史恢复及抽屉关闭。CSS 与测试格式检查通过。

## T2：加载反馈

浏览器页面加载完成与可选 ready/error 回报独立记录。聚焦预览加载完成后移除正常状态条，Change 原型标签对未回报就绪的页面显示“页面已加载”；仅实际仍未完成加载时提示等待或较慢。明确 error 回报保持告警，重新加载重置当前状态。

- `npm run typecheck` 通过，包括应用及共享 UI。
- 四个修改代码/测试文件的 Prettier 检查通过，`git diff --check` 通过。
- `npm run test:e2e -- tests/browser/previews.spec.ts tests/browser/prototypes.spec.ts`：16 项全部通过。覆盖无桥接页面在超时后仍正常、带桥接 ready、加载后 error、重载清除旧错误、固定 URL 与沙箱、Git 脚本/CSP 错误、分享、缩放、设备、目录、历史与窄屏。

实现差异已由 Agent 自查：未改变发布协议、服务端或隔离策略，前一轮工作台简化改动全部保留。

## 开发机更新与实际验收

`npm run service:update` 按停止、构建、启动顺序完成，生产构建成功；服务运行已提交且干净的实现 `2d78febf71f36f3b0aa8132cacab01352047f942`，buildId 为 `nH-wz50IBu8C9Z9d7aQJc`，端口 10680。未重置运行数据、登录或工作台偏好。

通过 Git 忽略环境配置中的验证 Token 登录本机服务，读取真实 GitHub 仓库及清单，直接加载清单中的公开 R2 固定页面。三个已发布原型在 1440px 与 320px 均显示内容；目录图标和标题左边界一致、无溢出，手机切换后关闭抽屉。加载完成无错误状态条，重载状态正常，沙箱仍为 allow-scripts，无页面运行错误。验证设备已退出，不影响其他设备。

已查看实际桌面截图及手机目录截图，确认与截图中的两个问题对应。证据截图位于 Git 忽略的 `artifacts/prototype-viewer-real-desktop.png`、`prototype-viewer-real-directory-mobile.png` 和 `prototype-viewer-real-mobile.png`。本次验证使用本机服务及真实公开原型；Merlin 网关外部认证不属于本次冒烟范围。
