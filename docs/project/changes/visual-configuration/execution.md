# T1：自动初始化并可靠保存服务配置

实现默认数据目录下 `config.json` 与显式路径覆盖；首次读取以完整文件独占发布，父目录缺失时自动创建。新增 GET/PUT 配置接口、原文件内容版本校验、单进程写入串行与原子替换。保存保持显式符号链接的目标，损坏配置、非法请求和读写失败均返回具体错误。README 已补充默认部署方式。

验证：`node --conditions=react-server --test tests/config.test.ts tests/store.test.ts` 13 项通过，涵盖 20 次并发首次读取、并发保存冲突、外部修改、无效字段与 JSON、权限失败、符号链接及 API 请求边界；`npm run typecheck`、改动文件 Prettier 检查与 `git diff --check` 通过。页面功能和生产构建由 T2 集成验证。

# T2：在工作台可视化维护配置并立即生效

已接入桌面左下角、移动端顶部和空状态配置入口，项目增删改与全部资源限制表单，以及未保存退出提示、冲突保留与重新加载。保存后使旧请求失效、重载项目列表；移除项目或更换仓库时清除旧来源和内容选择。新增 UI 包通用 Field/Input/Textarea 并同步独立预览；界面沿用现有雾蓝主题。shadcn CLI info、docs、dry-run/view 已核对，生成样式已适配公共 token，未安装额外依赖。

验证：`npx playwright test tests/browser/settings.spec.ts tests/browser/api.spec.ts` 8 项通过，覆盖空配置增删、持久化、限制恢复、冲突、非法输入、仓库替换、未保存退出及 320px 布局；已目视核对 `artifacts/settings-desktop.png` 和 `artifacts/settings-mobile.png`。首轮发现遮罩拦截按钮，已修正为现有弹层层级并复验。`npm run ui:build`、`npm run ui:test`、`npm run typecheck`、`npm run format:check` 通过。生产构建通过，并在临时数据目录下确认构建未创建运行配置。

执行中追加 T3 权限与分享需求，文档已补充，流程回到技术确认；上述 T2 交付基于此前已确认的配置范围，权限行为尚未接入。未将新范围提前记录为实现或验收完成。
