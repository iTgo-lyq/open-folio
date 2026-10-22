# Prototype package

遵循根 AGENTS.md 和本包 DESIGN.md，维护 prototype.json 中的七组 `quiet-*` 当前设计。仅使用明确标识的虚构仓库、人员和凭据；交互在内存运行，不访问真实接口或持久存储，不录入真实 Token。

清理过时入口时同步移除当前清单、专属源码和无引用资源；保留历史 Change 固定引用及已发布产物，Git 保存历史源码。

原型构建输出各页面对应的自包含 dist/<id>/index.html，脚本、CSS 和图片全部内联；dist 不入 Git。按 README.md 使用项目 R2 适配器发布，凭据只放发布机器。上传验证成功后登记当前清单与 Change；发布失败保留已有引用。历史 Change、Git 快照和标签不改写。

页面原型发布前生成声明设备的标准截图，发布后按 README.md「发布验收」核对 thumbnails 并在刷新后的真实工作台逐设备检查卡片图片实际加载。页面可打开或本地截图存在不能替代卡片展示验收；将结果记录到本次 Change。
