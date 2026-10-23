# GitHub 请求设计评审证据

## 调查基线

2026-10-23 在本机常驻服务数据上进行只读调查与离线回放。运行版本记录为 `f2bfd66f49e5db9c84e66ff93fe626426cd64261`，评审涉及的服务器实现与当时工作区一致。调查未调用真实 GitHub API，未修改绑定、凭据、快照或运行服务。

当时存在两个 OpenFolio 账号、两个工作台绑定，对应同一个 GitHub 身份，各自发现 OpenFolio 和 Runweft。相同 GitHub 身份不等于本次验证了两个 Token 完全一致；这里仅据身份判断它们会竞争用户级主额度。

| 每个工作台中的仓库 | Change 数 | 已归档 | 发布补记 | 已知 Change PR 数 | 无关联 PR 的 Change 数 |
| --- | ---: | ---: | ---: | ---: | ---: |
| OpenFolio | 74 | 72 | 58 | 13 | 61 |
| Runweft | 64 | 64 | 64 | 0 | 64 |

## 离线请求计数

读取当时的当前快照，为 `collectDelivery` 注入模拟 `DeliveryReader`：已知 PR 沿用快照中的状态和关联，无额外远端变化、无额外分页；未知关联返回完整空列表。该回放衡量当前算法在这些输入上的调用次数，不是线上实际流量测量，也不用于重新证明交付状态。

| 仓库 | 每轮总请求 | 详情请求 | 列表请求 | 不同列表查询数 | 所有请求均限流时的尝试数 |
| --- | ---: | ---: | ---: | ---: | ---: |
| OpenFolio | 83 | 13 | 70 | 66 | 75 |
| Runweft | 73 | 0 | 73 | 32 | 65 |

按当前空闲至少五分钟、活跃约一分钟的配置间隔，不计执行耗时及调度对齐，四个来源全部空闲的 PR 请求约为 `2 × (83 + 73) × 12 = 3744` 次/小时；其中一个 OpenFolio 来源活跃时约为 `83 × 60 + 83 × 12 + 73 × 12 × 2 = 7728` 次/小时。这是负载估算，未包含权限检查及其他调用。

## 实现原因

- `src/server/store.ts` 在 Git 未变化时复用文档索引，但仍对全部 Change 调用 `collectDelivery`。
- `src/server/delivery.ts` 仅在单轮内对 PR 详情按编号去重，列表查询没有同类去重；每轮重读已知详情，未找到关联时重新按分支或合并提交搜索。发布补记的状态覆盖发生在查询之后。
- 同模块将限流转换为局部诊断后继续处理剩余 Change，因此首次限流不会阻止本轮剩余查询。
- `src/server/background-refresh.ts` 持续扫描所有绑定的已接入来源，以工作台、仓库和分支去重；退出页面后仍定期扫描。
- `src/server/providers/github.ts` 没有共享冷却状态，未使用 `x-ratelimit-reset`，也未发送 ETag 条件请求。冷却缺陷与算法重复请求是两个独立问题。

适配层的模拟响应还验证了：返回主额度耗尽且约 1800 秒后恢复时，当前错误仅携带 `retryAfter: "60"`，紧接的第二次调用仍向模拟远端发请求；403 正文说明二级限流、没有 `Retry-After` 且主额度仍有剩余时，被分类为 `READ_DENIED`。

## 既有验证与证据限制

评审运行以下现有测试，结果为 26 项通过、0 失败：

```bash
node --conditions=react-server --test tests/providers.test.ts tests/delivery.test.ts tests/background-refresh.test.ts tests/repository-permissions.test.ts
```

这些测试证明已有行为受到覆盖，不证明请求数量合理。后续验证应以语义场景和实际模拟请求计数为依据，比较优化前后，并验证新增稳定历史记录时的请求增长方式；无需固定依赖持续变化的生产快照数量。

服务日志出现连续 `RATE_LIMITED`，但未记录对应响应头，因此本次调查不能确定事故触发了主限额还是二级限流，也不能还原完整线上调用量。

## 一手资料与范围收敛

评审时查阅 [GitHub REST API 限额说明](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)：普通 PAT 请求计入用户级主额度，限流后的等待依据包括 `Retry-After` 与 `x-ratelimit-reset`；二级限流不一定表现为主额度耗尽。

[GitHub REST API 最佳实践](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api)说明，正确认证的条件请求返回 304 时不消耗主额度。条件请求可作为正常缓存复验手段评估，但仍存在网络请求，不能替代减少重复查询和无变化历史扫描。

用户随后明确只优先推进统一冷却、查询去重与历史 PR 缓存，要求从算法减少请求，限流仍报错，不新增兜底。因此不把评审中提及的动态额度预算、普遍调整轮询频率或其他外部接入方案自动纳入交付。
