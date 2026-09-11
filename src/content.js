// ==UserScript==
// @name         Assistant Director (副导演·世界模拟器)
// @namespace    assistant-director
// @version      0.3.1
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
  const SCRIPT_VERSION = '0.3.1';
  // 注入走角色卡主世界书词条（MMS 同构）：constant 蓝灯 + at_depth system 0/15，
  // 首次创建定位置，之后只改 content 不动 position——用户可在世界书编辑器自由调整顺序。
  // V0.3.0：双词条（态势/暗线）合并为单一"副导演"词条；旧词条升级时下灯不删。
  const WB_ENTRY_DIRECTOR = '副导演';
  const WB_ENTRY_LEGACY = ['副导演-态势', '副导演-暗线'];   // V0.2.x 旧词条：仅 disable
  const WB_ORDER = 15;
  // 注入模板：XML 标签分段 + 两空格缩进列表——LLM 注意力分区友好，人工维护直观
  const MEMO_OPEN = '<内部导演备忘（禁止以任何形式向玩家展示）>';
  const MEMO_CLOSE = '</内部导演备忘>';
  const SIT_OPEN = '<当前态势（禁止以任何形式向玩家展示）>';
  const SIT_CLOSE = '</当前态势>';
  // 信号级战斗提醒：敌方构成由正文 AI 自选（世界书图鉴），程序不再安排 menu
  const COMBAT_RULE_HINT =
    '【若本楼冲突升级 → 开战】按【战斗轮规则】输出 <Combat_block>：我方/敌方各只写名字；敌方从世界书图鉴中按剧情合理性选择（可加 *N 与 [变种]）。';

  // localStorage 键（设置与 UI 偏好，随浏览器走）
  const LS = {
    settings: 'ad_settings_v1',
    ui: 'ad_ui_v1',
    promptDirector: 'ad_prompt_director_v1', // 副导演提示词预设（默认项锁定，自定义存快照）
  };
  // 聊天变量键（$ 前缀对 LLM 隐形，随聊天文件走）
  const CV = {
    world: '$ad_world',    // S7：世界状态（派系暗线/事件链/风声/encounter，取代 $ad_report）
    state: '$ad_state',    // 运行时状态（上次注入文本/骰子楼层/防连战锁等）
    roster: '$ad_roster',  // 名册+墓碑
  };

  const ALERT_LEVELS = ['松懈', '常规', '警戒', '严密'];

  // —— 事件链与风声（S7 本地骰参数，仿世界引擎；模块常量，暂不做设置项）———————
  const EV_STAGES = ['萌芽', '发酵', '逼近', '爆发', '平息'];
  const STAGE_SCORE = { '萌芽': 0, '发酵': 2, '逼近': 6, '爆发': 12, '平息': -3 };   // eventTension 阶段分
  const WIND_GRACE = 3;        // 风声安静豁免楼数
  const WIND_BASE = 10;        // 消散概率基线（%）
  const WIND_LINEAR = 15;      // 每楼线性递增（%）

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
      if (!['paper', 'events', 'winds'].includes(p.activeTab)) p.activeTab = 'paper';
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
    const mod = new Map(), del = new Set(), ins = new Map(), head = [];
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
  // 区块匹配：norm 后互相包含（spot 对地标键 / district 对大区 / zone 对大区）
  function zoneMatch(pattern, text) {
    const p = norm(pattern), t = norm(text);
    return !!(p && t && (t.includes(p) || p.includes(t)));
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
      if (zones.length && zones.some(z => zoneMatch(z, locationText))) sum += score;
    }
    return sum;
  }

  // 遇敌概率档案（S7 算法）：
  //   最终概率 = clamp(0,100, 区域基值 + 冷热修正)；冷热修正 = clamp(-40,40, heat + eventTension)
  //   区域基值三级兜底：spots（地标级）> districts（大区级）> SETTINGS.randomCombatChance（玩家设置）
  //   显式安全标记：命中 spots/districts 且 chance===0 → 直接安全区，不叠修正
  //   spots/districts 都对整段地点串匹配（双向包含）：地标键在四级地点（大区·区·地标·房间）
  //   下会取到第二段"区"，对整串匹配才能兜住真实地标；spots 更具体、先查，精度由优先级保证
  function encounterProfile(locationText) {
    const base = { chance: clamp(0, 100, Number(SETTINGS.randomCombatChance) || 0), safe: false, via: 'settings', heat: 0, tension: 0 };
    const world = readChatVar(CV.world);
    if (!world || !world.encounter) return base;   // 无世界状态（未首推）：与 S6 原行为一致
    const enc = world.encounter;
    let hit = null, via = 'settings';
    for (const s of (enc.spots || [])) {
      if (s && s.match && zoneMatch(s.match, locationText)) { hit = s; via = 'spot'; break; }
    }
    if (!hit) for (const d of (enc.districts || [])) {
      if (d && d.match && zoneMatch(d.match, locationText)) { hit = d; via = 'district'; break; }
    }
    if (!hit) return base;   // spots/districts 均未命中：玩家设置兜底（不加修正——副导演没给过该地判断）
    const chance = clamp(0, 100, Number(hit.chance) || 0);
    if (chance === 0) return { chance: 0, safe: true, via, heat: 0, tension: 0 };   // 显式安全标记
    const heat = (enc.heat && Number.isFinite(+enc.heat.value)) ? clamp(-30, 30, +enc.heat.value) : 0;
    const tension = eventTension(world, locationText);
    const mod = clamp(-40, 40, heat + tension);
    return { chance: clamp(0, 100, chance + mod), safe: false, via, heat, tension };
  }

  function onGenerationStarted(type, _opts, dryRun) {
    if (!SETTINGS.randomCombatEnabled) return;
    if (dryRun || type === 'swipe' || type === 'regenerate') return;
    const chat = (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) ? SillyTavern.getContext().chat : null;
    if (!Array.isArray(chat) || !chat.length) return;
    const last = chat[chat.length - 1];
    if (!last || last.is_user !== true) return;         // 只在用户刚发送的楼注入
    const mes = String(last.mes || '');
    if (mes.includes(RC_MARKER)) return;                // 防重复追加（含 swipe 后重跑）
    if (combatInProgress()) return;                     // 战斗进行中不触发
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
    tickerHeads: [],          // 折叠态情报轮播头条（最近 ≤3 条，最新在前）
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
    State.tickerHeads = Array.isArray(s.tickerHeads) ? s.tickerHeads : [];
  }
  function persistRuntimeState() {
    writeChatVar(CV.state, {
      wbLast: State.wbLast,
      lastLocationText: State.lastLocationText,
      lastLandmarkKey: State.lastLandmarkKey,
      lastDiceFloorId: State.lastDiceFloorId,
      randomCombatFired: State.randomCombatFired,
      tickerHeads: State.tickerHeads,
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
    scheduleDispatch('floor-event');
  }
  function onChatChanged() {
    // 换聊天：运行时状态重置（情报流也清空），注入词条按新聊天重写。
    // wbLast 必须清空——词条里还残留上一聊天的内容，带旧 base 会被误判成用户改动
    State.wbLast = { director: '' };
    State.lastLocationText = '';
    State.lastLandmarkKey = '';
    State.lastDiceFloorId = -1;
    State.randomCombatFired = false;
    State.tickerHeads = [];
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

  // —— 信号级态势文本（V0.3.0：无敌人菜单——敌方构成由正文 AI 自选）—————————
  // 驻守信号 = 世界状态里 zone 命中当前大区的派系（名称/士气/对我方立场）；
  // 临近冲突 = conflict 类事件推进到"爆发"阶段且归属当前大区（取代旧预约引爆）。

  function buildDirectorSituationText(locationText, world) {
    const lines = [SIT_OPEN, `  ${locationText}`];
    if (world && Array.isArray(world.factions)) {
      const stationed = world.factions.filter(f => f && f.zone && zoneMatch(f.zone, locationText));
      if (stationed.length) {
        for (const f of stationed.slice(0, 3)) {
          lines.push(`  驻守信号：${f.name}（${f.zone}）${f.morale ? '，士气：' + f.morale : ''}${f.stance ? '，对我方：' + f.stance : ''}`);
        }
      } else {
        lines.push('  此地无已知派系驻防——敌方构成由你按世界书图鉴与剧情合理性决定。');
      }
      const hot = (Array.isArray(world.events) ? world.events : [])
        .filter(ev => ev && ev.type === 'conflict' && ev.stage === '爆发'
          && eventZones(ev, world).some(z => zoneMatch(z, locationText)));
      for (const ev of hot) {
        lines.push(`  【⚠ 临近冲突】${ev.name}已推进到爆发阶段${ev.desc ? '——' + ev.desc : ''}——本楼冲突极易触发，戒备拉满。`);
      }
    } else {
      lines.push('  尚无世界态势档案——敌方构成由你按世界书图鉴与剧情合理性决定。');
    }
    lines.push(`  ${COMBAT_RULE_HINT}`);
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

  // —— 主配发流程（纯程序，零 LLM；每楼重算注入，幂等写入）———————————

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
    runLocalDice();   // 本地骰（事件链/风声）——在构建注入前推进
    const world = readChatVar(CV.world) || null;

    State.lastLocationText = locationText;
    const lKey = landmarkKey(locationText);
    State.lastLandmarkKey = lKey;

    // 词条内容 = 信号级当前态势 + 世界动态（事件/风声/派系暗线三态）
    const text = world
      ? buildDirectorSituationText(locationText, world) + '\n\n' + buildDirectorInjection(world, locationText)
      : buildDirectorSituationText(locationText, null);
    if (HAS_WB && (State.forceDirectorWrite || text !== State.wbLast.director)) {
      State.forceDirectorWrite = false;   // 开关重开的一次性强写（词条见 disabled 会重新上灯）
      writeWbEntry(WB_ENTRY_DIRECTOR, text);   // 异步写词条（内部幂等 + merge3 用户改动兜底）
      if (els.dot) els.dot.classList.add('on');   // 更新提醒：展开后熄灭
      log(`副导演注入已更新（${reason}）`);
    } else {
      log(`副导演注入无变化，保持（${reason}）`);
    }
    persistRuntimeState();
    updatePanelStatus(null, { locationText, world });
    updatePanelMeta(stat);
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
      };
    }
    return { factions: [], tombstones: [], revealed: [], manual: [] };
  }
  function saveRoster(r) { writeChatVar(CV.roster, r); }

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
      lastWorld: readChatVar(CV.world) || null,   // 上次世界状态（含本地骰推进结果）——增量修订式推演
    };
  }

  // —— 默认提示词（预设系统的默认项指向此函数；自定义预设存其文本快照）—————

  function DEFAULT_DIRECTOR_SYS() {
    return [
      '你是开放世界的架构师、顶级权谋小说作家——为正文AI制造巫师3级别的叙事波折，而不是记录世界。你的产出是一份完整的世界状态 JSON（对【上次世界状态】做增量修订）。',
      '铁律：',
      '0. 认知定位：你的全部输出是你的推断与提案，不是既定事实——正文AI把它们当参考素材而非指令。三态诚实：延续上次的三态，前文明确演出过才标"已渗透"，真相落地才标"已兑现"，拿不准一律"推断中"。',
      '1. 反废话：严禁复述前文表层信息、玩家已知常识或主角团已推导的内容。除"从前文合理构思的报纸报道和街头传闻"可作事实引用外，其余全部写推断与设计；永远不顺水推舟写看似合理的废话。',
      '2. factions：每派系一条（键名用英文）：{"name":"派系名","surface":"公开征兆一句话（市民视角，报纸社会新闻体，须体现与其他派系的互动迹象，禁止内幕细节）","truth":"幕后真相：前文很可能未出现过的深层动机+由动机生长的具体行动","contact":"主角团已引起其注意时：派出接触的具体人物（姓名/代号+伪装身份+真实目的），否则空串","scheme":"为主角团设下的圈套（诱饵+真实杀招），无则空串","mole":"安插的间谍（优先选最无害、揭示时戏剧反转最大的人选；【主角核心白名单】人物严禁入选），无则空串","causes":["楼23"],"state":"推断中|已渗透|已兑现","stance":"对我方的立场一句话","relations":"与其他派系的关系一句话","zone":"活动大区（如 萨里山）","morale":"士气一句话"}。',
      '3. 圈套纪律：恰好 floor(N/2)（N=派系总数，向下取整）个派系对主角团设圈套（scheme 非空）——这是下限也是上限，全员针对主角团=失败。其余派系的动向必须围绕自身利益运转（自己的敌人、生意、日程、地盘纠纷），与主角团无关或仅顺带相遇。圈套建在主角团推理的漏洞上，像最苛刻的编辑一样审视前文。',
      '4. 尊重实力设定：主角团的前文战绩、背景靠山、警觉程度是硬约束——针对他们的算计必须匹配相应的谨慎、成本与失败风险；把强者当无防备的工具人是廉价的阴谋论。',
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
      `【敌方阵营参考（仅供推演参考，具体敌人由正文AI自选）】\n${(ctx.enemyPool || []).join(' / ') || '（无）'}`,
      `【主角核心白名单（绝不背叛、绝不可能是间谍）】\n${(ctx.coreTeam || []).join(' / ') || '（未设置——正文长期塑造的核心同伴也可能被指定为间谍，建议在设置中填写）'}`,
      `【名册（已知派系）】\n${ctx.knownFactions.join(' / ') || '（无）'}`,
      `【墓碑（禁止复活）】\n${ctx.roster.tombstones.join(' / ') || '（无）'}`,
      // ⑨ 上次世界状态——增量修订的基线（含程序本地骰已推进的事件进度）
      `【上次世界状态（增量修订基线：延续未完结事件/未消散风声/三态）】\n${ctx.lastWorld ? JSON.stringify(ctx.lastWorld, null, 1) : '（首次推演——从零建立）'}`,
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
    const events = (world.events || []).filter(ev => ev && ev.stage !== '平息');
    if (events.length) {
      sections.push(['进行中的事件（程序每楼掷骰推进，阶段与进度可能已变化）', events.map(ev =>
        `  - ${ev.name}【${ev.type === 'progress' ? '进展' : '冲突'}·${ev.stage}·${ev.stageRound}/9】${ev.desc || ''}`)]);
    }
    if (world.winds && world.winds.length) {
      sections.push(['风声（市民舆论，可经报纸/闲谈自然提及）', world.winds.map(w =>
        `  - ${w.content}（${w.spread}${w.source ? '·' + w.source : ''}）`)]);
    }
    const facts = (world.factions || []).filter(f => f.state !== '推断中');
    if (facts.length) {
      sections.push(['世界引擎推断', facts.map(f =>
        `  - ${f.truth}【${f.state}·${(f.causes || [])[0] || ''}】${extra(f)}`)]);
    }
    const infers = (world.factions || []).filter(f => f.state === '推断中');
    if (infers.length) {
      sections.push(['幕后动向（推断中·仅可环境渗透，禁止直接揭示）', infers.map(f =>
        `  - ${f.truth}【推断·${(f.causes || [])[0] || ''}】${extra(f)}`)]);
    }
    const forbidden = (world.resistance && world.resistance.forbidden) || [];
    if (forbidden.length) {
      sections.push(['禁泄清单（调查未抵达前禁止揭示）', forbidden.map(x =>
        `  - ${x.truth}【途径：${x.path}】`)]);
    }
    const partial = (world.resistance && world.resistance.partial) || [];
    if (partial.length) {
      sections.push(['调查阻力（强行调查只应得到以下层级的信息）', partial.map(p => `  - ${p}`)]);
    }
    const friction = (world.resistance && world.resistance.friction) || [];
    if (friction.length) {
      sections.push(['环境阻力（当前环境对行动的客观影响）', friction.map(f => `  - ${f}`)]);
    }
    const body = sections.map(([tag, items]) => `<${tag}>\n${items.join('\n')}\n</${tag}>`).join('\n\n');
    return [
      MEMO_OPEN,
      '',
      '以下是副导演世界引擎的推断——用于环境渗透、NPC 行为自洽与剧情伏笔参考，正文按合理性自由取舍。',
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
        writeWbEntry(WB_ENTRY_DIRECTOR, buildDirectorSituationText(locationText, world) + '\n\n' + buildDirectorInjection(world, locationText));
      }
      Trigger.floorsSinceEvolve = 0;
      Trigger.lastDateKey = statDateKey(stat) || Trigger.lastDateKey;
      Trigger.lastStage = statStage(stat) || Trigger.lastStage;
      // ticker：事件/风声/派系征兆上轮播（最新 ≤3 条）
      const heads = [];
      for (const ev of (world.events || []).slice(0, 1)) heads.push(`⚔${String(ev.name || '').slice(0, 7)}·${ev.stage}`);
      for (const w of (world.winds || []).slice(0, 1)) heads.push(`📣${String(w.content || '').slice(0, 9)}`);
      for (const f of (world.factions || []).slice(0, 2)) heads.push(`${String(f.name || '').slice(0, 5)}：${String(f.surface || '').slice(0, 10)}`);
      for (const h of heads.reverse()) {
        if (State.tickerHeads[0] !== h) {
          State.tickerHeads.unshift(h);
          State.tickerHeads = State.tickerHeads.slice(0, 3);
        }
      }
      renderTicker();
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
  .ad-toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%);
    background: var(--ad-box-bg); border: 1px solid var(--ad-accent-dim); color: var(--ad-accent-bright);
    border-radius: var(--ad-radius); padding: 8px 18px; font-size: 12px; letter-spacing: 1px; z-index: 100000;
    font-family: var(--ad-font); box-shadow: 0 8px 28px rgba(0,0,0,0.5); }
  `;

  let els = {};
  let currentTheme = 'paper';   // paper（方案 A 报纸基因 · 默认） | slate

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
          <span class="ad-head-title">悉尼星期增刊 · GAZETTE</span>
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
      <div class="ad-tabs" id="ad-tabs">
        <button class="ad-tab" data-tab="paper" title="《悉尼宪报》派系公开征兆（灰卡揭幕体系）">📰 报纸</button>
        <button class="ad-tab" data-tab="events" title="进行中的事件链（本地骰每楼推进）">⚡ 事件链</button>
        <button class="ad-tab" data-tab="winds" title="风声与舆论（安静超时按概率消散）">📣 风声</button>
      </div>
      <div class="ad-wire" id="ad-wire"><div id="ad-wire-body"></div></div>
      <div class="ad-colophon">本报仅刊载 <b>街头可见之事与公开传闻</b> ｜ 幕后真相须由读者自行抵达</div>`);
    UI_DOC.body.appendChild(panel);

    // 模态容器（设置/卡片/注入预览共用）
    const modal = el('div', { id: 'ad-modal' }, `<div class="ad-modal-box" id="ad-modal-box"></div>`);
    UI_DOC.body.appendChild(modal);

    els = { rail, panel, dot: rail.querySelector('#ad-rail-dot'), ticker: rail.querySelector('#ad-ticker'),
      wireBody: panel.querySelector('#ad-wire-body'), tabs: panel.querySelector('#ad-tabs'),
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
    panel.querySelector('#ad-btn-settings').addEventListener('click', openSettingsModal);
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
    const heads = (State.tickerHeads || []).slice(0, 3);
    els.rail.classList.toggle('empty', heads.length === 0);
    els.ticker.innerHTML = heads.concat(heads).map(t => `<li>${esc(t)}</li>`).join('');
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

    // 首段 lead：驻守信号（世界状态 zone 命中当前地点的派系）——各 tab 共有
    if (State.lastLocationText) {
      const locShort = shortLoc(State.lastLocationText);
      let leadTitle = '';
      let leadBody = '';
      if (world && Array.isArray(world.factions)) {
        const stationed = world.factions.filter(f => f && f.zone && zoneMatch(f.zone, State.lastLocationText));
        const hot = (world.events || []).filter(ev => ev && ev.type === 'conflict' && ev.stage === '爆发'
          && eventZones(ev, world).some(z => zoneMatch(z, State.lastLocationText)));
        if (stationed.length) {
          leadTitle = `${locShort || '当前地点'} · ${stationed[0].name}活动区`;
          leadBody = `${stationed.map(f => `${f.name}${f.morale ? '（' + f.morale + '）' : ''}`).join('、')}在此活动。${hot.length ? `【⚠ ${hot[0].name}已到爆发阶段——冲突一触即发】` : '暂无爆发阶段冲突。'}`;
        } else {
          leadTitle = `${locShort || '当前地点'} · 无已知驻防`;
          leadBody = '此地暂无已知派系活动记录。若冲突升级，敌方将按剧情合理性与世界书图鉴演化。';
        }
      } else {
        leadTitle = `${locShort || '当前地点'} · 等待首推`;
        leadBody = '尚无世界态势档案——📡 手动触发或等待心跳推演后，此处显示驻守信号与世界动态。';
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
            <span class="ad-item-kicker">⚡ 事件链 · ${esc(worldDate)}</span>
            <span class="ad-item-alert ${stageCls}">${esc(ev.stage)} ${ev.stageRound}/9</span>
          </div>
          <div class="ad-item-title"><span class="ad-item-place">${esc(ev.name)}</span><span class="menu"> · ${ev.type === 'progress' ? '进展' : '冲突'}</span></div>
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
            <span class="ad-item-kicker">📣 风声 · ${esc(w.spread || '流传')}</span>
          </div>
          <div class="ad-item-reaction">${esc(w.content || '')}${w.source ? `<div class="ad-item-sub-wire">——${esc(w.source)}</div>` : ''}</div>
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
  function openModal(html) { els.modalBox.innerHTML = html; els.modal.classList.add('open'); }

  // —— 设置弹窗（可重渲染：世界书同步的增删/选书操作不丢其他输入）———————————

  let editSync = null;   // 编辑中的 worldSync 副本 { world: [] }

  function openSettingsModal() {
    editSync = { world: JSON.parse(JSON.stringify(SETTINGS.worldSync || [])) };
    renderSettingsModal();
  }

  // worldSync 即时持久化：选书/勾词条/增删立即写回（不依赖"保存"按钮）；
  // 已选书未勾词条的来源保留（filter 只去 book 空的），防止"选书后重开被清空"
  function persistSyncNow() {
    SETTINGS.worldSync = editSync.world.filter(x => x && x.book);
    saveSettings(SETTINGS);
  }

  // 把表单输入收进 SETTINGS（不持久化——供 sync 操作重渲前保存现场）
  function collectFormToSettings() {
    els.modalBox.querySelectorAll('[data-k]').forEach(input => {
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

  function renderSettingsModal() {
    const s = SETTINGS;
    const ep = (slot, title) => `
      <div class="ad-sec-title">${title}</div>
      <div class="ad-form-row"><label>Base URL</label><input type="text" data-k="${slot}.baseUrl" value="${esc(s[slot].baseUrl)}" placeholder="https://…/v1"></div>
      <div class="ad-form-row"><label>API Key</label><input type="text" data-k="${slot}.apiKey" value="${esc(s[slot].apiKey)}" placeholder="sk-…"></div>
      <div class="ad-form-row"><label>Model</label><input type="text" data-k="${slot}.model" value="${esc(s[slot].model)}" placeholder="模型名"></div>
      <div class="ad-form-row"><label>温度</label><input type="number" step="0.1" min="0" max="2" data-k="${slot}.temperature" value="${s[slot].temperature}"></div>
      <div class="ad-form-row"><label>maxTokens</label><input type="number" step="100" min="256" data-k="${slot}.maxTokens" value="${s[slot].maxTokens}"></div>`;
    syncSectionHtml.bookNames = (IS_LIVE && typeof getWorldbookNames === 'function') ? getWorldbookNames() : [];
    openModal(`
      <h3>⚙ 副导演 · 设置</h3>
      <div class="ad-form-row"><label>皮肤</label><select id="ad-set-theme">
        <option value="paper">paper · 1920s 阿卡姆大报（方案 A · 默认）</option>
        <option value="slate">slate · 深色档案（MMS 基因）</option>
      </select></div>
      <div class="ad-form-row" style="align-items:flex-start"><label style="padding-top:5px">功能开关</label><div style="display:flex;flex-direction:column;gap:4px">
        <label style="width:auto;color:var(--ad-ink-strong)"><input type="checkbox" data-k="enabledDirector" ${s.enabledDirector ? 'checked' : ''}> 世界推演（心跳/强制触发 + 副导演词条注入）</label>
      </div></div>
      <div class="ad-form-row" style="align-items:flex-start"><label style="padding-top:5px">🎲 随机遭遇</label><div style="display:flex;flex-direction:column;gap:4px">
        <label style="width:auto;color:var(--ad-ink-strong)"><input type="checkbox" data-k="randomCombatEnabled" ${s.randomCombatEnabled ? 'checked' : ''}> 每楼掷骰，命中即在用户本楼输入末尾追加"强制开战"指令</label>
        <label style="width:auto;color:var(--ad-ink-strong)"><input type="checkbox" data-k="randomCombatOncePerCycle" ${s.randomCombatOncePerCycle ? 'checked' : ''}> 防连战锁：每个推演周期（两次推演之间）最多一场随机战斗</label>
        <div style="display:flex;align-items:center;gap:6px">
          <input type="number" step="1" min="0" max="100" data-k="randomCombatChance" value="${s.randomCombatChance}" style="width:64px">
          <span class="dim" style="font-size:9.5px;color:var(--ad-ink-faint)">% / 楼 · 基线兜底值（世界状态 spots/districts 命中时被覆盖）· 安全区与战斗进行中不掷骰</span>
        </div>
      </div></div>
      <div class="ad-form-row"><label>推演心跳</label><input type="number" step="1" min="1" data-k="directorEveryX" value="${s.directorEveryX}">
        <span class="dim" style="flex:none;font-size:9.5px;color:var(--ad-ink-faint)">每 N 楼常规推演一次；战斗结果/跨日/阶段变化强制推</span></div>
      <div class="ad-form-row" style="align-items:flex-start"><label style="padding-top:5px">敌方阵营参考</label>
        <textarea data-k="enemyPool" rows="3" placeholder="手输敌方阵营参考，逗号/换行分隔（仅供推演参考，具体敌人由正文AI自选）&#10;例：萨里山剃刀帮，黑法老兄弟会，悉尼常规巡警">${esc(s.enemyPool || '')}</textarea>
        <span class="dim" style="flex:none;font-size:9.5px;color:var(--ad-ink-faint)">留空则不注入</span></div>
      <div class="ad-form-row" style="align-items:flex-start"><label style="padding-top:5px">主角核心白名单</label>
        <textarea data-k="coreTeam" rows="2" placeholder="手输绝不背叛的核心队友，逗号/换行分隔&#10;例：弗兰克，林有声">${esc(s.coreTeam || '')}</textarea>
        <span class="dim" style="flex:none;font-size:9.5px;color:var(--ad-ink-faint)">留空则任何人都可能是间谍</span></div>
      <div class="ad-form-row" style="align-items:flex-start"><label style="padding-top:5px">附加铁律</label>
        <textarea data-k="extraRules" rows="3" placeholder="手输给副导演的最高优先级注意事项（多行），拼到推演输入文末，压过默认规则&#10;例：灰瘟与邪教无任何关系，禁止关联；主角团是身经百战的强者，算计他们必须有成本与风险">${esc(s.extraRules || '')}</textarea>
        <span class="dim" style="flex:none;font-size:9.5px;color:var(--ad-ink-faint)">世界观纠偏/尺度约束</span></div>
      <div class="ad-form-row"><label>副导演可见楼层</label><input type="number" step="1" min="0" data-k="directorFloors" value="${s.directorFloors}">
        <span class="dim" style="flex:none;font-size:9.5px;color:var(--ad-ink-faint)">0=全部历史；仅 AI 楼层，排除玩家输入</span></div>
      <div class="ad-form-row"><label>调试模式</label><label style="width:auto;color:var(--ad-ink-strong)">
        <input type="checkbox" data-k="debug" ${s.debug ? 'checked' : ''}> 记录 LLM 请求/响应（控制台 + 日志查看）</label></div>
      <div class="ad-btnrow" style="margin-top:2px"><button id="ad-debug-open">🐞 LLM 调试日志</button></div>
      ${syncSectionHtml('world', '世界书同步（→ 推演输入）')}
      ${promptSectionHtml('director', '副导演 · 提示词', DirectorPrompt)}
      ${ep('director', '副导演 API（世界推演：派系/事件/风声/遇敌概率）')}
      <div class="ad-btnrow">
        <button class="primary" id="ad-set-save">保存</button>
        <button id="ad-set-close">关闭</button>
      </div>`);
    els.modalBox.querySelector('#ad-set-theme').value = currentTheme;

    // 全部设置项 change 即时持久化（不依赖"保存"按钮——名单/端点/楼数改完即生效）
    els.modalBox.querySelectorAll('[data-k]').forEach(el => {
      el.addEventListener('change', () => {
        collectFormToSettings();
        saveSettings(SETTINGS);
        // 推演开关切换即时生效：关→词条下灯；开→强制重写重新上灯
        if (el.getAttribute('data-k') === 'enabledDirector') applySwitches();
      });
    });

    const bindSyncOps = () => {
      els.modalBox.querySelectorAll('[data-sync-add]').forEach(btn => {
        btn.addEventListener('click', () => {
          collectFormToSettings();
          editSync[btn.getAttribute('data-sync-add')].push({ book: '', entries: [] });
          renderSettingsModal();
        });
      });
      els.modalBox.querySelectorAll('[data-sync-book]').forEach(sel => {
        sel.addEventListener('change', () => {
          collectFormToSettings();
          const [slot, i] = sel.getAttribute('data-sync-book').split(':');
          editSync[slot][+i].book = sel.value;
          editSync[slot][+i].entries = [];
          persistSyncNow();   // 选书即时保持
          renderSettingsModal();
        });
      });
      els.modalBox.querySelectorAll('[data-sync-pick]').forEach(btn => {
        btn.addEventListener('click', () => {
          collectFormToSettings();
          const [slot, i] = btn.getAttribute('data-sync-pick').split(':');
          openSyncPicker(slot, +i);
        });
      });
      els.modalBox.querySelectorAll('[data-sync-del]').forEach(btn => {
        btn.addEventListener('click', () => {
          collectFormToSettings();
          const [slot, i] = btn.getAttribute('data-sync-del').split(':');
          editSync[slot].splice(+i, 1);
          persistSyncNow();   // 删除即时保持
          renderSettingsModal();
        });
      });
    };
    bindSyncOps();
    bindPromptOps({ director: DirectorPrompt });

    els.modalBox.querySelector('#ad-debug-open').addEventListener('click', () => {
      collectFormToSettings();   // 先收表单（含调试开关），再打开日志
      openDebugModal();
    });

    els.modalBox.querySelector('#ad-set-save').addEventListener('click', () => {
      collectFormToSettings();
      persistSyncNow();
      applySwitches();   // 开关状态兜底生效（表单与即时监听一致时幂等）
      if (SETTINGS.enabledDirector) scheduleDispatch('settings-saved');
      const theme = els.modalBox.querySelector('#ad-set-theme').value;
      const p = loadUiPrefs(); p.theme = theme; saveUiPrefs(p);
      applyTheme(theme);
      toast('设置已保存');
      closeModal();
    });
    els.modalBox.querySelector('#ad-set-close').addEventListener('click', closeModal);
  }

  // —— LLM 调试日志弹窗（最近 20 次请求/响应；debug 开关开启时记录）—————————

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
    openModal(`
      <h3>🌍 世界状态 · 第 ${world.round || 1} 轮${world.digest ? ` · ${esc(world.digest)}` : ''}</h3>
      <div class="dim" style="font-size:9.5px;color:var(--ad-ink-faint);margin-bottom:8px">
        生成于 ${new Date(world.generatedAt || Date.now()).toLocaleString()}（触发：${esc(world.reason || '—')}）</div>
      <div class="ad-sec-title">事件链（本地骰每楼推进）</div>${evRows}
      <div class="ad-sec-title">风声（安静超时按概率消散）</div>${windRows}
      <div class="ad-sec-title">派系动向（暗线三态）</div>${facRows}
      <div class="ad-sec-title">遇敌概率档案</div>${encRows}
      ${forb ? `<div class="ad-sec-title">禁泄清单</div>${forb}` : ''}
      <div class="ad-sec-title">完整世界状态（存档 $ad_world）</div>
      <textarea readonly style="width:100%;height:180px;background:var(--ad-input-bg);color:var(--ad-ink);border:1px solid var(--ad-border);border-radius:var(--ad-radius-sm);font-family:inherit;font-size:10px;padding:8px;">${esc(JSON.stringify(world, null, 2))}</textarea>
      <div class="ad-btnrow">
        <button class="primary" id="ad-report-regen">📡 重新推演</button>
        <button id="ad-report-close">关闭</button>
      </div>`);
    els.modalBox.querySelector('#ad-report-regen').addEventListener('click', () => {
      closeModal();
      generateDirectorEvolve('manual');
    });
    els.modalBox.querySelector('#ad-report-close').addEventListener('click', closeModal);
  }

  // —— S5 派系名册弹窗（名册 CRUD + 墓碑）———————————————————————

  function openRosterModal() {
    const roster = getRoster();
    const rows = roster.factions.map(name => `
      <div class="ad-card-item" style="cursor:default">
        <span class="place">${esc(name)}</span>
        <button class="ad-row-btn" data-tomb="${esc(name)}" title="除名=墓碑：级联删该派系全部暗线并禁止模型复活">🪦 除名</button>
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
    norm, zoneMatch, landmarkKey, statDateKey, statStage, statCity,
    buildDirectorSituationText, buildDirectorInjection,
    shortLoc, renderTicker, renderWire, applyTheme,
    // 本地骰（S7）
    rollEvents, rollWinds, runLocalDice, currentFloorId, eventZones, eventTension,
    EV_STAGES, STAGE_SCORE, clamp,
    // LLM 客户端与推演层
    callLLM, extractJson,
    getEnemyPool, getCoreTeam, getSyncedWorldbookText, getShadowlineFloorContext,
    getLwbSummaryText,
    checkTriggers, generateDirectorEvolve, buildDirectorContext, buildDirectorMessages,
    validateWorld, DirectorPrompt, DEFAULT_DIRECTOR_SYS,
    getRoster, saveRoster, addRosterFaction, tombstoneFaction, restoreFaction, openRosterModal,
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
