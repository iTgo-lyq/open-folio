# 附加 Markdown 阅读修复与验证

## T1：恢复附加文档阅读

材料解析先保留旧 `doc`、`document` 的匹配与目标优先级，再匹配当前材料，未命中文件时才生成缺失提示。旧别名与未知目标回到概览的行为保持原样。

回归测试覆盖根目录与嵌套目录附加文档、旧文档链接、删除后的同路径，以及带 `ct=documents` 或其他材料参数的旧缺失链接。新增正常阅读测试在修复前失败（已有文档被返回为无 document 的缺失材料），修复后通过。

验证结果：

- `node --conditions=react-server --test tests/change-reading.test.ts tests/reading-cache.test.ts tests/central-reading.test.ts tests/shares.test.ts`：36 项通过。
- `npm run typecheck`、`npm run build`：通过。
- 对四个实现及测试文件运行 Prettier 检查，`git diff --check`：通过。
- `tests/browser/change-reader.spec.ts` 的两项 `extra Markdown` 回归：工作台和匿名分享页均通过，覆盖现有文档正文及新旧缺失链接。

浏览器执行使用临时 Playwright 适配配置，通过 `connectOverCDP` 连接常驻 Chrome 9222；因测试框架及账号隔离需要使用独立 context，结束时关闭测试 context 并断开连接，常驻浏览器及既有标签页保留。临时配置已清理；常规复跑命令为 `npm run test:e2e -- tests/browser/change-reader.spec.ts --grep 'extra Markdown'`。

Agent 自查确认差异仅恢复既有阅读行为，无数据迁移、材料格式或权限变更；旧文件参数仍优先于旧页签别名，删除文件不会跳到需求正文。无需修改当前 Specs。本次交付为可审阅 PR，尚未合入，不更新长期服务。
