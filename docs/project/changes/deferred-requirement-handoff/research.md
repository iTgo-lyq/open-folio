# 原型与准备证据

## Astra 原型

按用户要求由 Astra 子 agent 绘制，沿用 quiet-changes 的现有设计，修改范围仅为原型包；正式 UI、状态命令及 hook 实现尚未开始。预览评审场景为 `#/changes?scene=deferred`，示例详情为 `#/changes/templates-from-history`。

- 列表和按处理状态的看板独立展示“暂缓”；详情展示暂缓原因、恢复条件与已有澄清记录；空任务说明明确恢复后再规划，真实受阻原因保留。
- 源码提交：`36f3c473b6862ba83613469c25bf3e900c54b2c6`。
- 固定版本：`74a2e0139e90c9d66e2a82ed88a44f5d2d56fc993a1931d6d8549196736ce143`。
- [固定预览](https://pub-cc623a99ce8e4606a3491cc2d4b4436c.r2.dev/open-folio/74a2e0139e90c9d66e2a82ed88a44f5d2d56fc993a1931d6d8549196736ce143/index.html#/changes?scene=deferred)。原型清单及本 Change 的 previews 均通过发布登记命令关联同一固定版本；其他六个当前入口保持原引用。

## 已执行检查

- Astra 执行 `npm run build --workspace prototype`、`node packages/prototype/verify-deferred-requirement.mjs` 与 diff 检查通过。浏览器复用常驻 Chrome CDP，在仅授予 allow-scripts 的 iframe 中覆盖浅/深主题 × 1440、834、390、320px，共 8 组适用场景；桌面和平板验证处理状态看板，手机保持现有列表行为，列表/详情/空任务及真实受阻原因通过，页面错误为零。
- 本 agent 复查桌面列表、深色看板与手机详情截图，未发现本次范围的展示问题。浏览器证据保存在 Git 忽略的 `artifacts/deferred-requirement/`，可由包内验证脚本重建。
- `npm run screenshot --workspace prototype -- --entry dist/quiet-changes/index.html` 生成 pc-web、ipad、mobile 三张标准截图；该项目既有截图脚本使用独立 Chromium 及不透明 sandbox，交互检查继续复用常驻 Chrome。
- R2 发布适配器逐文件公开读取并核对字节通过；三种设备 thumbnails 均登记到当前分支清单与本 Change，公开图片实际加载通过。
- 使用 withSmokeSession 管理专用测试会话，在已刷新的真实工作台读取本 Change，固定版本与发布结果一致；桌面、平板、手机三种 Change 原型预览均实际显示“暂缓”场景。浏览器使用与用户 Cookie 隔离的独立 context，所有操作均在回调内等待完成；包装器核验退出后匿名且无可见绑定，清理通过。
- `node .agents/skills/spec-trail/prototype/scripts/validate.mjs`：7 项元数据/静态校验通过；Plan 与任务执行顺序校验通过（默认 T1 → T2）。这些准备检查不代表正式实现已验证。

## 待验收与后续检查

原型及 Technical / Plan 等待用户明确确认。两项实施任务仍为 todo。

项目当前原型总览只读取集成分支清单，因此合入前尚不包含本次新固定版本；本轮验证的是进行中 Change 的真实预览及公开三设备截图，未把当前总览卡片计为通过。按项目发布验收要求，集成后需刷新项目总览并逐设备确认本次卡片图片属于新固定版本，再完成交付清理。
