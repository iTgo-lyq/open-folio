# 执行与验证

## T1 调整讨论提交合并规则并验证并发回退

在主 skill 的提交与推送规则中加入单条讨论提交的 amend 例外，允许协作分支和独立工作分支使用固定原提交 SHA 的 lease；工作区说明引用同一规则，并区分普通推送、amend 回退和分支移交。自查确认阶段、任务、归档、合并及固定原型来源不参与该例外。

`python /home/tiger/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/spec-trail` 返回 `Skill is valid!`；`git diff --check` 通过。

运行一次性验证脚本 `node /tmp/openfolio-discussion-amend-experiment.mjs`，使用临时 bare 远端和两个克隆，退出时删除实验仓库。五项行为检查通过：

1. 远端仍为原提交时，显式 lease 成功替换最新讨论提交，提交数不增加，补充内容存在。
2. 预查发现远端已前进时，直接同步并追加普通提交，原提交和他人提交保留。
3. amend 后另一克隆先推送，本地再 fetch 更新跟踪引用，绑定原 SHA 的 lease 仍以 `stale info` 拒绝，远端保持他人的提交。
4. 上述拒绝后以 soft reset 恢复原提交关系并保留增量，普通提交、合并、推送成功；远端包含原提交、他人提交和补充提交，被拒绝的 amend 提交不是远端祖先。
5. 普通同步合并同一需求文件的两个不同位置修改，远端修订和本次澄清均保留。

本次只有规则和文档调整，没有增加常设推送脚本；验证在本地临时 Git 远端执行，没有改写项目远端历史。
