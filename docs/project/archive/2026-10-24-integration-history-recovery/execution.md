# 执行证据

## T1：同步合并后持续识别并验证原始交付

CLI 的 verify 以当前本地/远端来源 tip 与远端集成 tip 的 Git 祖先关系报告 sourceIncluded，来源引用均不存在时报告 sourceAbsent 与 sourceIncluded=null。cleanup 独立于差异扫描，使用 Agent 已验证的实际交付提交，并保留来源归属、其他入口依赖、文件和占用、新增提交、条件远端删除及非强制本地删除检查。归档返修以集中归档及来源纳入事实保护只读历史。

差异索引使用普通 git log --merges 定位原双亲合并提交，删除 first-parent 限制与合入后的归档重复证明；缓存规则版本递增为 2。工作台在索引缺失、歧义或读取失败时，仍可通过既有 PR 数据及其合并提交的 Git 祖先关系确认已集成。合入前 CI 保留归档校验，Git 原型快照目录约束也在该入口检查。

验证结果：

- `npm test`：344 项通过，包括第二父路径恢复、标记缺失/歧义时独立清理、PR 状态、旧同 tip 缓存重算、固定差异与删除后冷读取。
- `node --test .agents/skills/spec-trail/tests/*.test.mjs .agents/skills/spec-trail/setup/tests/*.test.mjs`：27 项通过。
- `npm run typecheck`、`npm run format:check`：通过。
- `npm run build`：在本 Change 工作区的 `.next` 生产构建通过。
- skill-creator `quick_validate.py .agents/skills/spec-trail`：通过。
- 对真实仓库只读运行新 CLI 的 `verify --change skill-auto-update`：远端 develop tip 为 `ede13981723cb6eec8fefefbef92395dbfe564a6`，本地及远端来源均为 `529e21eec7f0b2a86d7d302bc24e18978fae2574`，sourceIncluded=true；验证未执行删除。

独立评审由隔离上下文的只读 subagent 覆盖整个差异。评审发现本地 ref 指向缺失对象时，原通用 revision 可能将读取错误当作不存在；修复改为严格区分 ref 不存在和对象不可读，并补入真实 dangling-ref 回归。兼容本机 Git 的读取方式同时复验了正常清理后的 verify 与重复 cleanup；缺失对象时远端及本地来源均保留，正常清理后的重试成功。最终独立复验未发现新增删除安全问题。

归档前同步 develop 的已交付提交 `5856bd2`，合并无冲突；组合后的 `npm test` 350 项通过，类型检查通过。交付继续沿用 PR #25；长期服务部署及此前暂留来源的实际清理在合入后执行，没有改写既有归档或已推送历史。
