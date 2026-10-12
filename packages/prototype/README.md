# 原型构建与 R2 发布

本包维护 workspace-shell 外壳与 personal-workbench 个人工作台方案，设计依据见 [DESIGN.md](DESIGN.md)。源码入 Git，`npm run build --workspace prototype` 输出各自的自包含 `dist/<id>/index.html`。构建不会上传或改动清单，dist 不提交。

personal-workbench 顶部可切换首次连接、发现中、空结果、部分失败、连接失效、无权限和公开原型。连接表单只接受 `demo`，不验证或保留真实 token；仓库与记录均为示例。URL hash 保留当前页面，全部交互在内存运行。

token-workspaces 演示同 token 多设备恢复、不同 token 独立工作台、复制 token、设备退出与旧连接选择。示例用户名为 `demo-user`，只接受 `demo` 与 `demo-other`；状态仅保存在内存，复制也只处理这两个示例值。顶部场景栏为评审工具，不进入产品。

## 首次配置

在 Cloudflare 控制台开通 R2，创建 Standard 桶，启用 Settings → Public Development URL。r2.dev 用于开发预览且有限流；正式使用可连接自有域名。不要给历史版本设置自动删除规则。

创建只授权该桶的 Object Read & Write S3 API 凭据。复制 [环境变量模板](r2.env.example) 到发布机器的 `~/.config/open-folio/r2.env`，填入实际值，目录权限 700、文件权限 600。凭据只在发布机器使用，不放聊天、Git 或 workflow。

本适配器使用默认 jurisdiction 的账户 endpoint。公开地址填桶的 r2.dev 或已绑定域名，不填 S3 API 地址。Standard 有免费额度，超额按 [R2 定价](https://developers.cloudflare.com/r2/pricing/) 计费；[公开访问](https://developers.cloudflare.com/r2/buckets/public-buckets/)与[凭据设置](https://developers.cloudflare.com/r2/api/tokens/)见官方文档。

## 发布

在仓库根目录运行。先提交源码和构建脚本，保持工作区干净；协议文件放仓库外。以下 `your-change-id` 替换为本次发布所属的活动 Change。

```bash
npm ci
npm run build --workspace prototype
node .agents/skills/spec-trail/prototype/scripts/publish.mjs prepare \
  --directory packages/prototype/dist \
  --entries packages/prototype/publish-entries.json \
  --repository https://github.com/iTgo-lyq/open-folio \
  --out /tmp/open-folio-r2-request.json
node --env-file="$HOME/.config/open-folio/r2.env" packages/prototype/publish-r2.mjs \
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

固定引用包含源码提交、内容摘要和公开 URL。登记后验证各设备交互，再提交清单、workflow 与新 Change；进入 main 才更新项目总览。首次迁移成功后仅移除本包旧 preview 目录，历史 archive 与标签不动。上传失败不切换 Git 兜底，也不覆盖历史引用。

需要卡片截图时，在 prepare 前将 PNG 放入 `dist/<id>/pc-web.png`、`ipad.png`、`mobile.png`；适配器将存在的图片与入口一起发布并登记。截图应按 1440×900、834×1194、390×844 生成。当前单 HTML 已内联资源；后续改为 ESM 或外部字体时，需要为桶配置允许无 Cookie 跨域读取的 CORS。

本地 Agent 可从本机配置发布。向远端交接时只传 request/result 的非敏感内容；request 的 artifactDirectory 是发布机器本地路径，远端登记前需指向内容摘要完全相同的构建目录。不要传 S3 凭据。
