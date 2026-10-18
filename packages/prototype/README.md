# 原型构建与 R2 发布

本包维护 workspace-shell 外壳与 personal-workbench 个人工作台方案，设计依据见 [DESIGN.md](DESIGN.md)。源码入 Git，`npm run build --workspace prototype` 输出各自的自包含 `dist/<id>/index.html`。构建不会上传或改动清单，dist 不提交。

blue-glass-workbench 是蓝色玻璃工作台的独立视觉方案，覆盖仓库搜索与收藏、Specs 阅读、Change 详情、原型设备预览和明暗主题。仅使用示例数据，交互在内存运行；不是正式工作台的已上线界面。源码与设备快照一并内联，不访问外部资源。发布该页时，可单独以 `dist/blue-glass-workbench` 为产物目录，入口为 `index.html`，避免重新发布其他页面。

clarification-detail 聚焦 Change 详情概览中的澄清问答，沿用当前抽屉布局；顶部可切换问答、无记录和长文本示例，支持关闭与重新打开详情。

change-integration 演示“合入变更”页签：切换文件阅读统一 diff，查看归档移动、二进制与大文件限制；顶部切换合入记录、正常空态、异常、读取失败和加载场景。窄屏在文件列表与正文间切换；复制只使用示例提交，失败时提供手动复制。

personal-workbench 顶部可切换首次连接、发现中、空结果、部分失败、连接失效、无权限和公开原型。连接表单只接受 `demo`，不验证或保留真实 token；仓库与记录均为示例。URL hash 保留当前页面，全部交互在内存运行。

token-workspaces 演示同 token 多设备恢复、不同 token 独立工作台、浏览器记住多个身份与点选切换、单独移除、复制 token 和设备退出。两个示例 token 都属于 `demo-user`，可填写显示名称；只接受 `demo` 与 `demo-other`。顶部可选择双身份、目标凭据失效及切换时网络故障；状态仅保存在内存，复制也只处理这两个示例值。顶部场景栏为评审工具，不进入产品。

## 首次配置

在 Cloudflare 控制台开通 R2，创建 Standard 桶，启用 Settings → Public Development URL。r2.dev 用于开发预览且有限流；正式使用可连接自有域名。不要给历史版本设置自动删除规则。

创建只授权该桶的 Object Read & Write S3 API 凭据。按[根目录环境变量模板](../../.env.example)在发布机器的仓库根目录 `.env` 中填写五项 `R2_*` 配置；首次配置可复制模板，已有 `.env` 时补充对应项，文件权限设为 600。凭据只在发布机器使用，不放聊天、Git 或 workflow。

发布 CLI 依据脚本位置自动定位仓库根目录，使用与开发服务相同的 `@next/env` 加载方式，无需 `--env-file`。进程环境变量优先于 `.env.local` 和 `.env`，也支持 Next.js 对应环境的文件；默认按 production 加载。以当前工作目录解析 request/result 路径。

本适配器使用默认 jurisdiction 的账户 endpoint。公开地址填桶的 r2.dev 或已绑定域名，不填 S3 API 地址。Standard 有免费额度，超额按 [R2 定价](https://developers.cloudflare.com/r2/pricing/) 计费；[公开访问](https://developers.cloudflare.com/r2/buckets/public-buckets/)与[凭据设置](https://developers.cloudflare.com/r2/api/tokens/)见官方文档。

## 发布

在仓库根目录运行。先提交源码和构建脚本，保持工作区干净；协议文件放仓库外。以下 `your-change-id` 替换为本次发布所属的活动 Change。

```bash
npm ci
npm run build --workspace prototype
# 对本次发布的每个页面执行截图；示例替换为实际入口。
npm run screenshot --workspace prototype -- --entry dist/token-workspaces/index.html
node .agents/skills/spec-trail/prototype/scripts/publish.mjs prepare \
  --directory packages/prototype/dist \
  --entries packages/prototype/publish-entries.json \
  --repository https://github.com/iTgo-lyq/open-folio \
  --out /tmp/open-folio-r2-request.json
node packages/prototype/publish-r2.mjs \
  --request /tmp/open-folio-r2-request.json --result /tmp/open-folio-r2-result.json
```

上传以 requestId 为固定目录，条件创建对象，重试比对已存在内容，拒绝覆盖。全部文件通过公开访问和字节校验后才返回成功；失败结果不能登记。这里不创建桶、不管理账号、不运行服务器。

上传成功后，再执行以下登记；失败时保留已有配置和引用，原请求可重试：

```bash
node .agents/skills/spec-trail/prototype/scripts/setup.mjs --configure --hosting custom
node .agents/skills/spec-trail/prototype/scripts/publish.mjs register \
  --request /tmp/open-folio-r2-request.json --result /tmp/open-folio-r2-result.json \
  --change your-change-id
node .agents/skills/spec-trail/prototype/scripts/validate.mjs --browser
```

固定引用包含源码提交、内容摘要和公开 URL。登记后验证各设备交互，再提交清单、workflow 与新 Change；引用推送至配置的协作分支后更新项目总览。上传失败不切换 Git 兜底，也不覆盖历史引用。

## 截图

本项目发布页面原型必须提供声明设备的卡片截图。构建后、prepare 前对本次发布的每个页面运行（示例替换为实际入口，并按 devices 选择设备）：

```bash
npm run screenshot --workspace prototype -- --entry dist/token-workspaces/index.html
npm run screenshot --workspace prototype -- --entry dist/token-workspaces/index.html --device mobile
npm run screenshot --workspace prototype -- --entry dist/token-workspaces/index.html --viewport 320x720 --out /tmp/open-folio-screenshots
```

默认在入口旁生成 `pc-web.png`、`ipad.png`、`mobile.png`，对应 1440×900、834×1194、390×844，尺寸复用产品定义。`--device` 可重复指定；`--viewport WIDTHxHEIGHT` 生成 `custom.png`，每边范围 1–4096，与 `--device` 二选一。`--out` 可指定输出目录；路径按当前工作目录解析，npm workspace 命令的工作目录是本包。

截图使用 Playwright Chromium、OS 沙箱和仅授予 `allow-scripts` 的不透明 iframe，入口须为自包含 HTML，复用既有 HTML 校验与 CSP。页面错误或资源加载失败时明确失败，不降级为无沙箱运行。可用 `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 指定已安装的 Chromium；直接调用截图脚本时通过环境或 Node `--env-file` 注入。

适配器按 entryPath 所在目录查找标准命名图片，与入口一起发布并登记，不依赖入口 id 与目录名相同。以 dist 为产物目录时，入口可为 token-workspaces/index.html，图片为 token-workspaces/pc-web.png；仅发布单页面目录时，入口为 index.html，图片为 pc-web.png。自定义截图供本地验证，不自动登记为标准设备缩略图。截图脚本负责渲染与导出，具体交互由当次任务的 Agent 验证。当前单 HTML 已内联资源；后续改为 ESM 或外部字体时，需要为桶配置允许无 Cookie 跨域读取的 CORS。

## 发布验收

页面可打开、原型交互通过或上传成功，不代表卡片截图交付完成。负责发布的 Agent 必须完成以下检查并将结果写入本次 Change 的验证证据：

1. 核对发布 result、当前清单与本次 Change previews 中的 thumbnails，覆盖本次页面声明的每种设备；图片属于对应入口的固定版本，URL 可公开读取。
2. 将引用推送至协作分支后，在真实工作台刷新项目，进入原型总览，逐项切换桌面、iPad、手机筛选，确认本次页面的卡片图片加载成功（浏览器检查 img.complete 且 naturalWidth > 0），没有缺图或加载失败占位。
3. 从卡片进入原型页面并验证交互；保留卡片截图或等效浏览器断言证据。未通过时记录失败并修复，不能仅以本地 artifacts 截图代替发布验收。真实登录使用项目的测试会话清理约定，结束后核验退出结果。

本地 Agent 可从本机配置发布。向远端交接时只传 request/result 的非敏感内容；request 的 artifactDirectory 是发布机器本地路径，远端登记前需指向内容摘要完全相同的构建目录。不要传 S3 凭据。
