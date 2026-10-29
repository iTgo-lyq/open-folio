# T1 Agent 文本分享与双复制入口

交付 `/share/agent` 的 Markdown 文本响应与按篇链接、同快照正文和资源、超大材料目录、可读错误及双分享复制入口。复制入口由 Astra 设计实现，沿用现有组件；更新 README 使用说明，无持久数据迁移。

## 验证证据

- `node --conditions=react-server --test tests/shares.test.ts tests/personal-sessions.test.ts tests/credential-api.test.ts`：34 项通过，覆盖全文、单篇、代理地址、普通引用和 GFM 脚注隔离、归档解析、托管 URL、超大目录、参数与范围、失权和快照竞争，并回归共用的来源解析与会话授权。
- `npm run typecheck`、相关文件 Prettier check 和 `git diff --check`：通过。
- `npm run build`：最终实现生产构建通过，包含动态 `/share/agent` 路由；构建只使用本 worktree 的 `.next`，未覆盖运行中常驻服务产物。
- 复用 `http://127.0.0.1:9222` Chrome，以临时 Playwright browser fixture 接入 CDP，运行 `change-sharing.spec.ts` 全部 7 项及 `change-reader.spec.ts` 的材料/复制降级用例：8 项通过。为避免虚构 fixture 账号写入用户浏览器 Cookie，框架使用独立 context，未改默认 context 或他人页面；已关闭本次 context 并断开连接。临时 CDP 包装文件已删除。
- Astra 在同一 Chrome 独立 context 核对 1440、390、320px 的浅色和深色界面：六组均无水平溢出、遮挡或裁切，Tab 焦点与 Escape 返回正常。测试账号退出返回 200，context 已关闭。截图位于 `artifacts/agent-sharing-{1440,390,320}-{light,dark}.png`。
- 使用最终 `.next` 在独立临时数据目录、回环端口 10683 启动真实 Next 生产服务：GET/HEAD 对不可用来源返回 404 文字且禁止缓存，HEAD 无正文；非法参数为 400 文字，POST 为 405 且无 HTML。临时服务与数据用后清理，不涉及真实账号或常驻数据。
- 独立评审及问题复验通过，详情见 [Review](review.md)。

## 范围外观察

额外执行的既有「adjacent Changes follow the filtered directory order and return to the current row」用例未通过：原用例在 `group=none` 后等待「按阶段看板」；临时改为实际的「不分组看板」后，又发现看板第二项与详情相邻导航目标不一致。导航相关实现与 origin/develop 相同，未涉及本次分享改动；临时用例调整已撤回，不将该用例计为通过，也不扩展本 Change 修复范围。

## 交付边界

用户已明确验收通过，要求归档合入 develop 并更新常驻服务。归档前同步最新 develop，纳入已归档的窄屏原型工具栏修正，无合码冲突；原有分享验证证据仍适用，集成后的构建和服务冒烟按仓库约定执行。图片及原型提供引用而非视觉转写；超过 512 KiB 的材料正文只按明确目录分篇读取；分篇快照更新后需要重新读取入口。
