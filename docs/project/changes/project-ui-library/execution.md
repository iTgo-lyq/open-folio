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

## T4 托管预览与 Change 固定分享

工作台区分 hosted 与 Git 产物，按项目 prototypeOrigins 校验页面和截图来源；后端不请求远端地址。托管 iframe 保持不透明来源沙箱，支持可选版本握手、未确认提示和独立打开，固定 URL 不追加参数、不使用跨域 HEAD 探测。新 Git 引用可直接读取 Change 内快照。宿主桥接补充了消费方所需类型说明。

验证：previews 单元测试 9 项通过，覆盖固定托管版本、来源拒绝、缺失源码提交和 Change 快照；类型检查通过。10 项相关浏览器检查中 9 项直接通过，1 项因新增测试入口导致旧数量断言失败，更新断言后单独复验通过。实际 HTTPS 测试宿主用 Vite 构建 React 与共享 Button，JS/CSS 多资源、点击交互、沙箱与未接桥接超时均通过；Git 隔离、尺寸切换、固定链接及截图回归通过。未部署生产托管。

用户追加要求旧存档直接迁移并删除兼容路径，后续 T7 将取代本任务中暂时保留的旧格式读取；不改写本检查点已验证事实。

## T5 main 当前页面总览

快照固定 main 的配置与 prototype.json，按入口 id 展示名称、说明、类型和适配，不再扫描 Change 或展示关联版本选择。直接预览及分享固定到 main 清单提交；当前入口无需 Change。清单错误、未发布、截图缺失均独立说明。为三个已有项目原型显式登记当前清单，组件库预览未混入。缓存 2→3 原样保留 archivePins，再刷新 main 清单。

验证：12 项当前清单及预览单测通过，覆盖开发分支隔离、main 删除/重命名、源码变化不更换产物、损坏或缺失描述、无 main、固定链接及旧 pin 保留；类型检查与生产构建通过。11 项预览/总览/截图浏览器场景通过，含托管 React 产物、宿主生成 PNG、Git 离线截图、名称/说明筛选、固定链接、键盘返回及 320px 布局。调整卡片截图容器后聚焦布局复验通过；截图位于 artifacts/prototype-catalog-* 与 prototype-thumbnails-*。总览合入 main 后才会显示本项目登记入口。

## T7 旧 HTML 存档迁移

按用户追加指令，删除 PreviewEntry 顶层 path 的共享校验、类型及读取分支；离线一次性 migrate.mjs 负责旧格式转换，工作台只接受 artifact。迁移实际 archive/change-prototype-preview 的 3 个产物，从原保留提交 4aa15437403153400624d59a4402dc2137862af5 读取字节，复制到该归档的 previews 目录，保留其他关闭事实。新保留标签使用 archive-v2 命名空间，原 archive 标签不改写；新 pin 使用完整命名空间键，旧缓存 pin 原样留存。

验证：61 项现有单元测试全部通过；新增迁移端到端测试通过，覆盖重复执行、原字节/原标签保留、拒绝覆盖后续内容、新归档固定预览及旧格式链接拒绝。真实 3 个文件逐字节核对通过；类型检查和 11 项相关浏览器场景通过。旧格式固定链接需要改为迁移后生成的新链接，这是用户要求移除兼容后的明确行为。
