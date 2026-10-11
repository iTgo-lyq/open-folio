# T1：自动初始化并可靠保存服务配置

实现默认数据目录下 `config.json` 与显式路径覆盖；首次读取以完整文件独占发布，父目录缺失时自动创建。新增 GET/PUT 配置接口、原文件内容版本校验、单进程写入串行与原子替换。保存保持显式符号链接的目标，损坏配置、非法请求和读写失败均返回具体错误。README 已补充默认部署方式。

验证：`node --conditions=react-server --test tests/config.test.ts tests/store.test.ts` 13 项通过，涵盖 20 次并发首次读取、并发保存冲突、外部修改、无效字段与 JSON、权限失败、符号链接及 API 请求边界；`npm run typecheck`、改动文件 Prettier 检查与 `git diff --check` 通过。页面功能和生产构建由 T2 集成验证。

# T2：在工作台可视化维护配置并立即生效

已接入桌面左下角、移动端顶部和空状态配置入口，项目增删改与全部资源限制表单，以及未保存退出提示、冲突保留与重新加载。保存后使旧请求失效、重载项目列表；移除项目或更换仓库时清除旧来源和内容选择。新增 UI 包通用 Field/Input/Textarea 并同步独立预览；界面沿用现有雾蓝主题。shadcn CLI info、docs、dry-run/view 已核对，生成样式已适配公共 token，未安装额外依赖。

验证：`npx playwright test tests/browser/settings.spec.ts tests/browser/api.spec.ts` 8 项通过，覆盖空配置增删、持久化、限制恢复、冲突、非法输入、仓库替换、未保存退出及 320px 布局；已目视核对 `artifacts/settings-desktop.png` 和 `artifacts/settings-mobile.png`。首轮发现遮罩拦截按钮，已修正为现有弹层层级并复验。`npm run ui:build`、`npm run ui:test`、`npm run typecheck`、`npm run format:check` 通过。生产构建通过，并在临时数据目录下确认构建未创建运行配置。

T2 实施期间用户追加权限与分享需求，保留已授权的配置交付，补充技术与计划后由用户确认继续，按 T3 集成完整访问行为。

独立评审后修正读取超时字段名称，并依据工作台实际已展示 fingerprint 清理外部来源变更后残留选择。新增外部改仓库后只改名称保存的回归；`npx playwright test tests/browser/settings.spec.ts` 6 项通过。


# T3：用管理密码和项目邀请码控制访问与分享

实现环境变量管理密码覆盖、首次运行自动生成 `admin-password` 与独立随机 `access-secret`（私有权限），管理员登录后编辑配置。项目配置加入邀请码，新建及历史项目在面板中自动补充；历史项目未配置邀请码时只允许管理员读取。项目 Cookie 按项目隔离，管理员与访客凭证分离，最长保留 400 天，邀请码本身不自动过期。

分享使用 `?project=...#invite=...`，先移除片段再兑换访问 Cookie，支持首次进入与同页再次打开。更换邀请码后旧链接和 Cookie 在后续请求失效。通用 API、正文、图片、Git 原型 GET/HEAD 与截图入口均要求项目权限，并在异步返回前复核；匿名列表只返回 id、名称与锁定状态。配置读写要求管理员，写操作检查请求来源。独立随机签名密钥避免访客 Cookie 成为管理密码的离线验证器。

验证：

- `npm test`：80 项通过，包含默认路径、文件初始化、并发与保存冲突、私有凭据生成、管理员及项目权限隔离、旧配置保护、凭据轮换、请求格式与大小边界、签名隔离。
- `npx playwright test`：49 项全部通过。权限用空浏览器上下文测试，覆盖所有入口未授权拒绝、手填邀请码、持久状态重新打开、图片与 Git 原型读取、配置管理员登录、剪贴板分享、旧分享及 Cookie 撤销、320px 配置界面；现有阅读、Changes、原型、截图流程完整回归。
- `npm run typecheck`、`npm run format:check`、`git diff --check` 通过。T2 新增公共组件的 `ui:build` 与 `ui:test` 已通过，T3 沿用组件接口。
- `NODE_ENV=production npm run build` 通过；使用全新临时数据路径确认构建不创建配置或凭据。随后在 10683 启动真实生产产物，验证无显式配置时自动创建三个私有文件、生成密码登录、配置写回、邀请码访问与换码撤销，全部通过；测试服务和临时目录已清理。
- 已目视核对 `artifacts/access-mobile.png` 与 `artifacts/access-settings-mobile.png`，输入、按钮和滚动区在 320px 布局中可用。独立 Agent 评审及修正见 Review，复核未发现其他明确阻断问题。

回归曾发现同页 hash 分享未再次验证，以及分支删除后过度清理能力选择，均修正并纳入完整浏览器验证。首次权限测试有一个定位器误匹配 Next 的隐藏提示节点，已收窄到业务提示区域。

边界：文件保存面向单进程部署；外部静态托管原型及缩略图的直接 URL 权限由宿主管理；已经显示或下载的内容无法通过邀请码轮换收回。README 包含默认目录、密码取得方式、持久化、HTTPS 反向代理及分享使用说明。
