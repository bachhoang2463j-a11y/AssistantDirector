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

## 2026-09-08 ｜ fix：真酒馆导入后悬浮栏不可见——UI 挂载目标改为主页面 document（业务提交 `fbf20e2`）

**变更行为**：content.js 模块 8 新增 `UI_DOC` 挂载目标常量（window !== window.parent 时取 `window.parent.document`）；buildUI 的 style/rail/panel/modal、toast、document click 监听全部改挂/绑定 `UI_DOC`；z-index 对齐 AiRadio 量级（rail 99990 / panel 99995 / modal 99999 / toast 100000）；build.mjs 产物 `enabled: true`（导入即启用）。

**涉及文件**：`src/content.js`、`build.mjs`、`酒馆助手脚本-副导演.json`、`integration-test/harness.html`

**决策原因**（真机首测发现，IAB mock 层无法覆盖——mock 环境就是主页面执行，不存在 iframe）：
- 用户真酒馆导入后右侧无悬浮栏。实机排查证据链：酒馆助手（JS-Slash-Runner）的全局脚本运行在 `<iframe v-show="false">`（`src/panel/script/Iframe.vue:2`）里；脚本 iframe `TH-script--Assistant Director--…` 存在且运行正常（iframe 内 `__AD__.IS_LIVE === true`，`#ad-rail`/`#ad-style` 均已构建），但挂在 display:none 的 iframe body 里——主页面自然不可见。
- predefine.js 证实 TavernHelper API 全量代理进脚本 iframe（getVariables/injectPrompts/eventOn/SillyTavern getter），环境检测逻辑无需改动，仅挂载目标错误。
- 修复后模拟验证（真酒馆页面建隐藏 iframe 注入新版 content，不改用户脚本库）：`#ad-rail`/`#ad-panel`/`#ad-style` 全部出现在主页面 document，rail 计算样式 fixed/right:0/z-index 99990；验证残留已清理。harness 回归 59/59 全绿。

**遗留**：用户需删除旧版脚本后重新导入新版 JSON（或脚本库内更新 content）；z-index 100000 量级与 AiRadio 同层，若与其他全屏组件层叠冲突再调。

---

## 2026-09-08 ｜ feat：折叠态悬浮窗改版——缩小 + 去静态文案 + 更新提醒（业务提交 `9f58cfa`）

**变更行为**：折叠态贴边竖条重构；harness 新增 5 条 UI 断言（63/63 全绿）。

**涉及文件**：`src/content.js`、`酒馆助手脚本-副导演.json`、`integration-test/harness.html`

**决策原因**（用户真机反馈"地方有点占太大，去掉不必要的静态文案，只保留最新情报轮播，UI 层需要显示更新提醒"）：
- 视觉子代理分析截图确认：旧折叠态 40px×62vh 纵向过长，堆叠"世界情报/GAZETTE/✦/静默占位/点击展开"等静态装饰，无实际情报内容。
- 改版后折叠态：**30px 窄条**，高度自适应——顶部 ✦ 小星标（手柄+品牌残留，hover 变金，title 提示"点击展开"）+ 未读点 + **ticker 情报轮播为唯一内容**（26vh，最新条金色高亮）；**空态（无任何情报）时 ticker 隐藏，竖条收缩为 ~45px 小胶囊**。
- 更新提醒闭环：dispatchNow 检测注入文本变化 → pushTickerHead（地点短名·模式标签，如"绿顶酒馆·驻防"，最近 ≤3 条入 State.tickerHeads 持久化 $ad_state）+ 未读点琥珀脉冲点亮；展开面板后熄灭；换聊天清空。
- ticker 数据源从"卡片池派系名"（静态占位）改为"注入更新流"（真实动态情报）；S4 后将切 surface 头条。
- onChatChanged 补清 tickerHeads；__AD__ 测试钩子暴露 renderTicker/pushTickerHead/shortLoc。
- 展开态面板未动（用户未反馈；报头/底注属报纸美学核心，如需再精简另议）。

**验证**：harness 63/63（新增：注入更新点亮未读/ticker×2 无缝循环/展开后熄灭/折叠态极简结构断言[无 label/fold 元素]/空态收缩 empty 类）。IAB 截图管道本日不可用（capture failed for guest ×2），视觉留档由用户真机确认。

---

## 2026-09-08 ｜ feat：卡片导入 jsonc 容错 + fixtures 测试卡组（业务提交 `7947cc4`）

**变更行为**：content.js 新增 `stripJsonc`（字符串感知剥 // 与 /* */ 注释 + 尾逗号，字符串字面量内的 `//` 如 URL 不误伤），importCards 导入改走 stripJsonc→JSON.parse；新增 `integration-test/fixtures/cards-1925-06-13.json`（27 楼时点六卡纯 JSON：绿顶酒馆/中央车站/伦道夫仓库/澳大利亚酒店[安全区]/萨里山街区/禧市，menu 词条名与图鉴 V3.0 对齐）；harness 新增 3 条断言。

**涉及文件**：`src/content.js`、`酒馆助手脚本-副导演.json`、`integration-test/harness.html`、`integration-test/fixtures/cards-1925-06-13.json`

**决策原因**：用户反馈"导入之前的 jsonc 导入失败"——SPEC/报告示例均为 jsonc（带注释），JSON.parse 不接受；与其要求用户手工去注释，不如导入端容错（用户从文档直接复制即可导入），另配一份纯 JSON 卡组供导入测试。

**验证**：harness 66/66（新增：jsonc 行/块注释+尾逗号可解析、字符串内 // 不误剥、纯 JSON 原样可解析）；fixtures 经 node JSON.parse 校验 6 卡字段完整。

---

## 2026-09-08 ｜ feat：展开态重做为情报条目流 + 两个隐藏 bug 修复（业务提交 `dc3cb06`）

**变更行为**：展开态面板结构重做（报头/主体/工具条/底注全部重构）；dispatchNow 补总开关检查；saveSettings 同步闭包变量；mock setFloorStat 修复空楼层表写入无效位置。harness 70/70。

**涉及文件**：`src/content.js`、`酒馆助手脚本-副导演.json`、`integration-test/harness.html`

**决策原因**（用户反馈"信息密度小/无效边框太多/没有最关键的公开情报"，视觉子代理实测装饰占纵向 30-35%、横向 15-20%，4 卡 60% 高度仅承载 ~60 字且零情报条目）：
1. **展开态重做**：报头压成一行（日期·阶段 + 内联 ↻🗂⚙ 图标按钮）；主体改为无边框纯排版情报条目流——每卡一条 2~3 行（地点+戒备着色徽标 / 派系·敌情菜单区间 / 反应模式截断），当前地点条目 hit 高亮，顶部"当前 地点·配发形态"一行；删除：报头双线框/大标题/通栏英文、分隔标题、卡片盒（描边+圆角+金竖条）、胶囊徽章、底部工具条、colophon 底注。S1 数据源=卡片池，S4 换 surface 真情报流。
2. **真 bug ①**：dispatchNow 不检查 SETTINGS.enabled（总开关关闭后手动重算仍注入）——此前 harness"总开关关闭不注入"为假通过（mock setFloorStat 在 floorCount=0 时写 message[0] 而 message_id:-1 解析为 -1，stat 读取恒 null）。
3. **真 bug ②**：saveSettings 只写 localStorage 不同步闭包 SETTINGS——修 mock 暴露：外部改设置后 dispatchNow 读到的还是旧值。两处修复 + mock 修复后该断言转为真测试。
4. compactMenu 不再截断词条名（保信息密度，行内自然换行）；State 增 lastMode（nowline 数据源，持久化）。

**验证**：harness 70/70（新增：情报条目流渲染/含派系与敌情菜单全名/当前态势行/hit 高亮/工具内联无底部条）；IAB 截图管道持续不可用，视觉由用户真机确认。

---

## 2026-09-08 ｜ feat：情报完整显示 + 双主题皮肤系统（业务提交 `0974243`）

**变更行为**：renderWire 去掉 reaction 的 trunc(42) 截断（信息完整显示，wire 容器整体滚动承载）；UI_CSS 全量 CSS 变量化，新增 paper 主题（NewDay 报纸基因）；设置面板新增皮肤下拉；__AD__ 暴露 renderWire/applyTheme。harness 72/72。

**涉及文件**：`src/content.js`、`酒馆助手脚本-副导演.json`、`integration-test/harness.html`

**决策原因**：
1. 用户反馈"公开情报显示不全，做整体滑动窗口"——视觉子代理实测 6 条中 5 条反应模式被截断，根因是 JS 层 trunc(42) 而非容器（wire 本就是 overflow-y:auto）。修复=去截断，长文自然换行由滚动容器承载；菜单行加 line-height 缓解孤字换行。trunc 函数随之删除（无引用）。
2. 用户喜欢 NewDay 报纸风格，新建 paper 皮肤：米纸底 #f4ecd8 + 纸纹（radial+repeating 渐变）/纸边框 #8c7355（2px）/墨色 #2b241d/暗红强调 #8b2500（替代琥珀金）/安全区墨绿 #2e6b34/衬线字体 Noto Serif SC·Georgia/暖色投影——变量集照搬 NewDay.html 的主题制设计。slate（MMS 深色基因）为默认，两主题全 UI 生效（rail/panel/modal/toast/表单）。
3. 皮肤属 UI 偏好存 localStorage（uiPrefs.theme），设置面板下拉切换即时生效（applyTheme 挂 ad-theme-paper 类）。

**验证**：harness 72/72（新增：54 字长文 reaction 完整显示断言〔临时塞卡测试后还原〕、paper 主题类切换+衬线变量生效断言）。过程中修 harness 自身两处：断言数据误用 fixtures 卡（harness 卡组无此数据）、renderWire 未暴露测试钩子（TypeError 终止 runAll）。

---

## 2026-09-08 ｜ feat：paper 皮肤报纸质感重调（业务提交 `8d17ea8`）

**变更行为**：paper 主题按"阿卡姆广告报"参考重调；全部 border-radius 变量化（--ad-radius/--ad-radius-sm，paper 归零 slate 保留）；harness 皮肤断言扩展（直角 + inset 晕影）。72/72。

**涉及文件**：`src/content.js`、`酒馆助手脚本-副导演.json`、`integration-test/harness.html`

**决策原因**（用户反馈"不太像，去圆角/加投影模拟纸质感/多用棕色字体"，并给出阿卡姆广告报参考图；视觉子代理提取参数）：
- **直角**：panel/rail/modal/toast/输入框/按钮/卡片/滚动条 thumb 全部 border-radius:0（slate 用变量保留原圆角，两主题互不影响）。
- **纸质感投影**：右下双层柔影（4px 6px 18px + 1px 2px 6px，棕黑 rgba(30,18,8)）+ inset 边缘晕影两层（50px/120px 棕调）——纸张浮于桌面 + 四周做旧；纸纹横纹保留并调棕。
- **棕字系**：标题深棕 #2c1e14 / 正文棕 #5e4b35 / 弱化 #8c7a65 / 强调暗红棕 #8b2635 / 安全区墨绿 #2f4f3a；边框深棕细框 1px #2b1b0e（替代浅棕粗框）。
- **报纸语汇**：报头底线 3px double 双线、当前态势行底线 dashed 账目线、地点项目符号 ●→◆ 棕色菱形。

**验证**：harness 72/72（皮肤断言扩展：paper 直角 + boxShadow 含 inset，slate 恢复圆角）。

---

## 2026-09-08 ｜ feat：升级方案 A 阿卡姆大报皮肤与纵向长卷排版（业务提交 `fd5194a`）

**变更行为**：重构报纸皮肤为 1920s 方案 A（阿卡姆晨报 · 经典时代大报版），采用纵向长卷连续滑动（Vertical Continuous Roll）；输出 4 大候选方案选型演示页面 `demo_newspaper_showcase.html` 并更新 `demo_story_director.html`；打包 `酒馆助手脚本-副导演.json`。

**涉及文件**：`src/content.js`、`酒馆助手脚本-副导演.json`、`demo_newspaper_showcase.html`、`demo_story_director.html`

**决策原因**（用户反馈当前报纸皮肤不够像报纸，要求输出 demo 页面并在多方案中选择方案 A 纵向长卷排版）：
- **1920s 时代大报视觉重构**：
  - **报头（Masthead）**：双耳设计（期号/社训/定价）、牛津双实线（Oxford Rules 4px double）、衬线大刊名（Playfair Display/Noto Serif SC）与日期阶段副题栏。
  - **态势头条（Lead Story Box）**：通栏头条驻防简报 + 红色 PUBLIC RECORD 橡胶印章 + 醒目左强调线。
  - **情报流（News Column Articles）**：报纸分栏风格条目、报纸菱形符号（◆）、Kicker 来源元信息行、徽章状态标签、首字下沉社评与折角底注（Colophon）。
  - **贴边折叠条（Rail）**：米纸书脊材质、红星手柄、红墨水呼吸脉冲点与竖排情报轮播走纸带。
- **纵向长卷滑交互**：顶部报头与底注固定，内容区纵向平滑滚动，兼顾高拟真报纸质感与鼠标滚轮单手浏览的便捷性。

**验证**：`build.mjs` 打包成功（content 51555 字符），`demo_newspaper_showcase.html` 交互全功能验证通过，双主题切换与兼容性完好。

---

## 2026-09-08 ｜ feat：优化报纸排版——右上角按钮移位防遮挡 + 消除重复前缀标记点（业务提交 `4c49e14`）

**变更行为**：
1. 报头右上方三个工具按钮（↻ 🗂 ⚙）从主标题行脱离，定位至报头最右上角，给中央主标题保留 100% 完整宽度，彻底避免标题与按钮折叠重叠；
2. 消除文章卡片标题前的重复标记点（删除 `.ad-item-place::before` 的 `● `，仅保留 `◆ ` 菱形报纸语汇标记）；
3. 补全态势简报 Lead Box（`PUBLIC RECORD` 红色印章 + 态势简报 + 判定基准）与文章卡片报纸风 Kicker / 状态徽章；
4. 更新 harness 测试断言并重新编译 `酒馆助手脚本-副导演.json`。

**涉及文件**：`src/content.js`、`酒馆助手脚本-副导演.json`、`integration-test/harness.html`

**决策原因**（用户反馈"把每个标题前面的第二个标记点去掉，一个就足够了。把右上角的三个按钮移动到最右上，避免折叠"）：
- 此前由于 `.ad-item-title::before` 和 `.ad-item-place::before` 同时存在，导致标题前出现双重标记（`◆ ● 地点名`）；现统一仅保留单一标记点。
- 此前工具按钮 `.ad-head-btns` 位于 `.ad-head-main` 内联行，容易挤占报纸主刊名导致文字折行或遮挡；移至报头最右上角 `.ad-head-ears` 右侧绝对定位后，主刊名 `悉尼星期增刊 · GAZETTE` 居中舒展，视觉与操作互不干扰。

**验证**：`build.mjs` 打包成功（content 56529 字符），测试套件全部通过。

## 2026-09-08 ｜ feat：S2 态势位即时产卡落地（业务提交 `41555e6`）

**变更行为**：模块 5（LLM 客户端）与模块 7（态势位）从占位实现为完整链路；设置新增图鉴世界书配置；dispatchNow 接线即时产卡。harness 84/84（S2 新增 13 断言）。

**涉及文件**：`src/content.js`、`酒馆助手脚本-副导演.json`、`integration-test/harness.html`

**实现要点**：
1. **模块 5 LLM 客户端**：`callLLM`（OpenAI 兼容 /chat/completions 非流式，Bearer 认证，AbortSignal.timeout 90s）；`extractJson`（剥围栏 + 首个 [{ 配对提取，字符串感知不误伤）；`getBestiaryNames`（getWorldbook 世界书 API 读词条名做白名单；未配置时自动匹配名称含"图鉴"的世界书；读取失败降级为结构校验并缓存）；`readLatestFloorTail`（getChatMessages(-1) 正文尾 600 字，剥代码块/Status_block/Combat_block）。
2. **模块 7 即时产卡**：`triggerInstant`（dispatchNow 尾部接线：主地点未命中 + 分兵点位未命中 → 一次调用产多卡；Instant.busy 防并发）；`collectOffscreenPlaces`（角色"内心"字段正则提取"不在场，前往X"分兵点位）；`validateCard`（结构校验 + menu 词条强制图鉴白名单 + alert 四档）；`generateInstantCards`（输入组装 → 生成 → 校验 → 失败重试 ≤1 → 过卡写池 source=instant → toast + scheduleDispatch 下一拍命中替换兜底注入；tried 表防同地点重复产卡，换聊天清零）。
3. **设置**：新增"图鉴世界书"配置（留空自动匹配，保存时重置图鉴缓存）；端点未配置时完全不发起 LLM 调用（纯程序兜底）。
4. **harness S2 断言组**（mock fetch/getChatMessages/getWorldbook）：A 成功链路（兜底→异步入池→下一拍命中含词条判定→恰 1 次调用→请求含地点图鉴名册→不重复）；B 非法 menu 白名单拒绝→重试一次→不入池保持兜底→不反复重试；C 分兵多卡（主地点命中仅对分兵点位产卡）；D 端点未配置零调用。测试数据不污染 localStorage（段末还原）。

**验证**：84/84 全绿。注：A3 首跑失败系断言误用卡片名而非地点原文（匹配靠别名"后巷"），harness 修正后通过。

---

## 2026-09-08 ｜ feat：世界书同步配置 + 图鉴校验容错升级（业务提交 `964fc15`）

**变更行为**：SETTINGS 新增 worldSync 配置与设置面板区块；getBestiaryNames 升级为 getBestiaryIndex（含 strategy.keys）；新增 resolveBestiaryName/bestiaryMenuList/getSyncedWorldbookText；validateCard 规范化写回；buildInstantMessages 加【世界书同步资料】段。harness 93/93（新增 9 断言）。

**涉及文件**：`src/content.js`、`酒馆助手脚本-副导演.json`、`integration-test/harness.html`

**决策原因**（用户反馈：图鉴词条名带等级前缀；应让用户自选读取哪些世界书的哪些词条；图鉴给小模型导入"总览"词条即可；副导演不能只读上下文，还需同步剧情世界书）：
1. **图鉴校验容错**：真实图鉴词条名为"1级·萨里山剃刀党混混"格式，keys 含干净名。resolveBestiaryName 按 RpgCombat 同款语义四级匹配（词条名全等/keys 全等/剥等级前缀全等/双向包含），命中即把 menu 词条名**规范化写回完整词条名**——保证 RpgCombat 建局精确命中图鉴。
2. **世界书同步**：设置面板新增"世界书同步"区块（多来源：世界书下拉 + 词条勾选弹窗 + 增删；操作前 collectFormToSettings 保存现场防输入丢失）；getSyncedWorldbookText 按配置读词条 content（单词条 800 字/总计 4000 字上限）组装注入态势位 prompt——图鉴勾"总览与索引"即满足"给小模型导入总览"；剧情世界书（悉尼/沙蝎教派等）词条同理同步。S3 暗线位将复用同一数据源。
3. **菜单紧凑化**：给小模型的敌人选项从 41 个带前缀词条名改为 keys[0] 干净名列表（约省一半 token），规范名靠校验端写回保证。
4. mock 世界书对齐真实 WorldbookEntry 结构（name/strategy.keys/content）。

**验证**：harness 93/93（S0-S8：索引载入/四级匹配/规范化写回/图鉴外拒绝/多书多词条组装/持久化往返；A5 升级：请求含同步资料段）。过程中 8123 服务器被并行任务关闭，自起 8124 完成回归。

---
