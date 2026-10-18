# small Change 验证后等待用户确认再归档

## 目标与范围

small Change 完成实现和验证后保留可继续调整的原 Change，用户确认验收后才同步 Specs 并归档，避免每次补充都因提前归档而新建 Change。

用户明确要求：“small change 做完先不要自动归档，等我确认后再归档，这样后续的小调整可以继续在原 Change 里做。把 skill 里的规则调整一下。”本次为 small，仅调整流程指导，不改变状态结构或服务实现。

## 方案要点

- 统一主 skill 的状态字段说明、阶段表与关闭流程：small 保留 Agent 自查；自查和验证通过只记录 verification，进入 active / close 并等待用户确认，不以自验收代替用户验收。
- 命令参考统一指导使用 `accept --mode user`，依据用户实际验收或对当前交付的明确归档、合入指令记录来源；已有明确授权不重复询问。
- 等待期间在原 Change 处理原范围内的小调整，按既有返工规则追加任务、保留已完成记录并重新验证。验收确认后继续 Specs 同步与归档。
- 本次同样保留待用户验收状态；验收后同步 Change 状态维护与 Change 追踪两处当前 Specs 中的旧自验收说明。

## 验收

1. small 的 Agent 自查通过不会自动产生 acceptance、同步 Specs 或归档；未获用户验收时保留 active / close 与 confirmation 等待。
2. 用户确认后按既有关闭顺序完成归档，明确授权无需再次确认。
3. 待验收的原 Change 可按既有返工规则继续小调整，不覆盖已完成任务、不为同一范围另建 Change。
4. 主 skill 和命令参考不再指导 small 自动自验收归档；skill 校验和差异检查通过。
