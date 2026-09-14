// ==UserScript==
// @name         Assistant Director (副导演·世界模拟器)
// @namespace    assistant-director
// @version      0.4.4
// @description  AIRP 世界模拟器：单一副导演 API 世界推演（派系暗线/事件链/风声，S7 仿世界引擎）+ 随机遭遇掷骰（S6）+ 名册/墓碑（S5）+ 阶段揭示（S4）+ 公开情报贴边栏。注入走世界书词条 · SPEC V0.3.0
// @author       ELevin
// @match        *://*/*
// @grant        none
// ==/UserScript==

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  副导演 · 单 JSON 悬浮窗脚本插件（酒馆助手 / JS-Slash-Runner）
 *  模块分区见 SPEC §4.8：
 *    0 常量与配置 / 1 设置管理 / 2 酒馆环境适配 / 3 楼层监听状态机
 *    4 世界态势引擎（本地骰）/ 5 LLM 客户端 / 6 世界推演层（单一副导演 API）
 *    7 随机遭遇掷骰 / 8 公开层 UI / 9 GM 面板 / 10 主流程编排
 *  V0.3.0（S7）：态势/暗线双位合并为单一副导演 API；敌人安排移交正文 AI，
 *  程序只做概率掷骰提醒；世界状态仿世界引擎（派系关系/事件链/风声/encounter）。
 * ═══════════════════════════════════════════════════════════════════════════
 */
(function () {
  'use strict';

  // ═════════════════════════════════════════════════════════════════════
  // 0. 常量与配置
  // ═════════════════════════════════════════════════════════════════════

  const SCRIPT_NAME = 'AssistantDirector';
  const SCRIPT_VERSION = '0.4.4';
  // 注入走角色卡主世界书词条（MMS 同构）：constant 蓝灯 + at_depth system 0/15，
  // 首次创建定位置，之后只改 content 不动 position——用户可在世界书编辑器自由调整顺序。
  // V0.3.0：双词条（态势/暗线）合并为单一"副导演"词条；旧词条升级时下灯不删。
  const WB_ENTRY_DIRECTOR = '副导演';
  const WB_ENTRY_LEGACY = ['副导演-态势', '副导演-暗线'];   // V0.2.x 旧词条：仅 disable
  const WB_ORDER = 15;
  // 注入模板：XML 标签分段 + 两空格缩进列表——LLM 注意力分区友好，人工维护直观
  const MEMO_OPEN = '<内部导演备忘>';
  const MEMO_CLOSE = '</内部导演备忘>';
  const SIT_OPEN = '<当前态势>';
  const SIT_CLOSE = '</当前态势>';

  // localStorage 键（设置与 UI 偏好，随浏览器走）
  const LS = {
    settings: 'ad_settings_v1',
    ui: 'ad_ui_v1',
    promptDirector: 'ad_prompt_director_v1', // 副导演提示词预设（默认项锁定，自定义存快照）
  };
  // 聊天变量键（$ 前缀对 LLM 隐形，随聊天文件走）
  const CV = {
    world: '$ad_world',             // S7：世界状态（派系暗线/事件链/风声/encounter，取代 $ad_report）
    worldCheckpoint: '$ad_world_checkpoint',   // S8：上一推演点的世界快照（楼层回退时回滚）
    history: '$ad_history',         // V0.3.5：历史记录（推演/随机遭遇/系统事件，随聊天走）
    state: '$ad_state',    // 运行时状态（上次注入文本/骰子楼层/防连战锁等）
    roster: '$ad_roster',  // 名册+墓碑
    ledger: '$ad_ledger',  // V0.4.0：重大事件账本（Lv3+ 事件与风声 diff 入账，远方回响的采样源）
  };

  const ALERT_LEVELS = ['松懈', '常规', '警戒', '严密'];

  // —— 事件链与风声（S7 本地骰参数，仿世界引擎；模块常量，暂不做设置项）———————
  const EV_STAGES = ['萌芽', '发酵', '逼近', '爆发', '平息'];
  const STAGE_SCORE = { '萌芽': 0, '发酵': 2, '逼近': 6, '爆发': 12, '平息': -3 };   // eventTension 阶段分
  const WIND_GRACE = 3;        // 风声安静豁免楼数
  const WIND_BASE = 10;        // 消散概率基线（%）
  const WIND_LINEAR = 15;      // 每楼线性递增（%）

  // —— 区域突发事件（S9，仿世界引擎 REGIONAL_INCIDENT；类型本地掷骰 + 内容 LLM 生成）———
  // 类型表为结构化数组（V0.3.8 仿世界书模式）：[{ label, guide, weight, enabled, custom }]——
  // 默认 8 类轻量中性城市事件（custom:false 只可开关不可删）；玩家自定义行 custom:true 可删。
  // 引导只给灵感方向，事件具体内容（标题/范围/影响/风声/涉及派系）由推演 LLM 按当前世界观生成。
  function DEFAULT_INCIDENT_TYPES() {
    return [
      { label: '治安恶化', guide: '街面盗抢、斗殴、破坏等治安事件明显增多，警方或自治力量加强巡逻', weight: 18 },
      { label: '火灾', guide: '某处发生区域性火灾，波及建筑、仓储、船只或设施，引发救援与围观', weight: 14 },
      { label: '意外事故', guide: '坍塌、车祸、海难、机械故障等突发事故，造成伤亡或阻断通行', weight: 12 },
      { label: '失踪案件', guide: '数人接连失踪，亲友报案，邻里不安，流言四起', weight: 12 },
      { label: '恶性凶案', guide: '一宗足以引发区域恐慌的凶案，现场或手法异于常案', weight: 10 },
      { label: '骚乱集会', guide: '人群聚集事件：抗议、械斗、踩踏、骚乱，军警介入', weight: 10 },
      { label: '疫病苗头', guide: '原因不明的发热或皮疹病例出现，药房相关药品被抢购', weight: 9 },
      { label: '物资波动', guide: '某类生活或工业物资突然紧缺或价格异动，囤积与抢购出现', weight: 8 },
    ].map(t => ({ label: t.label, guide: t.guide, weight: t.weight, enabled: true, custom: false }));
  }

  // ═════════════════════════════════════════════════════════════════════
  // 1. 设置管理（localStorage，AiRadio 模式）
  // ═════════════════════════════════════════════════════════════════════

  function defaultEndpoint() {
    return { baseUrl: '', apiKey: '', model: '', temperature: 0.4, maxTokens: 4000 };
  }
  function defaultSettings() {
    return {
      enabledDirector: true,  // 世界推演总开关：推演（心跳/强制/手动📡）+ 副导演词条注入
      director: defaultEndpoint(), // 副导演 API（世界推演：派系/事件/风声/encounter）
      directorEveryX: 3,      // 心跳：每 N 楼常规推演一次（可调）
      enemyPool: '',          // 敌方阵营参考（手输，逗号/换行分隔）——推演输入的阵营名单
      coreTeam: '',           // 主角核心白名单（手输）——这些人绝不背叛、绝不被指定为间谍
      extraRules: '',         // 附加铁律（手输，多行）——拼到推演输入文末，最高优先级
      worldSync: [],          // 世界书同步：[{ book, entries }]——词条内容注入推演输入
      directorFloors: 20,     // 副导演可见 AI 楼层数（默认对齐 LWB 总结窗口；0=全部历史；排除玩家输入与隐藏楼层）
      randomCombatEnabled: true,      // 随机遭遇开关：每楼本地掷骰，命中即在用户本楼输入末尾追加强制开战指令
      randomCombatChance: 5,          // 遇敌概率基线（百分比/楼）——兜底值，世界状态命中 spots/districts 时被覆盖
      randomCombatOncePerCycle: true, // 防连战锁：每个推演周期（两次推演之间）最多一场随机战斗
      randomCombatCooldown: true,     // 战斗结束冷却开关：任意战斗（含剧情战）结束后 N 楼内不掷随机——只拦本插件掷骰
      randomCombatCooldownFloors: 3,  // 冷却楼数（战斗结束楼起算）
      regionalIncidentEnabled: true, // 区域突发事件总开关：本地掷骰定类型，LLM 按世界观生成事件内容
      regionalIncidentChance: 1,     // 触发概率（百分比/楼）
      regionalIncidentDuration: 5,   // 事件持续楼数（期间推演延续余波）
      regionalIncidentCooldown: 5,   // 消散后冷却楼数
      regionalIncidentTypes: DEFAULT_INCIDENT_TYPES(),   // 事件类型表（结构化数组，仿世界书行）
      distantEchoEnabled: true,     // 远方回响总开关：账本驱动，在玩家所在大区之外生成远方动态
      distantEchoLedgerThreshold: 10,  // 账本阈值：累积 N 条重大记录后开始掷骰
      distantEchoChance: 20,        // 触发概率（百分比/楼）
      distantEchoCooldown: 5,       // 生成成功后的冷却楼数
      debug: false,           // 调试模式：记录 LLM 请求/响应（环形日志 20 条 + 控制台输出）
    };
  }
  function normalizeSync(list) {
    return Array.isArray(list)
      ? list.filter(s => s && typeof s.book === 'string' && Array.isArray(s.entries))
          .map(s => ({ book: s.book, entries: s.entries.map(String) }))
      : [];
  }
  // V0.2.x → V0.3.0 设置迁移：双端点取暗线位（高智力）；双 worldSync 取并集；双开关并成推演开关
  function migrateSettings(saved) {
    const def = defaultSettings();
    const legacyOn = saved.enabled !== false;
    // 端点：优先旧暗线位，无则旧态势位
    const ep = saved.director || saved.shadowline || saved.situation || null;
    // worldSync 并集：按 book+词条 去重合并
    const merged = [];
    const seen = new Set();
    for (const src of [normalizeSync(saved.worldSync), normalizeSync(saved.worldSyncShadowline), normalizeSync(saved.worldSyncSituation)]) {
      for (const s of src) {
        const key = s.book + '||' + s.entries.join(',');
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(s);
      }
    }
    return {
      enabledDirector: saved.enabledDirector !== undefined ? saved.enabledDirector !== false
        : (saved.enabledShadowline !== undefined ? saved.enabledShadowline !== false : legacyOn),
      director: Object.assign(def.director, ep || {}),
      directorEveryX: Number.isFinite(saved.directorEveryX) && saved.directorEveryX > 0 ? saved.directorEveryX : 3,
      enemyPool: typeof saved.enemyPool === 'string' ? saved.enemyPool : '',
      coreTeam: typeof saved.coreTeam === 'string' ? saved.coreTeam : '',
      extraRules: typeof saved.extraRules === 'string' ? saved.extraRules : '',
      worldSync: merged,
      directorFloors: Number.isFinite(saved.directorFloors) ? saved.directorFloors
        : (Number.isFinite(saved.shadowlineFloors) ? saved.shadowlineFloors : 20),
      randomCombatEnabled: saved.randomCombatEnabled !== undefined ? saved.randomCombatEnabled !== false : true,
      randomCombatChance: Number.isFinite(saved.randomCombatChance) ? saved.randomCombatChance : 5,
      randomCombatOncePerCycle: saved.randomCombatOncePerCycle !== undefined ? saved.randomCombatOncePerCycle !== false : true,
      randomCombatCooldown: saved.randomCombatCooldown !== undefined ? saved.randomCombatCooldown !== false : true,
      randomCombatCooldownFloors: Number.isFinite(saved.randomCombatCooldownFloors) && saved.randomCombatCooldownFloors >= 0 ? saved.randomCombatCooldownFloors : 3,
      regionalIncidentEnabled: saved.regionalIncidentEnabled !== undefined ? saved.regionalIncidentEnabled !== false : true,
      regionalIncidentChance: Number.isFinite(saved.regionalIncidentChance) ? saved.regionalIncidentChance : 1,
      regionalIncidentDuration: Number.isFinite(saved.regionalIncidentDuration) && saved.regionalIncidentDuration >= 1 ? saved.regionalIncidentDuration : 5,
      regionalIncidentCooldown: Number.isFinite(saved.regionalIncidentCooldown) && saved.regionalIncidentCooldown >= 0 ? saved.regionalIncidentCooldown : 5,
      regionalIncidentTypes: normalizeIncidentTypes(saved.regionalIncidentTypes),
      distantEchoEnabled: saved.distantEchoEnabled !== undefined ? saved.distantEchoEnabled !== false : true,
      distantEchoLedgerThreshold: Number.isFinite(saved.distantEchoLedgerThreshold) && saved.distantEchoLedgerThreshold >= 1 ? saved.distantEchoLedgerThreshold : 10,
      distantEchoChance: Number.isFinite(saved.distantEchoChance) ? saved.distantEchoChance : 20,
      distantEchoCooldown: Number.isFinite(saved.distantEchoCooldown) && saved.distantEchoCooldown >= 0 ? saved.distantEchoCooldown : 5,
      debug: saved.debug === true,
    };
  }
  function loadSettings() {
    try {
      const raw = localStorage.getItem(LS.settings);
      if (!raw) return defaultSettings();
      return migrateSettings(JSON.parse(raw));
    } catch (e) { return defaultSettings(); }
  }
  function saveSettings(s) {
    SETTINGS = s;   // 同步闭包变量——dispatchNow/事件监听读的是它，只写 localStorage 不生效
    try { localStorage.setItem(LS.settings, JSON.stringify(s)); } catch (e) { log('warn', '设置保存失败', e); }
  }
  function loadUiPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem(LS.ui) || '{}') || {};
      if (!p.theme) p.theme = 'paper';
      if (!['paper', 'events', 'winds', 'ledger'].includes(p.activeTab)) p.activeTab = 'paper';
      return p;
    } catch (e) { return { theme: 'paper', activeTab: 'paper' }; }
  }
  function saveUiPrefs(p) {
    try { localStorage.setItem(LS.ui, JSON.stringify(p)); } catch (e) { /* 忽略 */ }
  }

  let SETTINGS = loadSettings();

  // —— 提示词预设（仿 MMS：默认项锁定不可删，新建=默认快照后可自由修改）—————
  // 一份工厂两实例（暗线/态势），localStorage 持久化；默认项 content 为空壳——消费端实时调 buildDefault()

  function makePresetStore(storageKey, buildDefault) {
    const load = () => {
      let data = null;
      try { data = JSON.parse(localStorage.getItem(storageKey) || 'null'); } catch (e) { /* 损坏回落默认 */ }
      if (!data || typeof data !== 'object' || !Array.isArray(data.presets)) {
        data = { active: 'default', presets: [{ id: 'default', name: '默认提示词', content: '', locked: true }] };
      }
      if (!data.presets.some(p => p && p.id === 'default')) {
        data.presets.unshift({ id: 'default', name: '默认提示词', content: '', locked: true });  // 数据自愈：默认项永远在
      }
      if (!data.presets.some(p => p && p.id === data.active)) data.active = 'default';
      return data;
    };
    const save = data => { try { localStorage.setItem(storageKey, JSON.stringify(data)); } catch (e) { /* 忽略 */ } };
    return {
      load, save,
      // 当前生效 system 文本：默认项实时生成（后续提示词升级即跟随），自定义用快照
      currentSys() {
        const data = load();
        const p = data.presets.find(x => x.id === data.active) || data.presets[0];
        return (p && !p.locked && p.content) ? p.content : buildDefault();
      },
      add(name) {
        const data = load();
        const id = 'prompt_' + Date.now();
        data.presets.push({ id, name, content: buildDefault(), locked: false });  // 新建=默认快照
        data.active = id;
        save(data);
      },
      rename(name) {
        const data = load();
        const p = data.presets.find(x => x.id === data.active);
        if (p && !p.locked) { p.name = name; save(data); }
      },
      remove() {
        const data = load();
        const p = data.presets.find(x => x.id === data.active);
        if (!p || p.locked) return;   // 默认不可删（UI 按钮已禁用，此处兜底）
        data.presets = data.presets.filter(x => x.id !== data.active);
        data.active = 'default';
        save(data);
      },
      select(id) {
        const data = load();
        if (data.presets.some(x => x.id === id)) { data.active = id; save(data); }
      },
      // 更新自定义预设内容（blur 即存；默认项锁定只读，不写入）
      updateContent(content) {
        const data = load();
        const p = data.presets.find(x => x.id === data.active);
        if (p && !p.locked) { p.content = content; save(data); }
      },
    };
  }

  // ═════════════════════════════════════════════════════════════════════
  // 2. 酒馆环境适配
  // ═════════════════════════════════════════════════════════════════════

  const log = (...a) => console.log(`[${SCRIPT_NAME}]`, ...a);
  const logWarn = (...a) => console.warn(`[${SCRIPT_NAME}]`, ...a);

  // LIVE = 酒馆助手脚本环境（或 harness 的完整 mock——两者 API 同构）
  function detectLive() {
    return typeof getVariables === 'function'
      && typeof insertOrAssignVariables === 'function'
      && typeof eventOn === 'function'
      && typeof tavern_events !== 'undefined';
  }
  const IS_LIVE = detectLive();
  // 世界书写入能力（注入通道）：五件套全在位才写词条，否则静默跳过注入
  const HAS_WB = typeof getCharWorldbookNames === 'function'
    && typeof getWorldbook === 'function'
    && typeof createWorldbookEntries === 'function'
    && typeof updateWorldbookWith === 'function';

  // —— 变量读写封装 ——————————————————————————————————————

  function readChatVar(key) {
    try {
      const all = getVariables({ type: 'chat' }) || {};
      return all[key];
    } catch (e) { logWarn('readChatVar 失败', key, e); return undefined; }
  }
  function writeChatVar(key, value) {
    try { insertOrAssignVariables({ [key]: value }, { type: 'chat' }); return true; }
    catch (e) { logWarn('writeChatVar 失败', key, e); return false; }
  }

  // 读最近一楼的 stat_data（自动回溯 ≤50 楼找最近快照）
  function readLatestStatData() {
    for (let i = -1; i >= -50; i--) {
      let v;
      try { v = getVariables({ type: 'message', message_id: i }); }
      catch (e) { break; }
      if (v && v.stat_data && v.stat_data['状态栏']) return v.stat_data['状态栏'];
    }
    return null;
  }

  // —— 注入通道（角色卡主世界书词条，MMS 同构）—————————————————
  // 态势/暗线各占一个 constant 蓝灯词条（at_depth/system/深度0/排序15），随聊天重写 content；
  // 位置只在首次创建时指定，此后更新只改 content 不动 position——用户在世界书编辑器里
  // 调整的顺序/深度永久保留。用户手动改过词条内容时，写入走 merge3 三方行级合并，
  // 用户改动持续保留在后续每一轮注入里（兜底机制）。

  let wbNameCache = null;                 // 角色卡主世界书名（挂载期缓存，换聊天重探）
  const wbInflight = Object.create(null); // entryName → 写入链（同词条串行防并发）
  let wbWarned = false;                   // 缺世界书写 API 只警告一次

  // LCS 行匹配：a[i] 命中 b 的下标（未命中 -1）——注入文本 ≤ 百行，DP 足够
  function lcsMatches(a, b) {
    const n = a.length, m = b.length;
    const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--)
      for (let j = m - 1; j >= 0; j--)
        dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const res = new Array(n).fill(-1);
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) { res[i] = j; i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
      else j++;
    }
    return res;
  }

  // 把 x 相对 base 的行级改动解析成编辑脚本：mod（改行 baseIdx→新行）/ del（删行）/ ins（某 base 行后插入）/ head（行首前插入）
  function diffEdits(base, x) {
    const mX = lcsMatches(base, x);
    const mod = new Map(), del = new Set(), ins = new Map();
    let head = [];   // V0.4.1 修复：原 const 声明却在行首插入分支被重赋值（TypeError 静默吞掉写入）——旧拼接顺序下 base 首行恒等于 ours 首行从未触发，备忘前置后暴露
    const n = base.length, m = x.length;
    let i = 0, j = 0;
    while (i < n || j < m) {
      if (i < n && mX[i] === j) { i++; j++; continue; }
      // 不一致段：base[i..i2) 为删、x[j..j2) 为增；等长部分两两配对成"改行"
      let i2 = i; while (i2 < n && mX[i2] === -1) i2++;
      const j2 = i2 < n ? mX[i2] : m;
      const k = Math.min(i2 - i, j2 - j);
      for (let t = 0; t < k; t++) mod.set(i + t, x[j + t]);
      for (let t = i + k; t < i2; t++) del.add(t);
      if (j2 - j > k) {
        const lines = x.slice(j + k, j2);
        if (i > 0) ins.set(i - 1, (ins.get(i - 1) || []).concat(lines));
        else head = head.concat(lines);
      }
      i = i2; j = j2;
    }
    return { mod, del, ins, head };
  }

  // 三方行级合并：base=脚本上次注入的纯内容，theirs=词条现状（含用户改动），ours=脚本新内容。
  // 用户改/删/增的行全部保留（双改同行用户赢）且随 base 演进持续生效；脚本删的行维持删除
  // （如换地点后的旧态势，即使用户改过也删）；base 为空（换聊天/首写）不合并直接覆盖——
  // 上一聊天残留在词条里的内容不能被当成用户改动。
  function merge3(base, theirs, ours) {
    if (!base) return ours;
    if (theirs === base) return ours;
    const B = base.split('\n');
    const u = diffEdits(B, theirs.split('\n'));   // 用户改动
    const s = diffEdits(B, ours.split('\n'));     // 脚本改动
    const out = s.head.concat(u.head);
    for (let i = 0; i < B.length; i++) {
      if (u.mod.has(i)) {
        if (!s.del.has(i)) out.push(u.mod.get(i));   // 用户改行（双改同行用户赢）；脚本纯删则删（脚本删除权威）
      } else if (!u.del.has(i)) {                    // 用户删行：不输出
        if (s.mod.has(i)) out.push(s.mod.get(i));    // 脚本改行：照常输出
        else if (!s.del.has(i)) out.push(B[i]);      // 双方都保留：原行
      }
      // 锚定在本行之后的插入：脚本新增在前，用户新增随后
      if (s.ins.has(i)) out.push(...s.ins.get(i));
      if (u.ins.has(i)) out.push(...u.ins.get(i));
    }
    return out.join('\n');
  }

  // 定位角色卡主世界书：primary → additional[0] → 都没有则按角色名新建并绑定（MMS 同款）
  async function resolveWbName() {
    if (wbNameCache) return wbNameCache;
    let charWb = null;
    try { charWb = await Promise.resolve(getCharWorldbookNames('current')); }
    catch (e) { logWarn('getCharWorldbookNames 失败', e); }
    let name = charWb && charWb.primary ? charWb.primary
      : (charWb && Array.isArray(charWb.additional) && charWb.additional[0]) || null;
    if (!name) {
      const charName = typeof getCurrentCharacterName === 'function' ? getCurrentCharacterName() : '';
      if (!charName) return null;
      await Promise.resolve(createWorldbook(charName));
      await Promise.resolve(rebindCharWorldbooks('current', { primary: charName, additional: [] }));
      name = charName;
    }
    wbNameCache = name;
    return name;
  }

  const WB_SLOT = { [WB_ENTRY_DIRECTOR]: 'director' };

  async function writeWbEntryNow(entryName, content) {
    const slot = WB_SLOT[entryName];
    const wbName = await resolveWbName();
    if (!wbName) { logWarn('世界书不可用，注入跳过', entryName); return false; }
    let entries = [];
    try { entries = (await Promise.resolve(getWorldbook(wbName))) || []; }
    catch (e) { logWarn('getWorldbook 失败', entryName, e); return false; }
    const existing = entries.find(e => e && e.name === entryName);
    if (!existing) {
      // 首次创建：constant 蓝灯 + at_depth/system/深度0/排序15
      await Promise.resolve(createWorldbookEntries(wbName, [{
        name: entryName, enabled: true,
        strategy: { type: 'constant', keys: [], keys_secondary: { logic: 'and_any', keys: [] }, scan_depth: 'same_as_global' },
        position: { type: 'at_depth', role: 'system', depth: 0, order: WB_ORDER },
        content, probability: 100,
      }]));
      log(`注入词条已创建：${entryName}`);
    } else {
      // 词条已存在：内容与上次注入的纯内容不一致 = 用户改过 → 三方合并；没改过 → 直接覆盖
      const base = slot ? (State.wbLast[slot] || '') : '';
      let final = content;
      if (base && existing.content !== base) final = merge3(base, existing.content, content);
      if (existing.content !== final || !existing.enabled) {
        await Promise.resolve(updateWorldbookWith(wbName, list =>
          list.map(e => e && e.name === entryName ? { ...e, content: final, enabled: true } : e)));
      }   // 内容相同且在注入：幂等跳过（不产生写调用），wbLast 照样回写
    }
    // wbLast 记「纯脚本内容」（非合并结果）——下次写入时词条现状 ≠ 纯内容即检出用户改动，
    // 用户改动得以随 base 演进持续重放（sticky）
    if (slot && State.wbLast[slot] !== content) { State.wbLast[slot] = content; persistRuntimeState(); }
    return true;
  }

  // 写注入词条（fire-and-forget；同词条串行防并发；缺写 API 静默跳过只警告一次）
  function writeWbEntry(entryName, content) {
    if (!HAS_WB) {
      if (!wbWarned) { wbWarned = true; logWarn('当前环境缺少世界书写入 API——注入通道不可用（静默跳过）'); }
      return Promise.resolve(false);
    }
    const prev = wbInflight[entryName] || Promise.resolve();
    const task = prev.then(() => writeWbEntryNow(entryName, content))
      .catch(e => { logWarn('注入词条写入失败', entryName, e); return false; });
    wbInflight[entryName] = task;
    return task;
  }

  // 禁用注入词条（不删除——换回有数据的聊天/重开总开关时恢复写入即回到注入）
  async function disableWbEntries(names) {
    if (!HAS_WB) return;
    const list = Array.isArray(names) ? names : [WB_ENTRY_DIRECTOR];
    const wbName = await resolveWbName();
    if (!wbName) return;
    let entries = [];
    try { entries = (await Promise.resolve(getWorldbook(wbName))) || []; }
    catch (e) { return; }
    if (!entries.some(e => e && list.includes(e.name) && e.enabled)) return;
    await Promise.resolve(updateWorldbookWith(wbName, es =>
      es.map(e => e && list.includes(e.name) ? { ...e, enabled: false } : e)));
  }

  // 重挂载/换聊天：按存档世界状态重建副导演词条（无状态则禁用，防上一聊天残留）；
  // V0.2.x 旧双词条一并下灯（内容已废弃，留着会双份注入）
  function syncDirectorEntry() {
    disableWbEntries(WB_ENTRY_LEGACY);
    if (!SETTINGS.enabledDirector) { disableWbEntries([WB_ENTRY_DIRECTOR]); return; }
    const world = readChatVar(CV.world);
    if (world && Array.isArray(world.factions)) writeWbEntry(WB_ENTRY_DIRECTOR, buildDirectorInjection(world, State.lastLocationText));
    else disableWbEntries([WB_ENTRY_DIRECTOR]);
  }

  // 功能开关切换即时生效：关 → 词条下灯；开 → 强制一次重写重新上灯
  // （writeWbEntryNow 见词条 disabled 会原内容重开灯，merge3 基线不动——用户改动保留）
  function applySwitches() {
    if (SETTINGS.enabledDirector) { State.forceDirectorWrite = true; scheduleDispatch('switch-on'); }
    else disableWbEntries([WB_ENTRY_DIRECTOR]);
  }

  // —— 事件封装 ——————————————————————————————————————————

  const EVT = {
    started: 'GENERATION_STARTED',
    received: 'MESSAGE_RECEIVED',
    updated: 'MESSAGE_UPDATED',
    swiped: 'MESSAGE_SWIPED',
    deleted: 'MESSAGE_DELETED',
    chatChanged: 'CHAT_CHANGED',
  };
  function bindEvent(name, cb) {
    try {
      if (tavern_events && tavern_events[name]) eventOn(tavern_events[name], cb);
      else logWarn('未知事件名', name);
    } catch (e) { logWarn('bindEvent 失败', name, e); }
  }

  // —— 随机遭遇掷骰（S6）—————————————————————————————————————
  // 程序侧概率推进：正文 AI 自己掷不出真随机（注入文里写概率基本永远不触发），
  // 故由本地在 GENERATION_STARTED（用户已发送、提示词未组装）时掷骰，
  // 命中即把强制开战指令以用户身份追加进本楼输入末尾——随楼层生成自然持久化。
  // V0.3.0：概率不再固定——按世界状态动态计算（spots>districts>玩家设置 三级兜底
  // + heat/eventTension 冷热加法修正），另加防连战锁（每推演周期最多一场）。

  const RC_MARKER = '【🎲随机遭遇】';
  const RC_DIRECTIVE = '本轮用户触发随机战斗，按【战斗轮规则】输出 Combat_block 块';

  const clamp = (min, max, v) => Math.max(min, Math.min(max, v));
  // 区块匹配：norm 后互相包含 + 压缩通道（两边去掉 ·/-/—/空白/括号后再互相包含——
  // 容忍 LLM 写 spot 时不带分隔符，如"澳大利亚酒店总督套房" vs "澳大利亚酒店 - 总督套房"）
  const ZONE_SQ_RE = /[·\-—–\s（）()]/g;
  function zoneMatch(pattern, text) {
    const p = norm(pattern), t = norm(text);
    if (!p || !t) return false;
    if (t.includes(p) || p.includes(t)) return true;
    const ps = p.replace(ZONE_SQ_RE, ''), ts = t.replace(ZONE_SQ_RE, '');
    return !!(ps && ts && (ts.includes(ps) || ps.includes(ts)));
  }
  // zoneHit（V0.3.2 三通道，对抗 LLM 真实写法）：①整串 zoneMatch ②复合 zone 按连接词
  // （至/与/、/，/和）切段，每段再与地点的各分段（按 ·/-/— 切，≥3 字——"悉尼"这类两字
  // 大区段不参与，防 p.includes(t) 误报）互相包含。真机实证案例：夏盖虫群 zone
  // "悉尼港码头区至禧市排污管网"、凯特 zone "萨里山核心区（绿顶酒馆）"、蒂莉 zone
  // "达令赫斯特区"——单串包含全部匹配不上，切段+分段后全部命中。
  function zoneHit(pattern, text) {
    if (!pattern || !text) return false;
    if (zoneMatch(pattern, text)) return true;
    const p0 = norm(pattern);
    if (!p0) return false;
    const segs = [p0].concat(p0.split(/[至与、，,和]/).map(s => s.trim())).filter(s => s && s.length >= 2);
    const tSegs = norm(text).split(/[·\-—–]/).map(s => s.trim()).filter(s => s.length >= 3);
    return segs.some(p => tSegs.some(t => zoneMatch(p, t)));
  }

  // 战斗进行中检测：最近一条可见 AI 楼含 <Combat_block> 即在战（RpgCombat 逐楼续写该块）
  function combatInProgress() {
    const chat = (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) ? SillyTavern.getContext().chat : null;
    if (!Array.isArray(chat)) return false;
    for (let i = chat.length - 1; i >= 0; i--) {
      const m = chat[i];
      if (!m || m.is_user || m.is_system || m.is_hidden) continue;
      return String(m.mes || '').includes('<Combat_block>');
    }
    return false;
  }

  // 事件归属大区集合：事件自带 zone ∪ 其涉及派系的 zone
  function eventZones(ev, world) {
    const zones = [];
    if (ev.zone) zones.push(ev.zone);
    for (const name of (ev.factions || [])) {
      const f = (world.factions || []).find(x => x && x.name === name);
      if (f && f.zone) zones.push(f.zone);
    }
    return zones;
  }

  // eventTension（微观冷热）：当前地点命中的 conflict 类事件的阶段分之和——世界另一头的战争不抬高本地遇敌率
  // 匹配目标用整段地点文本（zone 可能是大区也可能是次级区名，如"萨里山"⊂"悉尼 · 萨里山 · 绿顶酒馆"）
  function eventTension(world, locationText) {
    if (!world || !Array.isArray(world.events) || !locationText) return 0;
    let sum = 0;
    for (const ev of world.events) {
      if (!ev || ev.type !== 'conflict') continue;
      const score = STAGE_SCORE[ev.stage];
      if (!score) continue;
      const zones = eventZones(ev, world);
      if (zones.length && zones.some(z => zoneHit(z, locationText))) sum += score;
    }
    return sum;
  }

  // 遇敌概率档案（S7 算法）：
  //   最终概率 = clamp(0,100, 区域基值 + 冷热修正)；冷热修正 = clamp(-40,40, heat + eventTension)
  //   区域基值三级兜底：spots（地标级）> districts（大区级）> SETTINGS.randomCombatChance（玩家设置）
  //   显式安全标记：命中 spots/districts 且 chance===0 → 直接安全区，不叠修正
  //   spots/districts 都对整段地点串匹配（zoneHit 三通道：LLM 写法鲁棒）；spots 更具体、先查，精度由优先级保证
  function encounterProfile(locationText, worldArg) {
    const base = { chance: clamp(0, 100, Number(SETTINGS.randomCombatChance) || 0), safe: false, via: 'settings', heat: 0, tension: 0, why: '', heatWhy: '' };
    const world = (worldArg !== undefined) ? worldArg : readChatVar(CV.world);   // V0.4.1：可选显式传入（态势注入与配发读同一份，防两次读不一致）
    if (!world || !world.encounter) return base;   // 无世界状态（未首推）：与 S6 原行为一致
    const enc = world.encounter;
    const heatWhy = (enc.heat && enc.heat.why) ? String(enc.heat.why) : '';
    let hit = null, via = 'settings';
    for (const s of (enc.spots || [])) {
      if (s && s.match && zoneHit(s.match, locationText)) { hit = s; via = 'spot'; break; }
    }
    if (!hit) for (const d of (enc.districts || [])) {
      if (d && d.match && zoneHit(d.match, locationText)) { hit = d; via = 'district'; break; }
    }
    if (!hit) return Object.assign(base, { heatWhy });   // spots/districts 均未命中：玩家设置兜底（不加修正——副导演没给过该地判断）
    const chance = clamp(0, 100, Number(hit.chance) || 0);
    if (chance === 0) return { chance: 0, safe: true, via, heat: 0, tension: 0, why: hit.why || '', heatWhy };   // 显式安全标记
    const heat = (enc.heat && Number.isFinite(+enc.heat.value)) ? clamp(-30, 30, +enc.heat.value) : 0;
    const tension = eventTension(world, locationText);
    const mod = clamp(-40, 40, heat + tension);
    return { chance: clamp(0, 100, chance + mod), safe: false, via, heat, tension, why: hit.why || '', heatWhy };
  }

  // 战斗结束检测（V0.3.4）：每楼 dispatch 时比对——上楼在战（最近可见 AI 楼含
  // <Combat_block>）而本楼无块 = 战斗结束，记录结束楼层号（随机遭遇冷却窗口起点）。
  // 任意战斗都算（随机遭遇/剧情开战/用户命令——RpgCombat 统一用 Combat_block 续写）。
  function trackCombatEnd() {
    const inCombat = combatInProgress();
    if (State.combatLastSeen && !inCombat) {
      const floorId = currentFloorId();
      if (floorId >= 0) {
        State.combatEndFloorId = floorId;
        persistRuntimeState();
        pushHistory('system', { type: 'combat-end', floorId,
          note: `战斗结束（楼层 ${floorId}）——随机遭遇冷却 ${SETTINGS.randomCombatCooldown ? SETTINGS.randomCombatCooldownFloors + ' 楼' : '已关闭'}` });
        log(`战斗结束检测（楼层 ${floorId}）——随机遭遇冷却 ${SETTINGS.randomCombatCooldown ? SETTINGS.randomCombatCooldownFloors + ' 楼' : '已关闭'}`);
      }
    }
    State.combatLastSeen = inCombat;
  }

  // 战斗结束冷却判定：当前楼层距结束楼 < N → 冷却中（只拦本插件随机掷骰——
  // 用户输入命令与正文 AI 自行输出战斗不经此路径，天然不受影响）
  function combatCooldownActive() {
    if (!SETTINGS.randomCombatCooldown) return false;
    const n = Math.max(0, Number(SETTINGS.randomCombatCooldownFloors) || 0);
    if (!n || State.combatEndFloorId < 0) return false;
    const floorId = currentFloorId();
    return floorId >= 0 && (floorId - State.combatEndFloorId) < n;
  }

  function onGenerationStarted(type, _opts, dryRun) {
    // V0.4.0 生成上下文诊断记录（只记不拦）：真机若出现"其他脚本静默追加楼层导致误触发"，
    // dispatch 日志里的 type/dryRun/quiet 有据可依，再决定是否升级为门控
    State.lastGeneration = {
      type: String(type || ''),
      dryRun: dryRun === true,
      quiet: !!(_opts && typeof _opts.quiet_prompt === 'string' && _opts.quiet_prompt.trim()),
    };
    if (!SETTINGS.randomCombatEnabled) return;
    if (dryRun || type === 'swipe' || type === 'regenerate') return;
    const chat = (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) ? SillyTavern.getContext().chat : null;
    if (!Array.isArray(chat) || !chat.length) return;
    const last = chat[chat.length - 1];
    if (!last || last.is_user !== true) return;         // 只在用户刚发送的楼注入
    const mes = String(last.mes || '');
    if (mes.includes(RC_MARKER)) return;                // 防重复追加（含 swipe 后重跑）
    if (combatInProgress()) return;                     // 战斗进行中不触发
    if (combatCooldownActive()) return;                 // 任意战斗结束后 N 楼冷却（只拦随机掷骰）
    // 动态概率：取最新状态栏地点（ GENERATION_STARTED 时最新 stat 快照即当前场景）
    const stat = readLatestStatData();
    const locationText = String((stat && stat['地点']) || State.lastLocationText || '').trim();
    const profile = locationText ? encounterProfile(locationText) : { chance: Number(SETTINGS.randomCombatChance) || 0, safe: false, via: 'settings' };
    if (profile.safe) return;                           // 副导演显式安全区（spots/districts chance=0）
    // 防连战锁：本推演周期已触发过一场——锁到下一次推演成功（仅世界状态存在时生效）
    const world = readChatVar(CV.world);
    if (SETTINGS.randomCombatOncePerCycle && world && State.randomCombatFired) return;
    if (Math.random() * 100 >= profile.chance) return;
    last.mes = mes + '\n' + RC_MARKER + ' ' + RC_DIRECTIVE + '。';
    if (SETTINGS.randomCombatOncePerCycle && world) { State.randomCombatFired = true; persistRuntimeState(); }
    pushHistory('combat', { chance: profile.chance, via: profile.via,
      heat: profile.heat, tension: profile.tension, location: locationText, floorId: currentFloorId() });
    toast(`🎲 随机遭遇触发（${profile.chance}% · ${profile.via}）`);
    log(`随机遭遇命中（${profile.chance}%/楼 · 来源 ${profile.via} · heat ${profile.heat} · tension ${profile.tension}）——已注入用户本楼输入`);
  }


  // ═════════════════════════════════════════════════════════════════════
  // 3. 楼层监听状态机
  // ═════════════════════════════════════════════════════════════════════

  const State = {
    wbLast: { director: '' },  // 上次注入词条的「纯脚本内容」——merge3 的 base（≠词条现状即用户改过）
    forceDirectorWrite: false, // 推演开关重开的一次性强写标记（不持久化——词条见 disabled 会重新上灯）
    lastLocationText: '',     // 当前地点原文
    lastLandmarkKey: '',      // 当前地标键（大区后首字段）
    lastDiceFloorId: -1,      // 本地骰已推进到的楼层号（swipe/重roll 同楼不重复掷骰）
    randomCombatFired: false, // 防连战锁：本推演周期内已触发过随机战斗（推演成功解锁）
    combatLastSeen: false,    // 上楼检测时是否处于战斗中（true→false 跳变 = 战斗结束）
    combatEndFloorId: -1,     // 最近一次战斗结束的楼层号（其后 N 楼为随机遭遇冷却窗口）
    pendingIncident: null,    // 区域突发事件挂起（{ type, guide }——掷中待生成/失败重试，推演成功回执后清除）
    lastGeneration: null,     // 最近一次 GENERATION_STARTED 上下文（type/dryRun/quiet——诊断用，不持久化）
    tickerItems: [],          // V0.4.3：折叠态四类轮播条目 [{cat,text}]——态势/报纸/事件/风声 固定顺序
    tickerPins: [],           // V0.4.3：推演中已更新类别——下次推演前优先播放
    pendingTimer: null,
  };

  function loadRuntimeState() {
    const s = readChatVar(CV.state) || {};
    const wl = s.wbLast || {};
    State.wbLast = { director: wl.director || '' };
    State.lastLocationText = s.lastLocationText || '';
    State.lastLandmarkKey = s.lastLandmarkKey || '';
    State.lastDiceFloorId = Number.isFinite(s.lastDiceFloorId) ? s.lastDiceFloorId : -1;
    State.randomCombatFired = s.randomCombatFired === true;
    State.combatLastSeen = s.combatLastSeen === true;
    State.combatEndFloorId = Number.isFinite(s.combatEndFloorId) ? s.combatEndFloorId : -1;
    State.pendingIncident = (s.pendingIncident && s.pendingIncident.type) ? s.pendingIncident : null;
    const ti = s.tickerItems;
    State.tickerItems = Array.isArray(ti) ? ti.filter(x => x && typeof x === 'object' && typeof x.text === 'string') : [];
    State.tickerPins = Array.isArray(s.tickerPins) ? s.tickerPins.filter(x => typeof x === 'string') : [];
  }
  function persistRuntimeState() {
    writeChatVar(CV.state, {
      wbLast: State.wbLast,
      lastLocationText: State.lastLocationText,
      lastLandmarkKey: State.lastLandmarkKey,
      lastDiceFloorId: State.lastDiceFloorId,
      randomCombatFired: State.randomCombatFired,
      combatLastSeen: State.combatLastSeen,
      combatEndFloorId: State.combatEndFloorId,
      pendingIncident: State.pendingIncident || null,
      tickerItems: State.tickerItems,
      tickerPins: State.tickerPins,
      savedAt: Date.now(),
    });
  }

  // 去抖：连续楼层事件（received/updated/swiped 连发）合并为一次重算
  function scheduleDispatch(reason) {
    if (State.pendingTimer) clearTimeout(State.pendingTimer);
    State.pendingTimer = setTimeout(() => {
      State.pendingTimer = null;
      try { dispatchNow(reason); }
      catch (e) { logWarn('dispatch 异常', e); }
    }, 800);
  }

  function onFloorEvent() {
    if (!SETTINGS.enabledDirector) return;   // 随机遭遇独立于此开关（挂 GENERATION_STARTED）
    // V0.4.0 尾楼身份校验（对齐 ACU 思路）：最后一楼是用户楼（编辑自己楼层）时不触发重算
    const chat = (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) ? SillyTavern.getContext().chat : null;
    if (Array.isArray(chat) && chat.length && chat[chat.length - 1] && chat[chat.length - 1].is_user === true) return;
    scheduleDispatch('floor-event');
  }
  // V0.4.0 删楼补挂：删除楼层后及时跑回滚检测 + 注入重建（不走尾楼 is_user 校验——
  // 删楼后尾楼可能是用户楼；此前要等下一次楼层事件，世界状态与楼层错位窗口过长）
  function onMessageDeleted() {
    if (!SETTINGS.enabledDirector) return;
    scheduleDispatch('message-deleted');
  }
  function onChatChanged() {
    // 换聊天：运行时状态重置（情报流也清空），注入词条按新聊天重写。
    // wbLast 必须清空——词条里还残留上一聊天的内容，带旧 base 会被误判成用户改动
    State.wbLast = { director: '' };
    State.lastLocationText = '';
    State.lastLandmarkKey = '';
    State.lastDiceFloorId = -1;
    State.randomCombatFired = false;
    State.combatLastSeen = false;
    State.combatEndFloorId = -1;
    State.pendingIncident = null;
    State.tickerItems = [];
    State.tickerPins = [];
    renderTicker();   // V0.4.2：清空即时反映（否则换聊天后 DOM 还挂旧聊天头条）
    Trigger.lastDateKey = '';               // 换聊天：触发基线重建（首次 dispatch 记基线不触发）
    Trigger.lastStage = '';
    Trigger.lastCombatResult = '';
    Trigger.lastFloorId = -1;
    Trigger.floorsSinceEvolve = 0;
    wbNameCache = null;   // 换卡/换聊天：重探角色卡主世界书
    if (!SETTINGS.enabledDirector) { disableWbEntries([WB_ENTRY_DIRECTOR]); return; }
    syncDirectorEntry();   // 副导演词条按新聊天世界状态重建（无状态禁用）
    scheduleDispatch('chat-changed');
  }

  // ═════════════════════════════════════════════════════════════════════
  // 4. 世界态势引擎（信号级提醒 + 本地骰；纯程序，零 LLM）
  // ═════════════════════════════════════════════════════════════════════

  // —— 地点文本归一化：剥 emoji / 变体符 / 零宽，压缩空白 ——————————

  const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{FE0E}\u{FE0F}]/gu;
  function norm(s) {
    return String(s == null ? '' : s)
      .replace(EMOJI_RE, '')
      .replace(/[\u3000\s]+/g, ' ')
      .trim();
  }

  // —— 信号级态势文本（V0.4.1 极简化：地点 + 副导演对该地的一句话判断）—————————
  // why 三级：spots（地标级最具体）> districts（大区级）> 驻守信号兜底（zone 命中派系）；
  // 都没有时仅地点行。开战提示已删除（战斗轮规则由用户世界书常驻承载——V0.2 决策）。

  function buildDirectorSituationText(locationText, world) {
    const lines = [SIT_OPEN, `  ${locationText}`];
    const profile = encounterProfile(locationText, world);
    if (profile.why) {
      lines.push(`  ${profile.why}`);
    } else if (world && Array.isArray(world.factions)) {
      const stationed = world.factions.filter(f => f && f.zone && zoneHit(f.zone, locationText));
      for (const f of stationed.slice(0, 3)) {
        lines.push(`  驻守信号：${f.name}（${f.zone}）${f.morale ? '，士气：' + f.morale : ''}${f.stance ? '，对我方：' + f.stance : ''}`);
      }
    }
    lines.push(SIT_CLOSE);
    return lines.join('\n');
  }

  // —— 本地骰（S7，仿世界引擎：每楼微演进，零 LLM）————————————————
  // 事件链推进：stageRound/9 进度 + 阶段基准 + level 修正 → 1-100 阈值骰 →
  //   推进（>阈值）/ 受挫（<阈值×40%，回退一格）/ 保持；stageRound≥9 晋级下一阶段。
  // 风声衰减：安静楼数超 grace 后按线性递增概率消散，消散的下报纸架。
  // 幂等守卫：floorId 未前进不掷（swipe/重roll 重触发 dispatchNow 不重复推进）。

  function rollEvents(world, rand) {
    let changed = false;
    for (const ev of (world.events || [])) {
      if (!ev || ev.stage === '平息') continue;
      const si = EV_STAGES.indexOf(ev.stage);
      if (si < 0 || si >= EV_STAGES.length - 1) continue;   // 非法阶段/已到最后阶段
      const r = Math.min(1, (ev.stageRound || 1) / 9);
      // conflict 越后期越难推进（萌芽85→逼近70），progress 反之（越干越顺）
      const base = ev.type === 'progress' ? 75 + si * 5 : 85 - si * 5;
      const levelAdj = (ev.type === 'progress' ? 1 : -1) * (((ev.level || 1) - 1) * 10);
      const threshold = Math.round(base - 200 * r * (1 - r) + levelAdj);
      const dice = Math.floor(rand() * 100) + 1;
      if (dice > threshold) {
        ev.stageRound = (ev.stageRound || 1) + 1;
        if (ev.stageRound >= 9) { ev.stage = EV_STAGES[si + 1]; ev.stageRound = 1; }
        changed = true;
      } else if (dice < threshold * 0.4) {
        ev.stageRound = Math.max(1, (ev.stageRound || 1) - 1);
        changed = true;
      }
    }
    return changed;
  }

  function rollWinds(world, rand) {
    const before = world.winds ? world.winds.length : 0;
    const keep = [];
    for (const w of (world.winds || [])) {
      if (!w) continue;
      w.quietRounds = (w.quietRounds || 0) + 1;
      if (w.quietRounds <= WIND_GRACE) { keep.push(w); continue; }
      const n = w.quietRounds - WIND_GRACE - 1;
      const chance = Math.min(95, Math.max(5, WIND_BASE + WIND_LINEAR * n));
      if (Math.floor(rand() * 100) + 1 <= chance) continue;   // 消散：不保留
      keep.push(w);
    }
    world.winds = keep;
    return keep.length !== before;
  }

  // 楼层号（拿不到则 -1——不掷骰，避免无锚点重复推进）
  function currentFloorId() {
    try {
      const msgs = getChatMessages(-1);
      const m = Array.isArray(msgs) ? msgs[0] : null;
      if (m && m.message_id != null) return m.message_id;
    } catch (e) { /* 忽略 */ }
    return -1;
  }

  // 每楼本地骰入口：floorId 前进才掷；有实际变化才回写 $ad_world（幂等省写）
  function runLocalDice() {
    const world = readChatVar(CV.world);
    if (!world || !Array.isArray(world.events) && !Array.isArray(world.winds)) return false;
    const floorId = currentFloorId();
    if (floorId < 0 || floorId <= State.lastDiceFloorId) return false;
    State.lastDiceFloorId = floorId;
    const evChanged = rollEvents(world, Math.random);
    const windChanged = rollWinds(world, Math.random);
    if (evChanged || windChanged) {
      writeChatVar(CV.world, world);
      log(`本地骰推进（楼层 ${floorId}）：${evChanged ? '事件链' : ''}${evChanged && windChanged ? '+' : ''}${windChanged ? '风声衰减' : ''}`);
      return true;
    }
    return false;
  }

  // —— 区域突发事件（S9，仿世界引擎 REGIONAL_INCIDENT；单位=楼）—————————————
  // 类型本地掷骰（权重轮盘）→ 触发强制推演（指令段指定类型，内容 LLM 按世界观生成）
  // → 回执校验写入 world.incident（全局单例）→ 活跃期推演延续余波 → 到期消散 → 冷却。
  // 挂起重试：pendingIncident 存在（生成中/生成失败）时跳过掷骰直接触发，推演自动并入指令。

  // 类型表归一化（V0.3.8 结构化数组）：数组 → 规范条目（custom 默认 true）；旧版字符串（textarea
  // 时代）→ 按行解析为自定义条目；空/损坏 → 默认表
  function normalizeIncidentTypes(v) {
    const norm = t => ({
      label: String(t.label || '').trim(),
      guide: String(t.guide || '').trim(),
      weight: Number.isFinite(Number(t.weight)) ? Number(t.weight) : 0,
      enabled: t.enabled !== false,
      custom: t.custom !== false,
    });
    if (Array.isArray(v)) {
      const list = v.map(norm).filter(t => t.label);
      return list.length ? list : DEFAULT_INCIDENT_TYPES();
    }
    if (typeof v === 'string' && v.trim()) {
      const list = v.split('\n').map(line => {
        const segs = line.split('|').map(x => x.trim());
        if (segs.length < 3 || !segs[0]) return null;
        return norm({ label: segs[0], guide: segs[1], weight: Number(segs[2]), enabled: true, custom: true });
      }).filter(Boolean);
      return list.length ? list : DEFAULT_INCIDENT_TYPES();
    }
    return DEFAULT_INCIDENT_TYPES();
  }

  // 类型表解析：结构化数组 → 可用类型（enabled 且 weight>0；权重 0 = 单类禁用）
  function parseIncidentTypes(list) {
    return normalizeIncidentTypes(list)
      .filter(t => t.enabled !== false && t.weight > 0)
      .map(t => ({ type: t.label, guide: t.guide, weight: t.weight }));
  }

  // 权重轮盘（世界引擎 weightedPick 同款）
  function weightedPickIncident(types, rand) {
    if (!types || !types.length) return null;
    const total = types.reduce((s, t) => s + t.weight, 0);
    if (total <= 0) return null;
    let roll = rand() * total;
    for (const t of types) {
      roll -= t.weight;
      if (roll < 0) return t;
    }
    return types[types.length - 1];
  }

  function incidentLabel(type) {
    const found = parseIncidentTypes(SETTINGS.regionalIncidentTypes).find(t => t.type === type);
    return found ? found.type : type;
  }

  // 掷中（或重试）→ 强制推演（fire-and-forget；busy 时 pendingIncident 已置位，下次推演并入）
  function triggerIncidentEvolve(pick) {
    State.pendingIncident = { type: pick.type, guide: pick.guide || '' };
    persistRuntimeState();
    log(`区域突发事件掷中：${pick.type}——触发强制推演`);
    generateDirectorEvolve('regional-incident').catch(e => logWarn('区域突发事件推演异常', e));
  }

  // 每楼状态机（挂 dispatchNow，本地骰之前跑——幂等守卫读 lastDiceFloorId，更新留给 runLocalDice）
  function rollRegionalIncident() {
    const world = readChatVar(CV.world);
    if (!world || !Array.isArray(world.events)) return false;
    const floorId = currentFloorId();
    if (floorId < 0 || floorId <= State.lastDiceFloorId) return false;
    const inc = (world.incident && typeof world.incident === 'object') ? world.incident : null;
    let changed = false;
    if (inc && inc.active) {
      inc.duration = Math.max(0, (inc.duration || 0) - 1);
      if (inc.duration <= 0) {
        const title = inc.title || '未命名区域事件';
        Object.assign(inc, { active: false, title: '', type: '', zone: '', impact: '', duration: 0 });
        inc.cooldown = Math.max(0, Number(SETTINGS.regionalIncidentCooldown) || 0);
        pushHistory('incident', { phase: '消散', title });
        toast(`区域事件已平息：${title}`);
        log(`区域突发事件消散：${title}（冷却 ${inc.cooldown} 楼）`);
      }
      changed = true;
    } else if (inc && (inc.cooldown || 0) > 0) {
      inc.cooldown -= 1;
      changed = true;
    } else if (!SETTINGS.regionalIncidentEnabled) {
      return false;   // 总开关：掷骰与重试静默（活跃事件的状态机照常跑——否则关开关会永久悬挂）
    } else if (State.pendingIncident) {
      // 挂起/重试优先：跳过掷骰，直接触发强制推演（同类型）
      triggerIncidentEvolve(State.pendingIncident);
    } else {
      const chance = clamp(0, 100, Number(SETTINGS.regionalIncidentChance) || 0);
      if (chance > 0 && Math.random() * 100 < chance) {
        const picked = weightedPickIncident(parseIncidentTypes(SETTINGS.regionalIncidentTypes), Math.random);
        if (picked) triggerIncidentEvolve(picked);
      }
    }
    if (changed) writeChatVar(CV.world, world);
    return changed;
  }

  // 强制指令段（掷中类型 → LLM 按世界观具象化；世界引擎 buildRegionalIncidentPrompt 铁律精华）
  function buildIncidentDirective(pending) {
    return `【本地骰子强制指令：本轮必须生成区域突发事件】
本地骰子已判定触发区域突发事件，并指定类型：
类型：${pending.type}
类型说明：${pending.guide || '（无引导——按类型字面义生成）'}
你必须根据当前世界状态，生成一个符合该类型的区域级突发事件（标题/范围/影响按当前世界观具象化），并织入世界状态：
1. 事件影响一个明确的区域、街区、设施、道路或水域；
2. 不是小插曲、路人噪音或单人偶发事故；
3. 必须产生至少一条该事件的风声（winds）；
4. 必须造成至少一种外溢影响：events（织入一个新事件，stage 从萌芽起）、encounter（该区遇敌概率上调）、或 factions 变动；
5. 与玩家当前行为没有直接因果，不得写成已有仇敌、已有势力、已有事件链的阴谋结果；
6. 不得凭空毁灭核心舞台或核心资产；若事件不在玩家所在区域，只作为远方消息与风声传播，不打断玩家行动；
7. 禁止低价值事件（路人吵架、小偷小摸、醉汉闹事、普通邻里纠纷类）。
额外返回字段（必须）："incident": { "title": "事件标题", "zone": "影响区域", "impact": "一句话区域后果" }。`;
  }

  // 持续中指令（活跃期每次推演注入：延续余波、禁止新开——防事件堆叠）
  function buildIncidentOngoing(inc) {
    return `【区域突发事件持续中（剩余 ${inc.duration || 1} 楼）】
标题：${inc.title || '未命名'}${inc.type ? `（${inc.type}）` : ''}｜范围：${inc.zone || '未知'}｜影响：${inc.impact || ''}
该事件仍处活跃期：本轮推演延续其余波（风声/事件推进/encounter/派系反应），不得写成已平息，也不得在 incident 字段生成新事件。`;
  }

  // 回执合并（generateDirectorEvolve 成功路径，writeChatVar 之前调用；对齐世界引擎 mergeRegionalIncident）
  function mergeIncident(world, parsed) {
    if (!State.pendingIncident) {
      // 本地未掷中：丢弃 LLM 自发返回（防自发电）
      if (parsed && parsed.incident) delete parsed.incident;
      return;
    }
    const pending = State.pendingIncident;
    const receipt = (parsed && parsed.incident && typeof parsed.incident === 'object') ? parsed.incident : null;
    if (receipt && (receipt.title || receipt.zone || receipt.impact)) {
      world.incident = {
        active: true, type: pending.type,
        title: String(receipt.title || '未命名区域事件'),
        zone: String(receipt.zone || '未知区域'),
        impact: String(receipt.impact || '区域秩序受到冲击。'),
        duration: Math.max(1, Number(SETTINGS.regionalIncidentDuration) || 5),
        cooldown: 0,
      };
      State.pendingIncident = null;
      persistRuntimeState();
      pushHistory('incident', { phase: '触发', type: pending.type, title: world.incident.title,
        zone: world.incident.zone, impact: world.incident.impact });
      toast(`⚡ 区域事件：${world.incident.title}（${world.incident.zone}）`);
      log(`区域突发事件落地：${world.incident.title}（${pending.type}/${world.incident.zone}，持续 ${world.incident.duration} 楼）`);
    } else {
      // 无回执：pendingIncident 保留，下次推演优先重试同类型
      toast('区域事件生成未返回，下次推演将重试');
      logWarn('区域突发事件：推演未返回 incident 回执，保留 pending 下次重试');
    }
    if (parsed && parsed.incident) delete parsed.incident;   // 回执消费完毕，不进 world schema
  }

  // —— 重大事件账本（V0.4.0，镜像世界引擎 ledger：diff 入账，远方回响的采样源）—————
  // 推演后 diff（推演前世界 vs 推演后世界）：Lv≥3 新事件 / 推进至爆发·平息（终局，
  // 不限等级）/ Lv≥3 新风声 → 合并为一条（按楼层键）。独立于 $ad_history 环形 50 条——
  // 重大事件不随流水滚动丢失，形成"这方世界发生过什么大事"的编年档案。

  const LEDGER_KEEP = 30;   // 保留条数上限（模块常量，暂不做设置项）

  function getLedger() {
    const v = readChatVar(CV.ledger);
    return Array.isArray(v) ? v : [];
  }

  // 风声匹配（对齐 validateWorld 延续判定）：norm 后相等或互相包含 → 视为同一条（非新增）
  function windSeen(winds, content) {
    const nc = norm(content);
    if (!nc) return true;
    return (winds || []).some(x => x && norm(x.content)
      && (norm(x.content) === nc || norm(x.content).includes(nc) || nc.includes(norm(x.content))));
  }

  function recordLedger(prevWorld, newWorld, floorId) {
    const changes = [];
    const prevEvents = (prevWorld && Array.isArray(prevWorld.events)) ? prevWorld.events : [];
    const prevMap = new Map(prevEvents.filter(Boolean).map(e => [e.name, e]));
    for (const ev of (newWorld.events || [])) {
      if (!ev || !ev.name) continue;
      const isTerminal = ev.stage === '爆发' || ev.stage === '平息';
      if ((!ev.level || ev.level < 3) && !isTerminal) continue;
      const prev = prevMap.get(ev.name);
      if (!prev) {
        changes.push({ type: isTerminal ? 'event_terminal' : 'event_new', name: ev.name,
          level: ev.level, eventType: ev.type, stage: ev.stage, zone: ev.zone || '', desc: ev.desc || '' });
      } else if (prev.stage !== ev.stage) {
        changes.push({ type: isTerminal ? 'event_terminal' : 'event_advance', name: ev.name,
          level: ev.level, fromStage: prev.stage, toStage: ev.stage, desc: ev.desc || '' });
      }
    }
    const prevWinds = (prevWorld && Array.isArray(prevWorld.winds)) ? prevWorld.winds : [];
    for (const w of (newWorld.winds || [])) {
      if (!w || !w.content || !w.level || w.level < 3) continue;
      if (!windSeen(prevWinds, w.content)) {
        changes.push({ type: 'wind_new', level: w.level, content: w.content, source: w.source || '' });
      }
    }
    if (!changes.length) return;
    let entries = getLedger();
    if (Number.isFinite(floorId) && floorId >= 0) {
      entries = entries.filter(e => e && Number.isFinite(e.floor) && e.floor <= floorId   // 楼层回退：截掉未来条目
        && e.floor !== floorId);   // 同楼重roll：覆盖
    }
    entries.unshift({ floor: Number.isFinite(floorId) ? floorId : 0, round: newWorld.round || 0, changes });
    if (entries.length > LEDGER_KEEP) entries.length = LEDGER_KEEP;
    writeChatVar(CV.ledger, entries);
    log(`账本入账（楼层 ${floorId} · 第 ${newWorld.round || '?'} 轮）：${changes.length} 条变化`);
  }

  // —— 远方回响（V0.4.0，镜像世界引擎 distantEvent：账本驱动、本地骰、失败重试）—————
  // 账本 ≥ 阈值 → 概率骰 → 采样旧账（防复刻参照）→ 强制推演生成 zone 不在玩家当前大区的
  // Lv2/3 新事件/风声 → 回执 _distanceGenerated 校验 → distance:true 持久标记 + 冷却。
  // 指令段与区域事件互斥：区域事件掷中/重试/活跃期优先，远方顺延。

  function ensureDistant(world) {
    if (!world.distant || typeof world.distant !== 'object') {
      world.distant = { pending: false, cooldown: 0, sample: [], requestedFloor: 0, requestedType: '' };
    }
    world.distant.pending = world.distant.pending === true;
    world.distant.cooldown = Math.max(0, parseInt(world.distant.cooldown, 10) || 0);
    world.distant.sample = Array.isArray(world.distant.sample) ? world.distant.sample : [];
    world.distant.requestedFloor = parseInt(world.distant.requestedFloor, 10) || 0;
    world.distant.requestedType = world.distant.requestedType === 'event' || world.distant.requestedType === 'wind' ? world.distant.requestedType : '';
    return world.distant;
  }

  // 采样（世界引擎 sampleDistantLedger 同款）：最近 1/4 必选 + 旧账 Fisher-Yates 洗牌补足总量一半
  function sampleDistantLedger(rand) {
    const entries = getLedger();
    const recentCount = Math.floor(entries.length / 4);
    const targetCount = Math.floor(entries.length / 2);
    const recent = entries.slice(0, recentCount);
    const older = entries.slice(recentCount);
    for (let i = older.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [older[i], older[j]] = [older[j], older[i]];
    }
    return recent.concat(older.slice(0, Math.max(0, targetCount - recent.length)))
      .map(e => ({ floor: e.floor, round: e.round, changes: Array.isArray(e.changes) ? e.changes : [] }));
  }

  // 强制指令段（世界引擎 buildDistantEventPrompt 铁律精华，适配副导演 schema）
  function buildDistantDirective(d) {
    const wantsEvent = d.requestedType === 'event';
    return `【本地骰子强制指令：本轮必须生成一条远方动态】
以下是历史账本采样，仅用于识别已经使用过的事件主题、冲突结构和风声内容。不得续写、改写、复刻或直接关联这些记录：
${JSON.stringify(d.sample || [], null, 1)}

本地系统已指定本轮远方动态的类型：${wantsEvent ? '事件链 events' : '风声 winds'}。
结合当前世界状态与世界观，为本次远方动态独立新增一条${wantsEvent ? '事件（events 数组新增一项）' : '风声（winds 数组新增一项）'}（不影响你对其他已有世界状态的正常更新）。不得改成另一种类型。

强制要求：
- 新对象等级只能是 Lv2 或 Lv3。
- 新对象必须额外携带临时标记 "_distanceGenerated": true（仅供本地确认生成成功，不得添加到其他对象）。
- 玩家当前所在地：${State.lastLocationText || '未知'}——新对象不得发生在玩家当前大区，必须是远方区域（${wantsEvent ? 'zone 填远方大区' : '内容指向远方区域'}）。
- 与 {{user}} 的当前行为、资产、名声、仇敌及所在场景没有直接因果关系，不得强行打断 {{user}} 当前行动。
- 不得由上述账本中的既有事件、势力冲突或风声直接引发，也不得复刻其主题与结构。
- 必须扎根于当前世界观，发生在合理存在的远方区域、群体或社会系统中，不能成为无因果的随机噪音。
- 本次远方动态只能有一个带 "_distanceGenerated" 标记的新对象。`;
  }

  function triggerDistantEvolve() {
    log('远方回响：触发强制推演（distant-echo）');
    generateDirectorEvolve('distant-echo').catch(e => logWarn('远方回响推演异常', e));
  }

  // 每楼掷骰（挂 dispatchNow，区域事件之后、本地骰之前——幂等守卫读 lastDiceFloorId，更新留给 runLocalDice）
  function rollDistantEcho() {
    if (!SETTINGS.distantEchoEnabled) return false;
    const world = readChatVar(CV.world);
    if (!world || !Array.isArray(world.events)) return false;
    const floorId = currentFloorId();
    if (floorId < 0 || floorId <= State.lastDiceFloorId) return false;
    const distant = ensureDistant(world);
    const occupied = !!(State.pendingIncident || (world.incident && world.incident.active));   // 指令段被区域事件占用
    let changed = false;
    if (distant.pending) {
      if (!occupied) triggerDistantEvolve();   // 挂起重试（同款 _retry，推演回执失败保留 pending）
    } else if (distant.cooldown > 0) {
      distant.cooldown -= 1;
      changed = true;
    } else if (!occupied) {
      const entries = getLedger();
      const threshold = clamp(1, 999, Number(SETTINGS.distantEchoLedgerThreshold) || 10);
      const chance = clamp(0, 100, Number(SETTINGS.distantEchoChance) || 0);
      if (entries.length >= threshold && chance > 0 && Math.random() * 100 < chance) {
        distant.pending = true;
        distant.sample = sampleDistantLedger(Math.random);
        distant.requestedFloor = floorId;
        distant.requestedType = Math.random() < 0.5 ? 'event' : 'wind';
        changed = true;
        triggerDistantEvolve();
        log(`远方回响掷中（账本 ${entries.length} 条 ≥ 阈值 ${threshold}，${chance}% 骰中）——本轮要求生成${distant.requestedType === 'event' ? '事件链' : '风声'}`);
      }
    }
    if (changed) writeChatVar(CV.world, world);
    return changed;
  }

  // 回执处理（generateDirectorEvolve 合并段，读原始 parsed 的 _distanceGenerated 标记——
  // validateWorld 会重建对象丢弃未知字段）：恰好一个 + 类型匹配 + Lv2/3 + 形状合法 + 确为新对象；
  // 失败剔除标记对象、pending 保持下次推演重试；成功在已验证对象上落 distance:true 持久标记 + 冷却。
  function acceptDistantEcho(world, prevWorld, parsed) {
    const rawEvents = (parsed && Array.isArray(parsed.events)) ? parsed.events : [];
    const rawWinds = (parsed && Array.isArray(parsed.winds)) ? parsed.winds : [];
    const markedEvents = rawEvents.filter(x => x && typeof x === 'object' && x._distanceGenerated === true);
    const markedWinds = rawWinds.filter(x => x && typeof x === 'object' && x._distanceGenerated === true);
    const marked = markedEvents.concat(markedWinds);
    const distant = (world.distant && typeof world.distant === 'object') ? world.distant : null;
    if (!marked.length) {
      if (distant && distant.pending) {
        toast('远方回响生成未返回，下次推演将重试');
        logWarn('远方回响：推演未返回 _distanceGenerated 标记对象，保留 pending 下次重试');
      }
      return;
    }
    if (!distant || !distant.pending) return;   // 未掷中：自发标记对象当普通条目放行（标记不进 schema）
    const prevEvents = (prevWorld && Array.isArray(prevWorld.events)) ? prevWorld.events : [];
    const prevWinds = (prevWorld && Array.isArray(prevWorld.winds)) ? prevWorld.winds : [];
    const evName = x => String((x.name != null && x.name !== '') ? x.name : (x['事件'] || x['名称'] || '')).trim();
    const windContent = x => String((x.content != null && x.content !== '') ? x.content : (x['风声'] || x['内容'] || '')).trim();
    const candidate = marked.length === 1 ? marked[0] : null;
    const isEvent = candidate ? markedEvents.includes(candidate) : false;
    const typeMatches = !!candidate && ((distant.requestedType === 'event' && isEvent) || (distant.requestedType === 'wind' && !isEvent));
    const level = candidate ? parseInt(candidate.level, 10) : 0;
    const isNew = !!candidate && (isEvent
      ? !prevEvents.some(x => x && x.name === evName(candidate))
      : !windSeen(prevWinds, windContent(candidate)));
    const validShape = !!candidate && (isEvent
      ? !!evName(candidate) && ['conflict', 'progress'].includes(candidate.type)
      : !!windContent(candidate));
    if (!(candidate && typeMatches && (level === 2 || level === 3) && isNew && validShape)) {
      // 剔除"新对象"级别的标记条目（名字/内容与上次世界重合的是续写对象，不剔防误删既有条目）
      const badNames = new Set(markedEvents
        .filter(x => !prevEvents.some(p => p && p.name === evName(x)))
        .map(evName).filter(Boolean));
      if (badNames.size) world.events = (world.events || []).filter(ev => !badNames.has(ev.name));
      const badWinds = markedWinds
        .filter(x => !windSeen(prevWinds, windContent(x)))
        .map(x => norm(windContent(x))).filter(Boolean);
      if (badWinds.length) world.winds = (world.winds || []).filter(w => !badWinds.includes(norm(w.content || '')));
      logWarn('远方回响生成未通过校验，下次推演继续强制生成');
      return;
    }
    // 成功：在已验证对象上落 distance 持久标记（validateWorld 重建对象——按 name/content 匹配）
    let landed = false;
    if (isEvent) {
      const target = (world.events || []).find(x => x && x.name === evName(candidate));
      if (target) { target.distance = true; landed = true; }
    } else {
      const nc = norm(windContent(candidate));
      const target = (world.winds || []).find(x => x && norm(x.content) === nc);
      if (target) { target.distance = true; landed = true; }
    }
    if (!landed) logWarn('远方回响落地但未匹配到已验证对象（distance 标记缺失）');
    distant.pending = false;
    distant.cooldown = Math.max(1, Number(SETTINGS.distantEchoCooldown) || 5);
    distant.sample = [];
    distant.requestedFloor = 0;
    distant.requestedType = '';
    pushHistory('system', { type: 'distant-echo', note: `远方回响落地：${isEvent ? evName(candidate) : '远方风声'}（Lv${level}）` });
    toast(`🌏 远方回响：${isEvent ? evName(candidate) : windContent(candidate).slice(0, 18)}（Lv${level}）`);
    log(`远方回响落地：${isEvent ? '事件 ' + evName(candidate) : '风声'}（Lv${level}，冷却 ${distant.cooldown} 楼）`);
  }

  // —— 历史记录（V0.3.5，$ad_history 随聊天走）———————————————————————
  // 四类：evolve（世界推演）/ combat（随机遭遇触发）/ incident（区域突发事件）/ system（楼层回滚、战斗结束）。
  // 各类环形上限 50 条，最新在前。世界状态的演变过程从此前端可见。

  const HISTORY_LIMIT = 50;

  function getHistory() {
    const h = readChatVar(CV.history);
    return {
      evolve: Array.isArray(h && h.evolve) ? h.evolve : [],
      combat: Array.isArray(h && h.combat) ? h.combat : [],
      system: Array.isArray(h && h.system) ? h.system : [],
      incident: Array.isArray(h && h.incident) ? h.incident : [],
    };
  }

  function pushHistory(kind, entry) {
    if (!['evolve', 'combat', 'system', 'incident'].includes(kind)) return;
    const h = getHistory();
    h[kind].unshift(Object.assign({ at: Date.now() }, entry));
    if (h[kind].length > HISTORY_LIMIT) h[kind].length = HISTORY_LIMIT;
    writeChatVar(CV.history, h);
  }

  function clearHistory() { writeChatVar(CV.history, null); }

  // 推演变化摘要：新旧世界的派系/事件/风声集合 diff（一句话可读）
  function diffWorld(prev, next) {
    if (!prev || !Array.isArray(prev.factions)) return '首次推演——世界从零建立';
    const names = list => new Set((list || []).map(x => x && x.name).filter(Boolean));
    const windKeys = list => new Set((list || []).map(w => w && w.content).filter(Boolean));
    const diff = (a, b, label) => {
      const added = [...b].filter(x => !a.has(x));
      const removed = [...a].filter(x => !b.has(x));
      const parts = [];
      if (added.length) parts.push(`${label}+${added.length}${added.length <= 3 ? '（' + added.join('、') + '）' : ''}`);
      if (removed.length) parts.push(`${label}-${removed.length}${removed.length <= 3 ? '（' + removed.join('、') + '）' : ''}`);
      return parts;
    };
    const parts = [
      ...diff(names(prev.factions), names(next.factions), '派系'),
      ...diff(names(prev.events), names(next.events), '事件'),
      ...diff(windKeys(prev.winds), windKeys(next.winds), '风声'),
    ];
    return parts.length ? parts.join('，') : '构成无变化（内容修订）';
  }

  // —— checkpoint 完整回滚（S8，仿世界引擎存档点）—————————————————————
  // 推演写入新世界前把旧世界快照到 $ad_world_checkpoint，并在新世界记 floorId 锚点
  // （该状态对应的楼层号）。每楼 dispatch 检测：楼层回退（删楼/回退编辑——当前楼层号
  // 小于世界锚点）→ 回滚到上一推演点（本地骰的推进随之丢弃，事件链不会因删楼而越推越快）。
  // 单级回滚：回滚后锚点重置为当前楼层（继续删楼不再回退——更深的快照不存在）。
  // swipe 不回滚（楼层号不变，重 roll 后 3 楼心跳内会重推覆盖）。
  function maybeRollbackWorld() {
    const world = readChatVar(CV.world);
    if (!world || !Number.isFinite(world.floorId) || world.floorId < 0) return false;
    const floorId = currentFloorId();
    if (floorId < 0 || world.floorId <= floorId) return false;   // 楼层未回退
    const checkpoint = readChatVar(CV.worldCheckpoint);
    if (checkpoint && Array.isArray(checkpoint.factions)) {
      checkpoint.floorId = floorId;   // 以当前楼层为新基线（单级回滚）
      writeChatVar(CV.world, checkpoint);
      log(`楼层回退（${world.floorId} → ${floorId}）：世界状态回滚到上一推演点（round ${checkpoint.round || '?'}）`);
      toast('↩ 楼层回退——世界状态已回滚到上一推演点');
    } else {
      // 首推后即被删楼（无更早快照）：回退到无世界状态
      writeChatVar(CV.world, null);
      log(`楼层回退（${world.floorId} → ${floorId}）：无更早快照，回到未推演状态`);
      toast('↩ 楼层回退——无更早推演快照，世界状态已清空');
    }
    Trigger.floorsSinceEvolve = 0;
    State.lastDiceFloorId = floorId;   // 回滚后本地骰以新楼层为基线（不立即补掷）
    if (State.randomCombatFired) { State.randomCombatFired = false; persistRuntimeState(); }   // 推演周期随回滚重置
    pushHistory('system', { type: 'rollback', from: world.floorId, to: floorId,
      toRound: checkpoint ? (checkpoint.round || '?') : 0,
      note: checkpoint ? `世界状态回滚到上一推演点（round ${checkpoint.round || '?'}）` : '无更早快照，回到未推演状态' });
    return true;
  }

  // —— 主配发流程（纯程序，零 LLM；每楼重算注入，幂等写入）———————————

  // V0.4.0 dispatch 日志的生成上下文后缀（诊断：定位静默/后台生成导致的误触发）
  function genContextSuffix() {
    const g = State.lastGeneration;
    if (!g) return '';
    return ` · 上次生成 ${g.type || '?'}${g.dryRun ? ' dryRun' : ''}${g.quiet ? ' quiet' : ''}`;
  }

  function dispatchNow(reason) {
    if (!SETTINGS.enabledDirector) return;   // 推演总开关关：完全静默（随机遭遇独立工作）
    const stat = readLatestStatData();
    if (!stat) {
      log('无 stat_data 可用（MMS 未运行或尚无楼层变量），跳过本轮配发');
      disableWbEntries([WB_ENTRY_DIRECTOR]);
      updatePanelStatus('等待状态栏数据…');
      return;
    }
    const locationText = String(stat['地点'] || '').trim();
    if (!locationText) {
      logWarn('stat_data 缺少地点字段，跳过');
      return;
    }
    maybeRollbackWorld();   // S8：楼层回退检测（删楼/回退编辑 → 回滚到上一推演点）
    trackCombatEnd();       // V0.3.4：战斗结束检测（冷却窗口起点）
    rollRegionalIncident(); // S9：区域突发事件状态机（活跃/消散/冷却/重试/掷骰——先于本地骰，幂等守卫共享）
    rollDistantEcho();      // V0.4.0：远方回响掷骰（账本驱动，幂等守卫共享；指令段与区域事件互斥）
    runLocalDice();   // 本地骰（事件链/风声）——在构建注入前推进
    const world = readChatVar(CV.world) || null;

    State.lastLocationText = locationText;
    const lKey = landmarkKey(locationText);
    State.lastLandmarkKey = lKey;

    // 词条内容 = 信号级当前态势 + 世界动态（事件/风声/派系暗线三态）
    const text = world
      ? buildDirectorInjection(world, locationText) + '\n\n' + buildDirectorSituationText(locationText, world)   // V0.4.1：当前态势移到备忘之后（末尾注意力位）
      : buildDirectorSituationText(locationText, null);
    if (HAS_WB && (State.forceDirectorWrite || text !== State.wbLast.director)) {
      State.forceDirectorWrite = false;   // 开关重开的一次性强写（词条见 disabled 会重新上灯）
      writeWbEntry(WB_ENTRY_DIRECTOR, text);   // 异步写词条（内部幂等 + merge3 用户改动兜底）
      if (els.dot) els.dot.classList.add('on');   // 更新提醒：展开后熄灭
      log(`副导演注入已更新（${reason}${genContextSuffix()}）`);
    } else {
      log(`副导演注入无变化，保持（${reason}${genContextSuffix()}）`);
    }
    persistRuntimeState();
    updatePanelStatus(null, { locationText, world });
    updatePanelMeta(stat);
    State.tickerItems = buildTickerItems(world, locationText, State.tickerPins);   // V0.4.3：每楼从当前世界状态派生四类条目（重载/换聊天后即恢复）
    renderTicker();
    if (IS_LIVE) checkTriggers(stat);   // S7：心跳 + 强制推触发矩阵
  }

  // ═════════════════════════════════════════════════════════════════════
  // 5. LLM 客户端（OpenAI 兼容 /chat/completions 非流式）
  // ═════════════════════════════════════════════════════════════════════

  // —— LLM 调试日志（环形缓冲，最近 20 次请求/响应；设置开启后记录并在控制台输出）———

  const DebugLog = [];
  function debugRecord(entry) {
    DebugLog.push(entry);
    if (DebugLog.length > 20) DebugLog.shift();
  }

  async function callLLM(cfg, messages, { timeoutMs = 90000, label = 'llm' } = {}) {
    if (!cfg || !cfg.baseUrl || !cfg.model) throw new Error('端点未配置（Base URL / Model 必填）');
    const url = String(cfg.baseUrl).replace(/\/+$/, '') + '/chat/completions';
    const t0 = Date.now();
    // AiRadio 式调试：发起即在控制台打印完整请求（不等返回），失败/成功即时打印原因
    if (SETTINGS.debug) console.log(`[${SCRIPT_NAME}][LLM→]`, label, cfg.model, url, `
—— 完整 messages ——
` + JSON.stringify(messages, null, 1));
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: Object.assign(
          { 'Content-Type': 'application/json' },
          cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}
        ),
        body: JSON.stringify({
          model: cfg.model, messages,
          temperature: cfg.temperature != null ? cfg.temperature : 0.4,
          max_tokens: cfg.maxTokens || 2000,
          stream: false,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      if (SETTINGS.debug) console.warn(`[${SCRIPT_NAME}][LLM✗]`, label, `请求失败（${Date.now() - t0}ms）：`, e.message || e);
      debugRecord({ label, at: Date.now(), url, model: cfg.model, messages, raw: '', ok: false, ms: Date.now() - t0, error: e.message || String(e) });
      throw new Error(`请求失败：${e.message || e}`);
    }
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      if (SETTINGS.debug) console.warn(`[${SCRIPT_NAME}][LLM✗]`, label, `HTTP ${res.status}（${Date.now() - t0}ms）：`, errText.slice(0, 500));
      debugRecord({ label, at: Date.now(), url, model: cfg.model, messages, raw: errText.slice(0, 2000), ok: false, ms: Date.now() - t0, error: `HTTP ${res.status}` });
      throw new Error(`HTTP ${res.status}${errText ? '：' + errText.slice(0, 200) : ''}`);
    }
    const data = await res.json();
    const content = data && data.choices && data.choices[0] && data.choices[0].message
      && data.choices[0].message.content;
    if (!content) {
      if (SETTINGS.debug) console.warn(`[${SCRIPT_NAME}][LLM✗]`, label, `响应缺少 content（${Date.now() - t0}ms）：`, JSON.stringify(data).slice(0, 500));
      debugRecord({ label, at: Date.now(), url, model: cfg.model, messages, raw: JSON.stringify(data).slice(0, 2000), ok: false, ms: Date.now() - t0, error: '响应缺少 choices[0].message.content' });
      throw new Error('响应缺少 choices[0].message.content');
    }
    if (SETTINGS.debug) console.log(`[${SCRIPT_NAME}][LLM←]`, label, `成功 ${content.length} 字符（${Date.now() - t0}ms）
—— 响应原文 ——
` + content);
    debugRecord({ label, at: Date.now(), url, model: cfg.model, messages, raw: content, ok: true, ms: Date.now() - t0, error: '' });
    return content;
  }

  // 从模型输出提取 JSON：剥 ``` 围栏，取首个 [ 或 { 到配对闭合（字符串感知）
  function extractJson(text) {
    let s = String(text || '').trim()
      .replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const start = s.search(/[[{]/);
    if (start < 0) throw new Error('输出中未找到 JSON');
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < s.length; i++) {
      const c = s[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') { inStr = true; continue; }
      if (c === '{' || c === '[') depth++;
      else if (c === '}' || c === ']') {
        depth--;
        if (depth === 0) return JSON.parse(s.slice(start, i + 1));
      }
    }
    throw new Error('JSON 未闭合');
  }

  // —— 敌人名单（用户手输，推演输入的阵营参考）+ 地标键（spots 匹配粒度）—————————

  // 敌人名单：手输文本（逗号/顿号/换行分隔）→ 数组；为空表示未配置
  function getEnemyPool() {
    return String(SETTINGS.enemyPool || '')
      .split(/[,，、\n]/).map(s => s.trim()).filter(Boolean);
  }
  // 主角核心白名单：手输文本 → 数组；注入推演输入，这些人不可能是间谍
  function getCoreTeam() {
    return String(SETTINGS.coreTeam || '')
      .split(/[,，、\n]/).map(s => s.trim()).filter(Boolean);
  }

  // 地标键：状态栏地点"大区 · 地标 …"中大区后的第一个字段（如"澳大利亚酒店 - 总统套房"）。
  // encounter.spots 的小区域匹配粒度锚。
  function landmarkKey(locationText) {
    const parts = norm(locationText).split(/[·]/).map(s => s.trim()).filter(Boolean);
    return parts.length >= 2 ? parts[1] : (parts[0] || '');
  }

  // 世界书排序：对齐酒馆上下文顺序——先按 position.type 分组（角色定义前→…→深度插入），
  // 组内按 position.order 升序。getWorldbook 返回的"自定义顺序"与此无关（真机实证乱序）。
  const WB_POS_ORDER = ['before_character_definition', 'after_character_definition',
    'before_example_messages', 'after_example_messages', 'before_author_note', 'after_author_note', 'at_depth'];
  function sortWorldbookEntries(entries) {
    const rank = e => {
      const p = (e && e.position) || {};
      const i = WB_POS_ORDER.indexOf(p.type);
      return [i < 0 ? 99 : i, Number.isFinite(p.order) ? p.order : 100];
    };
    return (entries || []).slice().sort((a, b) => {
      const [pa, oa] = rank(a), [pb, ob] = rank(b);
      return pa !== pb ? pa - pb : oa - ob;
    });
  }

  // —— 世界书同步（单一副导演位；V0.3.0 合并双位配置）——————————————
  // 信息完整性优先：不做长度截断——缺信息导致的瞎编比长输入的稀释更危险
  async function getSyncedWorldbookText() {
    const sync = SETTINGS.worldSync || [];
    if (!sync.length) return '';
    const parts = [];
    for (const src of sync) {
      if (!src.book || !src.entries || !src.entries.length) continue;
      let entries;
      try { entries = await getWorldbook(src.book); }
      catch (e) { logWarn(`同步世界书读取失败：${src.book}`, e); continue; }
      const sorted = sortWorldbookEntries(entries);   // 酒馆上下文顺序（order），非 getWorldbook 原始顺序
      const wanted = new Set(src.entries);
      for (const e of sorted) {
        if (!e || !wanted.has(e.name)) continue;
        parts.push(`【${src.book} · ${e.name}】\n${String(e.content || '').trim()}`);
      }
    }
    return parts.join('\n\n');
  }

  // —— 副导演楼层上下文：最近 N 楼 AI 楼层原文（与正文 AI 视野一致，全量）—————————
  // N = SETTINGS.directorFloors（默认 20，对齐 LWB 总结窗口；0=全部历史）；
  // 楼层过滤三字段：is_user（玩家楼）/ is_system（/hide 隐藏楼——真机实证 0-11 楼即此标记）/ is_hidden
  function getShadowlineFloorContext() {
    const limit = Number.isFinite(SETTINGS.directorFloors) ? SETTINGS.directorFloors : 20;
    let floors = null;
    try {
      // 优先：SillyTavern.getContext().chat（原生消息数组引用；真机 SillyTavern.chat 顶层不存在）
      let chat = null;
      if (typeof SillyTavern !== 'undefined' && SillyTavern) {
        if (typeof SillyTavern.getContext === 'function') {
          const c = SillyTavern.getContext();
          if (c && Array.isArray(c.chat)) chat = c.chat;
        }
        if (!chat && Array.isArray(SillyTavern.chat)) chat = SillyTavern.chat;
      }
      if (Array.isArray(chat)) {
        floors = [];
        for (let i = 0; i < chat.length; i++) {
          const m = chat[i];
          if (!m || m.is_user || m.is_system || m.is_hidden) continue;
          const text = String(m.mes != null ? m.mes : (m.message || ''));
          if (!text.trim()) continue;
          floors.push({ id: i, text });
        }
      }
    } catch (e) { floors = null; }
    if (floors === null) {
      // 回退：getChatMessages（酒馆助手转换层；hide_state 过滤不含 is_system 楼，尽力而为）
      try {
        const msgs = getChatMessages('all', { role: 'assistant', hide_state: 'unhidden' });
        floors = (Array.isArray(msgs) ? msgs : [])
          .filter(m => m && m.message && String(m.message).trim() && m.is_hidden !== true)
          .map(m => ({ id: m.message_id, text: String(m.message) }));
      } catch (e) { floors = []; }
    }
    if (limit > 0) floors = floors.slice(-limit);
    return floors
      .map(f => `━━━━━━ 楼层 ${f.id} ━━━━━━\n${stripBlocks(f.text)}`)
      .join('\n\n');
  }

  // 剥代码块/状态栏/Combat_block（正文语境输入通用）
  function stripBlocks(text) {
    return String(text || '')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/<Status_block>[\s\S]*?<\/Status_block>/gi, '')
      .replace(/<Combat_block>[\s\S]*?<\/Combat_block>/gi, '');
  }

  // —— LWB 结构化总结（副导演的早期历史载体：正文 AI 视野里 20 楼之前就是这份总结）—————

  function getLwbSummaryText() {
    try {
      // chatMetadata 真机经 getContext() 暴露（顶层不一定有），两级兼容
      let meta = null;
      if (typeof SillyTavern !== 'undefined' && SillyTavern) {
        if (typeof SillyTavern.getContext === 'function') {
          const c = SillyTavern.getContext();
          if (c && c.chatMetadata) meta = c.chatMetadata;
        }
        if (!meta && SillyTavern.chatMetadata) meta = SillyTavern.chatMetadata;
      }
      const store = (meta && meta.extensions && meta.extensions.LittleWhiteBox
        && meta.extensions.LittleWhiteBox.storySummary) || null;
      if (!store || !store.json) return '';
      const data = store.json;
      const parts = [];
      if (Array.isArray(data.keywords) && data.keywords.length) {
        parts.push(`关键词：${data.keywords.map(k => k && k.text).filter(Boolean).join('、')}`);
      }
      if (Array.isArray(data.events) && data.events.length) {
        const lines = data.events.map(ev =>
          `${ev.timeLabel || ''}｜${ev.title || ''}：${ev.summary || ''}`);
        parts.push(`已发生事件（含楼层出处）：\n${lines.join('\n')}`);
      }
      return parts.join('\n\n');
    } catch (e) { return ''; }
  }

  // ═════════════════════════════════════════════════════════════════════
  // 6. 世界推演层（单一副导演 API）：触发矩阵 → 全量输入 → 推演 → 宽容校验 → 三路分发
  // ═════════════════════════════════════════════════════════════════════

  const Trigger = {
    busy: false,              // 推演生成中（并发触发直接跳过）
    busyReason: '',
    lastDateKey: '',          // 上次推演时的游戏内日期（跨日→强制推）
    lastStage: '',            // 上次推演时的剧情阶段（变更→强制推）
    lastCombatResult: '',     // 上次看到的 $rpg_combat_result 指纹（变化→强制推）
    lastFloorId: -1,          // 上次配发的楼层号（心跳计数去重）
    floorsSinceEvolve: 0,     // 上次推演以来的楼层数（≥directorEveryX → 心跳推演）
  };

  // —— 名册（$ad_roster：派系名册 + 墓碑；S5 才做 CRUD，S3 自动注册）—————

  function getRoster() {
    const r = readChatVar(CV.roster);
    if (r && Array.isArray(r.factions)) {
      return {
        factions: r.factions.map(String),
        tombstones: Array.isArray(r.tombstones) ? r.tombstones.map(String) : [],
        revealed: Array.isArray(r.revealed) ? r.revealed.map(String) : [],   // S4：玩家侧已知派系（接触即揭，单调）
        manual: Array.isArray(r.manual) ? r.manual.map(String) : [],          // S4：预输入来源（无"新面孔"标记）
        prompts: (r.prompts && typeof r.prompts === 'object' && !Array.isArray(r.prompts)) ? r.prompts : {},  // V0.4.4：派系钦定设定（名→文本）
      };
    }
    return { factions: [], tombstones: [], revealed: [], manual: [], prompts: {} };
  }
  function saveRoster(r) { writeChatVar(CV.roster, r); }

  // V0.4.4 派系钦定设定（作者钦定背景：定位/实力/认知边界——注入推演输入，压过默认铁律的自由推断）
  // 墓碑不清设定：恢复出墓时随之回来
  function setFactionPrompt(name, text) {
    name = String(name || '').trim();
    if (!name) { toast('派系名为空'); return false; }
    const roster = getRoster();
    if (!roster.factions.includes(name)) { toast('该派系不在名册中——先入册再设定'); return false; }
    text = String(text || '').trim();
    if (text) roster.prompts[name] = text;
    else delete roster.prompts[name];
    saveRoster(roster);
    log(text ? '派系钦定设定已保存：' + name : '派系钦定设定已清空：' + name);
    return true;
  }

  // —— S5 名册 CRUD（GM 生杀权：添加=轻量登场/预输入，删除=墓碑，恢复=出墓碑）———

  // 添加派系（预输入：MMS 固定名册同构——玩家已知，立即署名 + 永远有平静占位卡）
  function addRosterFaction(name) {
    name = String(name || '').trim();
    if (!name) { toast('派系名为空'); return false; }
    const roster = getRoster();
    if (roster.factions.includes(name)) { toast('名册中已存在'); return false; }
    if (roster.tombstones.includes(name)) { toast('该派系在墓碑中——先恢复再操作'); return false; }
    roster.factions.push(name);
    roster.manual.push(name);      // 预输入来源（区别于插件自动登记——不打"新面孔"标记）
    roster.revealed.push(name);    // 预输入派系 = 玩家已知，立即署名
    saveRoster(roster);
    log('名册登记（预输入）：', name);
    return true;
  }

  // 除名 = 墓碑：级联删该派系全部暗线（世界状态条目 + 提及它的事件/风声/阻力整条删——
  // 交叉暗线其他派系自身条目不动），废弃名单写入推演输入（【墓碑（禁止复活）】），词条即时重写
  function tombstoneFaction(name) {
    name = String(name || '').trim();
    if (!name) return false;
    const roster = getRoster();
    roster.factions = roster.factions.filter(f => f !== name);
    if (!roster.tombstones.includes(name)) roster.tombstones.push(name);
    saveRoster(roster);

    // 短名容错：条目常以核心名提及派系（"蒂莉的信使"而非"蒂莉（达令赫斯特）"）——全名或去括号核心名任一命中即算提及
    const core = name.replace(/[（(][^）)]*[）)]/g, '').trim();
    const mentions = v => {
      const s = String(v == null ? '' : (typeof v === 'string' ? v : JSON.stringify(v)));
      return s.includes(name) || (core.length >= 2 && core !== name && s.includes(core));
    };
    // 级联：世界状态——该派系条目 + 提及它的阻力整条删 + 事件中的该派系剔除（剔空删事件）+ 提及它的风声删
    const world = readChatVar(CV.world);
    if (world && Array.isArray(world.factions)) {
      const before = world.factions.length;
      world.factions = world.factions.filter(f => !(f && f.name === name));
      const res = world.resistance && typeof world.resistance === 'object' ? world.resistance : {};
      if (Array.isArray(res.forbidden)) res.forbidden = res.forbidden.filter(x => x && !mentions(x.truth) && !mentions(x.path));
      if (Array.isArray(res.partial)) res.partial = res.partial.filter(x => !mentions(x));
      if (Array.isArray(res.friction)) res.friction = res.friction.filter(x => !mentions(x));
      world.resistance = res;
      if (Array.isArray(world.events)) {
        world.events = world.events.map(ev => {
          if (!ev) return ev;
          if (mentions(ev.name) || mentions(ev.desc)) return null;   // 事件本身提及该派系：整条删
          if (Array.isArray(ev.factions)) {
            ev.factions = ev.factions.filter(f => f !== name && !mentions(f));
            return ev.factions.length ? ev : null;   // 涉及派系剔空：删
          }
          return ev;
        }).filter(Boolean);
      }
      if (Array.isArray(world.winds)) world.winds = world.winds.filter(w => w && !mentions(w.content) && !mentions(w.source));
      writeChatVar(CV.world, world);
      writeWbEntry(WB_ENTRY_DIRECTOR, buildDirectorInjection(world, State.lastLocationText));   // 词条即时重写（无该派系版本）
      renderWire();   // surface 报纸同步去该派系
      log(`墓碑：${name} 已除名（世界派系 ${before}→${world.factions.length} 条，事件/风声/阻力级联删除）`);
    }
    return true;
  }

  // 恢复：出墓碑回名册（报告内容已被级联删除——由下一轮推演重新覆盖）
  function restoreFaction(name) {
    name = String(name || '').trim();
    if (!name) return false;
    const roster = getRoster();
    if (!roster.tombstones.includes(name)) return false;
    roster.tombstones = roster.tombstones.filter(f => f !== name);
    if (!roster.factions.includes(name)) roster.factions.push(name);
    saveRoster(roster);
    log('墓碑恢复（回名册）：', name);
    return true;
  }

  // —— S4 接触判定（接触即揭 + 单调锁）———————————————————————
  // 玩家可见视野 = 非隐藏楼层原文 + LWB 早期总结 + 当前敌人名单；派系名（或去括号核心名）
  // 出现在任一即算已接触——正文提过就是玩家见过。已揭示名单存 $ad_roster.revealed，
  // 单调只增不减（旧楼被 LWB 隐藏/敌人名单轮换后不回退成灰卡）。
  // 返回 { roster, newly }：newly = 本拍新揭示（renderWire 用于金色揭幕闪动，仅首拍）。
  function syncRevealState() {
    const roster = getRoster();
    const pending = roster.factions.filter(n => !roster.revealed.includes(n) && !roster.tombstones.includes(n));
    if (!pending.length) return { roster, newly: [] };
    let vision = '';
    try {
      const stat = readLatestStatData() || {};
      vision = [getShadowlineFloorContext(), getLwbSummaryText(), JSON.stringify(stat['人物'] || {})].join('\n');
    } catch (e) { return { roster, newly: [] }; }
    const newly = [];
    for (const name of pending) {
      const core = name.replace(/[（(][^）)]*[）)]/g, '').trim();
      if (vision.includes(name) || (core.length >= 2 && core !== name && vision.includes(core))) {
        roster.revealed.push(name);
        newly.push(name);
      }
    }
    if (newly.length) saveRoster(roster);
    return { roster, newly };
  }

  // —— 触发矩阵（每楼 dispatchNow 末尾检查；去抖=新楼才检查 + busy 锁）—————
  // 心跳：每 directorEveryX 楼常规推演；强制推：战斗结果/跨日/阶段变化（高价值时机立即推）。

  function statDateKey(stat) {
    const parts = String(stat['日期和时间'] || '').replace(EMOJI_RE, '').split('·').map(s => s.trim());
    return parts.length >= 2 ? `${parts[0]}·${parts[1]}` : (parts[0] || '');
  }
  function statStage(stat) {
    const parts = String(stat['日期和时间'] || '').replace(EMOJI_RE, '').split('·').map(s => s.trim());
    return parts.length >= 3 ? parts[parts.length - 1] : '';
  }
  function statCity(stat) {
    const parts = norm(stat['地点']).split(/[·\-—]/).map(s => s.trim()).filter(Boolean);
    return parts[0] || '';
  }

  function checkTriggers(stat) {
    if (Trigger.busy) return;
    const firstRun = Trigger.lastFloorId === -1;
    const floorId = currentFloorId();
    if (floorId > Trigger.lastFloorId) {
      Trigger.floorsSinceEvolve++;
      Trigger.lastFloorId = floorId;
    }
    const dateKey = statDateKey(stat);
    const stage = statStage(stat);
    const combat = JSON.stringify(readChatVar('$rpg_combat_result') || null);
    const everyX = Number(SETTINGS.directorEveryX) > 0 ? Number(SETTINGS.directorEveryX) : 3;
    let reason = null;
    if (firstRun && !Trigger.lastDateKey) {
      // 首次记录基线，不触发（避免安装即推演；换聊天后同样只记基线）
    } else if (combat !== Trigger.lastCombatResult && combat !== 'null') reason = 'combat-result';
    else if (dateKey && dateKey !== Trigger.lastDateKey) reason = 'newday';
    else if (stage && stage !== Trigger.lastStage) reason = 'stage-change';
    else if (Trigger.floorsSinceEvolve >= everyX) reason = 'heartbeat';
    Trigger.lastDateKey = dateKey || Trigger.lastDateKey;
    Trigger.lastStage = stage || Trigger.lastStage;
    Trigger.lastCombatResult = combat;
    if (reason) generateDirectorEvolve(reason);
  }

  // —— 推演输入组装（信息完整性优先：数据源全量）———————————————

  async function buildDirectorContext(stat) {
    const [worldSync] = await Promise.all([getSyncedWorldbookText()]);
    const roster = getRoster();
    return {
      floorContext: getShadowlineFloorContext(),
      lwb: getLwbSummaryText(),
      worldSync,
      statData: stat,
      enemyPool: getEnemyPool(),   // 敌方阵营参考（正文 AI 自选具体敌人，名单仅供推演参考阵营构成）
      coreTeam: getCoreTeam(),
      extraRules: String(SETTINGS.extraRules || '').trim(),
      knownFactions: roster.factions, roster,
      factionPrompts: Object.keys(roster.prompts)   // V0.4.4：派系钦定设定（墓碑派系除外——禁止复活者不进输入）
        .filter(name => !roster.tombstones.includes(name) && String(roster.prompts[name] || '').trim())
        .map(name => [name, String(roster.prompts[name]).trim()]),
      lastWorld: readChatVar(CV.world) || null,   // 上次世界状态（含本地骰推进结果）——增量修订式推演
      pendingIncident: State.pendingIncident || null,   // S9：掷中待生成/失败重试的区域事件（指令段）
      activeIncident: (() => {
        const w = readChatVar(CV.world);
        return (w && w.incident && w.incident.active) ? w.incident : null;   // 活跃期（Ongoing 指令段）
      })(),
      pendingDistant: (() => {
        const w = readChatVar(CV.world);
        return (w && w.distant && w.distant.pending) ? w.distant : null;   // V0.4.0：远方回响挂起（指令段，区域事件之后）
      })(),
    };
  }

  // —— 默认提示词（预设系统的默认项指向此函数；自定义预设存其文本快照）—————

  function DEFAULT_DIRECTOR_SYS() {
    return [
      '你是开放世界的架构师、顶级权谋小说作家——为正文AI制造巫师3级别的叙事波折，而不是记录世界。你的产出是一份完整的世界状态 JSON（对【上次世界状态】做增量修订）。',
      '铁律：',
      '0. 认知定位：你的全部输出是你的推断与提案，不是既定事实——正文AI把它们当参考素材而非指令。三态诚实：延续上次的三态，前文明确演出过才标"已渗透"，真相落地才标"已兑现"，拿不准一律"推断中"。动笔前先为每个派系盘点它此刻实际知道什么、不知道什么——信息必须有渠道（接触、线人、公开报道）；无法确定它是否知道的，一律按不知道处理。你写的是克制的智者，不是无所不知的疯子。',
      '1. 反废话：严禁复述前文表层信息、玩家已知常识或主角团已推导的内容。除"从前文合理构思的报纸报道和街头传闻"可作事实引用外，其余全部写推断与设计；永远不顺水推舟写看似合理的废话。',
      '2. factions：每派系一条（键名用英文）：{"name":"派系名","surface":"公开征兆一句话（市民视角，报纸社会新闻体，须体现与其他派系的互动迹象，禁止内幕细节）","truth":"幕后真相：前文很可能未出现过的深层动机+由动机生长的具体行动","contact":"主角团已引起其注意时：派出接触的具体人物（姓名/代号+伪装身份+真实目的），否则空串","scheme":"为主角团设下的圈套（诱饵+真实杀招），无则空串","mole":"安插的间谍（优先选最无害、揭示时戏剧反转最大的人选；【主角核心白名单】人物严禁入选），无则空串","causes":["楼23"],"state":"推断中|已渗透|已兑现","stance":"对我方的立场一句话","relations":"与其他派系的关系一句话","zone":"活动大区（如 萨里山）","morale":"士气一句话"}。',
      '3. 圈套纪律：必须写明各派系当前动机和世界造成的可见迹象。优先保证戏剧冲突——一个派系有设下圈套的动机和能力，就让他这么做。各派系的圈套优先针对各自的核心对手，只有当前文已演出该派系注意到主角团（接触、情报渠道、利益交集）时，圈套才允许指向主角团，且必须写明它依据的情报来源。全员针对主角团=失败；无人有任何算计（白开水复读前文）=失败；世界在本次推演后无任何变化=失败。',
      '4. 尊重实力设定：主角团的前文战绩、背景靠山、警觉程度是硬约束。对实力强于己方或背景深厚的对象，忌惮的表达是回避、试探、借第三方出手、留后路，而不是正面挑衅与鲁莽对抗——敌意烈度必须匹配其掌握的情报与底气。把强者当无防备的工具人是廉价的阴谋论。',
      '5. 深层动机必须从派系既得利益与前文行为中合理生长——推断可以大胆，动机必须有根。墓碑名单中的派系禁止以任何形式复活或提及。',
      '6. 措辞紧凑：每项一句话以内，禁止铺陈细节与心理描写长篇。',
      '7. resistance：forbidden={truth 禁泄真相, path 正确获取途径, leak_cost 过早泄露毁掉什么}；partial=强行调查应得的部分信息或误导；friction=来自已登场势力动机的环境阻力。',
      '8. events 事件链：延续【上次世界状态】中未完结的事件（保留 name 与走向，除非剧情有明确理由改变——胜负、外力干预；已彻底了结的不再输出）；新事件在前文已有具体迹象时才创建（筹划/试探/矛盾初现即可萌芽，不要求证据充分）。结构：{"name":"事件名","type":"conflict|progress","stage":"萌芽|发酵|逼近|爆发|平息","stageRound":1-9,"level":1-4,"factions":["涉及派系名"],"zone":"无派系关联时填归属大区","desc":"一句话现状"}。程序会每楼掷骰推进 stageRound 与阶段，你只负责宏观修订与增删。',
      '9. winds 风声：信息开始公开发布/被听闻/转述/小范围议论即可建立（报纸报道、街头传闻、渠道消息）；延续上次未消散的风声（内容可演进）。结构：{"content":"一句话风声","source":"来源（如 悉尼晨报/码头工人）","spread":"私下|流传|公开","level":1-3}。去重，禁止复述 surface 已写的内容。',
      '10. encounter 遇敌概率：{"heat":{"value":-30~30的整数,"why":"剧情总体走向冲突为正、缓和为负，一句话"},"spots":[{"match":"地标名（如 伦道夫船运仓库）","chance":0-100,"why":"一句话"}],"districts":[{"match":"大区名（如 萨里山）","chance":0-100,"why":"一句话"}]}。spots 给剧情涉及的关键地标（民用/中立/己方据点 chance=0——0 是显式安全标记，程序见 0 直接免战）；districts 给主要大区的整体治安冷热。没把握的地方不给——程序会用玩家设置的基线概率兜底。',
      '11. 只输出 JSON，禁止任何解释文字。顶层 schema：{"digest":"世界现状一句话摘要","factions":[…],"events":[…],"winds":[…],"resistance":{"forbidden":[…],"partial":[…],"friction":[…]},"encounter":{…},"roster_ops":[]}',
    ].join('\n');
  }

  const DirectorPrompt = makePresetStore(LS.promptDirector, DEFAULT_DIRECTOR_SYS);

  function buildDirectorMessages(ctx) {
    const sys = DirectorPrompt.currentSys();
    const user = [
      // ① 世界书同步资料（按配置顺序）——推演的世界知识基础
      `【世界书同步资料】\n${ctx.worldSync || '（无）'}`,
      // ② LWB 早期历史总结——对应已被隐藏（总结）的早期楼层的浓缩
      `【早期历史总结（LWB，对应已隐藏的早期楼层）】\n${ctx.lwb || '（无）'}`,
      // ③ 非隐藏楼层原文——与正文 AI 视野一致（仅 AI 楼层，━━ 分隔严格排版）
      `【非隐藏楼层原文（与正文 AI 视野一致）】\n${ctx.floorContext || '（无）'}`,
      // ④ 以下为辅助信息——只管非玩家阵营：仅时空锚点与敌方动向，玩家队伍数值/资产/内心一律不发
      `【当前时空与敌方动向】\n${JSON.stringify({
        '日期和时间': ctx.statData['日期和时间'],
        '地点': ctx.statData['地点'],
        '敌方动向': (ctx.statData['人物'] && ctx.statData['人物']['敌人']) || [],
      }, null, 1)}`,
      // 敌方阵营参考（可选——为空时整块不显示，不给推演多余的"（无）"噪音）
      ...((ctx.enemyPool || []).length ? [`【敌方阵营参考（仅供推演参考，具体敌人由正文AI自选）】\n${ctx.enemyPool.join(' / ')}`] : []),
      `【主角核心白名单（绝不背叛、绝不可能是间谍）】\n${(ctx.coreTeam || []).join(' / ') || '（未设置——正文长期塑造的核心同伴也可能被指定为间谍，建议在设置中填写）'}`,
      `【名册（已知派系）】\n${ctx.knownFactions.join(' / ') || '（无）'}`,
      // V0.4.4 派系钦定设定——作者钦定的定位/实力/认知边界，压过默认铁律的自由推断（无设定整块省略）
      ...((ctx.factionPrompts || []).length ? [`【派系钦定设定（作者钦定背景：该派系的定位/实力/认知边界以此为准，优先级高于本文默认规则；未覆盖的字段仍按默认铁律推演）】\n${ctx.factionPrompts.map(([n, t]) => `◆ ${n}：${t}`).join('\n')}`] : []),
      `【墓碑（禁止复活）】\n${ctx.roster.tombstones.join(' / ') || '（无）'}`,
      // ⑨ 上次世界状态——增量修订的基线（含程序本地骰已推进的事件进度）
      `【上次世界状态（增量修订基线：延续未完结事件/未消散风声/三态）】\n${ctx.lastWorld ? JSON.stringify(ctx.lastWorld, null, 1) : '（首次推演——从零建立）'}`,
      // ⑨b 区域突发事件指令段（S9）：掷中/重试 → 强制生成指令；活跃期 → 延续余波指令（互斥）
      ...(ctx.pendingIncident ? [buildIncidentDirective(ctx.pendingIncident)]
        : (ctx.activeIncident ? [buildIncidentOngoing(ctx.activeIncident)] : [])),
      // ⑨c 远方回响指令段（V0.4.0）：与区域事件指令段互斥（掷中/活跃期优先），远方顺延到空闲轮
      ...(!(ctx.pendingIncident || ctx.activeIncident) && ctx.pendingDistant ? [buildDistantDirective(ctx.pendingDistant)] : []),
      // ⑩ 附加铁律（用户手输，最高优先级）——放文末：末尾注意力区块，压过前文的默认规则
      ...(ctx.extraRules ? [`【附加铁律（用户指定，优先级高于本文所有默认规则）】\n${ctx.extraRules}`] : []),
    ].join('\n\n');
    return [{ role: 'system', content: sys }, { role: 'user', content: user }];
  }

  // —— 推演硬校验（宽容模式：只做结构整形与字段补默认，不丢弃、不重试）—————————

  const TRI_STATES = ['推断中', '已渗透', '已兑现'];
  const EV_TYPES = ['conflict', 'progress'];
  const WIND_SPREADS = ['私下', '流传', '公开'];

  function validateWorld(parsed, ctx) {
    if (!parsed || typeof parsed !== 'object') return { world: null, errs: ['输出非对象'] };
    const errs = [];
    const pick = (o, ...keys) => {
      if (!o || typeof o !== 'object') return undefined;
      for (const k of keys) if (o[k] != null && o[k] !== '') return o[k];
      return undefined;
    };
    const lastWorld = (ctx && ctx.lastWorld) || null;
    const lastEvents = lastWorld && Array.isArray(lastWorld.events) ? lastWorld.events : [];
    const lastWinds = lastWorld && Array.isArray(lastWorld.winds) ? lastWorld.winds : [];

    // factions：沿用暗线三态宽容清洗 + 新增关系四字段
    let factions = (parsed.factions || []).map((f, i) => {
      f = (f && typeof f === 'object') ? f : {};
      f.name = pick(f, 'name', '派系', '名称') || `未命名派系${i + 1}`;
      f.truth = pick(f, 'truth', '真相') || '（真相未明）';
      f.surface = pick(f, 'surface', '征兆', '表面') || '（街头暂无可察异动）';
      const rawCauses = pick(f, 'causes', '出处');
      f.causes = (Array.isArray(rawCauses) && rawCauses.length) ? rawCauses : ['（出处未标注）'];
      const rawState = pick(f, 'state', '状态');
      f.state = TRI_STATES.includes(rawState) ? rawState : '推断中';
      f.contact = String(pick(f, 'contact', '接触', '接触人') || '');
      f.scheme = String(pick(f, 'scheme', '圈套') || '');
      f.mole = String(pick(f, 'mole', '间谍', '内线') || '');
      f.stance = String(pick(f, 'stance', '立场') || '');
      f.relations = String(pick(f, 'relations', '关系') || '');
      f.zone = String(pick(f, 'zone', '大区', '活动范围') || '');
      f.morale = String(pick(f, 'morale', '士气') || '');
      return f;
    });
    // 墓碑过滤（程序兜底，SPEC §4.4 删除=墓碑）：模型违反铁律输出墓碑派系时整条丢弃
    const dead = (ctx && ctx.roster && Array.isArray(ctx.roster.tombstones)) ? ctx.roster.tombstones : [];
    if (dead.length) {
      const dropped = factions.filter(f => dead.includes(f.name)).map(f => f.name);
      if (dropped.length) {
        factions = factions.filter(f => !dead.includes(f.name));
        logWarn('墓碑派系条目已丢弃（禁止复活）：', dropped.join('、'));
      }
    }

    // events：类型/阶段/进度校验 + 上次事件延续兜底（模型忘带 stage/stageRound 时继承）
    const events = (Array.isArray(parsed.events) ? parsed.events : []).map(ev => {
      ev = (ev && typeof ev === 'object') ? ev : {};
      const name = String(pick(ev, 'name', '事件', '名称') || '').trim();
      if (!name) return null;
      const prev = lastEvents.find(x => x && x.name === name);
      const type = EV_TYPES.includes(ev.type) ? ev.type : (prev && EV_TYPES.includes(prev.type) ? prev.type : 'conflict');
      const stage = EV_STAGES.includes(ev.stage) ? ev.stage : (prev && EV_STAGES.includes(prev.stage) ? prev.stage : '萌芽');
      let stageRound = Number(ev.stageRound);
      if (!Number.isFinite(stageRound) || stageRound < 1 || stageRound > 9) stageRound = (prev && prev.stageRound) || 1;
      return {
        name, type, stage, stageRound,
        level: clamp(1, 4, Number(ev.level) || 1),
        factions: (Array.isArray(ev.factions) ? ev.factions : []).map(String).filter(Boolean),
        zone: String(ev.zone || '').trim(),
        desc: String(pick(ev, 'desc', '描述', '现状') || ''),
        distance: prev && prev.distance === true ? true : undefined,   // V0.4.0：远方标记继承（防 validateWorld 重建丢标）
      };
    }).filter(Boolean);

    // winds：传播等级校验 + 延续继承 quietRounds（否则每次推演重置计数，风声永不衰减）
    const winds = (Array.isArray(parsed.winds) ? parsed.winds : []).map(w => {
      w = (w && typeof w === 'object') ? w : {};
      const content = String(pick(w, 'content', '风声', '内容') || '').trim();
      if (!content) return null;
      const nc = norm(content);
      const prev = lastWinds.find(x => x && norm(x.content) && (norm(x.content) === nc || norm(x.content).includes(nc) || nc.includes(norm(x.content))));
      return {
        content,
        source: String(pick(w, 'source', '来源') || ''),
        spread: WIND_SPREADS.includes(w.spread) ? w.spread : '流传',
        level: clamp(1, 3, Number(w.level) || 1),
        quietRounds: prev ? (prev.quietRounds || 0) : 0,
        distance: prev && prev.distance === true ? true : undefined,   // V0.4.0：远方标记继承
      };
    }).filter(Boolean);

    // encounter：heat clamp ±30；spots/districts 数组清洗 + chance clamp 0-100
    const rawEnc = parsed.encounter && typeof parsed.encounter === 'object' ? parsed.encounter : {};
    const rawHeat = rawEnc.heat && typeof rawEnc.heat === 'object' ? rawEnc.heat : {};
    const zoneList = arr => (Array.isArray(arr) ? arr : [])
      .map(z => (z && typeof z === 'object' && String(z.match || '').trim())
        ? { match: String(z.match).trim(), chance: clamp(0, 100, Number(z.chance) || 0), why: String(z.why || '') }
        : null)
      .filter(Boolean);
    const encounter = {
      heat: { value: clamp(-30, 30, Number(rawHeat.value) || 0), why: String(rawHeat.why || '') },
      spots: zoneList(rawEnc.spots),
      districts: zoneList(rawEnc.districts),
    };

    // resistance：沿用原清洗（对象条目容错）
    const resistance = parsed.resistance && typeof parsed.resistance === 'object' ? parsed.resistance : {};
    resistance.forbidden = (resistance.forbidden || []).filter(x => x && x.truth && x.path);
    const plainText = (x, keys) => {
      if (x == null) return '';
      if (typeof x === 'string') return x.trim();
      if (typeof x === 'object' && !Array.isArray(x)) {
        const parts = keys.filter(k => x[k] != null && x[k] !== '').map(k => String(x[k]));
        const s = parts.length ? parts : Object.values(x).filter(v => typeof v === 'string');
        return s.join('：');
      }
      return String(x);
    };
    resistance.partial = (resistance.partial || []).map(x => plainText(x, ['target', 'result'])).filter(Boolean);
    resistance.friction = (resistance.friction || []).map(x => plainText(x, ['source', 'effect'])).filter(Boolean);

    return {
      world: {
        round: (lastWorld && Number.isFinite(lastWorld.round) ? lastWorld.round : 0) + 1,
        digest: String(parsed.digest || ''),
        factions, events, winds, resistance, encounter,
        roster_ops: (parsed.roster_ops || []).map(String).filter(Boolean),
        generatedAt: Date.now(), reason: Trigger.busyReason || '',
      }, errs,
    };
  }

  // —— 世界动态注入（副导演词条后半：事件/风声/派系暗线三态，推演与本地骰后刷新）———

  function buildDirectorInjection(world, _locationText) {
    // 定位声明放开标签之后：副导演输出是推断与提案，正文AI参考演出而非执行——防按头
    // 派系行尾缀：接触人/圈套/间谍（非空才带——正文 AI 可借环境渗透演出，间谍揭示节奏由三态+禁泄控制）
    const extra = f => [
      f.contact && `｜接触：${f.contact}`,
      f.scheme && `｜圈套：${f.scheme}`,
      f.mole && `｜间谍：${f.mole}`,
    ].filter(Boolean).join('');
    // 段落 = [标签名, 列表行]；标签内两空格缩进 "- " 列表，段间空行
    const sections = [];
    const inc = (world.incident && world.incident.active) ? world.incident : null;
    if (inc) {
      sections.push(['区域动态', [
        `  - ⚠ ${inc.title || '未命名区域事件'}${inc.type ? `（${inc.type}）` : ''}·范围：${inc.zone || '未知'}·剩余 ${inc.duration || 1} 楼——${inc.impact || ''}`,
      ]]);
    }
    const events = (world.events || []).filter(ev => ev && ev.stage !== '平息');
    if (events.length) {
      sections.push(['进行中的事件', events.map(ev =>
        `  - ${ev.name}【${ev.type === 'progress' ? '进展' : '冲突'}·${ev.stage}·${ev.stageRound}/9】${ev.desc || ''}`)]);
    }
    if (world.winds && world.winds.length) {
      sections.push(['风声', world.winds.map(w =>
        `  - ${w.content}（${w.spread}${w.source ? '·' + w.source : ''}）`)]);
    }
    const facts = (world.factions || []).filter(f => f.state !== '推断中');
    if (facts.length) {
      sections.push(['世界引擎推断', facts.map(f =>
        `  - ${f.truth}【${f.state}·${(f.causes || [])[0] || ''}】${extra(f)}`)]);
    }
    const infers = (world.factions || []).filter(f => f.state === '推断中');
    if (infers.length) {
      sections.push(['幕后动向', infers.map(f =>
        `  - ${f.truth}【推断·${(f.causes || [])[0] || ''}】${extra(f)}`)]);
    }
    const forbidden = (world.resistance && world.resistance.forbidden) || [];
    if (forbidden.length) {
      sections.push(['禁泄清单', forbidden.map(x =>
        `  - ${x.truth}【途径：${x.path}】`)]);
    }
    const partial = (world.resistance && world.resistance.partial) || [];
    if (partial.length) {
      sections.push(['调查阻力', partial.map(p => `  - ${p}`)]);
    }
    const friction = (world.resistance && world.resistance.friction) || [];
    if (friction.length) {
      sections.push(['环境阻力', friction.map(f => `  - ${f}`)]);
    }
    const body = sections.map(([tag, items]) => `<${tag}>\n${items.join('\n')}\n</${tag}>`).join('\n\n');
    return [
      MEMO_OPEN,
      '',
      '以下是副导演世界引擎的推断——用于环境渗透、NPC 行为自洽与剧情伏笔参考，正文按合理性自由取舍。',
      '注意：像专业的小说作者一样自然融入故事，不要以上帝视角告知玩家。',
      '',
      body,
      '',
      MEMO_CLOSE,
    ].join('\n');
  }

  // —— 推演主流程（单一副导演 API）———————————————————————————

  async function generateDirectorEvolve(reason) {
    if (Trigger.busy) { toast('📡 推演进行中，请稍候（上次任务未完成）'); return; }
    if (!SETTINGS.enabledDirector) {
      if (reason === 'manual') toast('世界推演已关闭——⚙ 设置 → 功能开关');
      log(`推演开关关闭，跳过${reason}触发`);
      return;
    }
    const cfg = SETTINGS.director;
    if (!cfg.baseUrl || !cfg.model) {
      log(`副导演 API 未配置，跳过${reason}触发`);
      toast('副导演 API 未配置——⚙ 设置 → 副导演 API（Base URL / Model）');
      return;
    }
    Trigger.busy = true; Trigger.busyReason = reason;
    if (reason === 'manual') toast('📡 副导演推演已启动…完成后自动弹出世界状态');
    try {
      const stat = readLatestStatData();
      if (!stat) { log('推演触发但无 stat_data，跳过'); return; }
      const locationText = String(stat['地点'] || '').trim();
      const ctx = await buildDirectorContext(stat);
      const messages = buildDirectorMessages(ctx);
      // 调用 + 解析：仅当完全拿不到 JSON（网络失败/输出非 JSON——token 无法利用）才重试一次；
      // 解析成功后无论校验提示多少条都宽容落地，绝不因校验丢弃整份状态浪费 token
      let parsed = null, lastErr = '';
      for (let attempt = 1; attempt <= 2 && !parsed; attempt++) {
        try {
          const raw = await callLLM(cfg, messages, { timeoutMs: 180000, label: 'director' });
          parsed = extractJson(raw);
        } catch (e) {
          lastErr = e.message || String(e);
          logWarn(`世界推演第 ${attempt} 次调用失败：${lastErr}`);
          if (attempt === 1) toast('📡 首次调用失败，重试中…', 4000);
        }
      }
      if (!parsed) {
        logWarn(`世界推演最终失败（保持上次状态）：${lastErr}`);
        toast(`世界推演失败：${lastErr}`, 6000);
        return;
      }
      const { world, errs } = validateWorld(parsed, ctx);
      if (errs.length) logWarn('推演宽容提示（条目已保留）：', errs.join('；'));
      if (!world) { toast('世界推演失败：输出结构异常', 6000); return; }
      if (!world.factions.length) logWarn('推演 factions 为空——已存档落地（不重试不丢弃）');
      // S8 checkpoint：写入新世界前快照旧世界（楼层回退时回滚）；新世界记楼层锚点
      const prevWorld = readChatVar(CV.world);
      if (prevWorld && Array.isArray(prevWorld.factions)) writeChatVar(CV.worldCheckpoint, prevWorld);
      world.floorId = currentFloorId();   // 回滚检测锚点（-1=拿不到楼号 → 永不触发回滚，安全）
      // S9：活跃区域事件从旧世界继承（validateWorld 构造的是全新对象——不继承会丢事件），
      // 随后 mergeIncident 决定覆盖（本次掷中回执）或保留
      if (prevWorld && prevWorld.incident) world.incident = prevWorld.incident;
      if (prevWorld && prevWorld.distant) world.distant = prevWorld.distant;   // V0.4.0：远方回响状态继承
      mergeIncident(world, parsed);
      acceptDistantEcho(world, prevWorld, parsed);   // V0.4.0：远方回响回执（读原始 parsed 的标记对象）
      recordLedger(prevWorld, world, world.floorId);   // V0.4.0：账本 diff 入账
      pushHistory('evolve', { reason, round: world.round, digest: world.digest || '',
        factions: world.factions.length, events: world.events.length, winds: world.winds.length,
        changes: diffWorld(prevWorld, world) });
      // 存档 + 分发
      writeChatVar(CV.world, world);
      // 名册自动注册（新派系轻量登场；墓碑派系绝不回册——即使模型违反铁律输出）
      const roster = getRoster();
      for (const f of world.factions) if (!roster.factions.includes(f.name) && !roster.tombstones.includes(f.name)) roster.factions.push(f.name);
      for (const op of world.roster_ops) if (op && !roster.factions.includes(op) && !roster.tombstones.includes(op)) roster.factions.push(op);
      saveRoster(roster);
      // 防连战锁解锁：新推演周期开始
      if (State.randomCombatFired) { State.randomCombatFired = false; persistRuntimeState(); }
      // 提炼注入（信号级态势 + 世界动态；用户改过词条内容走 merge3 合并兜底）
      if (locationText) {
        writeWbEntry(WB_ENTRY_DIRECTOR, buildDirectorInjection(world, locationText) + '\n\n' + buildDirectorSituationText(locationText, world));
      }
      Trigger.floorsSinceEvolve = 0;
      Trigger.lastDateKey = statDateKey(stat) || Trigger.lastDateKey;
      Trigger.lastStage = statStage(stat) || Trigger.lastStage;
      // ticker：四类轮播条目重建 + 已更新类别置顶（V0.4.3：优先播放已更新内容）
      {
        const pins = [];
        const changed = (a, b, keyFn) => JSON.stringify((a || []).map(keyFn)) !== JSON.stringify((b || []).map(keyFn));
        if (!prevWorld) pins.push('situation', 'paper', 'events', 'winds');   // 首推全更新
        else {
          if ((prevWorld.digest || '') !== (world.digest || '')) pins.push('situation');
          if (changed(prevWorld.factions, world.factions, f => [f && f.name, f && f.surface, f && f.state])) pins.push('paper');
          if (changed(prevWorld.events, world.events, e => [e && e.name, e && e.stage, e && e.stageRound])) pins.push('events');
          if (changed(prevWorld.winds, world.winds, w => w && w.content)) pins.push('winds');
        }
        State.tickerPins = pins;
        State.tickerItems = buildTickerItems(world, locationText, pins);
        persistRuntimeState();   // 推演产生的 pins/条目立即落盘（V0.4.2 教训：不能等下一次 dispatch）
        renderTicker();
      }
      renderWire();   // 事件/风声/灰卡即时上报纸
      if (els.dot) els.dot.classList.add('on');
      toast(`世界状态已更新（${reason}）：${world.factions.length} 派系 · ${world.events.length} 事件 · ${world.winds.length} 风声`);
      log('世界推演完成', `round ${world.round}，派系 ${world.factions.length}，事件 ${world.events.length}，风声 ${world.winds.length}`);
      openWorldModal(world);   // GM 查看弹窗（手动/自动触发均弹出）
    } finally {
      Trigger.busy = false; Trigger.busyReason = '';
    }
  }

  // ═════════════════════════════════════════════════════════════════════
  // 7. 随机遭遇掷骰（见分区 2 的 S6 区块；此处保留分区号占位对齐 SPEC 索引）
  // ═════════════════════════════════════════════════════════════════════

  // ═════════════════════════════════════════════════════════════════════
  // 8. 公开层 UI（贴边折叠栏，自 demo_story_director.html 移植）
  // ═════════════════════════════════════════════════════════════════════

  // 挂载目标：酒馆助手的全局脚本运行在隐藏 iframe 里（Iframe.vue v-show=false），
  // UI 必须挂到主页面 document 才可见；harness/直开页面时 window===parent 走 document。
  const UI_DOC = (window !== window.parent && window.parent && window.parent.document)
    ? window.parent.document
    : document;

  const UI_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Courier+Prime:ital,wght@0,400;0,700;1,400&family=Noto+Serif+SC:wght@400;600;700;900&family=Playfair+Display:ital,wght@0,600;0,800;0,900;1,400&display=swap');

  /* ── 主题变量：slate（MMS 深色基因）── */
  #ad-rail, #ad-panel, #ad-modal, .ad-toast {
    --ad-bg: linear-gradient(180deg, rgba(15,23,42,0.96), rgba(2,6,23,0.96));
    --ad-box-bg: #0f172a;
    --ad-overlay: rgba(2,6,23,0.72);
    --ad-input-bg: rgba(30,41,59,0.7);
    --ad-border: rgba(148,163,184,0.28);
    --ad-panel-border: 1px solid rgba(148,163,184,0.28);
    --ad-ink: #cbd5e1; --ad-ink-strong: #e2e8f0;
    --ad-ink-dim: #94a3b8; --ad-ink-faint: #64748b;
    --ad-accent: #fbbf24; --ad-accent-bright: #fde68a;
    --ad-accent-dim: rgba(251,191,36,0.55); --ad-accent-faint: rgba(251,191,36,0.14);
    --ad-line: rgba(148,163,184,0.14); --ad-line-strong: rgba(148,163,184,0.28);
    --ad-hit: rgba(251,191,36,0.06); --ad-safe: #4ade80;
    --ad-scroll: rgba(148,163,184,0.25);
    --ad-shadow: -18px 0 48px rgba(0,0,0,0.5);
    --ad-font: 'Courier New', 'SimSun', monospace;
    --ad-radius: 10px; --ad-radius-sm: 5px;
  }
  /* ── 主题：paper（方案 A：1920s 阿卡姆晨报 · 经典时代大报版）── */
  #ad-rail.ad-theme-paper, #ad-panel.ad-theme-paper, #ad-modal.ad-theme-paper, .ad-toast.ad-theme-paper {
    --ad-bg: radial-gradient(circle at 50% 50%, rgba(255,255,255,0.4) 0%, rgba(220,205,175,0.3) 100%), repeating-linear-gradient(0deg, #f4eedb, #f4eedb 2px, #f0e6ce 2px, #f0e6ce 4px);
    --ad-box-bg: #f4eedb;
    --ad-overlay: rgba(43,27,14,0.55);
    --ad-input-bg: rgba(255,250,235,0.9);
    --ad-border: #3a3028;
    --ad-panel-border: 3px solid #1a1614;
    --ad-ink: #2b241e; --ad-ink-strong: #1a1614;
    --ad-ink-dim: #5e5145; --ad-ink-faint: #8a7b6c;
    --ad-accent: #8b1e1e; --ad-accent-bright: #a82424;
    --ad-accent-dim: rgba(139,30,30,0.6); --ad-accent-faint: rgba(139,30,30,0.12);
    --ad-line: #c4b59d; --ad-line-strong: #3a3028;
    --ad-hit: rgba(139,30,30,0.06); --ad-safe: #2f4f3a;
    --ad-scroll: #b8a890;
    --ad-shadow: -14px 0 45px rgba(20,12,6,0.4), inset 0 0 80px rgba(120,90,40,0.12);
    --ad-font: 'Playfair Display', 'Noto Serif SC', 'Newsreader', Georgia, serif;
    --ad-radius: 0px; --ad-radius-sm: 0px;
  }
  /* paper 报纸语汇：双线报头 / 虚线账目 / 菱形项目符号 / 报头双耳 / 题头 */
  .ad-theme-paper .ad-head {
    border-bottom: 4px double var(--ad-line-strong);
    background: rgba(244, 238, 219, 0.95);
    padding: 26px 14px 8px;
    position: relative;
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
  }
  .ad-theme-paper .ad-head-ears {
    display: flex; justify-content: space-between; align-items: center;
    border-bottom: 1px solid var(--ad-line-strong); padding-bottom: 3px; margin-bottom: 2px;
    font-size: 8.5px; letter-spacing: 1px; color: var(--ad-ink-dim); text-transform: uppercase;
    font-family: 'Courier Prime', 'Courier New', monospace;
  }
  .ad-theme-paper .ad-head-ears .ear-motto { font-style: italic; color: var(--ad-accent); font-family: var(--ad-font); }
  .ad-theme-paper .ad-head-main {
    display: block; position: relative; width: 100%; text-align: center; margin: 2px 0;
  }
  .ad-theme-paper .ad-head-info { display: none; }
  .ad-theme-paper .ad-head-title {
    font-size: 20px; font-weight: 900; letter-spacing: 3.5px; color: var(--ad-ink-strong);
    text-transform: uppercase; line-height: 1.15; text-align: center; width: 100%;
    text-shadow: 1px 1px 0 rgba(255,255,255,0.8);
    font-family: 'Playfair Display', 'Noto Serif SC', serif;
    margin: 2px 0 3px;
  }
  .ad-theme-paper .ad-head-btns {
    position: absolute; right: 3px; top: 3px; z-index: 20; display: flex; gap: 3px;
  }
  .ad-theme-paper .ad-head-btns button {
    background: rgba(244, 238, 219, 0.9); border: 1px solid var(--ad-line-strong);
    border-radius: 2px; color: var(--ad-ink-dim); padding: 1px 4px; font-size: 11px;
    line-height: 1.2; cursor: pointer; transition: all .15s;
  }
  .ad-theme-paper .ad-head-btns button:hover {
    background: var(--ad-accent); color: #fff; border-color: var(--ad-accent);
  }
  .ad-theme-paper .ad-head-sub {
    display: flex; justify-content: space-between; align-items: center;
    border-top: 1px solid var(--ad-line-strong); border-bottom: 1px solid var(--ad-line-strong);
    padding: 3px 6px; margin-top: 2px; font-size: 9.5px; letter-spacing: 1.5px;
    font-family: 'Courier Prime', 'Courier New', monospace; color: var(--ad-ink-strong);
  }
  .ad-theme-paper .ad-head-sub .stage { color: var(--ad-accent); font-weight: bold; }
  .ad-theme-paper .ad-nowline.ad-lead-box {
    border: 1px solid var(--ad-line-strong); border-left: 4px solid var(--ad-accent);
    background: rgba(235, 225, 200, 0.7); margin: 9px 12px 6px; padding: 8px 12px;
    border-radius: 0; box-shadow: 0 1px 4px rgba(0,0,0,0.05); position: relative;
    white-space: normal; overflow: visible; text-overflow: clip; flex: none;
  }
  .ad-theme-paper .ad-lead-stamp {
    position: absolute; right: 8px; top: 7px; transform: rotate(6deg);
    border: 1.5px solid var(--ad-accent); color: var(--ad-accent); font-family: 'Courier Prime', monospace;
    font-size: 7.5px; font-weight: bold; padding: 1px 5px; letter-spacing: 1px; opacity: 0.85; pointer-events: none;
  }
  .ad-theme-paper .ad-lead-eyebrow {
    font-family: 'Courier Prime', monospace; font-size: 8.5px; letter-spacing: 1.5px;
    color: var(--ad-accent); text-transform: uppercase; font-weight: bold; margin-bottom: 3px;
  }
  .ad-theme-paper .ad-lead-title {
    font-size: 13.5px; font-weight: 800; color: var(--ad-ink-strong); margin-bottom: 4px;
    font-family: 'Playfair Display', 'Noto Serif SC', serif; line-height: 1.3;
  }
  .ad-theme-paper .ad-lead-body {
    font-size: 11px; line-height: 1.6; color: var(--ad-ink); text-align: justify;
  }
  .ad-theme-paper .ad-item {
    border-bottom: 1px solid var(--ad-line); padding: 9px 12px 11px;
  }
  .ad-theme-paper .ad-item.hit {
    background: rgba(139, 30, 30, 0.05);
    border-left: 3px solid var(--ad-accent);
  }
  .ad-theme-paper .ad-item-header {
    display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 3px;
  }
  .ad-theme-paper .ad-item-kicker {
    font-family: 'Courier Prime', monospace; font-size: 8.5px; letter-spacing: 1px;
    color: var(--ad-ink-dim); text-transform: uppercase;
  }
  .ad-theme-paper .ad-item-alert {
    font-family: 'Courier Prime', monospace; font-size: 8.5px; font-weight: bold;
    padding: 1px 5px; border: 1px solid var(--ad-line-strong); background: #ede3cc; color: var(--ad-ink-strong);
    border-radius: 0px;
  }
  .ad-theme-paper .ad-item-alert.hot {
    background: var(--ad-accent); color: #fff; border-color: var(--ad-accent);
  }
  .ad-theme-paper .ad-item-alert.safe {
    background: #e2edd9; color: var(--ad-safe); border-color: var(--ad-safe);
  }
  .ad-theme-paper .ad-item-title {
    font-family: 'Playfair Display', 'Noto Serif SC', serif; font-size: 13.5px; font-weight: 700;
    color: var(--ad-ink-strong); line-height: 1.35; margin-bottom: 4px;
  }
  .ad-theme-paper .ad-item-title::before {
    content: '◆ '; font-size: 9px; color: var(--ad-accent); vertical-align: 1px;
  }
  .ad-theme-paper .ad-item-place { font-weight: 700; color: var(--ad-ink-strong); }
  .ad-theme-paper .ad-item-title .menu { font-weight: normal; color: var(--ad-ink); font-size: 12px; }
  .ad-theme-paper .ad-item-reaction {
    font-size: 11px; line-height: 1.65; color: var(--ad-ink); text-align: justify; margin-top: 3px;
  }
  .ad-theme-paper .ad-item-sub-wire {
    margin-top: 6px; padding-left: 8px; border-left: 2px solid var(--ad-line);
    font-size: 10px; color: var(--ad-ink-dim); line-height: 1.55; font-style: italic;
    font-family: 'Playfair Display', 'Noto Serif SC', serif;
  }
  .ad-theme-paper .ad-colophon {
    display: block; border-top: 3px double var(--ad-line-strong); padding: 7px 14px; font-size: 8.5px;
    letter-spacing: 1px; color: var(--ad-ink-dim); text-align: center;
    background: rgba(244, 238, 219, 0.95); flex: none; font-family: 'Courier Prime', 'Courier New', monospace;
  }
  .ad-theme-paper .ad-colophon b { color: var(--ad-accent); font-weight: bold; }
  /* paper 报纸栏目导航：报头双线下的一行栏目签，激活项红底白字（老报纸栏目感） */
  .ad-theme-paper .ad-tabs { border-bottom: 2px double var(--ad-line-strong); background: rgba(244, 238, 219, 0.95); }
  .ad-theme-paper .ad-tab { font-family: 'Courier Prime', 'Courier New', monospace; text-transform: uppercase;
    letter-spacing: 2px; font-size: 9px; padding: 5px 4px 4px; }
  .ad-theme-paper .ad-tab.active { background: var(--ad-accent); color: #fff; box-shadow: none; }
  .ad-theme-paper .ad-tab.active:hover { background: var(--ad-accent-bright); }
  .ad-theme-paper .ad-modal-box h3 { letter-spacing: 6px; border-bottom: 2px solid var(--ad-line-strong); }

  #ad-rail { position: fixed; right: 0; top: 28%; width: 32px; z-index: 99990;
    background: var(--ad-bg); border: var(--ad-panel-border); border-right: none;
    border-radius: var(--ad-radius) 0 0 var(--ad-radius); display: flex; flex-direction: column; align-items: center;
    cursor: pointer; user-select: none; padding: 9px 0 7px;
    transition: width .25s ease, box-shadow .3s ease; }
  #ad-rail:hover { box-shadow: -6px 0 24px var(--ad-accent-faint); }
  #ad-rail:hover .ad-rail-star { color: var(--ad-accent); }
  .ad-rail-star { font-size: 12px; line-height: 1; color: var(--ad-accent-dim);
    padding-bottom: 5px; transition: color .25s; }
  #ad-rail-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--ad-accent);
    opacity: 0; transition: opacity .3s; box-shadow: 0 0 8px var(--ad-accent-dim);
    animation: ad-dot-pulse 1.6s ease-in-out infinite; }
  #ad-rail-dot.on { opacity: 1; }
  @keyframes ad-dot-pulse { 0%,100% { transform: scale(1); box-shadow: 0 0 4px var(--ad-accent-dim);} 50% { transform: scale(1.5); box-shadow: 0 0 12px var(--ad-accent-dim);} }
  .ad-rail-ticker { height: 26vh; overflow: hidden; margin-top: 8px; width: 100%; position: relative;
    mask-image: linear-gradient(180deg, transparent, #000 18%, #000 82%, transparent);
    -webkit-mask-image: linear-gradient(180deg, transparent, #000 18%, #000 82%, transparent); }
  #ad-rail.empty .ad-rail-ticker { display: none; }
  .ad-rail-ticker ul { list-style: none; position: absolute; left: 0; right: 0; margin: 0; padding: 0;
    animation: ad-tick 14s linear infinite; }
  @keyframes ad-tick { from { transform: translateY(0); } to { transform: translateY(-50%); } }
  .ad-rail-ticker li { writing-mode: vertical-rl; letter-spacing: 3px; font-size: 9px;
    color: var(--ad-ink-dim); padding: 0 0 16px 0; display: block; margin: 0 auto; width: 16px; }
  .ad-rail-ticker li:first-child { color: var(--ad-accent-bright); }

  #ad-panel { position: fixed; right: -430px; top: 4vh; bottom: 4vh; width: 390px; z-index: 99995;
    background: var(--ad-bg); border: var(--ad-panel-border); border-right: none;
    border-radius: var(--ad-radius) 0 0 var(--ad-radius); box-shadow: var(--ad-shadow);
    display: flex; flex-direction: column; font-family: var(--ad-font); color: var(--ad-ink);
    transition: right .38s cubic-bezier(0.22, 1, 0.36, 1); }
  #ad-panel.open { right: 0; }
  /* 报头基础布局（GM 按钮独立顶条：绝对定位至报头最右上，不再与标题同行遮挡） */
  .ad-head { display: flex; justify-content: space-between; align-items: center; gap: 8px;
    padding: 24px 12px 7px; border-bottom: 1px solid var(--ad-line-strong); flex: none; position: relative; }
  .ad-head-ears { display: none; }
  .ad-head-main { display: flex; justify-content: space-between; align-items: center; width: 100%; gap: 6px; }
  .ad-head-title { font-size: 11px; font-weight: bold; letter-spacing: 1px; color: var(--ad-ink-strong); }
  .ad-head-sub { display: none; }
  .ad-head-info { font-size: 10.5px; letter-spacing: 1px; color: var(--ad-ink-dim); white-space: nowrap; overflow: hidden; }
  .ad-head-info .stage { color: var(--ad-accent); }
  .ad-head-btns { position: absolute; right: 2px; top: 2px; display: flex; gap: 4px; z-index: 10; }
  .ad-head-btns button { background: none; color: var(--ad-ink-dim); border: none; cursor: pointer;
    font-family: inherit; font-size: 12px; padding: 2px 4px; line-height: 1; transition: color .2s; }
  .ad-head-btns button:hover { color: var(--ad-accent); }
  /* 栏目导航 tab 栏：报纸/事件链/风声 三栏分立（V0.3.1） */
  .ad-tabs { flex: none; display: flex; border-bottom: 1px solid var(--ad-line-strong); }
  .ad-tab { flex: 1; padding: 6px 4px 5px; font-size: 10.5px; letter-spacing: 1px; background: none;
    border: none; border-right: 1px solid var(--ad-line); color: var(--ad-ink-dim); cursor: pointer;
    font-family: inherit; line-height: 1.2; transition: color .15s, background .15s; }
  .ad-tab:last-child { border-right: none; }
  .ad-tab:hover { color: var(--ad-ink-strong); }
  .ad-tab.active { color: var(--ad-accent); font-weight: bold; box-shadow: inset 0 -2px 0 var(--ad-accent); background: var(--ad-hit); }
  /* 当前态势行/头条 */
  .ad-nowline { flex: none; padding: 7px 12px; font-size: 11px; letter-spacing: 1px;
    color: var(--ad-ink); border-bottom: 1px solid var(--ad-line);
    background: var(--ad-hit); line-height: 1.5; position: relative; }
  .ad-lead-stamp { display: none; }
  .ad-lead-eyebrow { font-size: 9.5px; color: var(--ad-accent); font-weight: bold; margin-bottom: 2px; }
  .ad-lead-title { font-size: 12px; font-weight: bold; color: var(--ad-ink-strong); margin-bottom: 2px; }
  .ad-lead-body { font-size: 10.5px; color: var(--ad-ink-dim); line-height: 1.5; }
  /* 情报流主体：整体纵向滚动 */
  .ad-wire { flex: 1; overflow-y: auto; padding: 2px 0 10px; }
  .ad-wire::-webkit-scrollbar { width: 5px; }
  .ad-wire::-webkit-scrollbar-thumb { background: var(--ad-scroll); border-radius: var(--ad-radius-sm); }
  .ad-item { padding: 7px 12px 8px; }
  .ad-item + .ad-item { border-top: 1px solid var(--ad-line); }
  .ad-item.hit { background: var(--ad-hit); }
  /* S4 灰卡（未接触派系遮名）/ 新面孔标记 / 平静占位 / 金色揭幕闪动 */
  .ad-item.grey .ad-item-place { color: var(--ad-ink-faint); letter-spacing: 3px; }
  .ad-item.grey .ad-item-reaction { opacity: 0.78; }
  .ad-newcomer { color: var(--ad-accent); font-weight: bold; }
  .ad-item.quiet .ad-item-reaction { color: var(--ad-ink-faint); }
  @keyframes ad-unveil-flash {
    0% { background: rgba(251, 191, 36, 0.32); box-shadow: inset 2px 0 0 var(--ad-accent); }
    100% { background: transparent; box-shadow: none; }
  }
  .ad-item.unveil { animation: ad-unveil-flash 2.4s ease-out 1; }
  .ad-item-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 2px; }
  .ad-item-kicker { font-size: 9.5px; color: var(--ad-ink-dim); letter-spacing: 0.5px; }
  .ad-item-alert { font-size: 9px; letter-spacing: 1px; color: var(--ad-ink-faint); padding: 1px 4px; }
  .ad-item-alert.hot { color: var(--ad-accent); font-weight: bold; }
  .ad-item-alert.safe { color: var(--ad-safe); }
  .ad-item-title { font-size: 12px; color: var(--ad-ink-strong); margin-bottom: 2px; font-weight: bold; }
  .ad-item-title::before { content: '● '; font-size: 8px; color: var(--ad-accent-dim); vertical-align: 1px; }
  .ad-item-place { color: var(--ad-ink-strong); }
  .ad-item-title .menu { color: var(--ad-ink-dim); font-size: 11px; font-weight: normal; }
  .ad-item-reaction { font-size: 10.5px; line-height: 1.5; color: var(--ad-ink-dim); }
  .ad-item-sub-wire { margin-top: 4px; padding-left: 6px; border-left: 2px solid var(--ad-line); font-size: 10px; color: var(--ad-ink-faint); }
  .ad-empty { padding: 14px 16px; font-size: 10.5px; color: var(--ad-ink-faint); letter-spacing: 1px; }
  .ad-colophon { display: none; }

  #ad-modal { position: fixed; inset: 0; z-index: 99999; display: none;
    background: var(--ad-overlay); align-items: center; justify-content: center; }
  #ad-modal.open { display: flex; }
  .ad-modal-box { width: min(680px, 92vw); max-height: 86vh; overflow-y: auto;
    background: var(--ad-box-bg); border: var(--ad-panel-border); border-radius: var(--ad-radius);
    padding: 18px 20px; font-family: var(--ad-font); color: var(--ad-ink);
    box-shadow: 0 24px 64px rgba(0,0,0,0.6); }
  .ad-modal-box::-webkit-scrollbar { width: 5px; }
  .ad-modal-box::-webkit-scrollbar-thumb { background: var(--ad-scroll); border-radius: var(--ad-radius-sm); }
  .ad-modal-box h3 { font-size: 13px; letter-spacing: 4px; color: var(--ad-accent); margin: 0 0 14px;
    border-bottom: 1px solid var(--ad-line-strong); padding-bottom: 8px; }
  .ad-form-row { display: flex; align-items: center; gap: 10px; margin-bottom: 9px; font-size: 11.5px; }
  .ad-form-row label { width: 110px; color: var(--ad-ink-dim); letter-spacing: 1px; flex: none; }
  .ad-form-row input[type=text], .ad-form-row input[type=number], .ad-form-row textarea, .ad-form-row select {
    flex: 1; background: var(--ad-input-bg); border: 1px solid var(--ad-border); border-radius: var(--ad-radius-sm);
    color: var(--ad-ink-strong); font-family: inherit; font-size: 11.5px; padding: 5px 8px; }
  .ad-form-row textarea { resize: vertical; min-height: 52px; line-height: 1.5; }
  .ad-form-row input:focus, .ad-form-row textarea:focus, .ad-form-row select:focus { outline: none; border-color: var(--ad-accent-dim); }
  .ad-sec-title { font-size: 11px; letter-spacing: 3px; color: var(--ad-accent); margin: 14px 0 8px; }
  .ad-sec-title::before { content: '✶ '; }
  .ad-card-item { display: flex; justify-content: space-between; align-items: center; gap: 8px;
    background: var(--ad-input-bg); border: 1px solid var(--ad-line); border-radius: var(--ad-radius-sm);
    padding: 7px 10px; margin-bottom: 7px; font-size: 11.5px; cursor: pointer; }
  .ad-card-item:hover { border-color: var(--ad-accent-dim); }
  .ad-card-item .place { color: var(--ad-ink-strong); }
  .ad-card-item .meta { color: var(--ad-ink-faint); font-size: 10px; }
  .ad-btnrow { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
  .ad-btnrow button { background: var(--ad-input-bg); color: var(--ad-ink); border: 1px solid var(--ad-line-strong);
    border-radius: var(--ad-radius-sm); font-family: inherit; font-size: 11px; letter-spacing: 1px;
    padding: 6px 14px; cursor: pointer; }
  .ad-btnrow button:hover { border-color: var(--ad-accent); color: var(--ad-accent); }
  .ad-btnrow button.primary { border-color: var(--ad-accent-dim); color: var(--ad-accent); }
  /* 名册/卡片行内操作按钮 */
  .ad-row-btn { flex: none; font-size: 10px; letter-spacing: 1px; padding: 3px 10px; cursor: pointer;
    background: var(--ad-input-bg); color: var(--ad-ink-dim); border: 1px solid var(--ad-line-strong);
    border-radius: var(--ad-radius-sm); font-family: inherit; }
  .ad-row-btn:hover { border-color: var(--ad-accent-dim); color: var(--ad-accent); }
  /* 调试日志：角色分块 + 换行渲染（pre-wrap——\n 真实呈现，不再是转义字面量） */
  .ad-dbg-role { display: inline-block; font-size: 9.5px; letter-spacing: 1px; padding: 1px 9px;
    border: 1px solid var(--ad-line-strong); border-radius: 99px; color: var(--ad-ink-strong);
    margin: 8px 0 3px; }
  .ad-dbg-role.sys { color: var(--ad-accent); border-color: var(--ad-accent-dim); }
  .ad-dbg-block { background: var(--ad-input-bg); border: 1px solid var(--ad-border);
    border-radius: var(--ad-radius-sm); padding: 8px 10px; margin: 0 0 4px;
    font-family: Consolas, Menlo, monospace; font-size: 10.5px; line-height: 1.65;
    white-space: pre-wrap; word-break: break-word; color: var(--ad-ink);
    max-height: 280px; overflow-y: auto; }
  .ad-dbg-ok { color: #4ade80; }
  .ad-dbg-fail { color: #f87171; }
  /* ═══ V0.3.7 设置 UI 重构：PC 960px 工作台 + 移动端面板内切（变量全走主题）═══ */
  /* PC 宽屏弹窗壳 */
  #ad-modal .ad-modal-box.st-expanded { width: min(960px, 95vw); max-height: 90vh; height: 720px;
    display: flex; flex-direction: column; overflow: hidden; padding: 0; }
  .st-head { flex: none; border-bottom: 3px double var(--ad-line-strong); padding: 12px 20px 10px; background: var(--ad-box-bg); }
  .st-ears { display: flex; justify-content: space-between; border-bottom: 1px solid var(--ad-line-strong);
    padding-bottom: 4px; margin-bottom: 6px; font-size: 9px; letter-spacing: 2px; color: var(--ad-ink-dim); }
  .st-head-row { display: flex; justify-content: space-between; align-items: center; }
  .st-title { font-size: 17px; font-weight: 900; letter-spacing: 3px; color: var(--ad-ink-strong); }
  .st-title span.sub { font-size: 10px; font-weight: normal; letter-spacing: 1px; color: var(--ad-ink-dim); margin-left: 10px; }
  .st-body { flex: 1; display: flex; overflow: hidden; }
  .st-nav { width: 220px; flex-shrink: 0; background: var(--ad-input-bg); border-right: 2px solid var(--ad-line-strong);
    display: flex; flex-direction: column; justify-content: space-between; }
  .st-nav-label { padding: 10px 14px 6px; font-size: 9px; font-weight: 700; letter-spacing: 2px;
    color: var(--ad-ink-faint); border-bottom: 1px solid var(--ad-line); }
  .st-nav-items { list-style: none; padding: 6px 0; overflow-y: auto; flex: 1; }
  .st-nav-btn { padding: 9px 14px; display: flex; justify-content: space-between; align-items: center;
    font-size: 12.5px; font-weight: 700; color: var(--ad-ink); cursor: pointer;
    border-left: 4px solid transparent; margin-bottom: 2px; transition: all .15s; }
  .st-nav-btn:hover { color: var(--ad-accent); background: var(--ad-hit); }
  .st-nav-btn.active { background: var(--ad-box-bg); border-left-color: var(--ad-accent); color: var(--ad-accent); }
  .st-nav-btn .idx { font-size: 10px; color: var(--ad-ink-dim); }
  .st-stage { flex: 1; overflow-y: auto; padding: 18px 24px 30px; }
  .st-stage::-webkit-scrollbar { width: 6px; }
  .st-stage::-webkit-scrollbar-thumb { background: var(--ad-scroll); border-radius: var(--ad-radius-sm); }
  .st-pane { display: none; }
  .st-pane.active { display: block; }
  .st-foot { flex: none; border-top: 3px double var(--ad-line-strong); padding: 10px 18px;
    display: flex; justify-content: space-between; align-items: center; background: var(--ad-box-bg); }
  .st-foot .colophon { font-size: 9.5px; color: var(--ad-ink-dim); }
  /* 设置卡片与控件（PC/移动共用） */
  .st-card { background: var(--ad-input-bg); border: 1px solid var(--ad-line-strong);
    padding: 12px 14px; margin-bottom: 12px; }
  .st-card-head { display: flex; justify-content: space-between; align-items: center;
    border-bottom: 1px solid var(--ad-line); padding-bottom: 6px; margin-bottom: 10px; }
  .st-card-title { font-size: 12.5px; font-weight: 700; color: var(--ad-ink-strong); }
  .st-card-title::before { content: '◆ '; font-size: 8px; color: var(--ad-accent); }
  .st-label { display: block; font-size: 11px; font-weight: 600; color: var(--ad-ink-strong); margin-bottom: 3px; }
  .st-desc { font-size: 10px; color: var(--ad-ink-dim); line-height: 1.4; }
  .st-field { margin-bottom: 10px; }
  .st-field:last-child { margin-bottom: 0; }
  .st-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .st-grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
  .st-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
  .st-hr { border: none; border-top: 1px dashed var(--ad-line); margin: 10px 0; }
  .st-switch { position: relative; width: 36px; height: 19px; background: var(--ad-input-bg);
    border: 1.5px solid var(--ad-line-strong); border-radius: 12px; transition: all .2s; flex-shrink: none;
    display: inline-block; }
  .st-switch::after { content: ''; position: absolute; top: 1.5px; left: 2px; width: 12px; height: 12px;
    border-radius: 50%; background: var(--ad-ink-dim); transition: all .2s; }
  .st-switch-hidden { display: none !important; }
  input:checked + .st-switch { background: var(--ad-accent); border-color: var(--ad-accent); }
  input:checked + .st-switch::after { left: 18px; background: #fff; }
  .st-switch-label { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; }
  .st-stepper { display: inline-flex; align-items: center; border: 1px solid var(--ad-line-strong);
    background: var(--ad-box-bg); overflow: hidden; height: 26px; }
  .st-stepper button { background: var(--ad-input-bg); border: none; color: var(--ad-ink);
    width: 24px; height: 100%; font-size: 13px; font-weight: bold; cursor: pointer; }
  .st-stepper button:hover { background: var(--ad-accent); color: #fff; }
  .st-stepper input { width: 64px; height: 100%; border: none; border-left: 1px solid var(--ad-line);
    border-right: 1px solid var(--ad-line); text-align: center; background: transparent;
    color: var(--ad-ink-strong); font-size: 11.5px; font-weight: 700; outline: none; }
  .st-input, .st-select, .st-textarea { width: 100%; background: var(--ad-box-bg); border: 1px solid var(--ad-line-strong);
    color: var(--ad-ink-strong); font-family: inherit; font-size: 11.5px; padding: 6px 9px; outline: none; }
  .st-input:focus, .st-select:focus, .st-textarea:focus { border-color: var(--ad-accent); }
  .st-textarea { resize: vertical; min-height: 52px; line-height: 1.5; }
  .st-chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
  .st-chip { background: var(--ad-input-bg); border: 1px solid var(--ad-line-strong);
    font-size: 10px; padding: 2px 6px; color: var(--ad-ink); }
  /* 区域事件类型行（仿世界书条目：开关/名称/引导/权重/删除） */
  .inc-row { display: flex; align-items: center; gap: 8px; padding: 6px 8px; margin-bottom: 4px;
    background: var(--ad-box-bg); border: 1px solid var(--ad-line); }
  .inc-row input[type="text"] { background: transparent; border: 1px solid var(--ad-line);
    color: var(--ad-ink-strong); font-family: inherit; font-size: 11px; padding: 3px 6px; outline: none; }
  .inc-row input:focus { border-color: var(--ad-accent); }
  .inc-row .inc-label { width: 96px; flex: none; font-weight: 700; }
  .inc-row .inc-guide { flex: 1; min-width: 0; }
  .inc-row .inc-weight { width: 52px; flex: none; text-align: center; }
  .inc-row .inc-del { flex: none; border: 1px solid var(--ad-line-strong); background: none;
    color: var(--ad-ink-dim); cursor: pointer; font-size: 10px; padding: 2px 7px; }
  .inc-row .inc-del:hover { color: var(--ad-accent); border-color: var(--ad-accent); }
  /* 移动端面板内切设置视图（#ad-panel 内，零弹窗） */
  #panel-view-news { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-height: 0; }
  #panel-view-settings { flex: 1; display: none; flex-direction: column; overflow: hidden; min-height: 0; }
  .mv-tabs { flex: none; display: flex; border-bottom: 2px double var(--ad-line-strong); }
  .mv-tab { flex: 1; padding: 7px 2px 6px; border: none; border-right: 1px solid var(--ad-line);
    background: none; cursor: pointer; font-family: inherit; font-size: 10px; font-weight: 700;
    letter-spacing: 0.5px; color: var(--ad-ink-dim); white-space: nowrap; transition: all .15s; }
  .mv-tab:last-child { border-right: none; }
  .mv-tab.active { background: var(--ad-accent); color: #fff; }
  .mv-body { flex: 1; overflow-y: auto; padding: 12px 14px 20px; }
  .mv-body::-webkit-scrollbar { width: 4px; }
  .mv-body::-webkit-scrollbar-thumb { background: var(--ad-scroll); }
  .mv-pane { display: none; }
  .mv-pane.active { display: block; }
  .mv-foot { flex: none; border-top: 3px double var(--ad-line-strong); padding: 8px 12px;
    display: flex; justify-content: space-between; align-items: center; }
  /* 窄屏移动端兼容：面板满宽 */
  @media (max-width: 480px) {
    #ad-panel { width: 100vw; right: -105vw; }
    #ad-panel.open { right: 0; }
  }
  .ad-toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%);
    background: var(--ad-box-bg); border: 1px solid var(--ad-accent-dim); color: var(--ad-accent-bright);
    border-radius: var(--ad-radius); padding: 8px 18px; font-size: 12px; letter-spacing: 1px; z-index: 100000;
    font-family: var(--ad-font); box-shadow: 0 8px 28px rgba(0,0,0,0.5); }
  `;

  let els = {};
  let currentTheme = 'paper';   // paper（方案 A 报纸基因 · 默认） | slate

  // 设备检测（V0.3.7 设置 UI 双路分流）：严格按 UA 标识，不用屏幕宽度
  function isMobileDevice() {
    const ua = navigator.userAgent || navigator.vendor || '';
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua);
  }

  function applyTheme(theme) {
    currentTheme = theme === 'paper' ? 'paper' : 'slate';
    const on = currentTheme === 'paper';
    for (const n of [els.rail, els.panel, els.modal]) {
      if (n) n.classList.toggle('ad-theme-paper', on);
    }
  }

  function el(tag, attrs, html) {
    const n = UI_DOC.createElement(tag);
    if (attrs) for (const k of Object.keys(attrs)) n.setAttribute(k, attrs[k]);
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function buildUI() {
    if (UI_DOC.getElementById('ad-rail')) { logWarn('已初始化，跳过重复挂载'); return; }
    const style = el('style', { id: 'ad-style' });
    style.textContent = UI_CSS;
    UI_DOC.head.appendChild(style);

    // 折叠态贴边条（✦ 手柄 + 未读点 + 情报轮播；空态收缩为小胶囊）
    const rail = el('aside', { id: 'ad-rail', title: '世界情报 · 点击展开' }, `
      <div class="ad-rail-star">✦</div>
      <div id="ad-rail-dot"></div>
      <div class="ad-rail-ticker"><ul id="ad-ticker"></ul></div>`);
    UI_DOC.body.appendChild(rail);

    // 展开态面板：双耳古典大报头 → 栏目导航 tab → 纵向连续情报流 → 报尾底注
    const panel = el('aside', { id: 'ad-panel' }, `
      <div class="ad-head">
        <div class="ad-head-ears">
          <span>VOL. IV — NO. 138</span>
          <span class="ear-motto">"Truth in the Shadows"</span>
          <span>PRICE: 2 PENCE</span>
        </div>
        <div class="ad-head-main">
          <span class="ad-head-info"><span id="ad-mast-date-slate">—</span> · <span class="stage" id="ad-mast-stage-slate">—</span></span>
          <span class="ad-head-title" id="ad-head-title">悉尼星期增刊 · GAZETTE</span>
        </div>
        <span class="ad-head-btns">
          <button id="ad-btn-report" title="世界推演：查看最新世界状态 / 手动触发（S7）">📡</button>
          <button id="ad-btn-recompute" title="按最新楼层立即重算注入（含本地骰推进）">↻</button>
          <button id="ad-btn-world" title="世界状态查看器（派系/事件/风声/遇敌概率）">🌍</button>
          <button id="ad-btn-roster" title="派系名册：名册/墓碑管理（S5）">📜</button>
          <button id="ad-btn-settings" title="副导演 API 与开关">⚙</button>
        </span>
        <div class="ad-head-sub">
          <span id="ad-mast-date">—</span>
          <span class="stage" id="ad-mast-stage">—</span>
        </div>
      </div>
      <div id="panel-view-news">
      <div class="ad-tabs" id="ad-tabs">
        <button class="ad-tab" data-tab="paper" title="《悉尼宪报》派系公开征兆（灰卡揭幕体系）">📰 报纸</button>
        <button class="ad-tab" data-tab="events" title="进行中的事件链（本地骰每楼推进）">⚡ 事件链</button>
        <button class="ad-tab" data-tab="winds" title="风声与舆论（安静超时按概率消散）">📣 风声</button>
        <button class="ad-tab" data-tab="ledger" title="重大事件账本（Lv3+ 与终局自动归档——远方回响的采样源）">📜 旧档</button>
      </div>
      <div class="ad-wire" id="ad-wire"><div id="ad-wire-body"></div></div>
      <div class="ad-colophon">本报仅刊载 <b>街头可见之事与公开传闻</b> ｜ 幕后真相须由读者自行抵达</div>
      </div>
      <div id="panel-view-settings"></div>`);
    UI_DOC.body.appendChild(panel);

    // 模态容器（设置/卡片/注入预览共用）
    const modal = el('div', { id: 'ad-modal' }, `<div class="ad-modal-box" id="ad-modal-box"></div>`);
    UI_DOC.body.appendChild(modal);

    els = { rail, panel, dot: rail.querySelector('#ad-rail-dot'), ticker: rail.querySelector('#ad-ticker'),
      wireBody: panel.querySelector('#ad-wire-body'), tabs: panel.querySelector('#ad-tabs'),
      headTitle: panel.querySelector('#ad-head-title'),
      viewNews: panel.querySelector('#panel-view-news'), viewSettings: panel.querySelector('#panel-view-settings'),
      mastDate: panel.querySelector('#ad-mast-date'), mastStage: panel.querySelector('#ad-mast-stage'),
      mastDateSlate: panel.querySelector('#ad-mast-date-slate'), mastStageSlate: panel.querySelector('#ad-mast-stage-slate'),
      modal, modalBox: modal.querySelector('#ad-modal-box') };

    // 交互
    rail.addEventListener('click', () => togglePanel(true));
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
    UI_DOC.addEventListener('click', e => {
      if (els.panel.classList.contains('open')
        && !els.panel.contains(e.target) && !els.rail.contains(e.target)
        && !els.modal.contains(e.target)) togglePanel(false);
    });
    panel.querySelector('#ad-btn-report').addEventListener('click', () => {
      const world = readChatVar(CV.world);
      if (world && world.factions) openWorldModal(world);
      else { toast('尚无世界状态——手动触发推演'); generateDirectorEvolve('manual'); }
    });
    panel.querySelector('#ad-btn-recompute').addEventListener('click', () => {
      dispatchNow('manual'); toast('已按最新楼层重算注入');
    });
    panel.querySelector('#ad-btn-world').addEventListener('click', () => {
      const world = readChatVar(CV.world);
      if (world) openWorldModal(world);
      else { toast('尚无世界状态——等待首次推演（📡 手动或心跳触发）'); }
    });
    panel.querySelector('#ad-btn-roster').addEventListener('click', openRosterModal);
    // 设置入口双路分流（V0.3.7）：UA 判移动端 → 面板内切简版设置（零弹窗）；PC → 960px 工作台弹窗
    panel.querySelector('#ad-btn-settings').addEventListener('click', () => {
      if (isMobileDevice()) toggleMobileSettings();
      else openSettingsModal();
    });
    // 栏目切换：activeTab 持久化（localStorage），即时重渲染
    if (els.tabs) els.tabs.addEventListener('click', e => {
      const btn = e.target.closest('.ad-tab');
      if (!btn) return;
      const tab = btn.getAttribute('data-tab');
      const p = loadUiPrefs();
      if (p.activeTab === tab) return;
      p.activeTab = tab; saveUiPrefs(p);
      renderWire();
    });

    if (loadUiPrefs().panelOpen) togglePanel(true, true);
    applyTheme(loadUiPrefs().theme);
    renderWire(); renderTicker();
  }

  function togglePanel(open, silent) {
    const willOpen = open !== undefined ? open : !els.panel.classList.contains('open');
    els.panel.classList.toggle('open', willOpen);
    if (willOpen) els.dot.classList.remove('on');
    if (!willOpen && mobileSettingsActive) closeMobileSettings();   // 面板收起时退出设置视图（回报纸态）
    const p = loadUiPrefs(); p.panelOpen = willOpen; saveUiPrefs(p);
    if (willOpen && !silent) renderWire();
  }

  function toast(msg, ms = 2200) {
    const t = el('div', { class: 'ad-toast' + (currentTheme === 'paper' ? ' ad-theme-paper' : '') }, esc(msg));
    UI_DOC.body.appendChild(t);
    setTimeout(() => t.remove(), ms);
  }

  // ticker：最新情报轮播（折叠态唯一内容）；空态时竖条收缩为小胶囊
  // 地点短名：取剥 emoji 后按分隔符切段的倒数第二段（"悉尼·萨里山·绿顶酒馆·大堂"→"绿顶酒馆"）
  function shortLoc(text) {
    const parts = norm(text).split(/[·\-—]/).map(s => s.trim()).filter(Boolean);
    const seg = parts.length >= 2 ? parts[parts.length - 2] : (parts[0] || '');
    return seg.slice(0, 8);
  }

  function renderTicker() {
    if (!els.rail || !els.ticker) return;
    const items = (State.tickerItems || []).slice(0, 8);
    els.rail.classList.toggle('empty', items.length === 0);
    els.ticker.innerHTML = items.concat(items).map(it => `<li>${esc(it.text)}</li>`).join('');
  }

  // —— 折叠态四类轮播条目（V0.4.3）—————————————————————————————
  // 固定类别顺序：📍态势（地点）→ 📰报纸（最新派系征兆）→ ⚔事件链 → 📣风声；
  // tickerPins（推演中已更新类别）的组整体提前——优先播放已更新内容。
  const TICKER_ORDER = ['situation', 'paper', 'events', 'winds'];

  function buildTickerItems(world, locationText, pins) {
    const groups = { situation: [], paper: [], events: [], winds: [] };
    if (locationText) groups.situation.push({ cat: 'situation', text: `📍${shortLoc(locationText)}` });
    if (world) {
      for (const f of (world.factions || []).filter(x => x && x.surface).slice(0, 2))
        groups.paper.push({ cat: 'paper', text: `📰${String(f.surface).slice(0, 10)}` });
      for (const ev of (world.events || []).filter(x => x && x.stage !== '平息').slice(0, 2))
        groups.events.push({ cat: 'events', text: `⚔${String(ev.name || '').slice(0, 7)}·${ev.stage}` });
      for (const w of (world.winds || []).slice(0, 2))
        groups.winds.push({ cat: 'winds', text: `📣${String(w.content || '').slice(0, 9)}` });
    }
    const pinned = TICKER_ORDER.filter(c => (pins || []).includes(c));
    const rest = TICKER_ORDER.filter(c => !pinned.includes(c));
    return pinned.concat(rest).flatMap(c => groups[c]);
  }

  // 面板主体：当前态势行 + 世界情报流（事件卡/风声卡/派系灰卡揭幕体系）
  // 栏目渲染（V0.3.1 tab 化）：当前所在地 lead 为各 tab 共有的上下文头，
  // 其下按 activeTab 分流——📰 报纸（原版派系征兆流）/ ⚡ 事件链 / 📣 风声。
  function renderWire() {
    if (!els.wireBody) return;
    const world = readChatVar(CV.world);
    const tab = loadUiPrefs().activeTab || 'paper';
    // tab 栏 active 态同步（切主题/重挂载后自愈）
    if (els.tabs) els.tabs.querySelectorAll('.ad-tab').forEach(b =>
      b.classList.toggle('active', b.getAttribute('data-tab') === tab));
    let html = '';

    // 首段 lead（V0.3.2）：地点 + 遇敌几率 + 区域氛围——副导演不再安排具体敌人，
    // 面板直接亮出当前生效的掷骰几率（spots/districts/设置兜底 + 冷热修正后的最终值）
    // 与氛围依据（驻守派系/爆发事件警告/副导演给该地的理由）
    if (State.lastLocationText) {
      const locShort = shortLoc(State.lastLocationText);
      let leadTitle = '';
      let leadBody = '';
      if (world && Array.isArray(world.factions)) {
        const profile = encounterProfile(State.lastLocationText);
        leadTitle = profile.safe ? `${locShort || '当前地点'} · 安全区`
          : `${locShort || '当前地点'} · 遇敌几率 ${profile.chance}%`;
        const stationed = world.factions.filter(f => f && f.zone && zoneHit(f.zone, State.lastLocationText));
        const hot = (world.events || []).filter(ev => ev && ev.type === 'conflict' && ev.stage === '爆发'
          && eventZones(ev, world).some(z => zoneHit(z, State.lastLocationText)));
        const parts = [];
        if (stationed.length) parts.push(`${stationed.map(f => `${f.name}${f.morale ? '（' + f.morale + '）' : ''}`).join('、')}在此活动`);
        const incActive = (world.incident && world.incident.active) ? world.incident : null;
        if (incActive && incActive.zone && zoneHit(incActive.zone, State.lastLocationText)) {
          parts.push(`【⚠ 区域事件：${incActive.title || '未命名'}】${incActive.impact || ''}`);
        }
        if (hot.length) parts.push(`【⚠ ${hot[0].name}已到爆发阶段——冲突一触即发】`);
        if (profile.why) parts.push(profile.why);
        else if (profile.heatWhy && (profile.heat !== 0 || profile.tension !== 0)) parts.push(profile.heatWhy);
        leadBody = parts.join('。') || '暂无区域情报——若冲突升级，敌方按剧情合理性与世界书图鉴演化。';
      } else {
        leadTitle = `${locShort || '当前地点'} · 等待首推`;
        leadBody = '尚无世界态势档案——📡 手动触发或等待心跳推演后，此处显示遇敌几率与区域氛围。';
      }
      html += `<div class="ad-nowline ad-lead-box" title="${esc(State.lastLocationText)}">
        <div class="ad-lead-stamp">PUBLIC RECORD</div>
        <div class="ad-lead-eyebrow">📍 当前所在地态势简报 · CURRENT SITUATION</div>
        <div class="ad-lead-title">${esc(leadTitle)}</div>
        <div class="ad-lead-body">${esc(leadBody)}</div>
      </div>`;
    }

    if (!world || !Array.isArray(world.factions)) {
      const emptyByTab = {
        paper: '报纸尚无印张——等待副导演首次世界推演（📡 手动触发，或每 N 楼心跳自动推演）。',
        events: '事件链空栏——世界暂时平静，等待首次推演后由副导演建立事件。',
        winds: '风声版面暂无消息——等待首次推演后由副导演建立风声。',
        ledger: '旧档尚无编年——Lv3 以上重大事件与风声将在推演中自动归档。',
      };
      html += `<div class="ad-empty">${emptyByTab[tab] || emptyByTab.paper}</div>`;
      els.wireBody.innerHTML = html;
      return;
    }

    const worldDate = world.generatedAt ? new Date(world.generatedAt).toLocaleDateString() : '';

    if (tab === 'events') {
      // ⚡ 事件链：阶段徽标 + 进度（平息不显示）
      const events = (world.events || []).filter(ev => ev && ev.stage !== '平息');
      if (!events.length) {
        html += `<div class="ad-empty">世界暂时平静——暂无进行中的事件。新事件在前文出现具体迹象时由副导演创建。</div>`;
      }
      for (const ev of events) {
        const stageCls = ev.stage === '爆发' || ev.stage === '逼近' ? 'hot' : '';
        html += `<div class="ad-item${ev.stage === '爆发' ? ' hit' : ''}">
          <div class="ad-item-header">
            <span class="ad-item-kicker">⚡ 事件链${ev.distance ? ' · 🌏 远方' : ''} · ${esc(worldDate)}</span>
            <span class="ad-item-alert ${stageCls}">${esc(ev.stage)} ${ev.stageRound}/9</span>
          </div>
          <div class="ad-item-title"><span class="ad-item-place">${esc(ev.name)}</span><span class="menu"> · ${ev.type === 'progress' ? '进展' : '冲突'}${ev.distance && ev.zone ? ' · ' + esc(ev.zone) : ''}</span></div>
          <div class="ad-item-reaction">${esc(ev.desc || '')}</div>
        </div>`;
      }
      els.wireBody.innerHTML = html;
      return;
    }

    if (tab === 'winds') {
      // 📣 风声：传播等级 + 来源
      const winds = (world.winds || []).filter(Boolean);
      if (!winds.length) {
        html += `<div class="ad-empty">街头暂无风声——旧风声已消散，或副导演尚未建立舆论动向。</div>`;
      }
      for (const w of winds) {
        html += `<div class="ad-item">
          <div class="ad-item-header">
            <span class="ad-item-kicker">📣 风声 · ${esc(w.spread || '流传')}${w.distance ? ' · 🌏 远方' : ''}</span>
          </div>
          <div class="ad-item-reaction">${esc(w.content || '')}${w.source ? `<div class="ad-item-sub-wire">——${esc(w.source)}</div>` : ''}</div>
        </div>`;
      }
      els.wireBody.innerHTML = html;
      return;
    }

    if (tab === 'ledger') {
      // 📜 旧档（V0.4.0）：重大事件账本编年（最新在前——Lv≥3 新事件/推进/终局/Lv≥3 风声）
      const entries = getLedger();
      if (!entries.length) {
        html += `<div class="ad-empty">尚无重大事件入账——Lv3 以上事件与风声将在推演中自动归档。</div>`;
      }
      for (const e of entries) {
        const lines = (Array.isArray(e.changes) ? e.changes : []).map(c => {
          if (c.type === 'event_new') return `<span class="ad-item-alert">[新增Lv${c.level}]</span> ${esc(c.name)}${c.zone ? ` · ${esc(c.zone)}` : ''}${c.desc ? ` — ${esc(c.desc)}` : ''}`;
          if (c.type === 'event_advance') return `<span class="ad-item-alert">[推进]</span> ${esc(c.name)}(Lv${c.level}) ${esc(c.fromStage || '?')}→${esc(c.toStage || '?')}${c.desc ? ` — ${esc(c.desc)}` : ''}`;
          if (c.type === 'event_terminal') return `<span class="ad-item-alert hot">[终局]</span> ${esc(c.name)}(Lv${c.level}) → ${esc(c.toStage || c.stage || '?')}${c.desc ? ` — ${esc(c.desc)}` : ''}`;
          if (c.type === 'wind_new') return `<span class="ad-item-alert">[风声Lv${c.level}]</span> ${esc(c.content || '')}${c.source ? `——${esc(c.source)}` : ''}`;
          return '';
        }).filter(Boolean);
        if (!lines.length) continue;
        html += `<div class="ad-item">
          <div class="ad-item-header">
            <span class="ad-item-kicker">📜 旧档 · 第 ${e.round || '?'} 轮</span>
            <span class="ad-item-alert">№${e.floor}</span>
          </div>
          <div class="ad-item-reaction">${lines.join('<br>')}</div>
        </div>`;
      }
      els.wireBody.innerHTML = html;
      return;
    }

    // 📰 报纸（默认 tab，原版形态）：派系灰卡（S4 揭幕体系全保留）——
    // 未接触派系 ？？？ 遮名（只可见征兆）；已接触署名 + 三态徽标；
    // 新面孔标记；新揭示首拍金色揭幕闪动；已接触但本轮无条目的名册派系给平静占位卡。
    const { roster, newly } = syncRevealState();
    for (const f of (world.factions || [])) {
      if (roster.tombstones.includes(f.name)) continue;   // 墓碑兜底（级联已删，双保险）
      const shown = roster.revealed.includes(f.name);
      const fresh = !roster.manual.includes(f.name);      // 插件自建 → 新面孔（预输入无标记）
      const stateCls = f.state === '已兑现' ? 'hot' : '';
      html += `<div class="ad-item${shown ? '' : ' grey'}${newly.includes(f.name) ? ' unveil' : ''}">
        <div class="ad-item-header">
          <span class="ad-item-kicker">《悉尼宪报》 · ${esc(worldDate)}${fresh ? ' · <span class="ad-newcomer">新面孔</span>' : ''}</span>
          ${shown ? `<span class="ad-item-alert ${stateCls}">${esc(f.state || '推断中')}</span>` : ''}
        </div>
        <div class="ad-item-title"><span class="ad-item-place">${shown ? esc(f.name) : '？？？'}</span>${f.zone ? `<span class="menu"> · ${esc(f.zone)}</span>` : ''}</div>
        <div class="ad-item-reaction">${esc(f.surface || '')}</div>
      </div>`;
    }
    // 平静占位：已接触（含预输入）但本轮世界状态无条目——"永远有卡，漏更新不丢卡"；
    // 未接触派系不出占位卡（不剧透存在感——它们只经征兆灰卡登场）
    const worldNames = new Set((world.factions || []).map(f => f.name));
    for (const name of roster.factions) {
      if (worldNames.has(name) || roster.tombstones.includes(name) || !roster.revealed.includes(name)) continue;
      html += `<div class="ad-item quiet">
        <div class="ad-item-header"><span class="ad-item-kicker">《悉尼宪报》 · 平静</span></div>
        <div class="ad-item-title"><span class="ad-item-place">${esc(name)}</span></div>
        <div class="ad-item-reaction">暂无可察异动。</div>
      </div>`;
    }

    els.wireBody.innerHTML = html;
  }

  // dispatch 后刷新（状态行由 renderWire 从 State 生成）
  function updatePanelStatus(waiting, info) {
    if (!els.wireBody) return;
    if (waiting != null) {
      const now = els.wireBody.querySelector('.ad-nowline');
      if (now) {
        const titleEl = now.querySelector('.ad-lead-title');
        if (titleEl) titleEl.textContent = waiting;
        else now.textContent = waiting;
      } else {
        els.wireBody.innerHTML = `<div class="ad-nowline ad-lead-box"><div class="ad-lead-title">${esc(waiting)}</div></div>`;
      }
      return;
    }
    renderWire(); renderTicker();
  }

  // 报头：日期/阶段（"⏰ 1925年 · 6月13日 · 12:40 · 潜伏期" → 两段）
  function updatePanelMeta(stat) {
    if (!stat) return;
    const raw = String(stat['日期和时间'] || '');
    const parts = raw.replace(EMOJI_RE, '').split('·').map(s => s.trim()).filter(Boolean);
    const dateText = parts.length >= 2 ? `${parts[0]} · ${parts[1]}` : (parts[0] || '1925年 · 6月13日');
    const stageText = parts.length >= 3 ? (parts[parts.length - 1] || '潜伏期') : '潜伏期';

    if (els.mastDate) els.mastDate.textContent = dateText;
    if (els.mastStage) els.mastStage.textContent = stageText;
    if (els.mastDateSlate) els.mastDateSlate.textContent = dateText;
    if (els.mastStageSlate) els.mastStageSlate.textContent = stageText;
  }

  // ═════════════════════════════════════════════════════════════════════
  // 9. GM 面板（设置 / 卡片管理）
  // ═════════════════════════════════════════════════════════════════════

  function closeModal() { els.modal.classList.remove('open'); }
  function openModal(html) { els.modalBox.classList.remove('st-expanded'); els.modalBox.innerHTML = html; els.modal.classList.add('open'); }

  // —— 设置弹窗（可重渲染：世界书同步的增删/选书操作不丢其他输入）———————————

  let editSync = null;        // 编辑中的 worldSync 副本 { world: [] }
  let editIncidentTypes = null;   // 编辑中的事件类型表副本（结构化数组，仿世界书行模式）
  let settingsActiveTab = 'l-api';   // V0.4.0 当前激活设置栏——全量重渲保持栏目（修增删事件行跳回首屏）

  function openSettingsModal() {
    editSync = { world: JSON.parse(JSON.stringify(SETTINGS.worldSync || [])) };
    editIncidentTypes = normalizeIncidentTypes(SETTINGS.regionalIncidentTypes);
    settingsActiveTab = 'l-api';   // 新开弹窗回到首屏
    renderSettingsModal();
  }

  // 事件类型行渲染（仿世界书条目：开关启停所有行；删除仅自定义行；权重 0 = 单类禁用）
  function renderIncidentRows(list) {
    return (list || []).map((t, i) => `
      <div class="inc-row" data-inc-i="${i}">
        <label class="st-switch-label"><input type="checkbox" class="st-switch-hidden" data-inc-toggle="${i}" ${t.enabled !== false ? 'checked' : ''}><span class="st-switch"></span></label>
        <input type="text" class="inc-label" data-inc-label="${i}" value="${esc(t.label)}" placeholder="类型名">
        <input type="text" class="inc-guide" data-inc-guide="${i}" value="${esc(t.guide || '')}" placeholder="引导描述（推演灵感方向）">
        <input type="number" class="inc-weight" data-inc-weight="${i}" value="${t.weight}" min="0" step="1" title="权重（0=禁用）">
        ${t.custom ? `<button type="button" class="inc-del" data-inc-del="${i}">✕</button>` : '<span class="st-desc" title="内置类型不可删除">内置</span>'}
      </div>`).join('') || '<div class="st-desc">类型表为空——点右上"＋ 添加事件类型"建行。</div>';
  }

  // 类型行操作绑定（事件委托到容器；任何改动即时序列化进 SETTINGS 并保存）
  function bindIncidentOps(root) {
    const persist = () => {
      SETTINGS.regionalIncidentTypes = JSON.parse(JSON.stringify(editIncidentTypes));
      saveSettings(SETTINGS);
    };
    const listEl = root.querySelector('#ad-inc-list');
    if (!listEl) return;
    const readRow = (i) => {
      const row = listEl.querySelector(`[data-inc-i="${i}"]`);
      const t = editIncidentTypes[i];
      t.label = row.querySelector('[data-inc-label]').value.trim();
      t.guide = row.querySelector('[data-inc-guide]').value.trim();
      t.weight = Number(row.querySelector('[data-inc-weight]').value) || 0;
      t.enabled = row.querySelector('[data-inc-toggle]').checked;
    };
    listEl.addEventListener('change', e => {
      const target = e.target;
      const i = Number(target.getAttribute('data-inc-toggle') || target.getAttribute('data-inc-label')
        || target.getAttribute('data-inc-guide') || target.getAttribute('data-inc-weight'));
      if (!Number.isFinite(i) || !editIncidentTypes[i]) return;
      readRow(i);
      persist();
    });
    const addBtn = root.querySelector('#ad-inc-add');
    if (addBtn) addBtn.addEventListener('click', () => {
      editIncidentTypes.push({ label: '新事件类型', guide: '', weight: 10, enabled: true, custom: true });
      persist();
      renderSettingsModal();   // 重渲保持行内输入现场（值已在 editIncidentTypes）
    });
    listEl.addEventListener('click', e => {
      const del = e.target.closest('[data-inc-del]');
      if (!del) return;
      editIncidentTypes.splice(Number(del.getAttribute('data-inc-del')), 1);
      persist();
      renderSettingsModal();
    });
  }

  // worldSync 即时持久化：选书/勾词条/增删立即写回（不依赖"保存"按钮）；
  // 已选书未勾词条的来源保留（filter 只去 book 空的），防止"选书后重开被清空"
  function persistSyncNow() {
    SETTINGS.worldSync = editSync.world.filter(x => x && x.book);
    saveSettings(SETTINGS);
  }

  // 把表单输入收进 SETTINGS（不持久化——供 sync 操作重渲前保存现场）
  // root 参数（V0.3.7）：从指定容器收 [data-k]——PC 弹窗传 els.modalBox，移动端视图传面板容器；
  // 只收当前活跃容器，防止另一视图的陈旧输入覆盖刚改的值
  function collectFormToSettings(root) {
    (root || els.modalBox).querySelectorAll('[data-k]').forEach(input => {
      const path = input.getAttribute('data-k').split('.');
      let obj = SETTINGS;
      for (let i = 0; i < path.length - 1; i++) obj = obj[path[i]];
      const key = path[path.length - 1];
      obj[key] = input.type === 'checkbox' ? input.checked
        : input.type === 'number' ? Number(input.value) : input.value.trim();
    });
  }

  function openSyncPicker(slot, idx) {
    const src = editSync[slot][idx];
    if (!src || !src.book) { toast('请先选择世界书'); return; }
    openModal(`<h3>📖 选择同步词条</h3><div class="dim">加载 ${esc(src.book)} 词条列表…</div>`);
    Promise.resolve(getWorldbook(src.book)).then(entries => {
      const items = (entries || []).map(e => e && e.name).filter(Boolean)
        .map(name => `<div class="ad-form-row" style="margin-bottom:4px">
          <label style="width:auto;color:var(--ad-ink)"><input type="checkbox" data-entry="${esc(name)}" ${src.entries.includes(name) ? 'checked' : ''}> ${esc(name)}</label>
        </div>`).join('') || '<div class="dim">该世界书无词条。</div>';
      openModal(`<h3>📖 选择同步词条 · ${esc(src.book)}</h3>
        <div class="dim" style="font-size:10px;color:var(--ad-ink-faint);margin-bottom:8px">勾选的词条内容将注入副导演推演的输入。</div>
        <div style="max-height:52vh;overflow-y:auto">${items}</div>
        <div class="ad-btnrow"><button class="primary" id="ad-sync-pick-ok">确定</button><button id="ad-sync-pick-back">返回</button></div>`);
      els.modalBox.querySelector('#ad-sync-pick-ok').addEventListener('click', () => {
        src.entries = [...els.modalBox.querySelectorAll('[data-entry]:checked')]
          .map(n => n.getAttribute('data-entry'));
        persistSyncNow();   // 勾选即时保持
        renderSettingsModal();
      });
      els.modalBox.querySelector('#ad-sync-pick-back').addEventListener('click', renderSettingsModal);
    }).catch(() => { toast('世界书读取失败'); renderSettingsModal(); });
  }

  // —— 提示词预设编辑区（设置弹窗内，暗线/态势各一组）——————————————

  function promptSectionHtml(storeKey, title, store) {
    const data = store.load();
    const active = data.presets.find(p => p.id === data.active) || data.presets[0];
    const content = active && active.locked ? store.currentSys() : (active && active.content) || store.currentSys();
    const options = data.presets.map(p =>
      `<option value="${esc(p.id)}" ${p.id === data.active ? 'selected' : ''}>${esc(p.name)}${p.locked ? ' 🔒' : ''}</option>`).join('');
    return `
      <div class="ad-sec-title">${title}</div>
      <div class="ad-form-row">
        <select data-prompt-sel="${storeKey}" style="flex:1">${options}</select>
        <button data-prompt-rename="${storeKey}" style="flex:none" ${active && active.locked ? 'disabled' : ''}>重命名</button>
        <button data-prompt-del="${storeKey}" style="flex:none" ${active && active.locked ? 'disabled' : ''}>删除</button>
      </div>
      <div class="ad-btnrow" style="margin-top:2px"><button data-prompt-add="${storeKey}">＋ 新建（复制当前默认）</button></div>
      <textarea data-prompt-ta="${storeKey}" rows="8" ${active && active.locked ? 'readonly' : ''}
        style="width:100%;background:var(--ad-input-bg);color:var(--ad-ink);border:1px solid var(--ad-border);border-radius:var(--ad-radius-sm);font-family:inherit;font-size:10px;padding:8px;${active && active.locked ? 'opacity:0.6' : ''}"
        placeholder="提示词内容">${esc(content)}</textarea>
      ${active && active.locked
        ? '<div class="dim" style="font-size:9.5px;color:var(--ad-ink-faint);margin-top:3px">默认提示词只读（随插件升级更新）——新建副本后可自由修改。</div>'
        : '<div class="dim" style="font-size:9.5px;color:var(--ad-ink-faint);margin-top:3px">失焦自动保存；此预设内容固定存储，不再随默认更新。</div>'}`;
  }

  function bindPromptOps(storeMap) {
    const find = k => storeMap[k];
    els.modalBox.querySelectorAll('[data-prompt-add]').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = prompt('新提示词预设名称：', '');
        if (!name) return;
        find(btn.getAttribute('data-prompt-add')).add(name);
        renderSettingsModal();
      });
    });
    els.modalBox.querySelectorAll('[data-prompt-rename]').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = prompt('重命名提示词预设：', '');
        if (!name) return;
        find(btn.getAttribute('data-prompt-rename')).rename(name);
        renderSettingsModal();
      });
    });
    els.modalBox.querySelectorAll('[data-prompt-del]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!confirm('确定删除当前提示词预设？（回落到默认）')) return;
        find(btn.getAttribute('data-prompt-del')).remove();
        renderSettingsModal();
      });
    });
    els.modalBox.querySelectorAll('[data-prompt-sel]').forEach(sel => {
      sel.addEventListener('change', () => {
        find(sel.getAttribute('data-prompt-sel')).select(sel.value);
        renderSettingsModal();
      });
    });
    els.modalBox.querySelectorAll('[data-prompt-ta]').forEach(ta => {
      ta.addEventListener('blur', () => {
        find(ta.getAttribute('data-prompt-ta')).updateContent(ta.value);
      });
    });
  }

  function syncSectionHtml(slot, title) {    const rows = (editSync[slot] || []).map((src, i) => `
      <div class="ad-form-row">
        <select data-sync-book="${slot}:${i}" style="flex:1">
          <option value="">— 选择世界书 —</option>
          ${syncSectionHtml.bookNames.map(b => `<option value="${esc(b)}" ${src.book === b ? 'selected' : ''}>${esc(b)}</option>`).join('')}
        </select>
        <button data-sync-pick="${slot}:${i}" style="flex:none">选词条${src.entries.length ? `（${src.entries.length}）` : ''}</button>
        <button data-sync-del="${slot}:${i}" style="flex:none;padding:5px 8px">✕</button>
      </div>
      ${src.entries.length ? `<div class="dim" style="font-size:9.5px;margin:-3px 0 6px;color:var(--ad-ink-faint)">${src.entries.map(esc).join(' · ')}</div>` : ''}`)
      .join('');
    return `
      <div class="ad-sec-title">${title}</div>
      ${rows || `<div class="dim" style="font-size:10px;color:var(--ad-ink-faint);margin-bottom:6px">未配置——选世界书并勾选要注入的词条。</div>`}
      <div class="ad-btnrow" style="margin-top:2px"><button data-sync-add="${slot}">＋ 添加世界书来源</button></div>`;
  }

  // —— 设置工作台（V0.3.7 PC 960px 宽屏：左侧栏目导读 + 右侧社论卡片，8 栏目）———
  // 复用 data-k → collectFormToSettings 自动对接；sync/prompt 操作重渲不丢其他输入

  // 控件微模板（data-k 对接 SETTINGS；st-* 样式全走主题变量）
  const stInput = (k, val, ph, type = 'text', extra = '') =>
    `<input type="${type}" class="st-input" data-k="${k}" value="${esc(val)}" placeholder="${esc(ph || '')}" ${extra}>`;
  const stNum = (k, val, step, min, max) =>
    `<input type="number" class="st-input" data-k="${k}" value="${val}" step="${step}"${min != null ? ` min="${min}"` : ''}${max != null ? ` max="${max}"` : ''}>`;
  const stArea = (k, val, rows, ph) =>
    `<textarea class="st-textarea" data-k="${k}" rows="${rows}" placeholder="${esc(ph || '')}">${esc(val || '')}</textarea>`;
  const stSwitch = (k, on) =>
    `<label class="st-switch-label"><input type="checkbox" class="st-switch-hidden" data-k="${k}" ${on ? 'checked' : ''}><span class="st-switch"></span></label>`;
  const stStepper = (k, val, step, min, max) =>
    `<span class="st-stepper"><button type="button" data-step-k="${k}" data-step="-1">−</button>${stNum(k, val, step, min, max)}<button type="button" data-step-k="${k}" data-step="1">＋</button></span>`;
  const stRow = (label, desc, control) =>
    `<div class="st-row"><div><span class="st-label">${label}</span>${desc ? `<div class="st-desc">${desc}</div>` : ''}</div><div>${control}</div></div>`;

  function stepSyncValue(root, key, delta) {
    const input = root.querySelector(`[data-k="${key}"]`);
    if (!input) return;
    const cur = parseFloat(input.value) || 0;
    const min = input.min !== '' && input.min != null ? parseFloat(input.min) : -Infinity;
    const max = input.max !== '' && input.max != null ? parseFloat(input.max) : Infinity;
    input.value = Math.max(min, Math.min(max, cur + delta));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function renderSettingsModal() {
    const s = SETTINGS;
    const paneCls = id => `st-pane${settingsActiveTab === id ? ' active' : ''}`;   // V0.4.0 重渲保持激活栏
    if (!editSync) editSync = { world: JSON.parse(JSON.stringify(SETTINGS.worldSync || [])) };   // 防御：直渲（不经 openSettingsModal）也有现场
    if (!editIncidentTypes) editIncidentTypes = normalizeIncidentTypes(SETTINGS.regionalIncidentTypes);
    syncSectionHtml.bookNames = (IS_LIVE && typeof getWorldbookNames === 'function') ? getWorldbookNames() : [];
    const navItems = [
      ['l-api', '📡 电传通讯', '01'], ['l-rhythm', '⚙ 推演律动', '02'], ['l-combat', '🎲 街头遭遇', '03'],
      ['l-incidents', '⚡ 区域与远方', '04'], ['l-dossier', '📜 阵营与铁律', '05'], ['l-sync', '📖 档案库同步', '06'],
      ['l-prompt', '✍ 导演社论母版', '07'], ['l-diag', '🐞 诊断与回溯', '08'],
    ];
    openModal(`
      <div class="st-head">
        <div class="st-ears"><span>EDITION · ASSISTANT DIRECTOR</span><span style="color:var(--ad-accent);font-style:italic">THE DIRECTOR'S DESK</span><span>PRICE TWO PENCE</span></div>
        <div class="st-head-row">
          <div class="st-title">⚙ 导演编务处<span class="sub">EDITORIAL PREFERENCES · V${SCRIPT_VERSION}</span></div>
          <button id="ad-set-close" class="ad-row-btn">✕ 关闭</button>
        </div>
      </div>
      <div class="st-body">
        <aside class="st-nav">
          <div>
            <div class="st-nav-label">CONTENTS · 编务栏目</div>
            <ul class="st-nav-items">
              ${navItems.map(([id, label, idx]) => `<li class="st-nav-btn${id === settingsActiveTab ? ' active' : ''}" data-stab="${id}"><span>${label}</span><span class="idx">${idx}</span></li>`).join('')}
            </ul>
          </div>
          <div style="padding:10px 14px;border-top:1px solid var(--ad-line);font-size:9.5px;color:var(--ad-ink-dim)">S7/S9 世界引擎全景管理</div>
        </aside>
        <section class="st-stage">
          <div class="${paneCls('l-api')}" id="l-api">
            <div class="st-card">
              <div class="st-card-head"><span class="st-card-title">电报线路端点（副导演 API）</span></div>
              <div class="st-field"><span class="st-label">Base URL（服务地址）</span>${stInput('director.baseUrl', s.director.baseUrl, 'https://…/v1')}</div>
              <div class="st-field"><span class="st-label">API Key（通信密钥）</span>${stInput('director.apiKey', s.director.apiKey, 'sk-…')}</div>
              <div class="st-grid2">
                <div class="st-field"><span class="st-label">Model（推演模型）</span>${stInput('director.model', s.director.model, '模型名')}</div>
                <div class="st-field"><span class="st-label">温度（Temperature）</span>${stNum('director.temperature', s.director.temperature, 0.1, 0, 2)}</div>
              </div>
            </div>
            <div class="st-card">
              <div class="st-card-head"><span class="st-card-title">Token 限额与回溯楼层</span></div>
              <div class="st-grid2">
                ${stRow('MaxTokens（单次输出上限）', '', stStepper('director.maxTokens', s.director.maxTokens, 200, 256))}
                ${stRow('副导演可见楼层', '0=全部历史；仅 AI 楼层', stStepper('directorFloors', s.directorFloors, 5, 0))}
              </div>
            </div>
          </div>
          <div class="${paneCls('l-rhythm')}" id="l-rhythm">
            <div class="st-card">${stRow('<span style="font-size:13px">世界推演引擎总开关</span>', '推演 $ad_world 并写入词条；关→词条下灯', stSwitch('enabledDirector', s.enabledDirector))}</div>
            <div class="st-card">
              <div class="st-card-head"><span class="st-card-title">常规心跳与触发节奏</span></div>
              ${stRow('常态推演心跳（楼数）', '每隔 N 楼自动增量修订世界状态；战斗结算/跨日/阶段变化强制推', stStepper('directorEveryX', s.directorEveryX, 1, 1))}
            </div>
          </div>
          <div class="${paneCls('l-combat')}" id="l-combat">
            <div class="st-card">
              ${stRow('<span style="font-size:13px">每楼随机遭遇掷骰</span>', '用户发送输入时本地掷骰，命中即追加开战指令', stSwitch('randomCombatEnabled', s.randomCombatEnabled))}
              <hr class="st-hr">
              <div class="st-grid2">
                ${stRow('基准遇敌率（%）', '兜底值，世界状态 spots/districts 命中时被覆盖', stStepper('randomCombatChance', s.randomCombatChance, 1, 0, 100))}
                ${stRow('防连战锁', '每推演周期最多一场随机战斗', stSwitch('randomCombatOncePerCycle', s.randomCombatOncePerCycle))}
              </div>
              <hr class="st-hr">
              ${stRow('战斗结束冷却', `任意战斗（含剧情战）结束后 N 楼内不掷随机（只拦随机掷骰）`, `<div style="display:flex;align-items:center;gap:8px">${stSwitch('randomCombatCooldown', s.randomCombatCooldown)}${stStepper('randomCombatCooldownFloors', s.randomCombatCooldownFloors, 1, 0)}<span class="st-desc">楼</span></div>`)}
            </div>
          </div>
          <div class="${paneCls('l-incidents')}" id="l-incidents">
            <div class="st-card">
              <div class="st-card-head"><span class="st-card-title">⚡ 区域突发事件总控（S9）</span>
                <button id="ad-inc-add" class="ad-row-btn">＋ 添加事件类型</button></div>
              ${stRow('本地事件掷骰总开关', '每楼掷骰定类型，推演 LLM 按世界观生成具体内容', stSwitch('regionalIncidentEnabled', s.regionalIncidentEnabled))}
              <hr class="st-hr">
              <div class="st-grid3">
                <div class="st-field"><span class="st-label">触发概率（%/楼）</span>${stNum('regionalIncidentChance', s.regionalIncidentChance, 0.5, 0, 100)}</div>
                <div class="st-field"><span class="st-label">持续楼数</span>${stNum('regionalIncidentDuration', s.regionalIncidentDuration, 1, 1)}</div>
                <div class="st-field"><span class="st-label">冷却楼数</span>${stNum('regionalIncidentCooldown', s.regionalIncidentCooldown, 1, 0)}</div>
              </div>
              <div class="st-field"><span class="st-label">事件类型（仿世界书：开关启停；自定义行可删除；权重 0 = 单类禁用）</span>
                <div id="ad-inc-list">${renderIncidentRows(editIncidentTypes)}</div>
                <div class="st-desc" style="margin-top:4px">引导描述只给推演灵感方向——事件具体内容（标题/范围/影响/风声）由推演 LLM 按当前世界观生成</div>
              </div>
            </div>
            <div class="st-card">
              <div class="st-card-head"><span class="st-card-title">🌏 远方回响（账本驱动）</span></div>
              ${stRow('<span style="font-size:13px">远方动态掷骰</span>', '账本累积重大事件后，按概率在玩家所在大区之外生成远方事件链萌芽或风声——世界在别处继续', stSwitch('distantEchoEnabled', s.distantEchoEnabled))}
              <hr class="st-hr">
              <div class="st-grid3">
                <div class="st-field"><span class="st-label">账本阈值（条）</span>${stNum('distantEchoLedgerThreshold', s.distantEchoLedgerThreshold, 1, 1)}</div>
                <div class="st-field"><span class="st-label">触发概率（%/楼）</span>${stNum('distantEchoChance', s.distantEchoChance, 1, 0, 100)}</div>
                <div class="st-field"><span class="st-label">冷却楼数</span>${stNum('distantEchoCooldown', s.distantEchoCooldown, 1, 0)}</div>
              </div>
              <div class="st-desc" style="margin-top:4px">📜 旧档累积 Lv3+ 重大记录达阈值后开始掷骰；生成成功后冷却 N 楼（与区域事件互斥顺延）</div>
            </div>
          </div>
          <div class="${paneCls('l-dossier')}" id="l-dossier">
            <div class="st-card"><span class="st-label">主角核心白名单（绝不背叛、绝不可能是间谍）</span>
              ${stArea('coreTeam', s.coreTeam, 2, '逗号/换行分隔；留空则任何人都可能是间谍')}</div>
            <div class="st-card"><span class="st-label">敌方阵营候选池（推演参考，具体敌人正文 AI 自选）</span>
              ${stArea('enemyPool', s.enemyPool, 2, '逗号/换行分隔；留空则不注入')}</div>
            <div class="st-card"><span class="st-label">最高附加铁律（拼到推演输入文末，压过默认规则）</span>
              ${stArea('extraRules', s.extraRules, 3, '例：灰瘟与邪教无任何关系，禁止关联')}</div>
          </div>
          <div class="${paneCls('l-sync')}" id="l-sync">
            ${syncSectionHtml('world', '世界书同步（→ 推演输入）')}
          </div>
          <div class="${paneCls('l-prompt')}" id="l-prompt">
            ${promptSectionHtml('director', '导演社论母版（推演 system 提示词）', DirectorPrompt)}
          </div>
          <div class="${paneCls('l-diag')}" id="l-diag">
            <div class="st-card">
              <div class="st-card-head"><span class="st-card-title">通讯诊断与档案回溯</span></div>
              <div class="ad-btnrow" style="margin-top:0">
                <button id="ad-debug-open" class="ad-row-btn">🐞 LLM 调试日志（最近 20 次）</button>
                <button id="ad-history-open" class="ad-row-btn">🕘 历史记录（世界演变流水）</button>
              </div>
            </div>
            <div class="st-card">${stRow('调试模式', '记录 LLM 请求/响应（控制台 + 日志查看）', stSwitch('debug', s.debug))}</div>
            <div class="st-card">${stRow('皮肤', 'paper · 1920s 阿卡姆大报 / slate · 深色档案（MMS 基因）',
              `<select id="ad-set-theme" class="st-select" style="max-width:280px">
                <option value="paper">paper · 1920s 阿卡姆大报（默认）</option>
                <option value="slate">slate · 深色档案（MMS 基因）</option>
              </select>`)}</div>
          </div>
        </section>
      </div>
      <div class="st-foot">
        <span class="colophon">PC 宽屏工作台 · 全部设置项 change 即时持久化</span>
        <div style="display:flex;gap:8px">
          <button id="ad-set-save" class="ad-row-btn" style="border-color:var(--ad-accent-dim);color:var(--ad-accent)">✓ 保存生效</button>
          <button id="ad-set-close2" class="ad-row-btn">关闭</button>
        </div>
      </div>`);
    els.modalBox.classList.add('st-expanded');
    els.modalBox.querySelector('#ad-set-theme').value = currentTheme;

    // 栏目导航切换
    els.modalBox.querySelectorAll('.st-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        settingsActiveTab = btn.getAttribute('data-stab');   // V0.4.0 记住当前栏——重渲（增删事件行等）不再跳回首屏
        els.modalBox.querySelectorAll('.st-nav-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        els.modalBox.querySelectorAll('.st-pane').forEach(p => p.classList.remove('active'));
        const pane = els.modalBox.querySelector(`#${btn.getAttribute('data-stab')}`);
        if (pane) pane.classList.add('active');
      });
    });
    // 步进器（± 按钮改值并触发 change 持久化）
    els.modalBox.querySelectorAll('[data-step-k]').forEach(btn => {
      btn.addEventListener('click', () => stepSyncValue(els.modalBox, btn.getAttribute('data-step-k'), Number(btn.getAttribute('data-step'))));
    });
    // 全部设置项 change 即时持久化（不依赖"保存"按钮——名单/端点/楼数改完即生效）
    els.modalBox.querySelectorAll('[data-k]').forEach(el => {
      el.addEventListener('change', () => {
        collectFormToSettings(els.modalBox);
        saveSettings(SETTINGS);
        // 推演开关切换即时生效：关→词条下灯；开→强制重写重新上灯
        if (el.getAttribute('data-k') === 'enabledDirector') applySwitches();
      });
    });

    const bindSyncOps = () => {
      els.modalBox.querySelectorAll('[data-sync-add]').forEach(btn => {
        btn.addEventListener('click', () => {
          collectFormToSettings(els.modalBox);
          editSync[btn.getAttribute('data-sync-add')].push({ book: '', entries: [] });
          renderSettingsModal();
        });
      });
      els.modalBox.querySelectorAll('[data-sync-book]').forEach(sel => {
        sel.addEventListener('change', () => {
          collectFormToSettings(els.modalBox);
          const [slot, i] = sel.getAttribute('data-sync-book').split(':');
          editSync[slot][+i].book = sel.value;
          editSync[slot][+i].entries = [];
          persistSyncNow();   // 选书即时保持
          renderSettingsModal();
        });
      });
      els.modalBox.querySelectorAll('[data-sync-pick]').forEach(btn => {
        btn.addEventListener('click', () => {
          collectFormToSettings(els.modalBox);
          const [slot, i] = btn.getAttribute('data-sync-pick').split(':');
          openSyncPicker(slot, +i);
        });
      });
      els.modalBox.querySelectorAll('[data-sync-del]').forEach(btn => {
        btn.addEventListener('click', () => {
          collectFormToSettings(els.modalBox);
          const [slot, i] = btn.getAttribute('data-sync-del').split(':');
          editSync[slot].splice(+i, 1);
          persistSyncNow();   // 删除即时保持
          renderSettingsModal();
        });
      });
    };
    bindSyncOps();
    bindIncidentOps(els.modalBox);
    bindPromptOps({ director: DirectorPrompt });

    els.modalBox.querySelector('#ad-debug-open').addEventListener('click', () => {
      collectFormToSettings(els.modalBox);   // 先收表单（含调试开关），再打开日志
      openDebugModal();
    });

    els.modalBox.querySelector('#ad-history-open').addEventListener('click', () => {
      collectFormToSettings(els.modalBox);
      openHistoryModal();
    });

    const saveAndClose = () => {
      collectFormToSettings(els.modalBox);
      persistSyncNow();
      applySwitches();   // 开关状态兜底生效（表单与即时监听一致时幂等）
      if (SETTINGS.enabledDirector) scheduleDispatch('settings-saved');
      const theme = els.modalBox.querySelector('#ad-set-theme').value;
      const p = loadUiPrefs(); p.theme = theme; saveUiPrefs(p);
      applyTheme(theme);
      toast('设置已保存');
      closeModal();
    };
    els.modalBox.querySelector('#ad-set-save').addEventListener('click', saveAndClose);
    els.modalBox.querySelector('#ad-set-close2').addEventListener('click', closeModal);
    els.modalBox.querySelector('#ad-set-close').addEventListener('click', closeModal);
  }

  // —— 移动端面板内切设置视图（V0.3.7：#ad-panel 原位切换，零弹窗；4-Tab 卡片）———

  let mobileSettingsActive = false;
  let mobileTab = 'm-wire';
  let mobileStageBackup = '';   // 进入设置视图前的报头阶段文本（返回时还原）

  function stSwitchRow(label, desc, k, on) {
    return `<div class="st-row" style="margin-bottom:8px"><div><span class="st-label">${label}</span>${desc ? `<div class="st-desc">${desc}</div>` : ''}</div>${stSwitch(k, on)}</div>`;
  }

  function renderMobileSettings() {
    const s = SETTINGS;
    const root = els.viewSettings;
    const promptData = DirectorPrompt.load();
    const promptActive = promptData.presets.find(p => p.id === promptData.active) || promptData.presets[0];
    const promptOptions = promptData.presets.map(p =>
      `<option value="${esc(p.id)}" ${p.id === promptData.active ? 'selected' : ''}>${esc(p.name)}${p.locked ? ' 🔒' : ''}</option>`).join('');
    const syncChips = (SETTINGS.worldSync || []).map(src =>
      `<span class="st-chip">${esc(src.book)}（${src.entries.length} 词条）</span>`).join('')
      || '<span class="st-desc">未配置——世界书同步的编辑请使用 PC 端设置。</span>';
    const tabs = [
      ['m-wire', '📡 电传步调'], ['m-combat', '🎲 遭遇突发'], ['m-dossier', '📜 人事档案'], ['m-codex', '✍ 母版日志'],
    ];
    root.innerHTML = `
      <div class="mv-tabs">
        ${tabs.map(([id, label]) => `<button class="mv-tab${id === mobileTab ? ' active' : ''}" data-mtab="${id}">${label}</button>`).join('')}
      </div>
      <div class="mv-body">
        <div class="mv-pane${mobileTab === 'm-wire' ? ' active' : ''}" id="m-wire">
          <div class="st-card">
            <div class="st-card-head"><span class="st-card-title">副导演 API 线路</span></div>
            <div class="st-field"><span class="st-label">Base URL</span>${stInput('director.baseUrl', s.director.baseUrl, 'https://…/v1')}</div>
            <div class="st-field"><span class="st-label">API Key</span>${stInput('director.apiKey', s.director.apiKey, 'sk-…')}</div>
            <div class="st-field"><span class="st-label">Model 名</span>${stInput('director.model', s.director.model, '模型名')}</div>
            <div class="st-grid2">
              <div class="st-field"><span class="st-label">温度</span>${stNum('director.temperature', s.director.temperature, 0.1, 0, 2)}</div>
              <div class="st-field"><span class="st-label">MaxTokens</span>${stNum('director.maxTokens', s.director.maxTokens, 100, 256)}</div>
            </div>
          </div>
          <div class="st-card">
            <div class="st-card-head"><span class="st-card-title">世界推演调度</span></div>
            ${stSwitchRow('世界推演总开关', '推演 $ad_world 并写入词条', 'enabledDirector', s.enabledDirector)}
            <hr class="st-hr">
            ${stRow('推演心跳间隔（楼）', '常态每隔 N 楼常规推演一次', stStepper('directorEveryX', s.directorEveryX, 1, 1))}
          </div>
        </div>
        <div class="mv-pane${mobileTab === 'm-combat' ? ' active' : ''}" id="m-combat">
          <div class="st-card">
            <div class="st-card-head"><span class="st-card-title">街头随机遭遇</span></div>
            ${stSwitchRow('每楼随机遭遇掷骰', '命中即追加强制开战指令', 'randomCombatEnabled', s.randomCombatEnabled)}
            ${stRow('基准遇敌率（%）', '兜底值，命中 spots 时被覆盖', stStepper('randomCombatChance', s.randomCombatChance, 1, 0, 100))}
            <hr class="st-hr">
            ${stSwitchRow('防连战锁', '每推演周期最多一场', 'randomCombatOncePerCycle', s.randomCombatOncePerCycle)}
            ${stSwitchRow('战斗结束冷却', `结束后 ${s.randomCombatCooldownFloors} 楼内不掷随机`, 'randomCombatCooldown', s.randomCombatCooldown)}
            ${stRow('冷却楼数', '', stStepper('randomCombatCooldownFloors', s.randomCombatCooldownFloors, 1, 0))}
          </div>
          <div class="st-card">
            <div class="st-card-head"><span class="st-card-title">⚡ 区域突发事件</span>
              <button id="ad-m-inc-add" class="ad-row-btn">＋ 添加</button></div>
            ${stSwitchRow('本地事件掷骰', '类型掷骰本地定，内容推演生成', 'regionalIncidentEnabled', s.regionalIncidentEnabled)}
            <div class="st-grid3">
              <div class="st-field"><span class="st-label">概率(%/楼)</span>${stNum('regionalIncidentChance', s.regionalIncidentChance, 0.5, 0, 100)}</div>
              <div class="st-field"><span class="st-label">持续楼数</span>${stNum('regionalIncidentDuration', s.regionalIncidentDuration, 1, 1)}</div>
              <div class="st-field"><span class="st-label">冷却楼数</span>${stNum('regionalIncidentCooldown', s.regionalIncidentCooldown, 1, 0)}</div>
            </div>
            <div class="st-field"><span class="st-label">事件类型（开关/名称/权重；引导描述编辑请用 PC 端）</span>
              <div id="ad-m-inc-list">${renderIncidentRows(SETTINGS.regionalIncidentTypes)}</div></div>
          </div>
          <div class="st-card">
            <div class="st-card-head"><span class="st-card-title">🌏 远方回响</span></div>
            ${stSwitchRow('远方动态掷骰', '账本驱动，玩家所在大区之外生成远方事件/风声', 'distantEchoEnabled', s.distantEchoEnabled)}
            <div class="st-grid3">
              <div class="st-field"><span class="st-label">阈值(条)</span>${stNum('distantEchoLedgerThreshold', s.distantEchoLedgerThreshold, 1, 1)}</div>
              <div class="st-field"><span class="st-label">概率(%/楼)</span>${stNum('distantEchoChance', s.distantEchoChance, 1, 0, 100)}</div>
              <div class="st-field"><span class="st-label">冷却楼数</span>${stNum('distantEchoCooldown', s.distantEchoCooldown, 1, 0)}</div>
            </div>
          </div>
        </div>
        <div class="mv-pane${mobileTab === 'm-dossier' ? ' active' : ''}" id="m-dossier">
          <div class="st-card"><span class="st-label">主角核心白名单（绝不背叛）</span>${stArea('coreTeam', s.coreTeam, 2, '逗号/换行分隔')}</div>
          <div class="st-card"><span class="st-label">敌方阵营候选池（推演参考）</span>${stArea('enemyPool', s.enemyPool, 2, '逗号/换行分隔')}</div>
          <div class="st-card"><span class="st-label">附加最高铁律（推演文末，最高优先级）</span>${stArea('extraRules', s.extraRules, 3, '世界观纠偏/尺度约束')}</div>
          <div class="st-card">
            <div class="st-card-head"><span class="st-card-title">世界书同步词条</span></div>
            <div class="st-chips">${syncChips}</div>
          </div>
        </div>
        <div class="mv-pane${mobileTab === 'm-codex' ? ' active' : ''}" id="m-codex">
          <div class="st-card">
            <div class="st-card-head"><span class="st-card-title">副导演提示词预设</span>${promptActive && promptActive.locked ? '<span class="st-desc" style="color:var(--ad-accent);font-weight:bold">🔒 官方内置</span>' : ''}</div>
            <select id="ad-m-prompt-sel" class="st-select" style="margin-bottom:6px">${promptOptions}</select>
            <button id="ad-m-prompt-add" class="ad-row-btn" style="width:100%">＋ 复制新建预设</button>
          </div>
          <div class="st-card">
            <div class="st-card-head"><span class="st-card-title">通讯诊断与记录</span></div>
            <div style="display:flex;gap:6px">
              <button id="ad-m-debug" class="ad-row-btn" style="flex:1">🐞 LLM 日志</button>
              <button id="ad-m-history" class="ad-row-btn" style="flex:1">🕘 历史记录</button>
            </div>
            <hr class="st-hr">
            ${stSwitchRow('调试模式', '记录 LLM 请求/响应', 'debug', s.debug)}
          </div>
        </div>
      </div>
      <div class="mv-foot">
        <button id="ad-m-back" class="ad-row-btn">← 返回增刊</button>
        <button id="ad-m-save" class="ad-row-btn" style="border-color:var(--ad-accent-dim);color:var(--ad-accent)">✓ 保存生效</button>
      </div>`;

    // tab 切换
    root.querySelectorAll('[data-mtab]').forEach(btn => {
      btn.addEventListener('click', () => {
        mobileTab = btn.getAttribute('data-mtab');
        root.querySelectorAll('.mv-tab').forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        root.querySelectorAll('.mv-pane').forEach(p => p.classList.remove('active'));
        const pane = root.querySelector(`#${mobileTab}`);
        if (pane) pane.classList.add('active');
      });
    });
    // 步进器
    root.querySelectorAll('[data-step-k]').forEach(btn => {
      btn.addEventListener('click', () => stepSyncValue(root, btn.getAttribute('data-step-k'), Number(btn.getAttribute('data-step'))));
    });
    // 表单即时持久化（只收移动端容器——PC 弹窗未打开，无陈旧覆盖风险）
    root.querySelectorAll('[data-k]').forEach(input => {
      input.addEventListener('change', () => {
        collectFormToSettings(root);
        saveSettings(SETTINGS);
        if (input.getAttribute('data-k') === 'enabledDirector') applySwitches();
      });
    });
    // 提示词预设（复用 store；sel/add 即时生效）
    const promptSel = root.querySelector('#ad-m-prompt-sel');
    if (promptSel) promptSel.addEventListener('change', () => {
      DirectorPrompt.select(promptSel.value);
      renderMobileSettings();
    });
    const promptAdd = root.querySelector('#ad-m-prompt-add');
    if (promptAdd) promptAdd.addEventListener('click', () => {
      const name = prompt('新提示词预设名称：', '');
      if (!name) return;
      DirectorPrompt.add(name);
      renderMobileSettings();
    });
    const mDebug = root.querySelector('#ad-m-debug');
    if (mDebug) mDebug.addEventListener('click', () => { collectFormToSettings(root); openDebugModal(); });
    const mHistory = root.querySelector('#ad-m-history');
    if (mHistory) mHistory.addEventListener('click', () => { collectFormToSettings(root); openHistoryModal(); });
    // 区域事件类型行（移动端简化：直接改 SETTINGS 数组并保存；引导描述 PC 端编辑）
    const mIncList = root.querySelector('#ad-m-inc-list');
    if (mIncList) {
      const persistInc = () => { saveSettings(SETTINGS); };
      const readRow = (i) => {
        const row = mIncList.querySelector(`[data-inc-i="${i}"]`);
        const t = SETTINGS.regionalIncidentTypes[i];
        if (!t) return;
        t.label = row.querySelector('[data-inc-label]').value.trim();
        t.weight = Number(row.querySelector('[data-inc-weight]').value) || 0;
        t.enabled = row.querySelector('[data-inc-toggle]').checked;
      };
      mIncList.addEventListener('change', e => {
        const target = e.target;
        const i = Number(target.getAttribute('data-inc-toggle') || target.getAttribute('data-inc-label')
          || target.getAttribute('data-inc-weight'));
        if (!Number.isFinite(i)) return;
        readRow(i);
        persistInc();
      });
      const mAdd = root.querySelector('#ad-m-inc-add');
      if (mAdd) mAdd.addEventListener('click', () => {
        SETTINGS.regionalIncidentTypes.push({ label: '新事件类型', guide: '', weight: 10, enabled: true, custom: true });
        persistInc();
        renderMobileSettings();
      });
      mIncList.addEventListener('click', e => {
        const del = e.target.closest('[data-inc-del]');
        if (!del) return;
        SETTINGS.regionalIncidentTypes.splice(Number(del.getAttribute('data-inc-del')), 1);
        persistInc();
        renderMobileSettings();
      });
    }
    root.querySelector('#ad-m-back').addEventListener('click', closeMobileSettings);
    root.querySelector('#ad-m-save').addEventListener('click', () => {
      collectFormToSettings(root);
      saveSettings(SETTINGS);
      applySwitches();
      if (SETTINGS.enabledDirector) scheduleDispatch('mobile-settings-saved');
      toast('设置已保存');
      closeMobileSettings();
    });
  }

  function toggleMobileSettings() {
    if (mobileSettingsActive) closeMobileSettings();
    else {
      mobileSettingsActive = true;
      renderMobileSettings();
      els.viewNews.style.display = 'none';
      els.viewSettings.style.display = 'flex';
      if (els.headTitle) els.headTitle.textContent = '⚙ 设定增刊 · PREFERENCES';
      const stage = els.mastStageSlate || els.mastStage;
      if (stage) { mobileStageBackup = stage.textContent; stage.textContent = '设置中'; }
      log('移动端设置视图（面板内切，零弹窗）');
    }
  }
  function closeMobileSettings() {
    mobileSettingsActive = false;
    els.viewSettings.style.display = 'none';
    els.viewNews.style.display = 'flex';
    if (els.headTitle) els.headTitle.textContent = '悉尼星期增刊 · GAZETTE';
    const stage = els.mastStageSlate || els.mastStage;
    if (stage && mobileStageBackup) stage.textContent = mobileStageBackup;
    mobileStageBackup = '';
  }

  // —— LLM 调试日志弹窗（最近 20 次请求/响应；debug 开关开启时记录）—————————

  // —— 历史记录弹窗（V0.3.5：推演/随机遭遇/系统事件 三 tab；MMS 历史模块同构）—————

  let historyTab = 'evolve';   // 当前查看的 tab（evolve | combat | system）

  function renderHistoryModal() {
    const h = getHistory();
    const tabs = [
      ['evolve', `📡 推演（${h.evolve.length}）`],
      ['combat', `🎲 随机遭遇（${h.combat.length}）`],
      ['incident', `🎯 突发事件（${h.incident.length}）`],
      ['system', `⚙ 系统事件（${h.system.length}）`],
    ];
    const timeStr = at => new Date(at || Date.now()).toLocaleString();
    let list = '';
    if (historyTab === 'evolve') {
      list = h.evolve.map(e => `
        <div class="ad-card-item" style="cursor:default;align-items:flex-start;flex-direction:column;gap:2px">
          <div style="display:flex;justify-content:space-between;width:100%">
            <span class="place">第 ${e.round || '?'} 轮 · ${esc(e.reason || '')}</span>
            <span class="meta">${timeStr(e.at)} · 派系${e.factions ?? '?'} 事件${e.events ?? '?'} 风声${e.winds ?? '?'}</span>
          </div>
          <div class="dim" style="font-size:10px;color:var(--ad-ink-faint)">${esc(e.digest || '')}</div>
          <div class="dim" style="font-size:10px;color:var(--ad-ink-faint)">变化：${esc(e.changes || '')}</div>
        </div>`).join('') || '<div class="dim" style="padding:8px 2px">尚无推演记录。</div>';
    } else if (historyTab === 'combat') {
      list = h.combat.map(e => `
        <div class="ad-card-item" style="cursor:default">
          <span class="place">🎲 ${esc(String(e.location || '').slice(0, 24) || '未知地点')}</span>
          <span class="meta">${timeStr(e.at)} · ${e.chance ?? '?'}%（${esc(e.via || '')}${e.heat ? ' · heat' + e.heat : ''}${e.tension ? ' · 张力' + e.tension : ''}）</span>
        </div>`).join('') || '<div class="dim" style="padding:8px 2px">尚无随机遭遇记录。</div>';
    } else if (historyTab === 'incident') {
      list = h.incident.map(e => `
        <div class="ad-card-item" style="cursor:default;align-items:flex-start;flex-direction:column;gap:2px">
          <div style="display:flex;justify-content:space-between;width:100%">
            <span class="place">${e.phase === '消散' ? '🌫 消散' : '⚡ 触发'} ${esc(e.title || '')}</span>
            <span class="meta">${timeStr(e.at)}${e.phase !== '消散' && e.type ? ' · ' + esc(e.type) : ''}${e.zone ? ' · ' + esc(e.zone) : ''}</span>
          </div>
          ${e.impact ? `<div class="dim" style="font-size:10px;color:var(--ad-ink-faint)">${esc(e.impact)}</div>` : ''}
        </div>`).join('') || '<div class="dim" style="padding:8px 2px">尚无突发事件记录。</div>';
    } else {
      list = h.system.map(e => `
        <div class="ad-card-item" style="cursor:default">
          <span class="place">${e.type === 'rollback' ? '↩ 楼层回滚' : '⚔ 战斗结束'}</span>
          <span class="meta">${timeStr(e.at)} · ${esc(e.note || '')}</span>
        </div>`).join('') || '<div class="dim" style="padding:8px 2px">尚无系统事件记录。</div>';
    }
    openModal(`
      <h3>🕘 历史记录</h3>
      <div class="dim" style="font-size:9.5px;color:var(--ad-ink-faint);margin-bottom:8px">
        世界演变过程档案（各类环形保留最近 ${HISTORY_LIMIT} 条，存 $ad_history 随聊天走）。</div>
      <div class="ad-tabs" style="margin-bottom:8px">
        ${tabs.map(([k, label]) => `<button class="ad-tab${k === historyTab ? ' active' : ''}" data-htab="${k}">${label}</button>`).join('')}
      </div>
      <div style="max-height:52vh;overflow-y:auto">${list}</div>
      <div class="ad-btnrow">
        <button id="ad-history-clear">🗑 清空全部历史</button>
        <button id="ad-history-back">返回设置</button>
      </div>`);
    els.modalBox.querySelectorAll('[data-htab]').forEach(btn => {
      btn.addEventListener('click', () => { historyTab = btn.getAttribute('data-htab'); renderHistoryModal(); });
    });
    els.modalBox.querySelector('#ad-history-clear').addEventListener('click', () => {
      if (!confirm('确定清空全部历史记录？')) return;
      clearHistory();
      toast('历史记录已清空');
      renderHistoryModal();
    });
    els.modalBox.querySelector('#ad-history-back').addEventListener('click', renderSettingsModal);
  }

  function openHistoryModal() { historyTab = 'evolve'; renderHistoryModal(); }

  function openDebugModal() {
    const rows = DebugLog.slice().reverse().map((e, i) => `
      <div class="ad-card-item" data-dbg="${DebugLog.length - 1 - i}" style="cursor:pointer">
        <span class="place">${esc(e.label)} · ${esc(e.model || '')}</span>
        <span class="meta">${e.at ? new Date(e.at).toLocaleTimeString() : ''} · ${e.ms}ms · ${e.ok ? '<span class="ad-dbg-ok">✓ 成功</span>' : `<span class="ad-dbg-fail">✗ ${esc(e.error || '失败')}</span>`}</span>
      </div>`).join('') || '<div class="dim" style="padding:10px 4px">暂无记录——开启调试模式后，每次 LLM 调用（产卡/推演）会记录请求与响应。</div>';
    openModal(`
      <h3>🐞 LLM 调试日志（${DebugLog.length}）</h3>
      <div class="dim" style="font-size:10px;color:var(--ad-ink-faint);margin-bottom:8px">点击条目查看完整请求/响应。仅调试模式开启时记录（环形保留 20 条，刷新页面清空）。</div>
      ${rows}
      <div class="ad-btnrow"><button id="ad-dbg-back">返回设置</button></div>`);
    els.modalBox.querySelectorAll('[data-dbg]').forEach(n => {
      n.addEventListener('click', () => {
        const e = DebugLog[+n.getAttribute('data-dbg')];
        if (!e) return;
        // messages 按角色分块渲染：换行真实呈现（pre-wrap），不再是被 JSON.stringify 转义的 \n 字面量
        const msgHtml = (e.messages || []).map(m => `
          <span class="ad-dbg-role${m.role === 'system' ? ' sys' : ''}">${esc(String(m.role || '?').toUpperCase())}</span>
          <div class="ad-dbg-block">${esc(typeof m.content === 'string' ? m.content : JSON.stringify(m.content, null, 1))}</div>`).join('');
        openModal(`
          <h3>🐞 ${esc(e.label)} · ${esc(e.model || '')} · ${e.ok ? '<span class="ad-dbg-ok">✓</span>' : '<span class="ad-dbg-fail">✗ ' + esc(e.error || '') + '</span>'}</h3>
          <div class="dim" style="font-size:9.5px;color:var(--ad-ink-faint);margin-bottom:6px">${esc(e.url)} · ${e.ms}ms${e.at ? ' · ' + new Date(e.at).toLocaleTimeString() : ''}</div>
          <div class="ad-sec-title">请求 messages（按角色分块）</div>
          ${msgHtml || '<div class="dim">（无）</div>'}
          <div class="ad-sec-title" style="margin-top:10px">响应原文</div>
          <div class="ad-dbg-block">${esc(e.raw || '（空）')}</div>
          <div class="ad-btnrow"><button id="ad-dbg-back2">返回日志</button></div>`);
        els.modalBox.querySelector('#ad-dbg-back2').addEventListener('click', openDebugModal);
      });
    });
    els.modalBox.querySelector('#ad-dbg-back').addEventListener('click', renderSettingsModal);
  }

  // —— 世界状态查看弹窗（GM：派系/事件/风声/遇敌概率概览 + 完整 JSON + 重新推演）———

  function openWorldModal(world) {
    if (!world) { toast('尚无世界状态'); return; }
    const enc = world.encounter || {};
    const facRows = (world.factions || []).map(f => `
      <div class="ad-card-item" style="cursor:default">
        <span class="place">${esc(f.name)}${f.zone ? `（${esc(f.zone)}）` : ''}</span>
        <span class="meta">${esc(f.state)} · ${esc((f.causes || [])[0] || '')}</span>
      </div>
      <div class="dim" style="font-size:10px;color:var(--ad-ink-faint);margin:-4px 0 8px">
        征兆：${esc(f.surface)}<br>真相：${esc(f.truth)}${f.stance ? `<br>对我方：${esc(f.stance)}` : ''}${f.relations ? `<br>关系：${esc(f.relations)}` : ''}${f.morale ? `<br>士气：${esc(f.morale)}` : ''}</div>`).join('')
      || '<div class="dim">（无派系条目）</div>';
    const evRows = (world.events || []).map(ev => `
      <div class="ad-card-item" style="cursor:default">
        <span class="place">${esc(ev.name)}</span>
        <span class="meta">${ev.type === 'progress' ? '进展' : '冲突'} · ${esc(ev.stage)} ${ev.stageRound}/9 · Lv${ev.level}</span>
      </div>
      <div class="dim" style="font-size:10px;color:var(--ad-ink-faint);margin:-4px 0 8px">${esc(ev.desc || '')}${ev.factions && ev.factions.length ? '｜涉及：' + esc(ev.factions.join('、')) : ''}</div>`).join('')
      || '<div class="dim">（无事件）</div>';
    const windRows = (world.winds || []).map(w => `
      <div class="ad-card-item" style="cursor:default">
        <span class="place">📣 ${esc(w.content)}</span>
        <span class="meta">${esc(w.spread || '流传')} · 安静${w.quietRounds || 0}楼</span>
      </div>`).join('')
      || '<div class="dim">（无风声）</div>';
    const encRows = [
      `<div class="ad-card-item" style="cursor:default"><span class="place">🌡 剧情冷热</span><span class="meta">${enc.heat ? `${enc.heat.value > 0 ? '+' : ''}${enc.heat.value} · ${esc(enc.heat.why || '')}` : '未设置'}</span></div>`,
      ...((enc.spots || []).map(z => `<div class="ad-card-item" style="cursor:default"><span class="place">📍 ${esc(z.match)}</span><span class="meta">${z.chance}%${z.why ? ' · ' + esc(z.why) : ''}${z.chance === 0 ? '（安全区）' : ''}</span></div>`)),
      ...((enc.districts || []).map(z => `<div class="ad-card-item" style="cursor:default"><span class="place">🏙 ${esc(z.match)}</span><span class="meta">${z.chance}%${z.why ? ' · ' + esc(z.why) : ''}${z.chance === 0 ? '（安全区）' : ''}</span></div>`)),
    ].join('');
    const forb = ((world.resistance && world.resistance.forbidden) || [])
      .map(x => `<div class="dim" style="font-size:10px;color:var(--ad-ink-faint)">· ${esc(x.truth)}【途径：${esc(x.path)}】</div>`).join('');
    const inc = (world.incident && world.incident.active) ? world.incident : null;
    const incRows = inc
      ? `<div class="ad-sec-title">区域突发事件（剩余 ${inc.duration || 1} 楼）</div>
        <div class="ad-card-item" style="cursor:default;align-items:flex-start;flex-direction:column;gap:2px;border-color:var(--ad-accent-dim)">
          <div style="display:flex;justify-content:space-between;width:100%">
            <span class="place">⚠ ${esc(inc.title || '未命名')}</span>
            <span class="meta">${esc(inc.type || '')} · ${esc(inc.zone || '')}</span>
          </div>
          <div class="dim" style="font-size:10px;color:var(--ad-ink-faint)">${esc(inc.impact || '')}</div>
        </div>`
      : (world.incident && (world.incident.cooldown || 0) > 0
        ? `<div class="ad-sec-title">区域突发事件</div><div class="dim">已消散（冷却剩余 ${world.incident.cooldown} 楼）</div>` : '');
    openModal(`
      <h3>🌍 世界状态 · 第 ${world.round || 1} 轮${world.digest ? ` · ${esc(world.digest)}` : ''}</h3>
      <div class="dim" style="font-size:9.5px;color:var(--ad-ink-faint);margin-bottom:8px">
        生成于 ${new Date(world.generatedAt || Date.now()).toLocaleString()}（触发：${esc(world.reason || '—')}）</div>
      ${incRows}
      <div class="ad-sec-title">事件链（本地骰每楼推进）</div>${evRows}
      <div class="ad-sec-title">风声（安静超时按概率消散）</div>${windRows}
      <div class="ad-sec-title">派系动向（暗线三态）</div>${facRows}
      <div class="ad-sec-title">遇敌概率档案</div>${encRows}
      ${forb ? `<div class="ad-sec-title">禁泄清单</div>${forb}` : ''}
      <div class="ad-sec-title">完整世界状态（存档 $ad_world）</div>
      <textarea readonly style="width:100%;height:180px;background:var(--ad-input-bg);color:var(--ad-ink);border:1px solid var(--ad-border);border-radius:var(--ad-radius-sm);font-family:inherit;font-size:10px;padding:8px;">${esc(JSON.stringify(world, null, 2))}</textarea>
      <div class="ad-btnrow">
        <button class="primary" id="ad-report-regen">📡 重新推演</button>
        <button id="ad-report-wipe" title="清空当前世界状态（含回滚快照），从零重新推演；名册与钦定设定保留">🗑 清空重推</button>
        <button id="ad-report-close">关闭</button>
      </div>`);
    els.modalBox.querySelector('#ad-report-regen').addEventListener('click', () => {
      closeModal();
      generateDirectorEvolve('manual');
    });
    // V0.4.4 清空重推：$ad_world 与 checkpoint 一并清（防删楼回滚复活旧世界），名册保留，
    // 随即手动推演——lastWorld 为空即"首次推演从零建立"
    els.modalBox.querySelector('#ad-report-wipe').addEventListener('click', () => {
      if (!confirm('确定清空当前世界状态并从零重新推演？\n（派系/事件链/风声/遇敌档案全部重建；名册与钦定设定保留）')) return;
      writeChatVar(CV.world, null);
      writeChatVar(CV.worldCheckpoint, null);
      closeModal();
      toast('🗑 已清空世界状态——从零推演中…');
      generateDirectorEvolve('manual');
    });
    els.modalBox.querySelector('#ad-report-close').addEventListener('click', closeModal);
  }

  // —— S5 派系名册弹窗（名册 CRUD + 墓碑）———————————————————————

  function openRosterModal() {
    const roster = getRoster();
    const rows = roster.factions.map(name => `
      <div class="ad-card-item" style="cursor:default">
        <span class="place">${roster.prompts[name] ? '📌 ' : ''}${esc(name)}</span>
        <span style="display:flex;gap:4px">
          <button class="ad-row-btn" data-fp="${esc(name)}" title="作者钦定设定：定位/实力/认知边界，注入推演输入（优先级高于默认铁律）">✏️ 设定</button>
          <button class="ad-row-btn" data-tomb="${esc(name)}" title="除名=墓碑：级联删该派系全部暗线并禁止模型复活">🪦 除名</button>
        </span>
      </div>`).join('') || '<div class="dim" style="padding:8px 2px">名册为空——世界推演时自动登记，或在上方手动添加。</div>';
    const tombs = roster.tombstones.map(name => `
      <div class="ad-card-item" style="cursor:default;opacity:0.62">
        <span class="place">🪦 ${esc(name)}</span>
        <button class="ad-row-btn" data-restore="${esc(name)}" title="出墓碑回名册（暗线由下一轮推演重新覆盖）">↩ 恢复</button>
      </div>`).join('');
    openModal(`
      <h3>📜 派系名册（在册 ${roster.factions.length} · 墓碑 ${roster.tombstones.length}）</h3>
      <div class="dim" style="font-size:10px;color:var(--ad-ink-faint);margin-bottom:8px">
        名册进推演输入（已知派系，新派系由推演自动登记）；除名=墓碑——级联删该派系全部暗线（世界状态条目、提及它的事件/风声/阻力整条删）并禁止模型复活。存 $ad_roster。</div>
      <div class="ad-form-row"><label>添加派系</label><input type="text" id="ad-roster-new" placeholder="派系名（轻量登场：先入册，真相由推演补）">
        <button class="ad-row-btn" id="ad-roster-add">＋ 入册</button></div>
      ${rows}
      ${roster.tombstones.length ? `<div class="ad-sec-title" style="margin-top:12px">墓碑（禁止复活）</div>${tombs}` : ''}
      <div class="ad-btnrow"><button id="ad-roster-close">关闭</button></div>`);
    els.modalBox.querySelector('#ad-roster-add').addEventListener('click', () => {
      const input = els.modalBox.querySelector('#ad-roster-new');
      if (addRosterFaction(input.value)) { toast(`已入册：${input.value.trim()}`); openRosterModal(); }
    });
    els.modalBox.querySelectorAll('[data-fp]').forEach(btn => {
      btn.addEventListener('click', () => openFactionPromptModal(btn.getAttribute('data-fp')));
    });
    els.modalBox.querySelectorAll('[data-tomb]').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = btn.getAttribute('data-tomb');
        if (tombstoneFaction(name)) { toast(`已除名入墓碑：${name}（暗线级联清除）`); openRosterModal(); }
      });
    });
    els.modalBox.querySelectorAll('[data-restore]').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = btn.getAttribute('data-restore');
        if (restoreFaction(name)) { toast(`已恢复入册：${name}`); openRosterModal(); }
      });
    });
    els.modalBox.querySelector('#ad-roster-close').addEventListener('click', closeModal);
  }

  // —— V0.4.4 派系钦定设定编辑弹窗（定位/实力/认知边界——注入推演输入）—————

  function openFactionPromptModal(name) {
    const current = String((getRoster().prompts || {})[name] || '');
    openModal(`
      <h3>✏️ 派系钦定设定 · ${esc(name)}</h3>
      <div class="dim" style="font-size:10px;color:var(--ad-ink-faint);margin-bottom:8px">
        作者钦定背景：该派系的定位/实力/认知边界以此为准，注入推演输入（优先级高于默认铁律；未覆盖字段仍按默认铁律推演）。多行自由文本，建议写明它知道什么、忌惮什么、核心对手是谁。存 $ad_roster.prompts。</div>
      <textarea id="ad-fp-text" style="width:100%;height:200px;background:var(--ad-input-bg);color:var(--ad-ink);border:1px solid var(--ad-border);border-radius:var(--ad-radius-sm);font-family:inherit;font-size:11px;padding:8px;box-sizing:border-box;resize:vertical" placeholder="例：受英王背书的调查员是其惹不起的对象——它若知情，反应是回避与借刀，而非正面对抗；核心对手是XX派系，当前动机是……">${esc(current)}</textarea>
      <div class="ad-btnrow">
        <button class="primary" id="ad-fp-save">保存</button>
        <button id="ad-fp-clear">清空</button>
        <button id="ad-fp-close">关闭</button>
      </div>`);
    els.modalBox.querySelector('#ad-fp-save').addEventListener('click', () => {
      if (setFactionPrompt(name, els.modalBox.querySelector('#ad-fp-text').value)) {
        toast('已保存派系钦定设定：' + name);
        openRosterModal();
      }
    });
    els.modalBox.querySelector('#ad-fp-clear').addEventListener('click', () => {
      if (setFactionPrompt(name, '')) { toast('已清空派系钦定设定：' + name); openRosterModal(); }
    });
    els.modalBox.querySelector('#ad-fp-close').addEventListener('click', () => openRosterModal());
  }



  // ═════════════════════════════════════════════════════════════════════
  // 10. 主流程编排
  // ═════════════════════════════════════════════════════════════════════

  function init() {
    if (UI_DOC.getElementById('ad-rail')) { logWarn('已初始化，跳过重复挂载'); return; }
    buildUI();
    if (IS_LIVE) {
      loadRuntimeState();
      bindEvent(EVT.started, onGenerationStarted);
      bindEvent(EVT.received, onFloorEvent);
      bindEvent(EVT.updated, onFloorEvent);
      bindEvent(EVT.swiped, onFloorEvent);
      bindEvent(EVT.deleted, onMessageDeleted);
      bindEvent(EVT.chatChanged, onChatChanged);
      log(`已挂载（LIVE · v${SCRIPT_VERSION}），等待楼层事件`);
      if (SETTINGS.enabledDirector) {
        syncDirectorEntry();   // 重挂载：按存档世界状态重建词条 + V0.2.x 旧双词条下灯
        State.forceDirectorWrite = true;   // 自愈：词条残留禁用态时首拍重新上灯
        scheduleDispatch('init');
      }
      else log('世界推演已关闭，仅 UI 待命（随机遭遇掷骰独立工作）');
    } else {
      log(`已挂载（DEMO · v${SCRIPT_VERSION}）——无酒馆助手环境，UI 可用，注入与监听待命`);
      updatePanelStatus('演示模式 · 无酒馆环境');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // —— 测试钩子（harness 用；生产环境无害）—————————————————————
  window.__AD__ = {
    version: SCRIPT_VERSION, IS_LIVE,
    // 引擎纯函数
    norm, zoneMatch, zoneHit, landmarkKey, statDateKey, statStage, statCity,
    buildDirectorSituationText, buildDirectorInjection,
    shortLoc, renderTicker, renderWire, applyTheme,
    // 本地骰（S7）与 checkpoint 回滚（S8）与战斗冷却（V0.3.4）
    rollEvents, rollWinds, runLocalDice, currentFloorId, eventZones, eventTension, maybeRollbackWorld,
    trackCombatEnd, combatCooldownActive,
    // 历史记录（V0.3.5）与区域突发事件（S9）与账本/远方回响（V0.4.0）
    getHistory, pushHistory, clearHistory, diffWorld, openHistoryModal,
    parseIncidentTypes, weightedPickIncident, rollRegionalIncident,
    buildIncidentDirective, buildIncidentOngoing, mergeIncident, defaultIncidentTypes: DEFAULT_INCIDENT_TYPES, normalizeIncidentTypes,
    getLedger, recordLedger, windSeen, LEDGER_KEEP,
    ensureDistant, sampleDistantLedger, buildDistantDirective, rollDistantEcho, acceptDistantEcho, triggerDistantEvolve,
    onFloorEvent, onMessageDeleted, genContextSuffix,
    buildTickerItems, TICKER_ORDER,
    // 设置 UI 双路分流（V0.3.7）
    isMobileDevice, toggleMobileSettings, closeMobileSettings, renderSettingsModal,
    EV_STAGES, STAGE_SCORE, clamp,
    // LLM 客户端与推演层
    callLLM, extractJson,
    getEnemyPool, getCoreTeam, getSyncedWorldbookText, getShadowlineFloorContext,
    getLwbSummaryText,
    checkTriggers, generateDirectorEvolve, buildDirectorContext, buildDirectorMessages,
    validateWorld, DirectorPrompt, DEFAULT_DIRECTOR_SYS,
    getRoster, saveRoster, addRosterFaction, tombstoneFaction, restoreFaction, openRosterModal,
    setFactionPrompt, openFactionPromptModal,   // V0.4.4：派系钦定设定
    Trigger, openWorldModal,
    // S6：随机遭遇掷骰
    onGenerationStarted, combatInProgress, encounterProfile, RC_MARKER, RC_DIRECTIVE,
    DebugLog, openDebugModal, persistSyncNow,
    // 状态与数据
    state: State, settings: () => SETTINGS, migrateSettings,
    saveSettings, loadSettings,
    readLatestStatData, dispatchNow, scheduleDispatch, persistRuntimeState, loadRuntimeState,
    // 注入通道（世界书词条）与功能开关
    writeWbEntry, merge3, disableWbEntries, syncDirectorEntry, applySwitches, HAS_WB,
    CV, WB_ENTRY_DIRECTOR, WB_ENTRY_LEGACY, MEMO_OPEN, SIT_OPEN, SIT_CLOSE,
    togglePanel, updatePanelMeta,
  };
})();
