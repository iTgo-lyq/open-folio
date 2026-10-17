# 交付与验证证据

## 实现

SpecTrail 主 skill 的配图说明收敛为两个短段落：何时考虑配图，以及文档旁 `assets/` 目录与 Markdown 相对引用。setup 新增可选 document-diagrams 的全局安装询问，沿用会话内已有明确选择，同意后执行指定命令，不修改只读检查器和项目配置。

SVG 阅读沿用现有实现：格式识别、仓库扫描、资源响应及安全头、缓存版本、单元与浏览器用例和产品说明均保留。相关 11 个文件与整合前 main 逐字节一致；本轮没有重建或重启服务，也没有重新执行浏览器测试。格式识别验证 XML 与 SVG 根元素，不声称清洗 SVG 内容。

## 本轮验证

- `node --conditions=react-server --test tests/svg.test.ts tests/skill-sync.test.ts`：5 项通过。
- `node --test .agents/skills/spec-trail/setup/tests/setup.test.mjs`：10 项通过。
- skill-creator 的 `quick_validate.py` 分别校验主 skill 与 setup：均通过。
- `git diff --check`、`git diff --cached --check`：通过。
- SVG 代码、依赖、测试、README 和文档阅读 Spec 共 11 个文件与整合前 main 一致，三份旧 Change 目录已从候选树移除。

## 沿用的 SVG 验证依据

验收标准 3 的浏览器行为与完整回归依据，沿用 2026-10-16 对同一份 SVG 实现及测试的验证：`npm test` 173 项通过；`npm run typecheck` 应用及 UI 包通过；`npm run test:e2e -- tests/browser/svg.spec.ts tests/browser/specs.spec.ts tests/browser/api.spec.ts` 9 项通过。覆盖实际像素中的图内 CSS、渐变与箭头、正文与图片查看器、窄屏、错误图片提示、直接导航的脚本/外部资源/存储隔离，以及撤权后的 GET/HEAD 401。

上述结果是整合前的验证证据，不是本轮重跑；完整浏览器套件未跑。本轮保留文件逐字节一致，独立评审未发现代码阻塞，因此沿用这些结果，配合本轮 15 项检查。本次仅统一记录结论，不保留旧 Change 的逐轮记录或演示资产。

## 历史整合边界

原十个提交的前置基线为 `896270907f97dceecbd5c950fca880cc62137026`。候选提交直接以此为父，不继承原十个提交；仅保留本 Change 的文档与当前实现，不保留旧 Change 的逐轮过程记录。

iclaude 独立审查的结果记录在 Review；人工验收和归档以 `change.json` 为准。用户确认后才归档本 Change，并将最终结果保持为基线之后的一个提交，以明确旧远端提交的 `force-with-lease` 替换 main。远端若发生并发更新，应停止覆盖并重新核对。

压缩范围为本仓库 main 的提交历史；已推送对象仍可能在 GitHub 保留一段时间。公开分发仓库 `iTgo-lyq/spec-trail` 已同步旧版指引，其现有历史不在本次改写范围内。main 获批更新后由现有 Actions 同步最新 skill，并核对分发内容；不提前同步候选内容。
