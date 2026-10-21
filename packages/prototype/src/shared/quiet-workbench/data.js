// 示例数据：仓库、人员、工程记录全部虚构，只在内存中使用。
const TODAY = "2026-10-22";
const PEOPLE = {
  lin: { name: "林知远", login: "demo-lin", hue: 214 },
  chen: { name: "陈一", login: "chen-yi", hue: 158 },
  zhou: { name: "周屿", login: "zhouyu", hue: 24 },
  xu: { name: "许宁", login: "xuning", hue: 276 },
};
const ACCOUNT = { username: "lin", person: "lin" };
const TOKENS = [
  { id: "t1", name: "日常阅读", login: "demo-lin", platform: "GitHub", added: "10 月 8 日" },
  { id: "t2", name: "团队仓库", login: "demo-lin", platform: "GitHub", added: "10 月 17 日" },
];
const DEVICES = [
  { id: "d1", name: "Chrome · macOS", kind: "monitor", last: "正在使用", since: "10 月 20 日登录", current: true },
  { id: "d2", name: "Safari · iPhone", kind: "phone", last: "2 小时前活动", since: "10 月 18 日登录" },
  { id: "d3", name: "Edge · Windows", kind: "monitor", last: "5 天前活动", since: "10 月 9 日登录" },
];
const REPOS = [
  { id: "atlas", name: "Atlas", owner: "demo-studio", repo: "atlas", branch: "develop", hue: 214, status: "ready" },
  { id: "folio", name: "Folio", owner: "demo-studio", repo: "folio", branch: "develop", hue: 158, status: "ready" },
  { id: "fieldnotes", name: "Field Notes", owner: "demo-lab", repo: "field-notes", branch: "main", hue: 24, status: "ready" },
  { id: "design-kit", name: "Design Kit", owner: "demo-lab", repo: "design-kit", branch: "develop", hue: 276, status: "attention", reason: "协作分支的 workflow.json 缺少集成分支配置" },
  { id: "billing", name: "Billing", owner: "demo-studio", repo: "billing", branch: "develop", hue: 350, status: "denied", reason: "当前 Token 没有这个仓库的读取权限" },
];
const MORE_REPOS = [
  { id: "trail-kit", name: "Trail Kit", owner: "demo-lab", repo: "trail-kit", branch: "develop", hue: 190, status: "ready" },
  { id: "postcard", name: "Postcard", owner: "demo-studio", repo: "postcard", branch: "develop", hue: 42, status: "ready" },
];

// Specs：路径即能力身份；没有 doc 的节点只是命名空间。
const SPEC_TREE = {
  atlas: [
    { path: "trips", title: "行程规划", doc: true, children: [
      { path: "trips/editor", title: "行程编辑", doc: true },
      { path: "trips/sharing", title: "行程分享", doc: true },
      { path: "trips/templates", title: "行程模板", doc: true },
    ] },
    { path: "maps", title: "地图", children: [
      { path: "maps/offline", title: "离线地图", doc: true },
      { path: "maps/styles", title: "地图样式", doc: true },
    ] },
    { path: "expenses", title: "费用", children: [
      { path: "expenses/split", title: "费用分摊", doc: true },
      { path: "expenses/export", title: "费用导出", doc: true },
    ] },
    { path: "accounts", title: "账号与同步", doc: true },
    { path: "notifications", title: "通知", doc: true },
  ],
  folio: [
    { path: "writing", title: "写作", doc: true },
    { path: "sharing", title: "共享与权限", doc: true },
  ],
  fieldnotes: [],
};
const REGION_FIGURE = `<svg viewBox="0 0 520 220" role="img" aria-label="两个离线区域重叠，共享中间的瓦片"><rect x="1" y="1" width="518" height="218" rx="14" fill="var(--fig-bg)" stroke="var(--line)"/><g stroke="var(--fig-grid)">${Array.from({ length: 12 }, (_, i) => `<path d="M${40 + i * 40} 20v180"/>`).join("")}${Array.from({ length: 5 }, (_, i) => `<path d="M20 ${40 + i * 40}h480"/>`).join("")}</g><rect x="70" y="44" width="220" height="132" rx="10" fill="var(--fig-a)" stroke="var(--fig-a-line)" stroke-width="1.5"/><rect x="230" y="64" width="220" height="120" rx="10" fill="var(--fig-b)" stroke="var(--fig-b-line)" stroke-width="1.5"/><rect x="230" y="64" width="60" height="112" fill="var(--fig-ab)"/><text x="86" y="68" font-size="13" fill="var(--ink-2)">京都 · 312 MB</text><text x="304" y="88" font-size="13" fill="var(--ink-2)">大阪 · 286 MB</text><text x="236" y="198" font-size="12" fill="var(--ink-3)">共享瓦片只存一份</text></svg>`;
const SPEC_DOCS = {
  "maps/offline": {
    updated: "10 月 19 日",
    commit: "8c41e2a",
    lead: "在没有网络的目的地，用户仍能查看与行程相关的地图、地点和路线。离线数据按区域下载，占用空间和更新方式对用户清楚可见。",
    sections: [
      { id: "regions", h: "区域与下载", html: `<p>用户在行程中选择城市，或在地图上框选自定义范围，下载离线区域。单个区域上限 <strong>2 GB</strong>，下载前显示预计大小与设备剩余空间；空间不足时说明还差多少，而不是直接失败。</p><ul><li>只在 Wi‑Fi 下自动更新；使用蜂窝网络时需要用户手动确认。</li><li>下载可以暂停和继续；应用被系统回收后，从上次完成的分片继续。</li><li>同一地点被多个区域覆盖时，瓦片（tile）只保存一份，按引用计数清理。</li></ul>` },
      { id: "data", h: "数据与存储", html: `<div class="table-wrap"><table><thead><tr><th>数据</th><th>来源</th><th>更新频率</th><th>说明</th></tr></thead><tbody><tr><td>矢量瓦片</td><td>Atlas Tiles（MVT）</td><td>每 30 天</td><td>z0–z16，按区域打包</td></tr><tr><td>地点与营业时间</td><td>Places API 快照</td><td>每 7 天</td><td>只保存行程相关地点</td></tr><tr><td>路线</td><td>本地计算（Valhalla）</td><td>实时</td><td>步行、驾车；公共交通仅限部分城市</td></tr></tbody></table></div><p>客户端先读取区域清单，再按分片下载：</p><pre><code>GET /v2/offline/regions/{regionId}/manifest
Accept: application/vnd.atlas.manifest+json

{ "version": "2026.10.1", "sizeBytes": 734003200, "tiles": 18342 }</code></pre><div class="callout">${"{{ICON:info}}"}<p>离线区域只保存在本机，不随账号同步到其他设备；更换设备后需要重新下载。</p></div>` },
      { id: "expiry", h: "过期与清理", html: `<p>区域超过 <strong>60 天</strong>未更新时标记为“可能过期”，地图上以灰色提示；超过 120 天自动清理瓦片，但保留用户收藏的地点。引用计数的实现位于 <code>apps/mobile/src/features/offline-maps/storage/TileReferenceCounter.ts</code>，清理在应用空闲时分批执行。</p><figure>${REGION_FIGURE}<figcaption>区域重叠时共享瓦片</figcaption></figure>` },
      { id: "limits", h: "边界", html: `<ul><li>不提供卫星影像的离线下载。</li><li>离线状态下只能查找行程内的地点，不能搜索其他地点。</li><li>公共交通时刻表不离线保存，离线时只显示线路。</li></ul>` },
    ],
  },
};
function genericSpec(title, path) {
  return {
    updated: "10 月 12 日",
    commit: "3fa90d1",
    lead: `${title}的当前行为与边界。本文由项目仓库维护，记录已经实现并验证的能力。`,
    sections: [
      { id: "behavior", h: "当前行为", html: `<p>${title}面向正在规划或进行中的行程。用户在行程详情中进入相关功能，修改即时保存，并在网络恢复后与同行者同步。</p><ul><li>所有修改都记录操作者与时间，冲突时保留双方版本供选择。</li><li>只读成员可以查看，但不能修改或删除。</li></ul>` },
      { id: "boundary", h: "边界与约束", html: `<p>能力路径为 <code>${path}</code>。超出本文的需求通过新的 Change 讨论，确认实现后再同步到这里。</p>` },
    ],
  };
}

// Changes：字段对应 SpecTrail 的 change.json 与工作台派生信息。
const CHANGE_DOCS = {
  "offline-map-regions": {
    requirement: [
      { id: "goal", h: "目标", html: `<p>旅行者常在落地后才发现没有网络。现在只能整城下载，东京这类城市需要 1.6 GB，下载时间长、占空间。希望用户按行程实际需要的区域下载地图，并能清楚看到占用空间和更新状态。</p>` },
      { id: "scope", h: "范围与行为", html: `<ul><li>在行程中按城市或框选范围创建离线区域，下载前显示预计大小。</li><li>区域列表显示大小、更新时间和状态，可暂停、继续、更新和删除。</li><li>多个区域重叠时共享瓦片，删除一个区域不影响其他区域。</li></ul><p>不包括卫星影像，也不包括离线搜索行程外的地点。</p>` },
      { id: "acceptance", h: "验收", html: `<ol><li>框选上海外滩周边 5 km²，预计大小与实际下载结果误差不超过 10%。</li><li>下载中途杀掉应用，重新打开后从断点继续。</li><li>京都与大阪区域重叠，删除京都后大阪离线可用。</li><li>空间不足时说明所需空间，不开始下载。</li></ol>` },
    ],
    technical: [
      { id: "approach", h: "方案", html: `<p>沿用现有 MVT 瓦片服务，新增区域清单接口；客户端以 <code>regionId</code> 管理下载任务，瓦片落盘到共享目录，用 SQLite 维护引用计数。</p><pre><code>regions(id, name, bbox, version, size_bytes, state)
region_tiles(region_id, z, x, y)
tiles(z, x, y, ref_count, path)</code></pre>` },
      { id: "tradeoffs", h: "关键取舍", html: `<div class="table-wrap"><table><thead><tr><th>问题</th><th>选择</th><th>原因</th></tr></thead><tbody><tr><td>瓦片打包</td><td>按 z14 分片，每片约 4 MB</td><td>断点续传粒度合适，失败重试成本低</td></tr><tr><td>引用计数</td><td>SQLite 事务</td><td>删除区域与新下载并发时保持一致</td></tr><tr><td>后台下载</td><td>iOS BGProcessing / Android WorkManager</td><td>系统回收后可以恢复</td></tr></tbody></table></div>` },
      { id: "verify", h: "验证路径", html: `<p>单元测试覆盖引用计数并发；在 iOS 17、Android 14 真机上验证断点续传与空间不足提示。</p>` },
    ],
    plan: [
      { id: "tasks", h: "任务", html: `<ol><li><strong>T1 区域清单接口</strong>：返回版本、大小与分片列表。</li><li><strong>T2 共享瓦片存储</strong>：落盘与引用计数。</li><li><strong>T3 下载任务</strong>：暂停、继续与断点恢复。</li><li><strong>T4 区域管理界面</strong>：列表、框选与空间提示。</li><li><strong>T5 过期与清理</strong>：60 天提示、120 天清理。</li></ol>` },
    ],
    execution: [
      { id: "t1", h: "T1 区域清单接口", html: `<p>新增 <code>GET /v2/offline/regions/{id}/manifest</code>，覆盖 12 个城市样本。<code>npm test -- offline</code> 通过 48 项。</p>` },
      { id: "t2", h: "T2 共享瓦片存储", html: `<p>引用计数并发测试 2,000 轮无泄漏；删除区域平均耗时 180 ms。</p>` },
      { id: "t3", h: "T3 下载任务", html: `<p>iOS 17 真机强制退出 20 次，均从断点恢复；Android 14 待 T4 一起验证。</p>` },
    ],
  },
  "multi-currency-split": {
    requirement: [
      { id: "goal", h: "目标", html: `<p>跨国旅行时同行者用不同货币付款，目前只能手动换算。希望记账时选择币种，结算时统一换算为行程主币种。</p>` },
      { id: "acceptance", h: "验收", html: `<ol><li>同一行程内日元、人民币、美元混合记账，结算金额与汇率来源一致。</li><li>离线记账在联网后补充汇率，不改变已结算记录。</li></ol>` },
    ],
    technical: [
      { id: "rates", h: "汇率来源", html: `<p>候选：按记账当日汇率，或按结算时汇率。推荐按记账当日，结果可复现；代价是需要保存每笔的汇率快照。</p>` },
    ],
  },
  "trip-share-readonly": {
    requirement: [
      { id: "goal", h: "目标", html: `<p>行程发给家人时，对方不想注册账号也能查看安排。提供只读分享链接，可随时停止。</p>` },
      { id: "open", h: "待澄清", html: `<p>链接是否需要有效期，见澄清问答 Q2。</p>` },
    ],
  },
};
const CHANGES = {
  atlas: [
    { id: "timezone-drift-fix", title: "修复跨时区行程的日程错位", size: "small", status: "active", stage: "execution", creator: "zhou", created: "2026-10-21", labels: ["修复"], urgency: "urgent", related: ["trips/editor"], branch: "change/timezone-drift-fix",
      tasks: [{ id: "T1", title: "按出发地时区保存日程", status: "done", verification: "单元测试 32 项通过" }, { id: "T2", title: "在 iOS 17 真机回归", status: "blocked", reason: "等待测试设备，预计 10 月 23 日到位" }] },
    { id: "trip-share-readonly", title: "行程只读分享链接", size: "medium", status: "active", stage: "requirement", creator: "lin", created: "2026-10-20", labels: ["新功能", "安全"], related: ["trips/sharing"], branch: "develop",
      waiting: { kind: "confirmation", summary: "需求草稿已推送，Q2 链接有效期待回答", since: "今天 09:12" },
      clarifications: [{ q: "Q1", round: 1, text: "接收者是否需要登录？", rec: "不需要，链接即可查看，降低家人使用门槛。", answer: "不需要登录。" }, { q: "Q2", round: 1, text: "分享链接是否需要有效期？", rec: "默认 30 天，可以延长；减少长期暴露的风险。" }],
      tasks: [], previews: ["trip-share"] },
    { id: "multi-currency-split", title: "费用分摊支持多币种", size: "medium", status: "active", stage: "technical", creator: "chen", created: "2026-10-19", labels: ["新功能"], urgency: "high", related: ["expenses/split"], branch: "develop",
      waiting: { kind: "confirmation", summary: "技术方案已推送，等待确认汇率来源取舍", since: "昨天 18:40" },
      clarifications: [{ q: "Q1", round: 1, text: "结算币种由谁决定？", rec: "行程创建者设置主币种，成员可查看。", answer: "行程创建者设置。" }, { q: "Q2", round: 2, text: "按记账当日汇率还是结算时汇率？", rec: "按记账当日，结果可复现。" }],
      tasks: [], previews: ["expense-split"] },
    { id: "widget-ios", title: "iOS 主屏小组件", size: "large", status: "active", stage: "plan", creator: "chen", created: "2026-10-17", labels: ["新功能", "适配"], related: ["trips"], branch: "develop",
      waiting: { kind: "confirmation", summary: "实施计划待确认，共 5 个任务", since: "10 月 20 日" }, tasks: [], previews: ["home-widget"] },
    { id: "offline-map-regions", title: "离线地图按区域下载", size: "large", status: "active", stage: "execution", creator: "lin", created: "2026-10-14", labels: ["新功能", "性能"], urgency: "high", related: ["maps/offline"], branch: "change/offline-map-regions",
      tasks: [{ id: "T1", title: "区域清单接口", status: "done", verification: "接口测试 48 项通过" }, { id: "T2", title: "共享瓦片存储", status: "done", verification: "并发 2,000 轮无泄漏" }, { id: "T3", title: "下载任务与断点恢复", status: "done", verification: "iOS 17 强制退出 20 次均恢复" }, { id: "T4", title: "区域管理界面", status: "doing" }, { id: "T5", title: "过期提示与自动清理", status: "todo" }],
      clarifications: [{ q: "Q1", round: 1, text: "自定义区域用框选还是按行程自动推算？", rec: "两者都提供，默认按行程推算。", answer: "都提供，默认按行程推算。" }, { q: "Q2", round: 1, text: "是否支持卫星影像离线？", rec: "不支持，体积约为矢量的 8 倍。", answer: "不支持。" }, { q: "Q3", round: 2, text: "过期区域是否自动更新？", rec: "Wi‑Fi 下自动更新。", answer: "只在 Wi‑Fi 下自动更新。", withdrawn: "并入 Q1 的下载策略后不再单独决定。" }],
      confirmations: [{ phase: "需求", at: "10 月 15 日", summary: "按区域下载，显示大小与更新状态" }, { phase: "技术方案", at: "10 月 16 日", summary: "共享瓦片与 SQLite 引用计数" }, { phase: "计划", at: "10 月 16 日", summary: "五个任务，先接口与存储" }],
      delivery: { stage: null, changePrs: [{ n: 128, title: "离线地图按区域下载", state: "open", draft: true, head: "change/offline-map-regions", base: "develop" }], releasePrs: [] },
      previews: ["offline-maps"] },
    { id: "sync-conflict", title: "离线编辑冲突合并", size: "large", status: "active", stage: "execution", creator: "lin", created: "2026-10-12", labels: ["数据"], related: ["accounts", "maps/offline"], branch: "change/sync-conflict", dependsOn: ["offline-map-regions"],
      waiting: { kind: "dependency", summary: "等待 offline-map-regions 归档并合入", since: "10 月 18 日" },
      tasks: [{ id: "T1", title: "冲突检测", status: "todo" }, { id: "T2", title: "三方合并", status: "todo" }, { id: "T3", title: "冲突选择界面", status: "todo" }, { id: "T4", title: "回归与迁移验证", status: "todo" }] },
    { id: "notification-digest", title: "通知按天合并为摘要", size: "small", status: "active", stage: "close", creator: "xu", created: "2026-10-10", labels: ["体验"], related: ["notifications"], branch: "change/notification-digest",
      waiting: { kind: "confirmation", summary: "实现已验证，等待验收", since: "10 月 21 日" },
      tasks: [{ id: "T1", title: "按天合并通知", status: "done", verification: "单元测试与 Android 真机通过" }],
      delivery: { stage: "pendingIntegration", changePrs: [{ n: 131, title: "通知按天合并为摘要", state: "open", head: "change/notification-digest", base: "develop" }], releasePrs: [] } },
    { id: "templates-from-history", title: "从历史行程生成模板", size: "medium", status: "active", stage: "requirement", creator: "xu", created: "2026-10-08", labels: ["新功能"], urgency: "low", related: ["trips/templates"], branch: "develop", followUpOf: "trip-templates", tasks: [] },
    { id: "budget-alerts", title: "预算超支提醒", size: "small", status: "unknown", issue: "change.json 校验失败：stage 不能为 “review”", creator: "zhou", created: "2026-10-16", labels: [], related: [], branch: "change/budget-alerts", tasks: [] },
    { id: "expense-export", title: "费用导出为 CSV", size: "small", status: "completed", stage: "close", creator: "zhou", created: "2026-10-02", archived: "10 月 15 日", labels: ["新功能"], related: ["expenses/export"], branch: "change/expense-export",
      tasks: [{ id: "T1", title: "导出 CSV", status: "done", verification: "Excel、Numbers 打开正确" }],
      delivery: { stage: "pendingRelease", changePrs: [{ n: 119, title: "费用导出为 CSV", state: "merged", head: "change/expense-export", base: "develop" }], releasePrs: [] } },
    { id: "map-style-dark", title: "地图深色样式", size: "medium", status: "completed", stage: "close", creator: "chen", created: "2026-09-26", archived: "10 月 9 日", labels: ["体验", "适配"], related: ["maps/styles"], branch: "change/map-style-dark",
      tasks: [{ id: "T1", title: "深色样式表", status: "done", verification: "对比度检查通过" }, { id: "T2", title: "跟随系统切换", status: "done", verification: "iOS、Android 真机通过" }],
      delivery: { stage: "releaseMerged", changePrs: [{ n: 112, title: "地图深色样式", state: "merged", head: "change/map-style-dark", base: "develop" }], releasePrs: [{ n: 120, title: "发布 v1.6.0", state: "merged", version: "v1.6.0", head: "develop", base: "main" }] },
      integration: true },
    { id: "login-rate-limit", title: "登录失败限流", size: "small", status: "completed", stage: "close", creator: "lin", created: "2026-09-21", archived: "10 月 3 日", labels: ["安全"], urgency: "high", related: ["accounts"], branch: "change/login-rate-limit",
      tasks: [{ id: "T1", title: "连续失败暂缓", status: "done", verification: "接口测试 12 项通过" }],
      delivery: { stage: "releaseMerged", changePrs: [{ n: 108, title: "登录失败限流", state: "merged", head: "change/login-rate-limit", base: "develop" }], releasePrs: [{ n: 120, title: "发布 v1.6.0", state: "merged", version: "v1.6.0", head: "develop", base: "main" }] } },
    { id: "trip-templates", title: "行程模板", size: "medium", status: "completed", stage: "close", creator: "xu", created: "2026-09-12", archived: "9 月 28 日", labels: ["新功能"], related: ["trips/templates"], branch: "change/trip-templates", groupTitle: "行程模板",
      tasks: [{ id: "T1", title: "模板数据结构", status: "done" }, { id: "T2", title: "模板选择界面", status: "done" }],
      delivery: { stage: "releaseMerged", changePrs: [{ n: 97, title: "行程模板", state: "merged", head: "change/trip-templates", base: "develop" }], releasePrs: [{ n: 101, title: "发布 v1.5.0", state: "merged", version: "v1.5.0", head: "develop", base: "main" }] } },
    { id: "ar-navigation", title: "AR 实景导航", size: "large", status: "cancelled", stage: "technical", creator: "zhou", created: "2026-09-05", cancelled: "9 月 18 日", cancelReason: "支持的机型不足三成，先投入离线地图。", labels: ["新功能"], related: ["maps"], branch: "develop", tasks: [] },
  ],
  folio: [
    { id: "draft-autosave", title: "草稿自动保存", size: "small", status: "active", stage: "execution", creator: "chen", created: "2026-10-18", labels: ["体验"], related: ["writing"], branch: "change/draft-autosave", tasks: [{ id: "T1", title: "每 5 秒保存", status: "doing" }] },
    { id: "share-roles", title: "共享角色", size: "medium", status: "completed", stage: "close", creator: "lin", created: "2026-09-30", archived: "10 月 11 日", labels: ["安全"], related: ["sharing"], branch: "change/share-roles", tasks: [{ id: "T1", title: "角色模型", status: "done" }], delivery: { stage: "pendingRelease", changePrs: [{ n: 21, title: "共享角色", state: "merged", head: "change/share-roles", base: "develop" }], releasePrs: [] } },
  ],
  fieldnotes: [],
};
const STAGES = [
  ["requirement", "需求"],
  ["technical", "技术方案"],
  ["plan", "计划"],
  ["execution", "执行"],
  ["close", "关闭"],
];
const URGENCY = { urgent: "紧急", high: "高", normal: "普通", low: "低" };
const SIZE = { small: "Small", medium: "Medium", large: "Large", xlarge: "XLarge" };
const DELIVERY = {
  pendingIntegration: ["待集成", "accent"],
  pendingRelease: ["待发布", "violet"],
  releaseMerged: ["已发布", "green"],
  unknown: ["交付待核实", "amber"],
};
const INTEGRATION = {
  commit: "e91b07c",
  title: "Merge Change map-style-dark into develop",
  at: "10 月 9 日 16:42",
  files: [
    { path: "apps/mobile/src/features/map/styles/dark.json", add: 214, del: 0, kind: "added" },
    { path: "apps/mobile/src/features/map/MapView.tsx", add: 18, del: 6 },
    { path: "apps/mobile/src/theme/useColorScheme.ts", add: 9, del: 2 },
    { path: "apps/mobile/assets/map/sprite@2x.png", kind: "binary" },
    { path: "docs/project/changes/map-style-dark/ → docs/project/archive/2026-10-09-map-style-dark/", kind: "moved" },
  ],
  diff: {
    "apps/mobile/src/features/map/styles/dark.json": [
      ["hunk", "@@ -0,0 +1,214 @@"],
      ["add", null, 1, "{"],
      ["add", null, 2, "  \"version\": 8,"],
      ["add", null, 3, "  \"name\": \"atlas-dark\","],
      ["add", null, 4, "  \"sprite\": \"atlas://sprites/dark\","],
      ["add", null, 5, "  \"layers\": ["],
      ["add", null, 6, "    { \"id\": \"background\", \"type\": \"background\", \"paint\": { \"background-color\": \"#15191c\" } },"],
      ["add", null, 7, "    { \"id\": \"water\", \"type\": \"fill\", \"source-layer\": \"water\", \"paint\": { \"fill-color\": \"#1d2b33\" } },"],
    ],
    "apps/mobile/src/features/map/MapView.tsx": [
      ["hunk", "@@ -12,14 +12,26 @@ export function MapView({ region }: Props) {"],
      ["ctx", 12, 12, "  const scheme = useColorScheme();"],
      ["del", 13, null, "  const style = lightStyle;"],
      ["add", null, 13, "  const style = scheme === \"dark\" ? darkStyle : lightStyle;"],
      ["add", null, 14, "  const sprite = scheme === \"dark\" ? darkSprite : lightSprite;"],
      ["ctx", 14, 15, ""],
      ["ctx", 15, 16, "  return ("],
      ["del", 16, null, "    <MapLibre style={style} region={region} />"],
      ["add", null, 17, "    <MapLibre"],
      ["add", null, 18, "      style={style}"],
      ["add", null, 19, "      sprite={sprite}"],
      ["add", null, 20, "      region={region}"],
      ["add", null, 21, "      onStyleError={(error) => report(\"map.style\", error)}"],
      ["add", null, 22, "    />"],
      ["ctx", 17, 23, "  );"],
    ],
    "apps/mobile/src/theme/useColorScheme.ts": [
      ["hunk", "@@ -1,8 +1,15 @@"],
      ["ctx", 1, 1, "import { Appearance } from \"react-native\";"],
      ["del", 2, null, "export const useColorScheme = () => \"light\";"],
      ["add", null, 2, "import { useSyncExternalStore } from \"react\";"],
      ["add", null, 3, ""],
      ["add", null, 4, "export const useColorScheme = () =>"],
      ["add", null, 5, "  useSyncExternalStore(subscribe, () => Appearance.getColorScheme() ?? \"light\");"],
    ],
  },
};

// 原型：当前清单；缩略图在原型中用缩小的页面绘制，真实产品使用已发布截图。
const PROTOTYPES = {
  atlas: [
    { id: "offline-maps", title: "离线地图下载管理", desc: "区域列表、框选下载与空间提示。", kind: "page", devices: ["pc-web", "ipad", "mobile"], change: "offline-map-regions", public: "10 月 18 日", version: "4be1…9c02", commit: "a71c3e0" },
    { id: "expense-split", title: "费用分摊结算", desc: "多币种记账与按人结算。", kind: "page", devices: ["pc-web", "mobile"], change: "multi-currency-split", version: "77d0…31af", commit: "c09b812" },
    { id: "trip-share", title: "行程只读分享页", desc: "无需登录查看行程与地点。", kind: "page", devices: ["pc-web", "mobile"], change: "trip-share-readonly", version: "e3a9…1b74", commit: "5d2e6f9" },
    { id: "itinerary-editor", title: "行程编辑器", desc: "按天安排地点、交通与备注。", kind: "page", devices: ["pc-web", "ipad", "mobile"], version: "19fc…a0d3", commit: "0b7aa41" },
    { id: "home-widget", title: "iOS 主屏小组件", desc: "下一站与出发倒计时。", kind: "component", viewport: [338, 158], change: "widget-ios", version: "ab55…0e19", commit: "f4c18d2" },
  ],
  folio: [],
  fieldnotes: [],
};
const DEVICE_SIZE = { "pc-web": [1440, 900], ipad: [834, 1194], mobile: [390, 844] };
const DEVICE_LABEL = { "pc-web": "桌面", ipad: "平板", mobile: "手机" };
const DEVICE_ICON = { "pc-web": "monitor", ipad: "tablet", mobile: "phone" };
