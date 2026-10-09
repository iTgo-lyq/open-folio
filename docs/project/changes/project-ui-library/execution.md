# T1 基础 UI 包与前端约定

抽取 Button、IconButton、Badge、EmptyState 及公共 token，主应用的状态标签、空态和文档操作直接消费包入口。前端规范直接写入 AGENTS.md，未新增独立前端规范文档。安装、类型检查、格式检查和 Next 生产构建通过；Changes 与 Specs 浏览器回归 17 项通过，包含文档弹层焦点恢复及 320px 布局。

验证命令：`npm ci --no-audit --no-fund`、`npm run typecheck`、`npm run format:check`、`npm run build`、`npx playwright test tests/browser/changes.spec.ts tests/browser/specs.spec.ts`。

# T6 修复 T1 样式抽取范围

提交后的差异复查发现抽取正则匹配了移动端同名规则，误删无关布局。恢复原样式，仅移除包已接管的基础 Empty/Badge 规则，将其余上下文选择器改为公共组件类名；对原基线差异收敛为 22 行新增、110 行移除。重新通过 Next 生产构建及 17 项 Changes/Specs 浏览器回归，并查看桌面看板与移动详情截图，确认导航、列布局、抽屉和焦点显示正常。

# T2 独立组件预览

Vite 独立入口在 10683 提供组件导航、主题色、按钮状态、图标操作、标签及可切换空态；示例从公共包导入组件。`npm run ui:build`、`npm run ui:test`、`npm run typecheck`、`npm run format:check` 通过。生产预览验证异步按钮防重复点击、键盘操作、空态恢复、320px 无横向页面溢出及无脚本异常；桌面和移动截图已查看。构建的 HTML/CSS/JS 多文件位于被忽略的 dist，未使用 Change 原型关联或私人资源。

# T3 宿主发布与登记协议

新增严格的当前清单、hosted/git 引用、内容摘要与宿主请求/结果协议。prepare/register/recover 在宿主侧运行，登记持共享锁并写入恢复日志；失败、内容变化及已知不可变 URL 冲突拒绝更新。提供显式文件系统宿主适配示例，支持重复发布和完整上传后原子可用；Git 兜底复制独立 Change 快照，归档语义命令调整新式路径，旧格式和归档标签继续兼容。接入/验证/hook 与 skill 同步可选原型规则；增加只修改标题的 retitle 语义命令，将本 Change 展示标题校正为当前范围。

验证：`node --test tests/prototype-publishing.test.ts` 5 项通过，覆盖重复、失败、不完整结果、固定旧版本、路径与符号链接、脏源码、恢复冲突、hosted staged hook、新式 Git 快照归档及远端保留标签；原有契约、工具和状态命令回归 23 项通过。更新后的 setup/validate 与新增发布联合 11 项通过；类型及格式检查通过。宿主示例是可执行测试适配，不代表生产存储已部署。
