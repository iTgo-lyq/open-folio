# 原型构建与 R2 发布

当前原型清单只维护七组 `quiet-*` 设计，设计依据见 [DESIGN.md](DESIGN.md)。源码入 Git，`npm run build --workspace prototype` 输出各自的自包含 `dist/<id>/index.html`；构建不会上传或改动清单，dist 不提交。过时入口已从当前源码和总览移除；历史 Change 固定引用及已发布字节继续保留。

## 工作台新设计（七组入口）

`quiet-home`、`quiet-specs`、`quiet-changes`、`quiet-prototypes`、`quiet-credentials`、`quiet-public`、`quiet-share` 分别对应我的仓库与侧栏、Specs 阅读、Changes 列表与详情、原型总览与画布、账号与 Token、匿名公开原型、Change 分享阅读。源码位于 `src/shared/quiet-workbench/`，按模块拆为多个脚本，由各入口 HTML 内联。

所有仓库、人员、时间和工程材料均为虚构，状态只在内存中。顶部评审细条可切换页面、场景（加载、失败、离线、无权限、登录过期及各页面特有状态）与主题；右侧“评审设置”可切换强调色（陶土为方案，墨色与上一版蓝色作对照）、预览网站与应用图标并演示减少动态效果，均不属于产品。标志与图标源文件为 `src/assets/openfolio-mark.svg`、`openfolio-icon.svg`。示例账号 `lin` / `demo12345`，添加 Token 时输入 `demo` 或 `demo-work`。hash 可直达，例如 `#/changes/offline-map-regions/technical?theme=dark`、`#/changes?side=collapsed`、`#/changes?accent=ink`、`#/share/offline-map-regions?scene=sync-failed`。点击 Logo 或按 ⌘\ / Ctrl+\ 收起侧栏为悬浮胶囊。

验证：先 `npm run build --workspace prototype`，再 `node packages/prototype/verify-quiet-workbench.mjs`。检查使用仅授予 `allow-scripts` 的 iframe 与项目 CSP，覆盖七个入口 × 两套主题 × 四档宽度及主要交互；结果和截图输出到 Git 忽略的 `artifacts/quiet-workbench/`。正式卡片截图继续使用本包 screenshot 命令。

只发布这七组入口时，将 `dist/quiet-*/` 及其截图复制到 `dist/quiet-release/quiet-*/`，以 `dist/quiet-release` 为产物目录、`publish-quiet-entries.json` 为入口清单。发布前提交源码；固定引用通过 SpecTrail 发布登记命令更新。

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
npm run screenshot --workspace prototype -- --entry dist/quiet-home/index.html
node .agents/skills/spec-trail/prototype/scripts/publish.mjs prepare \
  --directory packages/prototype/dist \
  --entries packages/prototype/publish-quiet-entries.json \
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
npm run screenshot --workspace prototype -- --entry dist/quiet-home/index.html
npm run screenshot --workspace prototype -- --entry dist/quiet-home/index.html --device mobile
npm run screenshot --workspace prototype -- --entry dist/quiet-home/index.html --viewport 320x720 --out /tmp/open-folio-screenshots
```

默认在入口旁生成 `pc-web.png`、`ipad.png`、`mobile.png`，对应 1440×900、834×1194、390×844，尺寸复用产品定义。`--device` 可重复指定；`--viewport WIDTHxHEIGHT` 生成 `custom.png`，每边范围 1–4096，与 `--device` 二选一。`--out` 可指定输出目录；路径按当前工作目录解析，npm workspace 命令的工作目录是本包。

截图使用 Playwright Chromium、OS 沙箱和仅授予 `allow-scripts` 的不透明 iframe，入口须为自包含 HTML，复用既有 HTML 校验与 CSP。页面错误或资源加载失败时明确失败，不降级为无沙箱运行。可用 `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 指定已安装的 Chromium；直接调用截图脚本时通过环境或 Node `--env-file` 注入。

适配器按 entryPath 所在目录查找标准命名图片，与入口一起发布并登记，不依赖入口 id 与目录名相同。以 dist 为产物目录时，入口可为 quiet-home/index.html，图片为 quiet-home/pc-web.png；仅发布单页面目录时，入口为 index.html，图片为 pc-web.png。自定义截图供本地验证，不自动登记为标准设备缩略图。截图脚本负责渲染与导出，具体交互由当次任务的 Agent 验证。当前单 HTML 已内联资源；后续改为 ESM 或外部字体时，需要为桶配置允许无 Cookie 跨域读取的 CORS。

## 发布验收

页面可打开、原型交互通过或上传成功，不代表卡片截图交付完成。负责发布的 Agent 必须完成以下检查并将结果写入本次 Change 的验证证据：

1. 核对发布 result、当前清单与本次 Change previews 中的 thumbnails，覆盖本次页面声明的每种设备；图片属于对应入口的固定版本，URL 可公开读取。
2. 将引用推送至协作分支后，在真实工作台刷新项目，进入原型总览，逐项切换桌面、iPad、手机筛选，确认本次页面的卡片图片加载成功（浏览器检查 img.complete 且 naturalWidth > 0），没有缺图或加载失败占位。
3. 从卡片进入原型页面并验证交互；保留卡片截图或等效浏览器断言证据。未通过时记录失败并修复，不能仅以本地 artifacts 截图代替发布验收。真实登录使用项目的测试会话清理约定，结束后核验退出结果。

本地 Agent 可从本机配置发布。向远端交接时只传 request/result 的非敏感内容；request 的 artifactDirectory 是发布机器本地路径，远端登记前需指向内容摘要完全相同的构建目录。不要传 S3 凭据。

## Changes 动态视图预览

`quiet-changes` 已更新为默认“我的”、个人视图 tab、管理齿轮和状态多选。进入管理面板可添加（继承当前筛选/显示）、编辑、排序、显隐与删除；编辑完成后需在管理面板统一确认。主列表临时调整支持恢复、显式保存或另存。评审场景可切换已有个人视图、取消数量 0 和保存失败（首次失败、重试成功）。所有配置仅在内存中，页面重开恢复示例，不连接真实账号。

验证 `npm run build --workspace prototype && node packages/prototype/verify-change-views.mjs`。只发布此入口时，用 `dist/quiet-changes` 作为产物目录，入口清单为 `[{"id":"quiet-changes","entryPath":"index.html"}]`；保留其他六组已有固定引用。

## 暂缓需求预览

`quiet-changes/index.html#/changes?scene=deferred` 展示全部进行中 Change，包含“从历史行程生成模板”的暂缓示例。列表按处理状态单独分组；在“显示”中切换看板，保留处理状态分组，也可切换按阶段。点击示例查看暂缓原因、恢复条件与澄清记录；任务为空，后续材料未产生。详情直达 `#/changes/templates-from-history`。

验证：构建后运行 `node packages/prototype/verify-deferred-requirement.mjs`，复用常驻 Chrome CDP，仅创建并关闭本次标签页；覆盖浅深主题和桌面、平板、手机、320px，截图与检查结果位于 `artifacts/deferred-requirement/`。
