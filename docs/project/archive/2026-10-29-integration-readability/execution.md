# T1：合入差异阅读优化

统一两栏容器高度，列表与差异内容各自滚动，移除各栏独立的 max-height，修复左栏底部留白与右栏更高的问题。压缩合入信息、单行文件路径，使用主题强调色与左侧标记表示当前文件；文件标题、完整路径和操作栏分层，支持长行自动换行。沿用现有差异数据、URL 选择及复制兜底。

## 验证证据

- `npm run typecheck`、`npm run build`、改动文件 Prettier 检查及 `git diff --check` 通过。
- `npm run test:e2e -- tests/browser/integration.spec.ts tests/browser/refactor-layout.spec.ts`：10 项通过。新增覆盖短文件/非文本的两栏高度相等、长行切换换行、独立横纵滚动、标题位置不变及窄屏返回焦点；原有固定提交、深链接、历史导航、复制失败兜底与晚到请求仍通过。
- 自动测试沿用框架创建的隔离浏览器上下文，以兼容测试登录与虚构 Provider；没有使用用户会话。
- 生产构建在临时 11118 端口运行，浏览器使用常驻 Chrome CDP 的新标签页，通过不带 Cookie 的匿名请求读取长期服务上截图对应的归档差异。320/390/834/1440/1920px × 浅色/深色检查通过：两栏等高、主区域无横向溢出、换行可读、无页面错误。截图保存在主工作区 `artifacts/integration-readability/after-<width>-<theme>.png`，修改前截图为 `before-desktop.png`。检查后仅关闭任务页面并断开 CDP。

Agent 自查确认改动只影响合入阅读组件及其局部样式，无新增依赖或服务端契约变化。所有验收项通过，无未解决项。
