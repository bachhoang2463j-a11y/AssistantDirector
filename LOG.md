# LOG（施工日志）

> 规范见 `Coding rule.md`。回溯历史先读 LOG-INDEX.md，按 HASH 精准定位本文件对应段落，禁止一次性全量读取。

---

## 2026-09-07 ｜ SPEC V0.2 设计定稿重写（业务提交 `b516261`）

**变更行为**：SPEC.md 全文重写（V0.1→V0.2）、README.md 同步、`demo_story_director.html` 与 `Coding rule.md` 入库（此前未跟踪）；SPEC/README 中 demo 引用路径由 MMS 目录改为本项目根目录。

**涉及文件**：`SPEC.md`、`README.md`、`demo_story_director.html`、`Coding rule.md`

**决策原因**（本轮与用户对齐的全部设计定稿）：

1. **短标记废弃**：`【战斗标记点丨…】` 与状态栏正则/酒馆 markdown 管线冲突过多，已随 RpgCombat 功能回退；开战宣告唯一通道 = **最短 `<Combat_block>`**（我方/敌方各只写名字——我方数值 MMS 直连、技能走 RpgCombat 持久化、敌方数值图鉴/导演兜底）。战斗轮规则由用户常驻世界书前部（单一事实源），态势注入只带两行提醒。
2. **修补人格删除**：战斗初始化全链路（检测/解析/建局/兜底生成/图鉴写回）已移注 RpgCombat V10.12，副导演属地为纯叙事。
3. **态势模型重写**：原"18 场景模板 × 派系控制权 × 戒备等级"建立在两个不成立的假设上——MMS 的 18 个 SVG 地图是纯视觉模板无派系语义；AIRP 地点自由涌现不可穷尽。态势内容的本质是语义判断，改为**态势卡片池**：暗线位报告时全量复审 + 态势位小模型随地点即时产卡（分兵一次多卡），程序每楼只做三级匹配/规模重算/配发/校验；未命中走通用兜底注入 + 待登记闭环；粗路由删除。
4. **触发矩阵定稿**：暗线报告节律 = 世界时钟——newday 主节律（stat_data 日期跨日）+ 事件号外（战斗结算/阶段变更/跨城市）+ 同日 ≥15~20 楼兜底 + GM 面板手动；swipe 去抖（仅新楼生成后检查）。每楼零 LLM 调用。
5. **双端点定稿**：暗线位（次高智力、天级）+ 态势位（快速小模型、均 ~3 楼一次）；设置面板沿用 AiRadio custom_api 模式。
6. **项目形态变更**：单 HTML 正则 iframe → **单 JSON 悬浮窗脚本插件**（AiRadio 同构：type:script 外壳 + content 内嵌 UserScript，localStorage 存设置、聊天变量 `$ad_*` 存世界状态）；新增 §4.8 单 JSON 文件结构（外壳 + 10 模块分区 + 存储分层表）与 §3 可见性矩阵（surface/truth/garrisons/预约的玩家与正文 AI 可见边界）。

**验收依据**：用户对实例报告（27 楼时点全量 JSON，含六卡 garrisons 与三条 ambush 预约）确认 schema 与措辞密度后拍板落盘。

---

## 2026-09-08 ｜ SPEC V0.2.1 注入协议修正与 LWB 输入接口落实（业务提交 `2df0cd5`）

**变更行为**：SPEC.md §4.5 注入协议语义修正 + 安全地点变体、§4.3 新增 LWB 摘要读取细则、§4.6/§4.8 接口同步；README.md 版本与依赖表同步。

**涉及文件**：`SPEC.md`、`README.md`

**决策原因**：

1. **持续注入语义**（用户修正）：态势与暗线两条注入均持续在场（常驻深度0 system），原"频率"列让人误以为暗线注入是间歇性的——修正为"刷新频率"仅指内容更新节奏；替换式 = 刷新时 uninject+inject，上下文任何时刻各只有一份。
2. **安全地点变体**（用户补充）：绝对安全地点（menu 空/据点类）态势注入写明"当前场景无可见敌人，但不排除剧情合理范围内的认知外突袭"——安全只约束可见性，不没收正文的世界事件权限（预约引爆的伏击可能恰落在安全地点）。
3. **LWB storySummary 输入接口落实**（源码核实 `LittleWhiteBox/modules/story-summary/`）：
   - 读取通路 `SillyTavern.chatMetadata.extensions.LittleWhiteBox.storySummary`（酒馆助手稳定接口，只读快照，不依赖 LWB 事件）；
   - 字段：lastSummarizedMesId + json（keywords/events/arcUpdates，事件自带楼层号 #X-Y，直接作 causes 出处候选）；
   - 增量窗口：LWB 自动总结是异步楼层阈值触发（timing+interval），报告时以 lastSummarizedMesId 为界，之后 2~3 楼取原文补增量；
   - 楼层隐藏联动：LWB hideSummarizedHistory 开启后旧楼层被 /hide 隐藏（仅保留最近 ~3 楼）——暗线注入的"事实提醒"是被隐藏历史的唯一在场载体，决策性事实须保留；
   - 注入分工：LWB `<剧情总结>`（ASSISTANT/动态深度）管"发生过什么"，副导演暗线注入管"意味着什么"（truth/渗透/禁泄）——防冗余堆 token，事实提醒措辞密度对齐 LWB 精炼风格。

---

## 2026-09-08 ｜ SPEC §4.3 增量窗口措辞澄清（业务提交 `544c7ba`）

**变更行为**：§4.3 LWB 摘要读取细则中"之前的楼层信任摘要"措辞改写为明确语义。

**涉及文件**：`SPEC.md`

**决策原因**：原措辞"楼层信任摘要"被用户指出歧义（易误读为某种机制名词）。澄清为：已总结楼层不再回读原文，以 LWB 摘要事件为该段历史唯一输入材料；causes 出处程序校验只查楼层号真实存在、不回读原文复核事实陈述；LWB 缺席时该段为盲区（代价是无从推演而非幻觉，三态机制兜底）。

---

## 2026-09-08 ｜ S0~S1 落地：单 JSON 悬浮窗插件 + 卡片引擎 + harness 59 断言全绿（业务提交 `6035c65`）

**变更行为**：首版代码落地。新增 `src/content.js`（UserScript 主体，10 模块分区，S0~S1 范围：常量/设置/环境适配/楼层监听/卡片引擎/公开层 UI/GM 面板/主流程，S2~S3 留桩）、`build.mjs`（打包单 JSON，版本号自动同步 UserScript 头）、`酒馆助手脚本-副导演.json`（产物 v0.1.0，content 41381 字符）、`integration-test/harness.html`（mock 酒馆环境 + 59 断言）；SPEC §4.2 卡片 schema 补 `verdict`（判定标准，可选字段）与 `manual` 来源、§4.8 存储分层表补 `$ad_state`。

**涉及文件**：`src/content.js`、`build.mjs`、`酒馆助手脚本-副导演.json`、`integration-test/harness.html`、`SPEC.md`

**实现要点**：
1. **S0**：贴边折叠栏 UI 自 demo_story_director.html 移植（CSS 同源，id 前缀 ad- 防冲突）；双端点设置面板（暗线位/态势位，localStorage `ad_settings_v1`，AiRadio 模式）；环境检测（LIVE=酒馆助手 API 全套在位，否则 DEMO 静默降级）；API 封装（injectPrompts 替换式注入/getVariables message:-1 回溯 ≤50 楼读 stat_data/eventOn 四事件接线）。
2. **S1**：三级地点匹配（剥 emoji 全等 place=3.0/别名=2.8/双向包含按占比<2.0，多卡择优）；menu 解析（`*min~max`/`*N`/无数量，全角容错）；规模随行重算（倒地或弹药消耗过半[基准=历史最高存 $ad_state] → 区间下限-1 保底 1，正常取中值）；三种注入形态（命中卡/安全区变体[用户原话文案]/通用兜底）+ 报警框架首行；每楼 dispatch 幂等（lastInjectedText 相同跳过）；800ms 去抖；GM 面板卡片 CRUD（表单编辑/JSON 导入导出/写 $ad_cards）。
3. **harness 59 断言全绿**（IAB 实测）：环境初始化/三级匹配/menu 解析/stat 解析/规模重算/注入拼装/端到端 dispatch（含幂等、换地点、倒地降档）/事件链路去抖/持久化（localStorage+聊天变量+总开关回退）/UI 数据驱动（报头解析/派系分组/ticker 3×2）；折叠态布局计算样式断言（fixed/right:0/40px/z-index 60060/动画 ad-tick）+ 视觉子代理确认无破版。

**决策原因与过程记录**：
- 测试数据取自真实聊天记录 #27 楼 stat_data（总督套房/绿顶酒馆/满弹/倒地/低弹场景），非虚构样例。
- 首轮 57/59 → 3 处 harness 自身 bug 修正（非 content.js 缺陷，content.js 零改动通过全部）：① 低弹测试数据 20+8=28 未过基准 48 的半线（改 10+8=18）；② `Math.round(1.5)=2` 期望值写错（杀手*1→*2）；③ `MOCK.eventEmit` 未在 MOCK 返回对象暴露 + `reset()` 重新赋值 store.chat 导致 `MOCK.chat` 引用脱钩（改原地清空）。
- IAB 对未聚焦页面 setTimeout 节流（实测 100ms→641ms、800ms→995ms）：harness 固定 sleep 改 `waitFor` 条件轮询（15s 上限自适应等待 content 的 800ms 去抖真正触发）；断言完成判定移到 node 侧轮询（不受页面节流影响）。该节流环境接近真实酒馆 iframe 恶劣条件，能通过即真环境只会更好。
- 布局动画（展开缓动/ticker 循环时序）按开发约定留待真 Chrome/真机最终确认（IAB rAF 节流不可信）。

**遗留**：S2（态势位即时产卡）/S3（暗线人格）桩位已留；产物待用户导入真酒馆实测（导入方式：脚本库导入 `酒馆助手脚本-副导演.json`）。

---
