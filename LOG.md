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

## 2026-09-08 ｜ feat：信息完整性优先——全量注入（业务提交 `bed1b73`）

**变更行为**：getSyncedWorldbookText 废除单词条 800 字/总计 4000 字截断（词条内容全量）；readLatestFloorTail 废除 600 字截断（整楼正文全量，仅剥代码块）；SPEC 升 V0.2.2（§4.2 输入行 + §6 第 3 闸重写）。harness 94/94（新增 S7b 长词条全量断言 + A5 扩展全量正文/词条尾部标记断言）。

**涉及文件**：`src/content.js`、`酒馆助手脚本-副导演.json`、`integration-test/harness.html`、`SPEC.md`

**决策原因**（用户原则："副导演宁愿上下文被塞满也不能缺乏信息让它瞎说"——当前模式上下文很长，七八万字注入无压力）：
- 原"输入压缩"闸（V0.2 设计时为省 token 的保守假设）被推翻：长上下文模型时代，**缺信息导致的瞎编比长输入的稀释更危险**。
- SPEC §6 幻觉防线第 3 闸改写为"输入完整性 + 白名单"：全量注入勾选词条与正文，白名单校验（menu ∈ 图鉴、causes 楼层出处）不变——校验是程序闸，与输入长度无关。
- S3 暗线报告输入将沿用同一原则（LWB 摘要 + 全量增量窗口 + 全量世界书同步）。

---

## 2026-09-08 ｜ feat：双通道上下文（两套世界书配置 + 副导演楼层窗口）（业务提交 `6f95c7b`）

**变更行为**：SETTINGS.worldSync 拆为 worldSyncSituation / worldSyncShadowline 两套独立配置（loadSettings 自动迁移：旧单一配置复制到两套）；新增 shadowlineFloors（默认 20）；数据层新增 getShadowlineFloorContext / getLwbSummaryText / stripBlocks；getSyncedWorldbookText(slot) 参数化；设置面板双区块 + "副导演可见楼层"行。harness 105/105（新增双通道断言组 11 条）。

**涉及文件**：`src/content.js`、`酒馆助手脚本-副导演.json`、`integration-test/harness.html`、`SPEC.md`（V0.2.3）

**决策原因**（用户需求 + AskUserQuestion 确认）：
1. **两套世界书配置**：副导演（暗线位报告）与态势位（产卡）各自选书勾词条，不再共用；旧配置一次性迁移复制到两套（用户确认）。
2. **副导演楼层窗口**：默认 20 楼 AI 原文（对齐用户 LWB 的 20 楼一总结），排除玩家输入与 LWB 隐藏楼层，全量不截断，每楼带楼层号（causes 出处）；0=全部历史。早期历史由 LWB 结构化总结覆盖（用户确认：副导演视野与正文一致——N 楼原文 + LWB 总结）。
3. 实现：getShadowlineFloorContext 优先直读 SillyTavern.chat（同源消息数组，字段 mes/is_user/is_hidden 兼容），回退 getChatMessages('all', {role:'assistant', hide_state:'unhidden'})；getLwbSummaryText 读 chatMetadata.extensions.LittleWhiteBox.storySummary 格式化关键词+事件（带楼层出处）。
4. 本轮只做配置+数据层（用户确认），S3 暗线位主体下轮落地时直接消费 getShadowlineFloorContext/getLwbSummaryText/getSyncedWorldbookText('shadowline')。

**验证**：harness 105/105（F1-F6 楼层窗口/排除/楼层号/剥码/0=全部；L1 LWB 格式化；W1-W2 两套配置独立；P1 持久化往返；M1 旧配置迁移）。过程中修 harness 两处：世界书 mock 安装时机（双通道段在 S2 段之前，mock 提前）、编辑残留的重复 const s2 声明（SyntaxError 全挂）。

---

## 2026-09-09 ｜ feat：S3 暗线位战略层落地（业务提交 `a198009`）

**变更行为**：模块 6 从占位实现为完整战略层；GM 报头新增 📡 按钮 + 报告查看弹窗；dispatchNow 接线预约引爆与触发矩阵。harness 115/115（S3 新增 11 断言）。

**涉及文件**：`src/content.js`、`酒馆助手脚本-副导演.json`、`integration-test/harness.html`、`SPEC.md`（V0.2.4）

**实现要点**：
1. **触发矩阵**（checkTriggers，每楼 dispatch 末尾）：newday（stat_data 日期跨日）/阶段变更/跨城市/$rpg_combat_result 指纹变化三路号外/同日 15 楼兜底；首楼记基线不触发；Trigger.busy 锁防并发；换聊天重置基线；报告成功后基线对齐报告时点。
2. **报告输入组装**（信息完整性优先，全量五源）：N 楼 AI 原文（getShadowlineFloorContext，带楼层号）+ LWB 总结 + 暗线位世界书同步 + 全量 stat_data + 名册/墓碑/卡片池/上次报告三态/待登记地点 + 敌人名单。
3. **报告生成与校验**：暗线位 callLLM（180s 超时，重试 ≤1）；validateReport 硬校验——causes 必须含真实楼层号、truth/surface 成对、三态枚举（缺省推断中）、墓碑派系禁止复活、garrisons 逐张过图鉴白名单+规范化；坏条目丢弃不阻塞其余产出。
4. **三路分发**：garrisons mergeGarrisons 收编卡片池（已有卡按 place 复审更新 source=daily，新卡追加）；buildShadowlineInjection 生成提炼注入（事实提醒[已兑现/已渗透]+幕后动向[推断中]+禁泄清单+调查阻力）以 ad_shadowline 深度0 system 持续在场替换式注入；报告存档 $ad_report。
5. **名册**（$ad_roster）：报告派系自动注册（轻量登场），墓碑只读不写；S5 才做玩家 CRUD。
6. **预约-引爆**（$ad_pending.ambush + checkAmbush）：报告的 ambush预约 存档；每楼 dispatch 前检查（时间=预约日期片段与当前日期交集；地点=直接包含或经卡片池别名匹配对齐同一驻防点）；命中→对应卡戒备置顶+注入附主动接触态标注+预约移除。
7. **GM**：报头 📡 按钮（有报告→查看弹窗[派系三态概览/禁泄/预约/完整JSON/重新推演]；无报告→手动触发）；报告生成后自动弹出查看。

**验证**：harness 115/115（T0 基线不触发/T1 存档/T2 校验丢弃 2/4 存活/T3 提炼注入内容/T4 收编+规范化+拒新卡/T5 名册注册/T6 预约存档/T7 newday 自动触发/T8 引爆三合一/T9 端点未配置零调用）。修 harness 三处：名册 mock 写入时机（reset 前被清）、按钮数 3→4、T3 断言误查注入中不存在的派系名；修 content 一处：引爆地点匹配借卡片别名对齐（"达令港仓库"≈"达令港·伦道夫船运仓库"）。

---

## 2026-09-09 ｜ fix：世界书配置丢失 + 📡 反馈 + 调试模式 + 按钮间距（业务提交 `4d47d04`）

**变更行为**：worldSync 操作（选书/勾词条/增删）即时持久化（persistSyncNow，不依赖保存按钮；已选书未勾词条的来源保留）；generateShadowlineReport 端点未配置改 toast 提示、手动触发有启动提示；新增调试模式（SETTINGS.debug + DebugLog 环形 20 条 + openDebugModal 查看弹窗 + 控制台输出，callLLM 带 label）；报头按钮组间距适配 4 按钮（ears padding-right 75→118px）。harness 118/118（新增 W3/A7/T10）。

**涉及文件**：`src/content.js`、`酒馆助手脚本-副导演.json`、`integration-test/harness.html`

**决策原因**（用户真机反馈三问题）：
1. **"选择世界书后不保持，重开设置清空"**——双根因：①必须点"保存"才生效（用户勾完词条以为完成）；②保存时的 filter(x.book && x.entries.length) 把"已选书未勾词条"的来源丢弃。修复：所有 sync 操作即时写回 SETTINGS+localStorage；filter 放宽为只去 book 空的来源。
2. **"📡 点了没反应"**——端点未配置时静默 console.log（用户看不到）；手动推演无启动反馈（异步几分钟无提示）。修复：未配置→toast 指引设置；manual 触发→启动 toast。
3. **"加 debug 模式看发了什么回来什么"**——设置面板新增调试开关 + 🐞 日志按钮；DebugLog 记录每次 LLM 调用（label 区分 instant/shadowline、url、model、完整 messages、响应原文、耗时、错误），环形 20 条，弹窗逐条查看，控制台同步输出。
4. **"右上角按钮挪下来了"**——用户的绝对定位 CSS 未被改动，实为第 4 个按钮（📡）使按钮组变宽盖住耳朵行文字；加宽 ears 预留空间并收紧按钮内距。

**验证**：118/118。过程中 harness 自身两个坑：const sKeep 重复声明（内嵌 script 整块不执行——按钮点击无反应症状与用户反馈神似，已用 node --check 提取校验锁住）、W3 断言数据流还原错误。

---

## 2026-09-09 ｜ fix：图鉴校验链修复（真机报告暴露）（业务提交 `177e1ba`）

**变更行为**：stripTier 的 TIER_PREFIX_RE 扩展罗马数字（Ⅰ-Ⅹ 全/半角）；getBestiaryIndex 去自动匹配（bestiaryBook 必须显式配置，设置面板改世界书下拉）；暗线/态势位 prompt 强化（factions 不可为空=报告核心；menu 词条从名单原文照抄、禁止自创/改写等级前缀）。harness 119/119（新增 S4b 罗马数字断言）。

**涉及文件**：`src/content.js`、`酒馆助手脚本-副导演.json`、`integration-test/harness.html`

**决策原因**（用户真机暗线报告暴露）：
1. 报告 garrisons 的 menu 出现"Ⅴ级·萨里山剃刀党混混"等罗马数字等级——真机 bestiaryBook 留空走自动匹配失败（索引 null），白名单校验降级放行，模型自创等级原样入档。修复：罗马数字剥前缀匹配（'Ⅴ级·萨里山剃刀党混混'→剥除→命中 keys→规范化写回图鉴真名'1级·…'，等级以图鉴为准）；去自动匹配（用户确认该功能不需要），图鉴世界书改下拉显式选择，未配置时警告降级。
2. 报告 factions 为空数组——模型只产出 garrisons 未推演派系。prompt 规则 0：factions 不可为空，至少一条（无新动向延续上次三态）。
3. menu 名单措辞收紧：'原文照抄，禁止自创或改写等级前缀'（原'可用原词或其简写'给了自创空间）。
4. 调试模式用法说明：⚙ 设置开启后，每次 LLM 调用记录于 🐞 日志（本次真机报告生成时未开启故无记录）。

**验证**：119/119。过程中修 harness 时序错误：S2 段 bestiaryBook 配置块在图鉴断言之后执行（断言时索引 null 全挂），配置块前移后通过。

---

## 2026-09-09 ｜ fix：等级前缀正则补 ASCII 罗马数字组合（业务提交 `a790f92`）

**变更行为**：TIER_PREFIX_RE 扩展 ASCII 罗马组合（[IVXivx] 混排，IV级/iii级/x级 均剥除；VIP级 等普通词不误伤）。harness 119/119（S4b 扩三例）。

**涉及文件**：`src/content.js`、`酒馆助手脚本-副导演.json`、`integration-test/harness.html`

**决策原因**（用户第二份真机报告截图暴露）：模型输出 "IV级·悉尼常规巡警"——上轮修复只覆盖单字符 Unicode 罗马数字（Ⅳ），ASCII 字母组合 IV 漏网。另确认用户看的"提示词"入口错位：📡 报告弹窗是推演结论，LLM 请求/响应查看入口在 ⚙ 设置 → 🐞 调试日志（本次报告生成于 04:38，factions 为空与 IV 级问题均在上一轮修复之前，需重新导入验证）。

---

## 2026-09-09 ｜ fix：副导演输入三重修复（真酒馆实证驱动）（业务提交 `79e9581`）

**变更行为**：getShadowlineFloorContext 数据源改 `SillyTavern.getContext().chat`（真机顶层 `SillyTavern.chat` 不存在）+ 隐藏过滤改三字段（is_user/is_system/is_hidden，`/hide` 真实字段为 is_system）；getLwbSummaryText 同改 getContext().chatMetadata；buildShadowlineMessages 状态栏裁剪（仅日期/地点/敌方动向）+ user 输入顺序重排（世界书同步→LWB 总结→非隐藏楼层→辅助信息）+ 楼层 ━━ 分隔严格排版。harness 120/120（ST_MOCK 改真机形态，新增 T11 请求结构断言）。

**涉及文件**：`src/content.js`、`酒馆助手脚本-副导演.json`、`integration-test/harness.html`

**决策原因**（用户贴 28 万字符真实请求全文 + 要求开酒馆 debug）：
1. **隐藏楼泄漏**：真机实证 `getContext().chat` 27 楼中 0-11 楼 `is_system: true`（/hide 的真实标记，`is_hidden` 全 false）；旧代码过滤 is_hidden 无效且 `SillyTavern.chat` 顶层 undefined 走了 getChatMessages 回退（该层 hide_state 过滤不含 is_system 楼）——14 个已总结旧楼全漏进请求。修复后真机实测楼层上下文 = [12,14,16,18,20,22,24,26]（与正文 AI 视野完全一致，23178 字符）。
2. **状态栏裁剪**（用户原则：暗线只管非玩家阵营，不需要知道玩家阵营任何事）：旧请求全量 stat_data JSON（角色列表 HP/弹药/物品/内心、小地图、据点、行动选项共 10 万字符）——裁剪为 {日期和时间, 地点, 敌方动向}（stat_data.人物.敌人）。
3. **顺序重排**（用户规定：提示词→世界书 order→小白总结→非隐藏楼层）：user 段固定为 世界书同步资料（按配置顺序）→ LWB 早期历史总结 → 非隐藏楼层原文（`━━━━━━ 楼层 N ━━━━━━` 分隔，不与正文内【】标记混淆）→ 辅助信息（时空与敌方/敌人名单/卡片池/名册/墓碑/三态/待登记）。
4. LWB 读取同步修（真机 chatMetadata 也在 getContext 里，实测修复后 2779 字真实总结读出）。

**真机验证**（IAB 开酒馆实测，script 标签注入新版逻辑，不动用户插件）：楼层 ID、隐藏/玩家排除、━━ 排版、LWB 内容四项全过；验证后已 reload 清理注入。

---

## 2026-09-09 ｜ feat：世界书 order 排序 + 设置即时持久化 + S4 最小版 surface 上报纸（业务提交 `624fd32`）

**变更行为**：新增 sortWorldbookEntries（position.type 七级分组 + order 升序），getSyncedWorldbookText 遍历排序序列（非 getWorldbook 原始顺序/勾选顺序）；设置面板全部 data-k 项 change 即时持久化；renderWire 新增 surface 渲染分支（有报告时公开征兆替代卡片池成玩家可见内容）+ 报告成功后 surface 推入 ticker。harness 123/123（新增 W4/T12/T12b）。

**涉及文件**：`src/content.js`、`酒馆助手脚本-副导演.json`、`integration-test\\harness.html`

**决策原因**（用户第二份真实请求全文暴露三问题）：
1. **世界书顺序乱**（用户：总览蓝灯 order1 应排第一，实际"总督套房"排最前）：getWorldbook 返回的是 JS-Slash-Runner 的"自定义顺序"，与酒馆上下文的 position/order 无关（文档 1953 有注明但易误读）。修复：按 position.type 分组（角色定义前→…→深度插入）+ 组内 order 升序排列，输出遍历排序后序列（首版实现排序了但遍历仍按勾选顺序，W4 断言抓出后修正）。
2. **报告 garrisons menu 全空**：请求中【可选敌人名单】为"（无）"=图鉴索引未加载（真机设置下拉改了但只有 worldSync/debug 即时保存，bestiaryBook 仍依赖保存按钮）。修复：全部设置项 change 即时 collectFormToSettings+saveSettings+resetBestiaryCache。
3. **报纸表层不更新**：S4 最小版——报告生成后 factions.surface（公开征兆）渲染进面板情报流（派系名+一句话征兆+三态徽标+报告日期），有报告时替代卡片池（卡片池属态势后台数据，SPEC §3 可见性矩阵：玩家只见 surface）；最新两条 surface 短句推入折叠条 ticker。完整 S4（灰卡阶段揭示/墓碑/单向 MMS）后续落地。

**验证**：123/123（W4 排序：角色定义前 order1 先于 at_depth；T12 surface 上报纸含三态徽标；T12b surface 上 ticker）。

---

## 2026-09-09 ｜ feat：职责重划——敌人手输权威 + 态势全归态势位 + 地标键触发（业务提交 `e3682a6`）

**变更行为**：删除图鉴自动校验全链（bestiaryBook 设置/图鉴索引/四级匹配/规范化写回，-174 行）；SETTINGS 新增 enemyPool 手输框（逗号/换行分隔，menu 唯一权威选项来源）；暗线报告 schema 去 garrisons（prompt/校验/收编全删）、输入去态势数据（卡片池/敌人名单/待登记段）；产卡改地标键触发（landmarkKey=地点大区后首字段，没变不产卡）+ prompt 地标级粒度规则。harness 123/123（删 S0-S6/S4b 图鉴断言，新增 E1-E4 敌人名单/L1-L3 地标键/A8 地标不变不产卡/T4 不收编）。

**涉及文件**：`src/content.js`、`酒馆助手脚本-副导演.json`、`integration-test/harness.html`

**决策原因**（用户原则："不要把用户当傻子，程序没人类靠谱"）：
1. **删图鉴自动校验链**：敌人由用户全权控制——设置新增"本轮敌人名单"手输框（唯一权威）；世界书同步里的图鉴词条（用户手勾）提供内容语境。validateCard 的 menu 校验改为 ∈ 手输名单（双向包含容错），未配名单则不校验（人类权威，卡片可在管理里人工审删）。
2. **暗线去 garrisons**（用户："态势完全由小模型负责，暗线不要分散注意力"）：报告 schema 只剩 factions/resistance/roster_ops/ambush预约；输入删态势数据段（卡片池/敌人名单/待登记地点）；卡片池完全由态势位维护。
3. **地标键触发**（用户："更新范围是地标（大学/山洞/旅馆），不是大区也不是小房间；匹配状态栏大区后的字段，没变则不更新"）：landmarkKey = 地点串第二段（大区后首字段）；dispatchNow 中 keyChanged 才触发产卡（房间级变化客厅→玄关不产）；产卡 prompt 明确地标级 place 规则。

**验证**：123/123。过程中修 harness 两处：残留 resetBestiaryCache 调用（函数已删致 runAll TypeError）、T4 断言误判测试数据自带的 source='daily'。

---

## 2026-09-09 ｜ feat：零校验模式（业务提交 `85864de`）

**变更行为**：validateReport 与 validateCard 全部降级为结构整形与字段补默认（零丢弃零重试）；generateShadowlineReport 仅在 JSON 解析/网络失败时重试一次，解析成功必落地；busy 时点击有 toast 提示；失败 toast 带具体原因并延时 5-6 秒。harness 122/122。

**涉及文件**：`src/content.js`、`酒馆助手脚本-副导演.json`、`integration-test/harness.html`

**决策原因**（用户："把限制全都去掉，现在都还没跑通呢，先看效果，我没说限制别加"）：
1. 上一轮宽容版仍保留 causes 缺失丢弃/成对丢弃/墓碑丢弃/楼层号超界——用户明确要求零校验：模型输出先原样落地看效果，效果不满意调提示词，限制等用户提出再加。
2. 静默失败根因（用户"等半天连提醒都没有"）：旧版两次校验重试各 180s 超时 + 失败 toast 只闪 2.2s。修复：校验不再触发重试（解析成功=token 必有产出）；busy 状态点击提示"推演进行中"；失败原因写进 toast 且延时。
3. validateReport 只做：字段补默认（name/truth/surface/causes/state）+ resistance/ambush 结构过滤（空壳剔除，非语义限制）。validateCard 只拦废数据（缺 place/faction 物理不可用）。enemyPool 从校验源退为纯提示词引导。
4. 诊断记录：真机 Trigger.busy=false 未死锁，DebugLog 空（用户点击发生于旧版插件页面加载后无调用记录）。

**验证**：122/122（T2 全条目保留、B1 menu 任意词条单次调用入池、E5 零校验、T5 名册全注册）。

---

## 2026-09-09 ｜ fix：中文键名容错 + AiRadio 式控制台调试（业务提交 `577f0c8`）

**变更行为**：暗线提示词 factions 条目补字段结构示例（明确英文键名）；validateReport 键名容错（派系/名称、真相、征兆/表面、出处、状态 → 标准字段，映射失败才补默认）；callLLM 调试改为 AiRadio 式——发起即 console.log 完整 messages，失败/HTTP 错误/响应缺 content 即时 console.warn 原因与响应体（HTTP 错误附 res.text 前 500 字符）。harness 122/122（S3 mock 改中文键全链路验证容错）。

**涉及文件**：`src/content.js`、`酒馆助手脚本-副导演.json`、`integration-test/harness.html`

**决策原因**（用户真机报告"全是未命名派系"）：
1. 根因：提示词只给顶层 schema 未给 factions 条目字段示例，而 ambush预约 示例用中文键"派系"——模型被带偏，factions 条目输出 {"派系":…}，f.name 取空全补"未命名派系N"。修复：示例明确英文键 + 容错映射双保险。
2. 用户批评调试体验："哪家 debug 非要等 LLM 返回才能看结果，静默失败连失败原因都没有"——旧实现 debugRecord 在 callLLM 返回后才记录打印，请求挂起期间黑盒。修复：发起即打印（[LLM→] label/model/url/完整 messages JSON），三处失败点（fetch 异常/HTTP 非 200/响应缺 content）即时 console.warn 具体原因，HTTP 错误附响应体文本。
3. 另注：新聊天名册为空属正常（报告派系自动入册），非缺陷。

**验证**：122/122（T2 断言中文键"派系/征兆/真相/出处"映射为 name/surface/truth/causes；T3/T5/T12 全链路走容错后字段）。

---

## 2026-09-10 ｜ feat：暗线人格重写（架构师+反废话铁律+圈套/间谍字段）+ 提示词预设自定义 harness 132/132（业务提交 `2154ae0`）

**变更行为**：S3 暗线 system 提示词整体重写（"开放世界的架构师、顶级权谋小说作家"人格）；factions schema 扩展 contact/scheme/mole 三字段（validateReport 中英键容错、buildShadowlineInjection 非空缀行）；新增主角核心白名单（设置 coreTeam 手输，仿 enemyPool）；新增提示词预设系统（makePresetStore 工厂，暗线/态势两条链路各一套 localStorage 预设，默认锁定不可删、新建=默认快照、删除回落默认，设置面板各一组管理 UI）；SPEC §4.3 同步（V0.2.5）；harness 补 10 断言。

**涉及文件**：`src/content.js`、`SPEC.md`、`integration-test/harness.html`、`酒馆助手脚本-副导演.json`

**决策原因**（用户："副导演只是在写一些合理的废话，白白占用最宝贵的末尾注意力区块"）：
1. 根因诊断：旧提示词"克制、只依据已发生事实推演，禁止发明无出处的事件"+"无新动向时延续上次"把模型压成复读机——用户要的深层动机/圈套/间谍与"禁止发明"正面冲突。daily 卡片残留系 garrisons 复审链历史产物（e3682a6 已删），旧卡仍占注入位，用户自行 GM 面板手删。
2. 新人格核心：铁律 0 反废话（严禁复述前文表层信息/玩家已知常识/主角团已推导内容，报纸传闻外全写推断）；圈套覆盖率 floor(N/2) 向下取整；圈套建在主角团推理漏洞上；动机须从既得利益与前文行为合理生长；surface 须体现派系互动迹象（禁静态环境描述）。
3. contact/scheme/mole 三字段：用户草稿的"派出代表接触/设圈套/间谍反转"落地为结构化字段，非空才注入（省 token）；间谍揭示节奏由既有三态+禁泄机制控制，不加新机制。
4. 白名单手输（用户："不要什么都指望自动"）：coreTeam 设置项，注入暗线输入【主角核心白名单】，这些人绝不被指定为间谍；留空则任何人都可能。
5. 提示词预设（用户："像 MMS 一样，默认不可删但可新建后修改"）：默认项 content 空壳、消费端实时调 DEFAULT_*_SYS()（插件升级即跟随）；自定义存文本快照固定不随默认变；一份工厂两实例避免 MMS 式重复代码。

**验证**：132/132（T2b 新字段容错透传、T3b 注入缀行、T11b 白名单入输入、T11c 人格断言、T13a-f 预设全生命周期：锁定/快照/更新/删除回落/默认拒删/双链路独立）。

---

## 2026-09-10 ｜ feat：真机反馈修订——认知定位/圈套纪律/surface 报纸体/附加铁律模块（业务提交 `d4e5500`）

**变更行为**：S3 提示词补五条铁律（认知定位/反废话含"记录的庸才"/surface 报纸体/圈套上下限/尊重实力设定/措辞紧凑）；buildShadowlineInjection 首行加定位声明（推断备忘是参考素材非指令）；新增附加铁律模块（设置 extraRules 手输多行文本，拼到暗线输入文末，声明优先级高于默认规则）；harness +2 断言（T3c/T11b2，T11c 扩展）。

**涉及文件**：`src/content.js`、`integration-test/harness.html`、`酒馆助手脚本-副导演.json`

**决策原因**（用户真机首测反馈，Gemini 3.1P）：
1. 全员阴谋论：四个派系全部神经病一样针对主角团（圈套+间谍+接触全满），且把"灭了四个国家的邪教徒+英王背书的调查员"当无防备工具人。修复：圈套纪律改为"恰好 floor(N/2)——下限也是上限"，其余派系必须围绕自身利益运转；新增"尊重实力设定"铁律（主角团战绩/背景/警觉是硬约束，算计须匹配成本与失败风险）。
2. 幻觉关联（用户多次痛点）：灰瘟与邪教无任何关系（正文世界书写明但副导演看不到）。修复：附加铁律模块——用户手输最高优先级注意事项拼到输入文末（末尾注意力区块），示例即"灰瘟与邪教无任何关系，禁止关联"。这是通用纠偏通道，不只治这一处。
3. surface 层写错文体：出现"流浪汉被换成成年混混"这类只有内线才知道的细节——那是 truth/contact 层的内容。修复：surface 铁律改为"市民视角的公开信息——报纸社会新闻或街头传闻体（城里发生了什么），严禁调查线索/内幕细节/针对主角团的针对性情报"。
4. 上帝视角 + 按头：输出全是确定性断言，注入后正文 AI 被按头执行。修复：认知定位铁律（全部输出是推断与提案非既定事实，动机写"最可能的解释"、行动写"正在准备的方案"，三态诚实拿不准一律推断中）+ 注入首行定位声明（参考素材非指令，正文按合理性自由取舍）。
5. 输出冗长：truth/圈套/间谍大段铺陈心理与细节。修复：措辞紧凑铁律（每项一句话以内，禁止铺陈细节与心理描写长篇）。

**验证**：134/134（T3c 定位声明、T11b2 附加铁律文末注入且序在最后、T11c 人格断言扩展：下限也是上限/报纸体/尊重实力/一句话以内/推断与提案）。

---

## 2026-09-10 ｜ fix：真机二测——注入栏头/对象容错/friction 补段（业务提交 `40dd958`）

**变更行为**：注入栏头"事实提醒（已发生，正文须与之自洽）"改为"世界引擎推断（自由取舍）"；validateReport 的 partial/friction 容错从 map(String) 改为对象拼接（识别 {target,result}/{source,effect} 键）；buildShadowlineInjection 补 friction"环境阻力"段（原被静默丢弃）。harness 135/135（T3 断言改新栏头、T3d 新增对象容错断言、mock 改真机实证对象形式）。

**涉及文件**：`src/content.js`、`integration-test/harness.html`、`酒馆助手脚本-副导演.json`

**决策原因**（用户二测："提示词改进后整体输出效果还行，但是提示词拼装还有问题"）：
1. 栏头改名（用户指定）："事实提醒"暗示既定事实，与上一轮"推断非指令"定位矛盾——正文 AI 见到"已发生须自洽"就会按头执行。改为"世界引擎推断（自由取舍）"。
2. [object Object] 根因：真机 3.1P 把 partial/friction 输出成 {target,result}/{source,effect} 对象数组（旧 mock 只测过字符串形式），validateReport 的 map(String) 把对象直接字符串化。修复：plainText 容错——字符串直用、对象按键拼接（"警方全城戒备：牛津街机动巡逻增加三倍"）、其他键兜底取字符串值。
3. friction 全丢根因：buildShadowlineInjection 从一开始就只拼了 partial 段，friction（环境阻力）在注入侧从未有过出口——数据存了但正文 AI 永远看不到。补"环境阻力（当前环境对行动的客观影响）"段。
4. 旧版注入仍显示旧文本系浏览器缓存产物，清 localStorage + 带版本参数重载后 135/135。

**验证**：135/135（T3d 三子条件：无 [object Object]、对象键拼接文本、字符串条目原样保留；环境阻力段渲染）。

---

## 2026-09-10 ｜ V0.2.6 注入通道迁移世界书词条（MMS 同构）+ merge3 用户改动兜底（业务提交 `098ca2c`）

**变更行为**：`ad_situation`/`ad_shadowline` 两条注入从 `injectPrompts` 深度0 通道整体迁移到角色卡主世界书 constant 蓝灯词条（完全替代，旧通道代码删除）；`src/content.js` @version 0.1.0→0.2.0 重新打包；SPEC §3/§4.5、README 数据闭环/版本/变更记录同步；harness 新增世界书写入 mock 与「注入通道」断言组，149/149。

**涉及文件**：`src/content.js`、`integration-test/harness.html`、`酒馆助手脚本-副导演.json`、`SPEC.md`、`README.md`、`LOG.md`、`LOG-INDEX.md`

**决策原因**（用户需求：像 MMS 一样注入世界书，顺序交给用户，用户改词条后注入跟着改——兜底机制）：

1. **通道迁移（MMS 同构）**：两条注入各占一个词条 `副导演-态势`/`副导演-暗线`，首次创建 `constant` 蓝灯 + `at_depth/system/深度0/排序15`；之后更新只改 content 与 enabled，`...e` 展开保留 position——用户在世界书编辑器里调整的顺序/深度永久生效（用户自由决定顺序）。定位书本走 `getCharWorldbookNames('current')` primary → additional[0] → `createWorldbook(角色名)+rebindCharWorldbooks`（MMS `ensureInjection` 同款）。
2. **merge3 三方行级合并兜底**：`$ad_state.wbLast` 记每条词条上次注入的**纯脚本内容**（非合并结果）；写入前读词条现状，≠ 纯内容即检出用户手动修改，`merge3(base=纯内容, theirs=词条现状, ours=新内容)` 行级合并——用户改/删/增的行持续保留（sticky：wbLast 始终存纯内容，用户改动作为词条现状与纯内容的差值在每次写入时重放）、双改同行用户赢、脚本删行（换地点旧态势）照删、base 为空（换聊天/首写）直接覆盖防旧聊天残留误判。实现 = LCS 行匹配（`lcsMatches`）+ 编辑脚本解析（`diffEdits`：mod/del/ins/head）+ 基线行循环合成。
3. **生命周期兜底**：重挂载按存档重建两条词条（态势随 init dispatch、暗线 `syncShadowlineEntry` 按 `$ad_report`，无报告禁用）——顺带修复旧通道重载页面丢注入的缺陷；换聊天 wbLast 清空 + `wbNameCache` 重探 + 词条按新聊天重写；总开关关闭/无 stat_data 聊天只下灯（`enabled:false`）不删除。同词条写入串行（`wbInflight` 链）防并发；幂等闸从 `lastInjectedText` 改为 `wbLast.situation`（持久化字段同步替换）。
4. **harness**：WB_MOCK（books 可写存储 + fixtures 固定资料书，getWorldbook 统一分发）；删除 injectPrompts mock 与全部 injections 断言，改断言词条创建参数/幂等/内容；新增断言组：U1-U7 merge3 纯函数六场景+sticky、B1-B6 端到端（用户改词条合并保留/position 保留/无 stat 下灯/换聊天重建与禁用）。已知既有限制：S2/S3 段替换 window.fetch 后同页二次运行必失败，重跑需刷新页面（与本次改动无关）。

**验收依据**：IAB harness 149/149 ×2（首跑 + 刷新重跑）；`node --check` 双文件通过；真机验证留给用户（词条生成/顺序调整/手动改词条→下一轮合并生效）。

## 2026-09-10 ｜ S4 范围调整：取消 surface 单向写回 MMS（设计提交 `1051a8f`）

**变更行为**：SPEC §3 架构图（surface → 仅报纸呈现）、§4.6 插件间接口表（删除"写 MMS"行）、§4.8 模块图（删除 surface 单向输出 MMS）、§8 S4 计划行，README 路线图 S4 行同步移除该交付项；V0.2.6 变更摘要补记第 ④ 条。

**涉及文件**：`SPEC.md`、`README.md`

**决策原因**（用户拍板）：不给状态栏 LLM 增加额外负担——玩家可以不选择行动选项，自由根据已知线索行动。surface 的消费端只有玩家（报纸），副导演对 MMS 保持纯读（`stat_data`）。

**验收依据**：纯文档变更，无代码影响。

## 2026-09-10 ｜ 暗线输入补可选敌人名单（预约"规模"与战斗链路对齐）（业务提交 `4260c35`）

**变更行为**：`buildShadowlineContext` 增加 `enemyPool`，`buildShadowlineMessages` 辅助信息块新增【可选敌人名单（ambush 预约的"规模"只能从中选用）】；`DEFAULT_SHADOWLINE_SYS` 铁律 10 补"规模词条只能从名单选用"；设置面板 `enemyPool` 注释与占位符同步（产卡 menu 与预约"规模"共用）；SPEC §4.3 输入组装与 V0.2.6 摘要第 ⑤ 条记录；harness S3 加 T11d/T11e 断言、T11 去掉"不含可选敌人名单"负向断言、清理段重置 enemyPool，151/151。

**涉及文件**：`src/content.js`、`integration-test/harness.html`、`酒馆助手脚本-副导演.json`、`SPEC.md`、`LOG.md`、`LOG-INDEX.md`

**决策原因**（用户发现）：暗线 LLM 的 ambush 预约实质是另一种态势卡——预约"规模"经引爆检查流入态势注入（"预约引爆：{规模}"），成为正文 AI 写 Combat_block 的敌方名来源；但暗线输入五源里没有 `enemyPool`（产卡链路有），预约规模全凭 LLM 即兴命名，与图鉴/卡片菜单脱节，战斗链路对不上。补名单 + 铁律指向 = 输入侧引导（沿用 e3682a6"名单仅作 prompt 引导"哲学，不做硬校验）。

**验收依据**：IAB harness 151/151（T11d 断言名单注入暗线输入且位于辅助块内、T11e 断言铁律指向名单）。

## 2026-09-11 ｜ V0.2.7 注入模板 XML 化 + 调试日志渲染 + 双独立开关（业务提交 `b513934`）

**变更行为**：① 两条注入模板改 XML 标签分段 + 两空格缩进 `- ` 列表——态势三形态用 `<当前态势（禁止以任何形式向玩家展示）>` 包裹，暗线用 `<内部导演备忘>` 包裹五段标签（世界引擎推断/幕后动向/禁泄清单/调查阻力/环境阻力），主动接触态插到 `</当前态势>` 之前保持包裹完整；② LLM 调试日志重做渲染——messages 按角色分块（SYSTEM/USER 徽标）+ `pre-wrap` 真实换行（废除 JSON.stringify 转义的 `\n` 字面量）+ 记录补 `at` 时间戳（原"前触发"把耗时当时间差用是错的）；③ 总开关取消，改 `enabledShadowline`（报告推演+暗线注入）与 `enabledSituation`（态势注入+即时产卡+预约引爆）双独立开关，切换即时生效（`applySwitches`：关→词条下灯；开→forceSituationWrite 强写重新上灯，merge3 基线不动），旧 `enabled:false` 迁移为双关全关。@version 0.2.1；harness 158/158。

**涉及文件**：`src/content.js`、`integration-test/harness.html`、`酒馆助手脚本-副导演.json`、`SPEC.md`、`README.md`、`LOG.md`、`LOG-INDEX.md`

**决策原因**（用户三项指示）：
1. XML 模板——用户手工改写了自己的注入样例（标签分段+缩进），要求按该样式改造：LLM 注意力分区更好、人工维护更轻松。定位声明措辞随用户版本（"以下是暗线世界引擎的推断……正文按合理性自由取舍"）。
2. 调试日志 `\n` 渲染——原实现 textarea 塞 `JSON.stringify(messages)`，字符串内换行全部显示为字面量 `\n`，查看不便。
3. 双开关——玩家自由决定功能：暗线（LLM 推演）与态势（每楼注入）按需独立启停；预约引爆归态势开关（它作用于态势注入与卡片戒备；暗线开关只管埋雷）。

**测试要点**：harness 模板断言全部改 XML（T3f 结构断言/T8 插入位置断言/纯函数组包裹断言）；T14 组验证双开关独立（态势关不挡暗线跨日推演、暗线关拦下手动+自动推演、词条下灯/上灯）；M2 旧开关迁移。修 T9 的 `waitFor(恒真)` 立即返回问题（真 sleep 等异步写入落定，否则 T14 捕获旧内容误报）。

**验收依据**：IAB harness 158/158；调试弹窗页面侧验证（SYSTEM/USER 徽标、pre-wrap、280px 限高）；真机验证留给用户。

## 2026-09-11 ｜ V0.2.8 S5 名册 CRUD 落地（轻量登场 / 除名=墓碑 / 级联清暗线）（业务提交 `6b3d298`）

**变更行为**：S5 名册半场落地（预约-引爆已于 V0.2.4 落地）——① GM 按钮区新增 📜，`openRosterModal`（在册/墓碑分区 + 添加/除名/恢复行内按钮，存 `$ad_roster`）；② 核心函数 `addRosterFaction`（trim 入册，重复/墓碑名/空名拒绝）、`tombstoneFaction`（除名=墓碑 + 级联清暗线：报告条目、提及该派的 forbidden/partial/friction 整条删（短名容错：全名或去括号核心名任一命中）、该派预约作废 `$ad_pending`、暗线词条即时重写、surface 报纸同步）、`restoreFaction`（出墓碑回名册）；③ 墓碑双重保险——`validateReport` 程序过滤墓碑派系条目（报告输出为零）+ 自动注册跳过墓碑（绝不回册），提示词铁律 7 + 【墓碑（禁止复活）】输入为主。@version 0.2.2；harness 166/166。

**涉及文件**：`src/content.js`、`integration-test/harness.html`、`酒馆助手脚本-副导演.json`、`SPEC.md`、`README.md`、`LOG.md`、`LOG-INDEX.md`

**决策依据**：SPEC §4.4 既有设计（双轨来源/删除=墓碑/玩家只有生杀权没有改写权——故不做真相内容编辑与改名，只做生杀与恢复）；级联删除的短名容错由测试暴露（阻力文本常写"蒂莉的信使"而非全名）后修正。

**测试要点**：S5 组 R1-R6b——手动入册拒绝链、级联四路删除、词条重写、恢复、validateReport 过滤、端到端（模型输出墓碑派系→落地为零不回册+新派系照常登记）、弹窗渲染与行内按钮。T2 预期更新：S3 响应中的"墓碑派系"条目现被程序过滤（3 条保留），这正是新行为。

**验收依据**：IAB harness 166/166；真机验证留给用户（📜 弹窗操作与级联效果）。

## 2026-09-11 ｜ V0.2.9 S4 公开层完全体（接触即揭/灰卡/新面孔/平静占位）+ GM 按钮位置修复（业务提交 `5d8604e`）

**变更行为**：S4 从最小版（surface 上报纸）升为完全体——① **接触即揭**（`syncRevealState`）：派系名/去括号核心名出现在玩家可见视野（非隐藏楼层原文 + LWB 总结 + 当前敌人名单）任一即署名，程序侧判定（不依赖 LLM 输出 revealed 字段——确定性、无遗漏失败模式），`$ad_roster.revealed` 单调只增不减；② **灰卡**：未接触派系 ？？？ 遮名（征兆可见，三态徽标隐藏，不出占位卡不剧透存在感——未接触派系只经征兆灰卡登场）；③ **新面孔标记**：插件自动登记派系带标记（📜 预输入无，roster.manual 区分来源）；④ **金色揭幕闪动**：新揭示首拍 `ad-unveil-flash` 动画（2.4s 琥珀渐隐）；⑤ **平静占位卡**：已接触但本轮报告无条目的名册派系"暂无可察异动"（漏更新不丢卡）；⑥ 报告生成后 `renderWire()` 即时刷新（事件号外）；⑦ 墓碑除名报纸即刻全清。GM 报头按钮（📡↻🗂📜⚙）移至报头顶部专属条（两套主题 padding-top 预留，不再遮挡"悉尼星期增刊"标题）。`$ad_roster` 扩展 `revealed`/`manual` 两数组（getRoster 兼容旧数据）。@version 0.2.3；harness 171/171。

**涉及文件**：`src/content.js`、`integration-test/harness.html`、`酒馆助手脚本-副导演.json`、`SPEC.md`、`README.md`、`LOG.md`、`LOG-INDEX.md`

**决策依据**：SPEC §7 原文"阶段揭示节奏器/阶段推进解锁"落地为**接触即揭**——玩家真接触了报纸还写 ？？？ 会显得装傻（与"本报仅刊载街头可见之事"的诚实原则一致），阶段只保留在揭幕动画演出上；判定走程序侧视野匹配而非 LLM revealed 字段（模型漏输出字段时灰卡机制会整体静默失效，程序判定无此失败模式）。预输入派系（📜 手动入册）= 玩家已知，立即署名 + 永远有占位卡（MMS 固定名册同构）。

**测试要点**：V1-V5——灰卡遮名/未接触不出占位卡、正文提及即署名+unveil 类+revealed 入册、单调锁（揭幕仅首拍、无提及派系仍灰卡）、预输入署名+占位卡+无新面孔（插件自建有）、墓碑除名报纸全清。T12 预期改灰卡且只查 .ad-item 情报卡区域（顶部当前态势简报合法显示驻防派系名——玩家在场看得见驻军）。

**验收依据**：IAB harness 171/171；真机验证留给用户（灰卡→正文提及→揭幕闪动的实际观感、按钮位置）。

## 2026-09-11 ｜ S6 随机遭遇掷骰（GENERATION_STARTED 注入用户楼输入）（业务提交 `d8e9589`）

**变更行为**：① 新增设置项 `randomCombatEnabled`/`randomCombatChance`（默认 5%/楼）+ 设置弹窗"🎲 随机遭遇"块；② `onGenerationStarted` 监听 `GENERATION_STARTED`（用户已发送、提示词未组装的窗口期）本地掷骰，命中即把强制开战指令（`【🎲随机遭遇】本轮用户触发随机战斗，按【战斗轮规则】输出 Combat_block 块`）以用户身份追加进本楼输入末尾——随楼层生成自然持久化，swipe 重roll 时指令仍在（防重复标记避免二次追加）；③ 豁免：战斗进行中（最近可见 AI 楼含 `<Combat_block>`）/ swipe / regenerate / dryRun / 末楼非用户楼；④ 测试钩子暴露 + harness mock（eventEmit 透传参数、GENERATION_STARTED 事件）。@version 0.2.3；harness 186/186。

**涉及文件**：`src/content.js`、`integration-test/harness.html`、`酒馆助手脚本-副导演.json`

**决策依据**：用户实测"态势注入基本没用——不自己开战正文 AI 永不主动触发战斗"。根因：注入文是条件式判定（"若冲突升级→开战"），AI 倾向判不满足；正文 AI 自掷不出真随机（注入概率基本永不触发）。方案取 World 插件同款：程序侧本地掷骰 + 强制指令。注入通道经用户拍板选"字面写入用户楼输入"（非系统注入）——GENERATION_STARTED 早于提示词组装（World 插件注入自检实证），酒馆组装 prompt 时读 chat 数组，同代生效。

**测试要点**：S6 组 15 项——命中/未命中/概率边界（0.049/0.051）/概率 0/开关关/swipe/regenerate/dryRun/防重复/安全区/战斗中/末楼非用户楼。真机排障一例：用户"调到 100 也没注入"实为 localStorage 旧格式存档致概率回落 5%（改动从未保存）——已验证全链路（事件→掷骰→chat 修改）真机可用，事件回调为异步派发（同步检查会误判失败）。

**验收依据**：IAB harness 186/186；真机用户实测注入成功（"这下正文永远不进战的问题解决了"）。

## 2026-09-11 ｜ S7 V0.3.0 世界引擎化重构——单一副导演 API + 世界状态 + 本地骰 + 动态遇敌概率（业务提交 `4ebc462`）

**变更行为**：① **双位合并**：态势位/暗线位双 LLM 端点 → 单一 `director`（迁移取暗线位高智力值），双开关 → `enabledDirector`，双 worldSync → 单套并集迁移，双提示词预设 → `DirectorPrompt`，新增 `directorEveryX`（心跳楼数，默认3）与 `randomCombatOncePerCycle`（防连战锁，默认开）；② **世界状态 `$ad_world`**（取代 $ad_report，旧数据不迁移冷启动）：factions（暗线三态 surface/truth/接触/圈套/间谍全保留 + stance/relations/zone/morale）+ events（五阶段×stageRound1-9×level×涉及派系/zone）+ winds（传播等级×quietRounds）+ encounter（heat/spots/districts）+ resistance + roster_ops；③ **推演链**：`generateDirectorEvolve`（增量修订式——上次世界状态全量入输入，含本地骰推进结果）、`validateWorld` 宽容清洗（中文键容错/墓碑过滤/事件 stage·stageRound·type 继承兜底/风声 quietRounds 继承——防每次推演重置永不衰减/encounter clamp）、触发矩阵改心跳+强制推（combat-result/newday/stage-change 优先，city-change 与 floor-cap 废除）；④ **本地骰（每楼零 LLM）**：`rollEvents`（进度+阶段基准+level 修正 → 阈值骰 → 推进/受挫/保持，≥9 晋级；conflict 到"爆发"注入"⚠ 临近冲突"提醒行——取代预约引爆）、`rollWinds`（grace 3 楼后 10%+15%/楼 递增消散）、`runLocalDice`（lastDiceFloorId 幂等守卫，swipe 不重复推进）；⑤ **遇敌概率算法**（S6 消费）：`spots（地标级）> districts（大区级）> 玩家设置` 三级兜底 + `clamp(-40,40, heat + eventTension)` 冷热加法修正（eventTension=本地点 conflict 事件阶段分：萌芽0/发酵+2/逼近+6/爆发+12/平息-3，跨地点事件不计）；spots/districts 均对整段地点串匹配（地标键在四级地点下取到"区"，整串才能兜住）；chance=0 显式安全区不叠修正；⑥ **防连战锁**：命中上锁（randomCombatFired 持久化）→ 推演成功解锁（每周期最多一场）；⑦ **注入合并**：单词条 `副导演`（`<当前态势>` 信号级驻守提醒无敌人菜单 + `<内部导演备忘>` 世界动态：事件/风声/派系三态/禁泄/阻力），V0.2.x 旧双词条升级下灯不删；⑧ **拆除**（净减约 330 行）：卡片池/matchCard/parseMenu/computeScale/即时产卡链/预约埋雷/卡片弹窗/jsonc 导入；⑨ **报纸**：事件卡（阶段徽标+进度）/风声卡/派系灰卡揭幕体系全保留；lead 改驻守信号；🌍 世界状态查看器（round/digest/事件/风声/派系/遇敌档案/JSON/重推）取代 🗂 卡片弹窗。@version 0.3.0；harness 147/147（重构后）。

**涉及文件**：`src/content.js`、`integration-test/harness.html`、`酒馆助手脚本-副导演.json`、`SPEC.md`、`LOG.md`、`LOG-INDEX.md`

**决策依据**：用户架构决策（架构技能摊牌确认方案 B 自研精简世界引擎）——态势/暗线双位合并为单一副导演 API；敌人安排与开战方式移交正文 AI（智力最高信息最全），程序只做概率掷骰提醒；世界状态仿世界引擎（Disnight, MIT，仅作设计参考不直接采用——它不感知 stat_data/RpgCombat/名册墓碑，报纸灰卡揭幕无法挂靠其 schema，双注入 token 翻倍）。遇敌概率算法经用户两轮修订：小区域→大区域→玩家设置三级兜底（基础值=玩家设置，不由 LLM 输出）+ 冷热基线独立做加法；防连战锁为用户提出（防无逻辑连战）。本地骰每楼微演进 + API 每 3 楼宏演进是 World 插件核心模式（间隔内剧情变化由 eventTension 即时响应，弥补 heat 3 轮滞后）。

**测试要点**：harness 全面重构（186→147 项）——新增 S7 信号级态势文本（驻守信号/临近冲突/跨区不提醒）、本地骰（D1-D7：推进/受挫/晋级/平息不掷/幂等/新楼恢复）、遇敌概率档案（P1-P7：三级兜底/heat/eventTension/安全区/clamp 边界/无世界回落）、validateWorld（V0a-e：中文键/墓碑/事件风声继承/clamp）、推演端到端（T1-T14：存档/锁解锁/名册/词条/请求结构顺序/心跳/强制推三路/端点未配置/开关）、旧词条升级下灯（B7）；S6 扩动态概率与防连战锁用例。修复过程三教训：① 测试等待条件过弱（词条已存在时 waitFor 立即返回读到旧内容——改等新内容标志）；② 心跳测试只调 2 次 floorStep 而计数器被双重重置（第 3 楼从未发生）；③ B2 手动清 wbLast 绕过了 merge3 导致用户注丢失（删清空让合并正常走）。

**验收依据**：IAB harness 147/147；真机验证留给用户（3楼心跳/爆发事件提醒行/遇敌概率随地点冷热浮动/防连战锁一周期一场/报纸事件风声卡/swipe 后事件不重复推进）。

## 2026-09-12 ｜ V0.3.1 主面板 tab 化（报纸/事件链/风声 三栏分立）（业务提交 `242466d`）

**变更行为**：真机反馈"主面板 UI 层太乱"（事件链/风声/派系卡/平静占位全堆一列）——① 报头下新增栏目导航 tab 条（`.ad-tabs`：📰 报纸 / ⚡ 事件链 / 📣 风声，默认报纸=原版《悉尼宪报》派系征兆流）；② `renderWire` 按 `activeTab` 分流渲染（报纸=灰卡揭幕体系+平静占位；事件链=事件卡含空态；风声=风声卡含空态），当前所在地态势简报（lead）保留为各 tab 共有的顶部上下文头；③ `activeTab` 持久化于 `ad_ui_v1`（切栏即存，重挂载保持，非法值回落 paper）；④ CSS：基础 tab 样式（active 下划线金框）+ paper 主题报纸栏目签（双线分隔、Courier 大写、激活项红底白字）；⑤ 各 tab 独立空态文案。@version 0.3.1；harness 151/151（+4：tab 栏渲染/内容隔离/切换/持久化/共有 lead）。

**涉及文件**：`src/content.js`、`integration-test/harness.html`、`酒馆助手脚本-副导演.json`

**决策依据**：用户指定"原版的报纸报道作为第一个 tab，其余分门别类"——截图（OCR）确认现状三类内容（事件链×4/风声×3/派系卡+占位×8）天然三分；lead 保留在每个 tab 顶部（"我在哪"是所有栏目的上下文，不是某一类的报道）；世界状态概览不设第四 tab（🌍 弹窗已承担，避免重复入口）。

**测试要点**：tab 栏三签存在/默认 paper（派系流在、事件风声不在）/切 events（事件卡在派系不在）/切 winds/持久化（重渲染保持+还原）/lead 共有；无世界状态空态改按 tab 语义文案；UI 段开头显式重置 ad_ui_v1（防多轮回归的 activeTab 残留）。视觉目检：DOM 顺序报头→tab栏(24px)→情报流→报尾，几何校验通过。

**验收依据**：IAB harness 151/151；真机验证留给用户（tab 切换手感、paper 栏目签观感）。

## 2026-09-12 ｜ V0.3.2 zoneHit 三通道鲁棒匹配 + 态势简报几率化（真机首推实证修订）（业务提交 `4cd7e34`）

**变更行为**：用户贴真机首推 $ad_world 全文请求评审——LLM 输出质量全达标（圈套恰好 floor(5/2)=2、三态诚实、事件与正文强呼应、encounter 概率语义自洽），但暴露程序侧匹配失效：① **zoneHit 三通道**修复 LLM 真实 zone 写法（真机实证 5 派系 zone 有 4 个旧算法匹配不上、安全区 spot 失效）——通道1 原有整串互相包含；通道2 压缩通道（两边去 ·/-/—/空白/括号后再包含，解决"澳大利亚酒店总督套房" vs "澳大利亚酒店 - 总督套房"）；通道3 切段通道（zone 按连接词 至/与/、/，/和 切段，每段与地点各分段互相包含，分段 ≥3 字防"悉尼"两字大区段误报；解决"悉尼港码头区至禧市排污管网"/"萨里山核心区（绿顶酒馆）"/"达令赫斯特区"）；驻守信号/爆发事件提醒/eventTension/encounter spots·districts 全部换用；② **态势简报（lead）几率化**（用户指示：副导演不再安排具体敌人，简报显示交战几率与区域氛围）——标题=地点·遇敌几率 N%（安全区显示"安全区"），正文=氛围拼装（驻守派系士气 + 爆发事件警告 + 命中 spots/districts 的 why / heat 理由）；encounterProfile 返回扩 why/heatWhy；③ 正文注入的 <当前态势> 保持信号级（百分比不进正文——概率由程序掷骰执行）。@version 0.3.2；harness 159/159（+8：Z4-Z9 六个真机写法 zoneHit 用例 + lead 几率/安全区变体断言）。

**涉及文件**：`src/content.js`、`integration-test/harness.html`、`酒馆助手脚本-副导演.json`

**决策依据**：真机数据评审结论——LLM 天然写复合 zone（"A至B"）/括号注记/省略分隔符，提示词约束拦不住自然写法，必须程序侧兜底；用户指出"诺兰花园西侧·无已知驻防"与正文快开打不符正是匹配失效症状，并顺势指示简报语义升级（几率+氛围），与 V0.3.0"敌人安排移交正文 AI"的架构一致。

**测试要点**：Z4 复合zone（A至B）/Z4b（A与B）/Z5 括号注记分段/Z6 多字尾/Z7 压缩通道/Z8 两字段误报防护（'悉尼'不匹配'悉尼港码头区'）/Z9 描述性段含地点段——全部取自真机首推的实证写法；lead 断言改 '遇敌几率 41%'（25+heat10+tension6）+ 驻守 + districts why；安全区变体（chance=0 显示"安全区"+理由不显示几率）。

**验收依据**：IAB harness 159/159（一次 IAB 后台节流假死，reload 后正常）；真机验证留给用户（首推后各地点驻守信号恢复、洗衣房 100% 必遇战、回酒店安全区免掷）。

## 2026-09-12 ｜ V0.3.3 S8 checkpoint 完整回滚 + 文档全面更新（业务提交 `d3a9c4e`；文档 `fad90a2`）

**变更行为**：① **S8 checkpoint 完整回滚**：推演写入新世界前快照旧世界到 `$ad_world_checkpoint`，新世界记 `floorId` 锚点（currentFloorId 取不到记 -1 永不触发回滚）；每楼 dispatchNow 开头 `maybeRollbackWorld` 检测楼层回退（`world.floorId > 当前楼层` = 删楼/回退编辑）→ 回滚到上一推演点——本地骰的推进随之丢弃（事件链不会因删楼而越推越快）、`lastDiceFloorId` 重置为当前楼层（回滚后不立即补掷）、防连战锁随周期重置、词条/报纸随 dispatch 重算自然同步；单级回滚（checkpoint.floorId 重置为当前楼层，继续删楼不再回退——更深快照不存在）；无更早快照（首推后即删楼）时回到未推演状态；swipe 不回滚（楼层号不变，3 楼心跳内重推覆盖）。② **文档全面更新**（`fad90a2`）：README 重写至 V0.3.2（架构图/三件套闭环/原则/S0-S8 路线图/变更记录）；SPEC 正文重写 §4.2（世界状态模型：schema/本地骰/概率算法/zoneHit/S6+防连战锁语义）、§4.3（推演触发/输入/校验/人格）、§4.5（单词条注入协议+信号级语义）、§4.7（单端点）、§8（S0-S8 状态表）。@version 0.3.3；harness 166/166×2（连跑两轮稳定）。

**涉及文件**：`src/content.js`、`integration-test/harness.html`、`酒馆助手脚本-副导演.json`、`SPEC.md`、`README.md`、`LOG.md`、`LOG-INDEX.md`

**决策依据**：路线图第 1 项（用户确认开工）——swipe 重roll 与删楼会污染世界状态（本地骰推进与 LLM 推演结果均无法撤销），玩久了世界"越来越快"；采世界引擎 saveCheckpoint/restoreCheckpoint 模式的单级简化版。防连战锁语义随用户提问厘清并写入 SPEC §4.2：锁只约束随机注入一路，剧情开战不触发锁——战斗进行中掷骰本身被 combatInProgress 拦截，锁是"刚打完随机战、正文收尾但新推演未到"间隙的防护。

**测试要点**：K1-K5——推演快照（checkpoint=旧 round/digest）+ 锚点（floorId=当前楼层）、楼层回退回滚（round/digest 还原/骰子基线重置/锁重置/词条同步）、单级回滚（锚点重置后不再重复回退）、无快照回退（清空回未推演态）。排障两教训：① mock `replaceVariables` 重新赋值致 MOCK.chat 引用脱钩（S8 经 MOCK.chat 读不到写入、K2 对 undefined 取属性崩掉 runAll——改原地清空）；② mock `eventEmit` 包装只转发事件名漏掉参数——S6 的 swipe/regenerate/dryRun 守卫全部失效走真随机概率路径（~14%/轮 假失败率、失败用例漂移、hook console 时"全绿"纯属时序运气）——该 bug 自 S6 诞生即潜伏，本轮连跑两轮全绿确认修复。

**验收依据**：IAB harness 166/166 连跑两轮全绿；真机验证留给用户（删楼后报纸世界状态回退 + toast"↩ 楼层回退"提示）。

## 2026-09-12 ｜ V0.3.4 战斗结束冷却（任意战斗后 N 楼不掷随机）（业务提交 `95ea8d9`）

**变更行为**：用户提出"剧情战刚结束就随机开战很出戏"的补充防护——① 新设置 `randomCombatCooldown`（开关，默认开）+ `randomCombatCooldownFloors`（冷却楼数，默认 3，设置弹窗随机遭遇块内联）；② **结束检测**：每楼 dispatchNow 跑 `trackCombatEnd`——`combatLastSeen→false` 跳变（上楼在战、本楼无块）即战斗结束，记录 `combatEndFloorId`（持久化 $ad_state，页面重载不丢、换聊天重置）；任意战斗都算（随机遭遇/剧情开战/用户命令——RpgCombat 统一用 Combat_block 续写）；③ **冷却判定** `combatCooldownActive`：当前楼层距结束楼 < N → S6 掷骰直接跳过——**只拦本插件随机掷骰**，用户输入命令与正文 AI 自行输出战斗不经此路径，天然不受影响。@version 0.3.4；harness 170/170（+4：CD1 结束检测/CD2 窗口内 chance=100 也拦/CD3 推进 3 楼解除/CD4 开关关闭不拦）。

**涉及文件**：`src/content.js`、`integration-test/harness.html`、`酒馆助手脚本-副导演.json`、`SPEC.md`、`LOG.md`、`LOG-INDEX.md`

**决策依据**：用户确认加"任意战斗结束后 3 楼冷却，可开关可调数字，只影响本插件随机遭遇"。与防连战锁的分工：锁管"随机战打完到下次推演"的周期间隙，冷却管"任意战斗刚结束"的楼数窗口——两道闸互补。

**测试要点**：CD1 跳变检测（手置 combatLastSeen 模拟上楼在战）；CD2 spots chance=100 也拦（证明是冷却拦截而非概率未中）；CD3 addFloor×3 推进楼层后解除并注入；CD4 关开关不拦（需先解除 CD3 注入上的防连战锁——两道闸独立性的反向验证）。SPEC §4.2 冷却语义同步。

**验收依据**：IAB harness 170/170；真机验证留给用户（剧情战打完后 3 楼内无随机遭遇 toast，第 4 楼起恢复）。
