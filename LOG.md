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

## 2026-09-12 ｜ V0.3.5 历史记录模块（推演/随机遭遇/系统事件 三 tab）（业务提交 `cde8ad5`）

**变更行为**：用户指出"历史记录只存在后台，前端看不到"（每次推演覆盖 $ad_world，只留最近一轮+回滚快照）——① **历史存储 `$ad_history`**（随聊天走，换聊天隔离）：三类各环形上限 50 条（HISTORY_LIMIT），最新在前；② **四个写入点**：generateDirectorEvolve 成功（evolve：reason/round/digest/派系事件风声计数/**diffWorld 变化摘要**——新旧世界集合 diff"派系+1（新派系），派系-2（凯特、麦凯），事件-2，风声-1"式一句话）、S6 随机遭遇命中（combat：chance/via/heat/tension/地点/楼层）、maybeRollbackWorld（system：rollback from→to+目标轮次）、trackCombatEnd（system：战斗结束+冷却状态）；③ **🕘 历史记录弹窗**（入口：⚙ 设置 → 🕘 按钮，与 🐞 调试日志并排，MMS 历史模块同构）：三 tab（📡 推演(N)/🎲 随机遭遇(N)/⚙ 系统事件(N)，复用 .ad-tabs 样式）+ 条目列表 + 🗑 清空全部；④ diffWorld 纯函数（prev 缺失 → "首次推演——世界从零建立"；集合无变化 → "构成无变化（内容修订）"）。@version 0.3.5；harness 177/177（+7：K6a/K6b 端到端入档、H1 遭遇记录、H2 环形截断、H3/H3b 弹窗三 tab 渲染与切换、H4 清空）。

**涉及文件**：`src/content.js`、`integration-test/harness.html`、`酒馆助手脚本-副导演.json`、`SPEC.md`、`LOG.md`、`LOG-INDEX.md`

**决策依据**：用户要求"像 MMS 在设置中加一个历史记录模块，分一下 tab"。三类划分对应插件的三个可观测行为轨（世界怎么变的/随机遭遇何时何几率触发/系统何时回滚与战斗结束）；入口放设置弹窗按钮（用户指定"像 MMS 在设置中"），打开独立弹窗避免撑爆设置面板。

**测试要点**：K6 在 K5 的 MOCK.reset 前断言（reset 会清 $ad_history——首轮排障教训）；H2 用 55 条批量 push 验证截断与最新在前；H3 tab 标题含动态计数。修复：K6 断言从 S8 段尾移到 K4/K5 之间。

**验收依据**：IAB harness 177/177；真机验证留给用户（设置 → 🕘 查看推演历史的变化摘要与随机遭遇记录）。

## 2026-09-12 ｜ S9 V0.3.6 区域突发事件（类型本地掷骰 + 内容 LLM 生成）（业务提交 `07f0b01`）

**变更行为**：路线图第 2 项落地——经用户两轮方案修订（否决硬编码 1925 悉尼风 desc 模板 → 否决世界引擎原版 12 类表：太严重/雪灾不契合悉尼）后定稿**兼容性优先**方案：① **类型本地掷骰 + 内容 LLM 生成**——本地只掷抽象类型标签（权重轮盘），事件具体内容（标题/范围/影响/风声/涉及派系/遇敌概率）由强制推演按当前世界观生成，程序零硬编码时代内容；② **类型表可配置**（`regionalIncidentTypes` textarea，每行"标签|引导|权重"，权重 0/非法行跳过，空文本回落默认表）——默认 8 类轻量中性城市事件（治安恶化/火灾/意外事故/失踪案件/恶性凶案/骚乱集会/疫病苗头/物资波动），灾变类（地震/雪灾/饥荒/叛乱）默认不提供，按战役自行加行（如"邪教活动 | 隐秘集会与献祭迹象 | 12"）；③ **总开关 + 四参数可调**（enabled 默认开 / chance 默认 1%/楼——用户指出 3% 约百楼 3 次太频繁 / duration 5 楼 / cooldown 5 楼）；④ **状态机**（全局单例 `world.incident`，存 $ad_world 内 checkpoint 回滚覆盖；每楼挂 dispatchNow 与本地骰共享幂等守卫）：活跃 duration 递减→归零消散（cooldown 置位）→cooldown 递减→归零恢复掷骰；⑤ **掷中触发强制推演**（reason='regional-incident'，busy 时挂起 pendingIncident 下次推演并入）——指令段含掷中类型标签+引导+10 条铁律（区域级/非小插曲/必带风声/外溢影响/与玩家无因果/不毁舞台/禁低价值/禁阴谋化），要求返回 incident 回执 + events 织入 + winds + encounter 上调；⑥ **回执合并 mergeIncident**：world.incident 写入（type=本地指定，title/zone/impact=LLM 回执，duration=设置值）；无回执 pending 保留 → 下轮推演优先重试同类型（跳过掷骰与轮盘）；本地未掷中时 LLM 自发 incident 一律丢弃（防自发电）；⑦ 活跃期推演注入 OngoingPrompt（延续余波禁新开——防堆叠）+ incident 跨推演继承（validateWorld 构造新对象，不继承会丢）；⑧ 可见性：注入词条"区域动态"段 / 报纸 lead 区域事件提醒（zone 命中当前地点）/ 🌍 事件卡（活跃/剩余楼数/消散冷却）/ 触发消散 toast / 历史第四类 incident（🕘 弹窗第四 tab 🎯 突发事件）；⑨ 总开关只停掷骰与重试，活跃事件状态机照常（防关开关永久悬挂）。@version 0.3.6；harness 193/193（+16：I1-I16 类型表解析/默认表校验/轮盘/触发回执/指令段/历史/注入动态段/Ongoing 继承/消散冷却/恢复掷骰/无回执重试/防自发电/重试优先/总开关语义 + H3 四 tab）。

**涉及文件**：`src/content.js`、`integration-test/harness.html`、`酒馆助手脚本-副导演.json`、`SPEC.md`、`LOG.md`、`LOG-INDEX.md`

**决策依据**：用户核心诉求"模块兼容性更好，不写死世界观"——三层保障：默认表中性化、引导描述只给灵感方向、内容由 LLM 生成；类型表进设置解决"原版设计不完善"（类型表本身即世界观耦合点）。世界引擎四件套（duration/cooldown/_retry/防自发电）全数移植，单位从"推演轮"改为副导演的"楼"。重试机制简化：世界引擎用显式 _retry/_retryType 字段，副导演以 pendingIncident 持久化对象的存在性兼作重试标记（语义等价，少两字段）。

**测试要点**：I8 的 dispatchNow 会消费首楼掷骰（lastDiceFloorId -1→0，incident 提前递减一次）——I10/I11 断言按实际状态机计数修正；I15 手动构造 pending 前须先置 incident 为消散态（真实流中 pending 存在 ⇒ 事件必已消散，掷骰只在非活跃非冷却时进入）；S9 段设 directorEveryX=99 防心跳触发干扰。首轮 5 失败均为测试时序问题，产品逻辑无返工。

**验收依据**：IAB harness 193/193；真机验证留给用户（触发 toast"⚡ 区域事件"→ ⚡事件链 tab 见新事件 → 🕘 历史 🎯 tab 有记录 → 5 楼后消散提示）。

## 2026-09-12 ｜ V0.3.7 设置 UI 双路分流（PC 960px 工作台 / 移动端面板内切）（业务提交 `07fece5`）

**变更行为**：用户给出 demo（demo_settings_newspaper.html + SETTINGS_UI_MIGRATION_GUIDE.md）要求重构设置 UI 并做移动端兼容——① **设备检测**：`isMobileDevice()` 严格按 UA 标识（Android|iPhone|iPad...），绝不用屏幕宽度/比例；② **PC 端**：⚙ → 居中 960px 宽屏工作台弹窗（`.st-expanded` 壳：左侧 220px 八栏目导读索引「电传通讯/推演律动/街头遭遇/区域突发/阵营与铁律/档案库同步/导演社论母版/诊断与回溯」+ 右侧社论卡片网格 `.st-card` + 底部 ✓保存生效/关闭；数字字段配 ± 步进器 `stepSyncValue`；皮肤选择移入"诊断与回溯"栏）；③ **移动端**：⚙ → 390px 面板内**原位切换**简版设置（`#panel-view-settings` 4-Tab：📡电传步调（API+推演调度）/🎲遭遇突发（随机遭遇+区域突发）/📜人事档案（白名单/敌方池/铁律/世界书 chips 只读）/✍母版日志（提示词预设+诊断按钮+调试开关），底部 ←返回增刊/✓保存生效），报头标题切"⚙ 设定增刊·PREFERENCES"、阶段切"设置中"（返回还原）；零弹窗；④ `#ad-panel` 拆双视图（`#panel-view-news` 包裹原 tabs/wire/colophon + `#panel-view-settings`）；⑤ `collectFormToSettings(root)` 参数化——只收当前活跃容器（防另一视图陈旧输入覆盖）；`openModal` 清 st-expanded 类（其他弹窗不受 960 壳污染）；⑥ 窄屏兼容：`@media (max-width:480px)` 面板满宽（width:100vw）；⑦ 面板收起时自动退出设置视图回报纸态。@version 0.3.7；harness 204/204（+11：U1 UA 检测/U2 双视图骨架/U3-U6 PC 工作台（8 栏目/字段齐全/栏目切换/即时持久化）/U7-U11 移动端（UA stub 面板内切/4-Tab 字段/tab 切换/表单持久化/保存返回还原））。

**涉及文件**：`src/content.js`、`integration-test/harness.html`、`酒馆助手脚本-副导演.json`、`SPEC.md`、`LOG.md`、`LOG-INDEX.md`

**决策依据**：用户 demo 定稿（UA 双路分流/PC 方案1 侧栏索引/移动端方案2 4-Tab 内切不弹窗）；移动端世界书同步与类型表降级为只读展示（"编辑请使用 PC 端"——复杂编辑器不塞进 390px 简版，符合 demo 的 chips 展示基因）；排障一例：renderSettingsModal 直渲时 editSync 为 null（旧流程由 openSettingsModal 先置）→ 加防御性初始化。

**测试要点**：U2 断言用 computed display（内联 style 为空、隐藏靠 CSS）；U7 用 Object.defineProperty stub navigator.userAgent 模拟 iPhone（测完还原）；U10 移动端表单修改验证 root 参数化收集（5→9 落 SETTINGS）+ U11 保存后返回报纸态且值保持。视觉目检：PC 工作台 8 栏目/卡片/步进器与 demo 对齐（slate 主题下渲染正常）。

**验收依据**：IAB harness 204/204（干净复跑确认）；真机验证留给用户（手机酒馆 ⚙ 内切手感、PC 弹窗观感、窄屏面板满宽）。

## 2026-09-12 ｜ V0.3.8 真机反馈三连（步进器裁切/类型表仿世界书/空池瘦身）（业务提交 `f8ea785`）

**变更行为**：用户真机截图三处反馈——① **步进器数字裁切**：`.st-stepper input` 48→64px（MaxTokens 8192 等四位数被裁）；② **区域事件类型表仿世界书化**（用户指示"每个事件可开关…右上添加按钮自动生成一列填名称和权重，默认只可开关，自定义可删除"）：数据模型从 textarea 字符串改为**结构化数组** `[{label, guide, weight, enabled, custom}]`——默认 8 类 `custom:false` 只可开关不可删，自定义行 `custom:true` 可删，权重 0=单类禁用；`normalizeIncidentTypes` 迁移（数组规范/旧字符串按行解析为 custom 条目/空值回落默认工厂）；UI 为行列表（开关/名称/引导/权重/删除 + 右上 ＋添加；PC 含引导列，移动端简化行无引导列并注明"引导编辑请用 PC"）；`parseIncidentTypes` 改收数组（字符串分支保留兼容）；操作即时序列化进 SETTINGS（PC 用 editIncidentTypes 工作副本 + 重渲保持现场，移动端直改数组）；③ **空敌方池提示词瘦身**：enemyPool 为空时【敌方阵营参考】块整体不注入（原显示"（无）"）。@version 0.3.8；harness 209/209（+6：I2 改结构化默认表断言、U4 字段清单更新（textarea→行列表）、U12 默认 8 行渲染/内置无删除、U13 ＋添加自定义行/删除回收、U14 行开关关闭即时序列化且 parse 剔除、U15 旧字符串迁移、U16 空池无参考块有池注入）。

**涉及文件**：`src/content.js`、`integration-test/harness.html`、`酒馆助手脚本-副导演.json`、`SPEC.md`、`LOG.md`、`LOG-INDEX.md`

**决策依据**：用户三点真机反馈。类型行数据结构对齐世界书条目心智（开关=蓝灯、权重=优先级、删除=GM 权限仅限自定义）。顺带修复 harness 测试自污染：S7 段 floorStep 的 1% 区域事件真随机会偶发 busy 顶掉 T7 心跳断言（v28 的 T7/T7b/T7c 三连失败即此，非产品 bug）→ S7 段显式关区域事件（S9 段自行开启）；I16 加显式事件状态构造防前置异步残留。

**测试要点**：U12 内置行无删除钮（custom:false）；U13 添加→custom 行带删除→删除回收；U14 开关关闭即时序列化且 parseIncidentTypes 剔除该类（权重轮盘不再抽中）；U15 旧字符串存档迁移为 custom:true 数组；U16 空池断言只查"敌方阵营参考"块不查全文"（无）"（名册/墓碑等合法空标记不误伤）。

**验收依据**：IAB harness 209/209；真机验证留给用户（步进器完整显示、类型行增删开关手感、空敌方池推演输入）。

## 2026-09-12 ｜ V0.4.0 账本 + 远方回响 + 触发链路安全对齐 + 跳屏修复（业务提交 `f6ecb30`）

**变更行为**：plan 模式四决策全落（账本 UI=第四 tab「📜 旧档」/回响呈现=混入既有 tab+远方徽章/触发优化=安全三件套/无具体症状对齐健壮性）——① **账本 `$ad_ledger`**（CV 新键，镜像世界引擎 ledger.js diff 模式）：`recordLedger` 挂 generateDirectorEvolve 回执合并后，diff 推演前世界（含本地骰推进）vs 推演后世界——Lv≥3 新事件（带 zone/desc）/ 已存事件推进且新 stage∈{爆发,平息}（终局，不限等级）/ Lv≥3 新风声（norm 互相包含=延续不入账）合并为一条（按 floor 键）；同 floor 覆盖（重roll）、floor>当前的旧条目截断（楼层回退兜底）、LEDGER_KEEP=30 截尾；报纸第四 tab「📜 旧档」编年卡（№楼层·第N轮徽章 + [新增Lv3]/[推进]/[终局]/[风声Lv3] 变更行），activeTab 持久化兼容。② **远方回响**（镜像世界引擎 evolution.js:357-480）：`world.distant` 状态（pending/cooldown/sample/requestedFloor/requestedType，推演时从 prevWorld 继承、随 checkpoint 快照回滚）；`rollDistantEcho` 挂 dispatchNow（rollRegionalIncident 之后、共享 lastDiceFloorId 幂等）——pending 重试 > 冷却递减 > 阈值判定（账本 ≥ distantEchoLedgerThreshold 默认 10）> 概率骰（distantEchoChance 默认 20%/楼）命中 → `sampleDistantLedger`（最近 1/4 必选 + 旧账 Fisher-Yates 洗牌补足总量一半）+ requestedType（50% event/wind）→ `triggerDistantEvolve` 强制推演 reason='distant-echo'；指令段 `buildDistantDirective` 与区域事件**互斥**（pendingIncident/activeIncident 占用则顺延）；回执 `acceptDistantEcho` 读**原始 parsed** 的 `_distanceGenerated` 标记（validateWorld 重建对象会剥未知字段）——恰好一个+类型匹配+Lv∈{2,3}+形状合法+确为新对象（事件按 name/风声按 norm 包含判新）→ 成功落 `distance:true` 持久标记（validateWorld 的 prev 匹配继承跨推演保留，同 quietRounds 模式）+冷却（distantEchoCooldown 默认 5 楼）+历史 system 类 distant-echo；失败剔除标记对象（与上次世界重合的续写对象不剔防误删）、pending 保持下楼重试；⚡事件链/📣风声 tab 远方卡带「🌏 远方」徽章（事件附 zone）。③ **触发链路安全三件套**（对比"蚀心入魔·数据库"ACU 后定向移植）：尾楼 is_user 校验（onFloorEvent 读 SillyTavern.getContext().chat 尾楼，用户编辑自己楼层不触发重算）；补挂 MESSAGE_DELETED（onMessageDeleted 独立路径不走 is_user 校验——删楼后尾楼可能是用户楼，仍需 dispatch 让 maybeRollbackWorld 及时回滚）；生成上下文诊断记录（onGenerationStarted 顶端记 State.lastGeneration={type,dryRun,quiet}，dispatch 日志 genContextSuffix 携带——只记不拦）。**ACU 的 quiet/dryRun 门控明确不移植**：ACU 是油猴脚本需过滤自身劫持 generate 的剧情生成，副导演数据源恰是"状态栏脚本静默生成→写楼→MESSAGE_UPDATED"链路，照搬会误杀。④ **设置跳屏修复**（用户补充 bug）：renderSettingsModal 全量重渲激活栏写死首项（`i===0`/l-api）→ 增删事件行/worldSync 操作/选择器/调试历史返回均跳回 API 首屏；修法：模块级 `settingsActiveTab` 驱动 nav/pane active，点击导航同步，openSettingsModal 重置回首屏。设置新增 4 键 distantEcho*（defaults+migrate），PC 工作台第 4 栏更名「⚡ 区域与远方」+「🌏 远方回响」卡片，移动端 m-combat 分区简版卡片。@version 0.4.0；harness 242/242（+33：A1-A6 触发链路（上下文记录×2/用户楼跳过/AI 楼照常/删楼补挂/开关静默）、G1-G7 账本（四类变更入账/Lv2 不入账/无变化不入账/同楼覆盖/回退截断/风声延续）与采样确定性洗牌序、R1-R11 远方回响（阈值不足/概率未中/掷中 pending+采样/回执落地 distance+冷却/指令段内容/历史入档/冷却递减/类型不匹配剔除重试/互斥顺延×2/validateWorld 继承）、V1-V9 报纸 UI（旧档 tab/远方徽章×2/空态）与设置（默认值/首屏复位/增删不跳屏/字段+持久化/移动端卡片））。

**涉及文件**：`src/content.js`、`integration-test/harness.html`、`酒馆助手脚本-副导演.json`、`SPEC.md`、`LOG.md`、`LOG-INDEX.md`、`HANDOFF.md`

**决策依据**：HANDOFF §3.1 设计素材（世界引擎 ledger/distantEvent 已精读）+ 用户四项 plan 决策。关键技术点：validateWorld 重建 events/winds 对象剥未知字段——`_distanceGenerated` 临时标记必须在 validateWorld 之前的原始 parsed 上校验，而 `distance:true` 持久标记必须走 prev 匹配继承才能跨轮存活；checkpoint 写入在 acceptDistantEcho 变更 distant 状态之前（推演前快照语义保持）。排障一例：A4 首跑失败非产品 bug——S8 段在 ST_MOCK.chat 遗留未清理的用户尾楼（既有 harness 卫生问题，此前无段依赖尾楼身份未暴露），A4 显式构造 AI 尾楼 + 段末 BASE_LEN 复原修复。

**测试要点**：R3 掷中链路 Math.random=0 全确定（概率骰中+type=event+洗牌序）；R8 校验失败断言用 round 递增作推演完成标志（pending=true 初始即真会假通过）；R9/R10 互斥用 Trigger.busy 未被置位证明未触发推演；V7 跳屏修复断言增删后 active pane 仍为 l-incidents 且行数复原 8；G7 采样洗牌 rand=0 时序确定性（[11,10,9,7,6,5]）。

**验收依据**：IAB harness 242/242；真机验证留给用户（📜 旧档 tab 编年、🌏 远方徽章、远方回响触发 toast 与冷却、删楼后即时回滚、设置增删事件行不跳屏）。

## 2026-09-12 ｜ V0.4.1 注入提示词拼接优化 + merge3 潜伏 bug 修复（业务提交 `329fb1c`）

**变更行为**：用户给真机实例（spots 命中 85% 高危点但态势词条只写"此地无已知派系驻防"，要求极简 + 移到备忘之后末尾注意力位）——① **态势注入极简化**：`buildDirectorSituationText` 重写为「📍 地点行 + why 一句」——why 三级复用 `encounterProfile`（spots 地标级 > districts 大区级 > 驻守信号兜底），`encounterProfile` 增可选 world 参数（态势注入与配发读同一份防双读不一致）；删除：SIT/MEMO 标签的"（禁止以任何形式向玩家展示）"、无派系/无档案冗行（"此地无已知派系驻防——敌方构成由你按…"/"尚无世界态势档案"）、**【若本楼冲突升级 → 开战】整段（COMBAT_RULE_HINT 常量删除——战斗轮规则由用户世界书常驻承载，V0.2 决策）**、"⚠ 临近冲突"行（威胁提示由 spots why 承担，爆发事件的 tension 修正仍作用于遇敌率）。② **拼接顺序重排**：词条 = `<内部导演备忘>`（含世界动态/三态/禁泄/阻力）在前 + `<当前态势>` 收尾——dispatchNow 与 generateDirectorEvolve 两处同步改。③ **标签去括号**：`<进行中的事件（程序每楼掷骰推进…）>`/`<风声（市民舆论…）>`/`<幕后动向（推断中…）>`/`<禁泄清单（调查未抵达前…）>`/`<调查阻力（强行调查…）>`/`<环境阻力（当前环境…）>` 全部裸标签（行内容【】（）措辞保留）。④ **merge3 潜伏 bug 修复（备忘前置后暴露）**：`diffEdits` 的 `head` 声明 const 却在行首插入分支被重赋值 → `TypeError: Assignment to constant variable` 被 `writeWbEntry` 的 catch 静默吞掉 → 词条不更新且无提示——旧拼接顺序下 base 首行（`<当前态势…>`）恒等于 ours 首行，head 分支从未触发；改 `let head` 修复。harness：S7 态势段重写（why 三级/安全区 why/驻守兜底 ≤3/真实案例"诺兰花园西侧废弃洗衣房"压缩通道 zoneMatch 锁定/临近冲突行删除验证）、端到端加顺序断言（备忘在前 + 态势收尾 `lastIndexOf('</当前态势>')`）、B1-B3/K5 标志文本更新（驻守信号→帮派混战区/尚无档案→地点块或无备忘）、T3 尾断言改 `endsWith('</当前态势>')`、「设置默认结构」断言加 extra 诊断输出（脏键直接可见）。@version 0.4.1；harness 244/244（+2：真实案例锁定 + 顺序断言并入既有项重写）。

**涉及文件**：`src/content.js`、`integration-test/harness.html`、`酒馆助手脚本-副导演.json`、`SPEC.md`、`LOG.md`、`LOG-INDEX.md`、`HANDOFF.md`

**决策依据**：用户四点明确指示（修复 why 不显示/移到备忘之后/仅地点+why 两行/其余括号冗余去除）。merge3 bug 排障路径：241/244 → 纯函数复现 merge3 抛 TypeError → 定位 diffEdits const head → 改 let 一行修复 → 244/244。排障附带发现：跑挂轮次遗留脏 localStorage 会让「设置默认结构」断言假失败（干净复跑即绿）——extra 诊断输出保留供以后直读脏键。

**测试要点**：T3 改 `endsWith('</当前态势>')` + indexOf 顺序；S7 态势段新增"真实案例锁定"（ACU 无分隔 spot match ↔ 带 · 地点，压缩通道）；驻守兜底仅在 encounterProfile 未命中任何 spot/district 时出现（s7 responder 的 districts 无 why 字段即此场景）。

**验收依据**：IAB harness 244/244；真机验证留给用户（态势词条两行极简形态、高危 spot why 显示、备忘在前态势收尾的注意力布局）。

## 2026-09-12 ｜ V0.4.2 折叠栏头条渲染修复 + 备忘小说作者视角提醒（业务提交 `610da6d`）

**变更行为**：用户两项反馈——① **备忘引导语补充**：`buildDirectorInjection` 引导语后新增一行「注意：像专业的小说作者一样自然融入故事，不要以上帝视角告知玩家。」；② **折叠栏（缩略栏）不显示内容 debug**：用户实机截图折叠栏只剩星形胶囊。IAB 连真机酒馆（127.0.0.1:8000）检查：rail 处于 `empty` 态（CSS `#ad-rail.empty .ad-rail-ticker{display:none}`）、`State.tickerHeads=[]`、聊天变量无 `$ad_state`。git 考古定位回归点：**V0.3.0 世界引擎化重构（4ebc462）拆卡片池时把 dispatchNow 里的 `renderTicker()` 调用丢了**（早期 S0~S1 版本每楼 dispatch 都刷 ticker）——后果：tickerHeads 只在推演成功那一瞬渲染，而 `init()` 的 buildUI（renderTicker 空）先于 loadRuntimeState（恢复 $ad_state 历史头条）且恢复后无人再刷，**页面重载/换聊天后折叠栏永远空胶囊直到下一次推演**。修复：dispatchNow 每楼恢复 `renderTicker()`（幂等，覆盖 init 恢复与换聊天两条路径）+ onChatChanged 清空 tickerHeads 后即时 renderTicker（防 DOM 残留旧聊天头条）。harness +2：T-t1（预置 $ad_state.tickerHeads → dispatchNow → empty 态解除且头条渲染）、T-t2（CHAT_CHANGED → 即时清空回 empty 态）。@version 0.4.2；harness 246/246。

**涉及文件**：`src/content.js`、`integration-test/harness.html`、`酒馆助手脚本-副导演.json`、`LOG.md`、`LOG-INDEX.md`、`HANDOFF.md`

**决策依据**：用户实机截图 + IAB 真机检查（browser-use 连 127.0.0.1:8000，脚本 iframe 的 `__AD__` 状态 + 聊天变量）。真机排查附带发现：IAB 页面会被宿主随机重置成空白页（同 tab 反复发生，重开标签即可）；聊天变量必须 await `getVariables`（TavernHelper 返回 Promise，同步读得到空对象）。

**验收依据**：IAB harness 246/246；真机验证留给用户（导入 v0.4.2 后重载页面/换聊天，折叠栏应显示历史头条滚动——前提是该聊天推演过；从未推演的聊天维持星形胶囊为设计行为）。

## 2026-09-12 ｜ V0.4.3 折叠栏四类轮播（态势/报纸/事件/风声 + 已更新优先）（业务提交 `32975a4`）

**变更行为**：用户指示折叠栏改为「按态势、报纸、事件、风声的顺序进行轮播，优先播放已更新内容」——① **数据模型升级**：`State.tickerHeads`（推演快照字符串数组）废弃，改 `State.tickerItems`（`[{cat,text}]` 对象数组）+ `State.tickerPins`（已更新类别数组），均持久化 $ad_state（旧 tickerHeads 字段遗弃不迁移——每楼 dispatch 会重建）；② **`buildTickerItems(world, locationText, pins)` 纯函数**：固定类别顺序 📍态势（shortLoc 地点）→ 📰报纸（前 2 条派系征兆 surface 截 10 字）→ ⚔事件链（前 2 条未平息事件 名·阶段）→ 📣风声（前 2 条内容截 9 字），pins 中的类别组整体提前（组内保持类别相对序）；③ **dispatchNow 每楼派生**（世界状态/态势地点变化即刷新，页面重载/换聊天后自动恢复——含未推演聊天仅态势条）；④ **推演路径**：digest/factions(name+surface+state)/events(name+stage+stageRound)/winds(content) 字段级 diff 算 pins，首推全 pin；pins/条目立即 persistRuntimeState（补 V0.4.2 教训：不能等下一次 dispatch）；renderTicker 改 tickerItems 渲染（空判定 items.length===0）。⑤ 修自引入 bug：buildTickerItems 初版漏包装 {cat,text}（返回字符串数组）→ renderTicker 的 esc(undefined) 渲染空白 + harness T12 断言 x.text.includes 抛 unhandled rejection 炸断 runAll；__AD__ 补导出 buildTickerItems/TICKER_ORDER。harness：+3（T-k1 类别顺序纯函数/T-k2 pins 提前/T-t1 dispatch 派生渲染），T-t2 改推演落盘断言，T-t3 换聊天清空沿用；同步旧断言（T12/空态收缩 tickerHeads→tickerItems）；V0.4.3 段补设置清理（防脏值泄漏——上一版 sv43.regionalIncidentEnabled=false 未恢复致下一轮「设置默认结构」假失败）。@version 0.4.3；harness 249/249。

**涉及文件**：`src/content.js`、`integration-test/harness.html`、`酒馆助手脚本-副导演.json`、`LOG.md`、`LOG-INDEX.md`、`HANDOFF.md`

**决策依据**：用户指示四类顺序 + 已更新优先。排障两例：①IAB 宿主对 harness 标签的 fetch 概率性挂起（面板 visibility 开关重置可解；「等待加载产物…」是 stat 初始文案，runAll 中途查询时看到它≠挂起，要看 log 是否滚动）；②emoji 代理对坑——📍📰📣 是四字节字符，`text[0]`/`slice(0,2)` 只取到半个代理项，断言须用 `Array.from(text)[0]` 或 startsWith。

**测试要点**：T-k1 用 Array.from 按 code point 取 emoji；T-k2 断言 cat 数组而非 text 前缀；T-t2 推演落盘用 digest 变化触发 situation pin；V 段新增加的设置改动必须在段尾恢复（本轮「设置默认结构」假失败即 sv43 漏清理所致）。

**验收依据**：IAB harness 249/249；真机验证留给用户（导入 v0.4.3 后折叠栏四类条目滚动：📍当前地点→📰最新派系征兆→⚔未平息事件→📣风声；推演后刚更新的类别排最前；换聊天/重载页面自动恢复）。

## 2026-09-14 ｜ V0.4.4 派系钦定设定 + 圈套纪律动机驱动版 + 清空重推（业务提交 `af5c353`）

**变更行为**：治「警察超雄/大反派变小丑/派系全知」三症——① **派系钦定设定**：`$ad_roster` 新增 `prompts: {派系名→文本}`（getRoster 归一化，墓碑不清设定——恢复出墓随之回来）；名册弹窗每行加 ✏️ 设定按钮（有设定 📌 标记）+ `openFactionPromptModal` 编辑弹窗（多行 textarea，保存/清空，`setFactionPrompt` 非在册拒绝）；`buildDirectorContext` 收集非空设定（trim、墓碑派系排除）→ `buildDirectorMessages` 在【名册】之后注入【派系钦定设定】块（"定位/实力/认知边界以此为准，优先级高于本文默认规则"），无设定整块省略——仅注入推演输入，不进正文 AI 词条（用户选定）；② **圈套纪律改写**（DEFAULT_DIRECTOR_SYS）：铁律 3 去掉 floor(N/2) 配额，改为动机驱动（用户定稿）——"必须写明各派系当前动机和世界造成的可见迹象；有设下圈套的动机和能力就让他这么做；圈套优先针对各自的核心对手；指向主角团须前文已演出注意到 + 写明情报来源；全员针对主角团=失败；无人有任何算计=失败；世界在本次推演后无任何变化=失败"；铁律 0 追加认知复盘（"信息必须有渠道，无法确定按不知道处理；写克制的智者，不是无所不知的疯子"）；铁律 4 强化（"忌惮的表达是回避、试探、借第三方出手、留后路——敌意烈度必须匹配情报与底气"）；③ **清空重推**：世界状态弹窗加 🗑 按钮——confirm 后清 `$ad_world` + `$ad_world_checkpoint`（防删楼回滚复活旧世界；名册与钦定设定保留），随即 `generateDirectorEvolve('manual')` 从零首推（lastWorld=null → round 1）。__AD__ 补导出 setFactionPrompt/openFactionPromptModal。@version 0.4.4；harness 257/257。

**涉及文件**：`src/content.js`、`integration-test/harness.html`、`酒馆助手脚本-副导演.json`、`LOG.md`、`LOG-INDEX.md`、`HANDOFF.md`

**决策依据**：用户实局反馈（round 2 世界状态：麦凯"藐视外来豪绅"、伦道夫"竭力隐匿"）+ 项目内聊天记录核对结论——麦凯口袋阵等"外来买家"入网在楼 14-15/30 有依据，但"视为危险过江龙"是全知模板填充；根因三条：圈套配额强制半数派系敌视主角团（超雄制度性来源+挤压大反派戏份）、英王背景在世界书占比极少被 20 楼麦凯叙事浓度淹没、无派系级认知边界机制。用户决定"完全放弃 AI 自主"改用钦定设定（仅推演输入，与推演机制共存不冲突——配额按用户定稿改为动机驱动而非删除波折要求）；清空重推入口选弹窗按钮（原"📡 重新推演"是增量修订，跑偏的 lastWorld 会被棘轮继承）。

**测试要点**：FP 组 +8——FP1 prompts 归一化（对象透传/缺省补空）；FP2 setFactionPrompt 保存/非在册拒绝；FP3 真实 buildDirectorContext 走全链（trim + 墓碑排除 + 钦定块位于名册之后墓碑之前 + 墓碑派系设定文本不出现）；FP4 无设定整块省略；FP5/FP5b 编辑弹窗回填与名册行 📌 标记；WP1 点击清空后 $ad_world/$ad_world_checkpoint 同步为 null（click 处理器同步段断言，避开 evolve 异步竞态）；WP2 从零建立（round 1 + reason manual + 名册保留）。T11c 同步动机驱动版关键词（必须写明各派系当前动机/圈套优先针对各自的核心对手/世界无任何变化=失败/按不知道处理/敌意烈度必须匹配）；版本断言 0.4.3→0.4.4。FP 段自带独立 fetch mock 与 worldSync=[] 清理（防前组 worldSync 设置泄漏）。

**验收依据**：IAB harness 257/257；真机验证留给用户（导入 v0.4.4 后：📜 名册弹窗为伦道夫/麦凯等写钦定设定 → 📡 推演输入含【派系钦定设定】块；世界状态弹窗 🗑 清空重推从零建立；推演产物中派系立场体现认知渠道与实力烈度约束）。注：默认预设实时取 DEFAULT_DIRECTOR_SYS()，改完即生效；若设置里建过自定义预设需手动同步新铁律。
