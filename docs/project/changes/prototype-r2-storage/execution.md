# 执行证据

## T1：发布 workspace-shell 到 R2 并切换当前及本 Change 的固定引用

项目级 R2 适配器通过已有 custom 协议生成固定引用。源码留在 Git，dist 被忽略；当前清单与本 Change 引用同一次 R2 发布，本包旧 preview 已删除。原型 HTML 与迁移前字节一致，页面设计和交互未变。截图按 PC Web、iPad、Mobile 三种声明视口发布。

真实发布记录：

- bucket：open-folio-prototypes；公开基址：https://pub-cc623a99ce8e4606a3491cc2d4b4436c.r2.dev。
- version：190a1aec90f9b2b28afee5f73643ab767aeec6e1f03cfb5d6b65194ee76cf97a。
- sourceCommit：192ede7a37346df8ce4acd2bafe61c5f56218a1a。
- digest：sha256:ea9924681db706ae084a6da640c19decfb07ea8cfdd5c9090b09a6be09a7b75d。
- 共 4 个对象、239388 字节，全部公开 GET 的字节及 Content-Type 与本地一致。同请求再次上传成功，result 完全一致，条件写入未覆盖旧对象。
- 用户将桶级凭据同步到当前机器 /home/tiger/.config/open-folio/r2.env，权限 600。凭据不在 Git、workflow、预览引用或执行输出中。

验证与自查：

- `npm test --workspace prototype`：10 项通过，覆盖重复上传、冲突拒绝、内容改变、缺失入口、半途失败重试、权限错误脱敏、公开读取失败、截图引用、配置检查及 CLI 失败结果。
- `node --conditions=react-server --test tests/prototype-publishing.test.ts tests/prototype-tools.test.ts`：15 项通过，覆盖共享发布协议、登记、配置、归档及浏览器校验工具。
- `npm run build --workspace prototype` 通过；删除旧产物前使用 cmp 确认 HTML 字节相同。`validate.mjs --browser` 通过。
- 本地产物及真实 R2 地址均在 Chromium 的 allow-scripts 不透明来源沙箱检查 1440×900、834×1194、390×844、320×720：渲染、模块切换、搜索筛选、配置反馈、Escape 与焦点恢复、适用的侧栏折叠、无横向溢出均通过，无页面异常或失败资源。
- 运行中的 OpenFolio 刷新后，Change API 返回 hosted 引用及三个截图；在工作台打开本 Change 的 R2 iframe 并操作模块切换通过。页面未增加可选的 ready 握手，工作台的未确认就绪提示仍按现有规则显示。
- 以本 Change 最新 custom 配置调用实际服务读取器：旧 change-prototype-preview 的 3 个 Git 入口、prototype-hosting 的旧外壳、迁移前 main 当前入口均可解析；新当前入口解析为 hosted。
- 迁移前为上述 5 个历史入口建立 HTTP 200 与 SHA-256 基线，便于 main 切换后集成复核。对比 origin/main，全部旧 archive 无差异，旧标签未改。
- 新增 25 个依赖的下载地址指向公共 npm registry，逐一核对版本及 integrity 与官方元数据一致。格式检查与 git diff --check 通过。

自查覆盖引用一致性、凭据边界、不可变对象与失败处理、历史保留及实际浏览器交互。未改 Next.js 运行代码，未覆盖运行中服务的 .next 产物。
