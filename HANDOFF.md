# HANDOFF · 副导演项目交接文档

> **交接时间**：2026-09-14 ｜ **当前版本 V0.4.4** ｜ harness **257/257**
> **用途**：新对话接手开发。先读本文档，再按需查 SPEC.md（协议）/ LOG-INDEX.md（历史索引）。
> **下一步任务**：批量回填 backfill（长聊天冷启动，见 §3.1）。

---

## 1. 项目速览

**AssistantDirector（副导演）**：SillyTavern 酒馆助手（TavernHelper）单 JSON 悬浮窗脚本插件——AIRP 跑团的**世界模拟器**。与 MMS（状态栏）、RpgCombat（战斗）构成三件套生态。

| 项 | 值 |
|---|---|
| 源码 | `src/content.js`（单文件 IIFE，约 3960 行，分区 0-10） |
| 产物 | `酒馆助手脚本-副导演.json`（build.mjs 打包，content 内嵌 UserScript） |
| 测试 | `integration-test/harness.html`（257 断言，IAB 运行） |
| 文档 | SPEC.md（协议+版本摘要累积）/ README.md / LOG.md + LOG-INDEX.md |
| Git | master 分支，业务提交与 docs 提交分开，提交后回报短 hash |

**架构一句话**：单一"副导演 API"每 3 楼心跳增量修订世界状态 `$ad_world`（派系暗线三态/事件链/风声/遇敌概率档案）+ 本地骰每楼零 LLM 推进（事件链/风声衰减/区域突发事件/远方回响掷骰）+ 重大事件 diff 入账 `$ad_ledger`（远方回响采样源）+ 随机遭遇掷骰（用户发送时本地掷骰命中即注入强制开战指令）+ 单世界书词条「副导演」注入正文 + 报纸 UI（📰报纸/⚡事件链/📣风声/📜旧档 四 tab）。

**V0.3.x~V0.4.0 核心决策**（不要回退）：敌人安排与开战方式归**正文 AI**（从图鉴自选），副导演只管概率掷骰与世界状态；区域事件/远方回响**类型与触发本地掷骰 + 内容 LLM 生成**（世界观兼容，类型表/阈值用户可编辑）；ACU 的 quiet 门控**不移植**（副导演数据源是状态栏脚本静默生成写楼链路）。

## 2. 关键机制地图（content.js 内定位）

| 机制 | 函数/位置 | 要点 |
|---|---|---|
| 世界状态存储 | `CV.world = '$ad_world'` | schema 见 SPEC §4.2；`incident`（区域事件单例）、`distant`（远方回响状态）、`floorId`（回滚锚点）挂在顶层 |
| checkpoint 回滚 | `maybeRollbackWorld` | 推演前快照 `$ad_world_checkpoint`；楼层回退（删楼）→ 回滚；单级 |
| 触发矩阵 | `checkTriggers` | 心跳 `directorEveryX`(3)楼 + 强制推（combat-result/newday/stage-change）+ 手动📡；首楼只记基线 |
| 触发链路（V0.4.0） | `onFloorEvent`/`onMessageDeleted`/`onGenerationStarted` | 尾楼 is_user 校验（用户编辑自己楼不触发重算）；MESSAGE_DELETED 补挂（删楼及时回滚，不走 is_user 校验）；生成上下文 `State.lastGeneration`（type/dryRun/quiet 只记不拦，dispatch 日志 `genContextSuffix` 携带） |
| 推演主流程 | `generateDirectorEvolve` | 增量修订式（上次世界状态全量入输入）；`validateWorld` 宽容校验（中文键容错/墓碑过滤/事件风声继承）；写 `$ad_world` + 名册注册 + 防连战锁解锁 + 注入 + 历史 |
| 本地骰 | `runLocalDice` → `rollEvents`/`rollWinds` | 事件链阈值骰（阶段基准+进度曲线+level 修正）；风声 grace(3) 后 10%+15%/楼 消散；`lastDiceFloorId` 幂等守卫（swipe 不重复） |
| 遇敌概率 | `encounterProfile` | spots(地标)→districts(大区)→玩家设置 三级兜底 + `clamp(-40,40, heat+eventTension)`；chance=0 显式安全区 |
| zone 匹配 | `zoneHit` | 三通道：整串包含/压缩(去分隔符)/切段(按 至与、和 切段×地点分段，段≥3字)——容忍 LLM 真实写法 |
| 随机遭遇 | `onGenerationStarted` | GENERATION_STARTED 掷骰 → 命中以用户身份追加 `【🎲随机遭遇】…` 进本楼输入；防连战锁（`randomCombatFired`，推演解锁）+ 战斗结束冷却（`trackCombatEnd` 跳变检测 → `combatEndFloorId` 起 N 楼） |
| 区域突发事件 | `rollRegionalIncident` | 状态机：活跃 duration 递减→消散→cooldown→恢复掷骰；掷中→`triggerIncidentEvolve`（强制推演 reason='regional-incident'，指令段 `buildIncidentDirective`，10 条铁律）；回执合并 `mergeIncident`（LLM 返回 incident{title,zone,impact}；无回执 pending 重试同类型；未掷中丢弃自发电）；活跃期推演注入 `buildIncidentOngoing` |
| 类型表 | `parseIncidentTypes`/`normalizeIncidentTypes` | **结构化数组** `[{label,guide,weight,enabled,custom}]`；默认 8 类（`DEFAULT_INCIDENT_TYPES()`，custom:false 只可开关）；UI 行列表（PC 全字段+删除，移动端简化行）；权重 0=单类禁用 |
| 账本（V0.4.0） | `recordLedger`/`getLedger` → `$ad_ledger` | 推演回执合并后 diff 前后世界：Lv≥3 新事件（带 zone）/推进至爆发·平息（终局不限等级）/Lv≥3 新风声（`windSeen` norm 包含=延续不入账）；同楼覆盖、回退截断、上限 30（LEDGER_KEEP）；报纸「📜 旧档」tab 编年展示 |
| 远方回响（V0.4.0） | `rollDistantEcho` → `triggerDistantEvolve` → `acceptDistantEcho` | 挂 dispatchNow（区域事件后、共享 lastDiceFloorId 幂等）：账本≥阈值(10)×概率(20%/楼) → `sampleDistantLedger`（最近1/4必选+洗牌补半）→ 强制推演 distant-echo；指令段 `buildDistantDirective` 与区域事件互斥（掷中/活跃优先顺延）；回执读**原始 parsed** 的 `_distanceGenerated`（validateWorld 重建剥未知字段）——恰好一个+类型匹配+Lv2/3+形状合法+确为新 → `distance:true` 持久标记（validateWorld prev 继承跨轮存活）+冷却(5楼)+历史 distant-echo；失败剔除重试；远方卡「🌏 远方」徽章 |
| 注入 | `buildDirectorInjection` + `buildDirectorSituationText` → `writeWbEntry('副导演')` | 单词条 at_depth/system/depth0/order15；**V0.4.1 拼接顺序：备忘在前 + 当前态势收尾（末尾注意力位）**；备忘=世界动态段（区域动态/事件/风声/三态/禁泄/阻力，标签无括号）；态势=📍地点 + why 三级（`encounterProfile` spots>districts>驻守兜底，world 参数显式传入）；merge3 用户改动保留 |
| 历史 | `pushHistory`/`getHistory` | `$ad_history` 四类（evolve/combat/incident/system）各环形 50 条；🕘 弹窗（设置内入口）；distant-echo 落 system 类 |
| 折叠栏轮播 | `buildTickerItems`/`renderTicker` | V0.4.3 四类固定顺序：📍态势(shortLoc 地点)→📰报纸(前2条派系征兆)→⚔事件链(前2条未平息)→📣风声(前2条)，元素 `{cat,text}`；`State.tickerPins`（推演字段级 diff：digest/factions/events/winds）的类别组整体提前——已更新优先；dispatchNow 每楼派生（重载/换聊天即恢复）；推演后立即 persist；tickerHeads 字符串模型已废弃 |
| 派系钦定设定 | `setFactionPrompt`/`openFactionPromptModal` | V0.4.4 `$ad_roster.prompts`（名→文本，随聊天走；墓碑不清——恢复出墓随之回来）；名册弹窗 ✏️ 编辑（有设定 📌 标记）；`buildDirectorContext` 收集（trim + 墓碑排除）→ `buildDirectorMessages` 【名册】后注入【派系钦定设定】块（优先级高于默认铁律），无设定整块省略；**仅注入推演输入，不进正文 AI 词条** |
| 圈套纪律（V0.4.4 动机驱动版） | `DEFAULT_DIRECTOR_SYS` 铁律 0/3/4 | 铁律 3 已去掉 floor(N/2) 配额：有动机有能力就设圈套、优先针对各自核心对手、指向主角团须前文已演出+情报来源、世界无变化=失败；铁律 0 认知复盘（信息必须有渠道，不确定按不知道）；铁律 4 敌意烈度门槛（忌惮=回避/试探/借刀/留后路）——治「警察超雄/大反派变小丑/派系全知」。默认预设实时取构造函数即生效；**自定义预设存旧快照需手动同步** |
| 清空重推 | `openWorldModal` 内 #ad-report-wipe | V0.4.4 🗑 按钮：清 `$ad_world` + `$ad_world_checkpoint`（防删楼回滚复活旧世界；名册与钦定设定保留）→ 立即 manual 推演从零首推（round 1）；区别于「📡 重新推演」的增量修订（旧 lastWorld 棘轮继承） |
| 设置 UI | `isMobileDevice()` UA 分流 | PC ⚙ → 960px 八栏目工作台（`.st-*` 类；`settingsActiveTab` 全量重渲保持当前栏，新开回首屏）；移动端 ⚙ → 面板内切 `#panel-view-settings` 4-Tab 零弹窗；`collectFormToSettings(root)` 参数化（只收活跃容器）；远方回响卡片在 PC「⚡ 区域与远方」栏 + 移动端 m-combat 分区 |
| 报纸 | `renderWire` | activeTab 分流（📰/⚡/📣/📜 四 tab）；lead=遇敌几率+区域氛围（`encounterProfile` + 区域事件提醒）；灰卡揭幕体系（`syncRevealState` 接触即揭）；远方事件/风声卡「🌏 远方」徽章 |

## 3. 剩余路线图

### 3.1 批量回填 backfill（⭐ 下一任务）

**需求**：长聊天冷启动——世界状态只能从当前楼层开始建立，此前几百楼的世界演变一片空白。世界引擎方案：从首个 AI 楼层起分批补推（`backfillBatchSize` 楼/批，连续生成直到追平当前楼层），产出压缩为增量修订链。参考 `World/docs/批量重填世界推演.md`（有完整规范）与 `world-engine-evolution.js` 的 backfill 段。

**副导演适配要点**（供参考、可与用户讨论调整）：
- 入口：⚙ 设置内按钮（手动触发，防误触），进度条/toast 反馈；
- 分批：`directorFloors`(20) 楼/批或独立设置，逐批调 generateDirectorEvolve（reason='backfill'），链式 await 防并发；
- 终点：追平当前楼层后转常规心跳；中途可取消；
- 产物只喂 `lastWorld`（增量修订基线），注入词条在追平后才重建。

### 3.2 之后（优先级递减）
1. **时间模式节奏**：推演节律按故事时间（跨日）而非楼数（世界引擎 evolveMode time 模式）；
2. **worldSync 蓝绿灯降噪**：同步词条按关键词扫描注入（世界引擎 worldbookTrigger，`docs/世界书蓝绿灯触发.md` 有完整规范）。

## 4. 开发流程与铁律

1. **流程**：改 `src/content.js` → `node --check src/content.js` → `node build.mjs` 打包 → 改 harness 断言 → IAB 打开 `integration-test/harness.html` 点"▶ 运行全部断言" → 全绿 → git 业务提交 + docs 提交 → 更新 LOG.md/LOG-INDEX.md（格式照旧例）→ 回报短 hash。
2. **harness 运行**：IAB 不能开 file://——需本地静态服务（node http，端口 18748，**带 `Cache-Control: no-store`**，否则产物 JSON 缓存坑）；服务命令模板见 LOG 近几条会话或直接重写。IAB 页面会被宿主随机重置/节流（fetch 挂起、"等待加载产物…"假死）——reload 重跑即可；runAll 一次 ~60s，waitFor 自适应节流。
3. **版本号**：三处同步（UserScript 头 @version、SCRIPT_VERSION 常量、SPEC 版本摘要），习惯用 `sed -i` 一次改两处。
4. **测试钩子**：`window.__AD__` 暴露纯函数与内部状态（新功能记得加暴露）；harness 断言全走 AD.*。
5. **用户全局规则**（AGENTS.md）：全程中文回复；重大改动先确认方案（plan mode）；**严禁真机测试**（用户自行导入验证，只回报验证点）；每个有 git 备份的任务结尾必须提交并回报短 hash。
6. **真机环境**：用户酒馆在 `D:\SillyTavern`；世界引擎参考插件在 `public/scripts/extensions/third-party/World`（Disnight, MIT，仅作设计参考）。

## 5. 已踩过的坑（新对话必读）

- **harness mock `eventEmit` 必须全参转发**——漏参会致 onGenerationStarted 的 type/dryRun 守卫失效，真随机 5% 间歇假失败（V0.3.3 排障一整轮）；
- **mock `replaceVariables` 必须原地清空**（`delete store.chat[k]` 后 assign）——重新赋值会让 MOCK.chat 引用脱钩，后续断言全瞎；
- **事件回调是异步派发**——emit 后同步检查会误判失败，用 waitFor；
- **断言等待条件要等"新内容标志"**而非"元素存在"（词条早已存在时 waitFor 立即返回读到旧值）；
- **localStorage 旧格式存档**会吞新设置项（真机排障实例：概率改 100 不生效实为回落默认 5）——migrateSettings 每加新键必须有迁移行；
- **UA 双路分流**：设置 UI 移动端/PC 是两套容器，`collectFormToSettings(root)` 只收活跃容器（否则陈旧输入覆盖新值）；
- **harness 各段 ST_MOCK.chat 推楼必须复原**（V0.4.0 排障实例：S8 段遗留用户尾楼 → A4「尾楼为 AI 楼」假失败）——段开头记 `BASE_LEN`、段末 `while (stChat.length > BASE_LEN) stChat.pop()`；需要特定尾楼身份时显式 push 构造，勿依赖前段遗留；
- **跑挂轮次会遗留脏 localStorage**：某轮断言挂掉不影响后续段执行，但各段清理快照的时序抖动可能让下一轮的「设置默认结构」等读默认值断言假失败——「设置默认结构」断言已加 extra 诊断输出（失败时直接打印各键实际值），干净复跑即绿；
- **harness 新段凡改 SETTINGS 必须段尾恢复**（V0.4.3 排障实例：sv43.regionalIncidentEnabled=false 漏恢复 → 下一轮「设置默认结构」假失败）；
- **emoji 是代理对**：📍📰📣 等四字节字符的 `text[0]`/`slice(0,2)` 只取到半个字符——断言判定前缀用 `Array.from(text)[0]` 或 startsWith；
- **merge3/diffEdits 的行首插入分支**（`head`）在"base 首行 ≠ ours 首行"时才触发（V0.4.1 曾因此爆 const TypeError 静默吞写入）——改注入拼接顺序时务必跑 merge3 相关断言（B1-B3/T3/K5）；
- **IAB 截图管道**：`tab.screenshot()` 须在同 cell `nodeRepl.emitImage`；页面挂载需先点"运行"（__AD__ 才存在）；
- **IAB 真机检查酒馆**：browser-use 连 127.0.0.1:8000 可直查——脚本 iframe 里找 `contentWindow.__AD__`（UI 挂主页面 document，状态在脚本 iframe）；聊天变量必须 `await getVariables`（TavernHelper 返回 Promise，同步读得空对象）；IAB 页面会被宿主随机重置成空白页，重开标签即可；
- **每楼 dispatch 的 UI 刷新清单要完整**（V0.4.2 教训）：dispatchNow 曾丢 `renderTicker()`（V0.3.0 重构回归）——页面重载后 loadRuntimeState 恢复的数据永不渲染，直到下一次推演。新增持久化 UI 数据时检查 init/换聊天/每楼三条路径都有刷新点；
- **commit 中文乱码**只是终端显示波动，git 存储是 UTF-8（`git log --format=%s` 验证）。

## 6. 真机待验证清单（积压，用户尚未反馈）

- [ ] V0.3.3 楼层回退回滚（删楼 → toast"↩ 楼层回退" + 报纸状态回退）
- [ ] V0.3.4 战斗结束冷却（打完 3 楼内无随机遭遇，第 4 楼恢复）
- [ ] V0.3.5 历史记录（⚙ → 🕘 推演演变流水）
- [ ] V0.3.6 区域突发事件（触发 toast → 事件链 tab → 5 楼消散）
- [ ] V0.3.7 设置 UI 双路（手机 ⚙ 内切手感、PC 工作台观感、窄屏满宽）
- [ ] V0.3.8 类型行增删开关、步进器显示、空敌方池推演输入
- [ ] V0.4.0 📜 旧档 tab 编年（推演产生 Lv3 事件后入账展示）、🌏 远方徽章、远方回响触发（账本 ≥10 条后 toast「🌏 远方回响」+ 冷却 5 楼）、删楼后即时回滚（不再等下一楼）、设置增删自定义事件行不再跳回 API 首屏
- [ ] V0.4.1 态势词条极简两行形态（📍地点 + spot/district why）、备忘在前态势收尾的注意力布局、高危 spot（如 85% 洗衣房）why 准确显示
- [ ] V0.4.2 折叠栏头条：重载页面/换聊天后显示历史滚动头条（推演过的聊天；从未推演的维持星形胶囊为设计行为）
- [ ] V0.4.3 折叠栏四类轮播：📍态势→📰报纸→⚔事件→📣风声 顺序滚动、推演后已更新类别置顶、重载页面即恢复
- [ ] V0.4.4 派系钦定设定：📜 名册 ✏️ 写设定后推演输入含【派系钦定设定】块且立场服从钦定；🗑 清空重推从零建立（round 1）；推演产物派系立场体现认知渠道与敌意烈度约束（治超雄/全知）

## 7. 下一步任务的开工话术（新对话直接用）

> "读 D:\Project\AssistantDirector\HANDOFF.md，然后按 §3.1 的设计开工批量回填 backfill"

预计规模：设置入口 + 分批循环（链式 await generateDirectorEvolve）+ 进度反馈 + 取消 + 终点收敛 + harness +8 项左右，一次会话可完成。
