# 实施验证

## T1：识别协作者并兼容个人视图配置

批量扫描当前可读来源的 Change 材料提交作者；普通提交计入参与，纯合并操作者排除。活动及归档目录按 Change id 归并，创建者固定第一，平台身份与普通邮箱在服务端去重，响应只保留公开身份字段。扫描指纹递增以重建旧快照。创建者列开关默认关闭，兼容旧个人视图并支持 URL/账号保存。

验证：`node --conditions=react-server --test tests/change-creation-order.test.ts tests/change-views.test.ts tests/change-directory.test.ts` 共 17 项通过；覆盖材料编辑、无关代码、纯合并、工作分支、归档、暖刷新、身份别名/同名区分、分享字段与视图兼容。`npm run typecheck` 通过。初次分享断言误用了原测试中故意无有效主来源的归档 fixture，已改为核对有效来源的分享投影后通过。
