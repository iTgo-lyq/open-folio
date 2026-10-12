# 执行证据

## T1：发布 workspace-shell 到 R2 并切换当前及本 Change 的固定引用

已准备项目级 S3 发布适配器及本机配置说明。构建输出为被忽略的 dist；原型源码与 HTML 内容不变。脚本固定版本、条件写入、失败结果替换和公开字节验证均在本地模拟存储环境验证；未连接用户 R2，不能据此认定真实上传通过。

验证：

- `npm test --workspace prototype`：10 项通过，覆盖重复上传、冲突拒绝、内容改变、缺失入口、半途失败重试、权限错误脱敏、公开读取失败、截图引用、配置检查及 CLI 失败结果。
- `node --conditions=react-server --test tests/prototype-publishing.test.ts tests/prototype-tools.test.ts`：15 项通过，覆盖共享发布协议、登记、配置、归档及浏览器校验工具。
- `npm run build --workspace prototype`：输出单个页面；`cmp packages/prototype/preview/workspace-shell/index.html packages/prototype/dist/workspace-shell/index.html` 通过，字节与现有原型完全一致。
- 静态原型校验、`git diff --check` 通过；dist 已被 Git 忽略。
- 对比 origin/main：workflow、当前 manifest、旧 preview 及全部 archive 无差异。未操作历史标签。

用户将通过本地 Agent 操作已登录的 Cloudflare 浏览器。凭据只保存在本地发布机器；仓库 README 与环境变量模板供交接。尚缺真实桶、公开地址和本地上传验证结果，当前入口继续使用既有 Git 产物。

继续时先取得非敏感配置结果，由本地 Agent checkout 本 Change 分支，读取 README 完成上传；收取 request/result 与必要的产物文件，或由本地 Agent 登记后推送同一分支。随后核对公开预览、各视口交互、历史预览，才切换引用、删除当前旧产物并完成验收归档。
