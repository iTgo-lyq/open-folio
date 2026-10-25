# 并发同步导致合入记录消失的证据

## 本次提交图

[PR #22](https://github.com/iTgo-lyq/open-folio/pull/22) 的平台状态为 `MERGED`，原合并提交为 `11a86db365f54175b8e826ded83778ac7fa3ff62`：

- 第一父：`bc9fa7813a59b958092fe77ee9b9df5dc1a83b0e`，当时的远端 `develop`。
- 第二父：`529e21eec7f0b2a86d7d302bc24e18978fae2574`，已验收归档的来源。
- 唯一 trailer：`SpecTrail-Change: skill-auto-update`。

后续同步提交 `ea8666ee1d4b432eaa5c31fbd89581f5e59398ae` 的第一父为本地提交 `e4e116f4ddf20d316e10765ed08a020894499200`，第二父为原 PR 合并提交 `11a86db365f54175b8e826ded83778ac7fa3ff62`。两侧均包含此前的 `develop` 历史；原 PR 合并仍是当前已推送 `develop` 的祖先，但不在其第一父链上。

直接调用 `inspectIntegration` 验证原合并提交，结果为 `found`，归档位置为 `docs/project/archive/2026-10-25-skill-auto-update`。`integration.mjs verify` 从当前集成 tip 扫描则报告 `No verified remote integration; retain the PR and source`。

## 影响位置与边界

`scripts/integration-records.mjs` 的 `scanIntegrations` 使用 `git log --first-parent` 收集标记，`validator` 独立检查父结构和归档内容。两者分别决定候选可见性和候选合法性；此次失败发生在候选可见性。

同一扫描器被 CLI 的验证、清理及归档返修、OpenFolio 的合入索引以及 Setup 的发布 PR 校验复用。服务端会复用相同集成 tip 与 `INTEGRATION_VERSION` 下的完整索引，因此规则变化还需使旧索引重新计算。

现有测试特意排除第二父路径中的普通标记提交，并检查重复标记、无效归档、缺失对象、来源删除后的读取等情况。修复不能仅删除 `--first-parent` 后将任何可达标记都作为已验证合入；需要对候选与归档交付的关系进行完整验证。

主 skill 已要求主工作区只安全快进。此次现有历史可以只读恢复识别，无需重写集成分支；后续指引应说明本地分叉时在独立工作区整合，保留主协作分支的远端交付历史。

## 遍历方向的可行性实验

在固定的 `origin/develop` tip `d986b494e39951d9ef2709f72a28951242c2050a` 运行只读实验：从 tip 读取第一父路径；遇到没有 Change trailer 的合并，追加其他父路径；遇到有 Change trailer 的候选，仅继续第一父路径。处理过的提交不再重复处理。

结果：旧的单条第一父链找不到 `11a86db`，新遍历方向能找到；现有 `inspectIntegration` 将它验证为 `found`，来源仍为 `529e21e`，遍历没有进入该来源。此次实验处理 558 个提交、23 个带标记候选，执行 18 次分页 Git 历史读取；这仅说明本仓库当前图的可行性，不作为性能承诺。

另用现有 fixture 建立临时仓库，构造原 PR 合入、从旧基线出发的本地同步、两侧再次分叉合并，以及来源内的普通 `SpecTrail-Change` 标记。实验均通过：找回原 M，多路径不重复计数，来源内普通标记未被扫描；实验结束后删除临时仓库，没有修改正式交付代码。

`workspace.mjs` 的 handoff 并发重试也会在准备工作区合并最新集中提交，再把登记提交推送到集成分支；即使主工作区随后只快进，仍可能产生上述图结构。因此单靠主工作区快进约定无法解决所有漏识别场景，需要让索引理解普通同步合并两侧的集成历史。
