# 执行与验证

## T1：提交整理与 squash 防护指引

主 skill 在最终归档入口要求检查短期分支提交，允许受限整理噪声并核对、修复追踪信息；更新原来一律禁止 squash 的分支内规则，交付仍使用普通 merge。Setup 明确提醒禁止自动 squash，合并方式检查集中维护于 integration.md，主 skill 和发布入口引用它。应用、锁文件和 skill 版本统一为 0.1.18。

实际验证：

- 主 skill、Setup 的 `quick_validate.py` 均通过。
- `node --test .agents/skills/spec-trail/tests/version.test.mjs`：2 项通过。
- 读取三个版本文件并核对锁文件根包，全部为 0.1.18；新相对链接及标题锚点全部可解析。
- `prettier --check package.json package-lock.json` 与 `git diff --check` 通过。

Agent 自查按以下场景核对指引；这是规则推演，未执行历史改写或修改平台配置：

| 场景 | 指引结果 |
| --- | --- |
| 归档前积累无独立价值的试错、格式和修测试提交 | 合理压缩，保留独立交付和流程检查点；本次提交均有明确职责，无需压缩 |
| 待改写提交已被依赖、远端变化或涉及固定原型来源 | 保留历史，不放宽单次精确 lease 与既有边界 |
| 整理造成 Change 正文、JSON、任务定位或 PR 标记缺失 | 根据原始证据修复；无法恢复事实时暂停归档，不补造确认和验收 |
| 平台提供 squash，但实际选择普通 merge | 允许继续；本仓库元数据确认 allow_merge_commit=true、allow_auto_merge=false，未修改配置 |
| PR/MR 默认 squash、自动合并或队列使用 squash | 检查并取消本次 squash；强制策略或不可核实状态阻止合并 |
| 正式发布到 main/master | 复用同一合并方式检查，保留普通 merge，不引入 squash 交付支持 |

无应用逻辑、界面或脚本改动，不运行生产构建和浏览器验收；平台设置检查仍由 Agent 执行，不声称本地 CLI 或 CI 已自动验证它。
