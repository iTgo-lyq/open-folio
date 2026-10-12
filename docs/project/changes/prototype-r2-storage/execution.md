# 执行证据

## T1：发布 workspace-shell 到 R2 并切换当前及本 Change 的固定引用

已准备项目级 S3 发布适配器及本机配置说明。构建输出为被忽略的 dist；原型源码与 HTML 内容不变。脚本固定版本、条件写入、失败结果替换和公开字节验证均在本地模拟存储环境验证；未连接用户 R2，不能据此认定真实上传通过。

验证：

- `npm test --workspace prototype`：10 项通过，覆盖重复上传、冲突拒绝、内容改变、缺失入口、半途失败重试、权限错误脱敏、公开读取失败、截图引用、配置检查及 CLI 失败结果。
- `node --conditions=react-server --test tests/prototype-publishing.test.ts tests/prototype-tools.test.ts`：15 项通过，覆盖共享发布协议、登记、配置、归档及浏览器校验工具。
- `npm run build --workspace prototype`：输出单个页面；`cmp packages/prototype/preview/workspace-shell/index.html packages/prototype/dist/workspace-shell/index.html` 通过，字节与现有原型完全一致。
- 静态原型校验、`git diff --check` 通过；dist 已被 Git 忽略。
- 对比 origin/main：workflow、当前 manifest、旧 preview 及全部 archive 无差异。未操作历史标签。

2026-10-12 用户回报本地 Agent 已完成配置（账号权限以用户回报为依据，远端未登录控制台）：

- bucket：open-folio-prototypes；Account ID：af076b9d914da91e433420ebf090d43e。
- 公开基址：https://pub-cc623a99ce8e4606a3491cc2d4b4436c.r2.dev。
- 凭据只保存在用户 Mac 的 /Users/bytedance/.config/open-folio/r2.env；仅该桶 Object Read & Write，目录 700、文件 600。远端无法读取此本地文件。

已交接本地上传步骤：独立检出本 Change 分支，构建并生成三个声明设备的截图，prepare 后使用本机配置上传，只回传无密钥的 request/result JSON。远端收取记录及已发布产物后核对摘要、公开预览、各视口交互和历史预览，才登记引用、删除当前旧产物并完成验收归档。尚未收到真实上传结果，当前入口继续使用既有 Git 产物。
