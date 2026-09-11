// ==UserScript==
// @name         Assistant Director (副导演·世界模拟器)
// @namespace    assistant-director
// @version      0.2.3
// @description  AIRP 世界模拟器：态势卡片配发（每楼注入）+ 暗线推演（S2/S3）+ 名册/墓碑（S5）+ 阶段揭示（S4）+ 公开情报贴边栏。注入走世界书词条 · SPEC V0.2.9
// @author       ELevin
// @match        *://*/*
// @grant        none
// ==/UserScript==

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  副导演 · 单 JSON 悬浮窗脚本插件（酒馆助手 / JS-Slash-Runner）
 *  模块分区见 SPEC §4.8：
 *    0 常量与配置 / 1 设置管理 / 2 酒馆环境适配 / 3 楼层监听状态机
 *    4 态势卡片引擎 / 5 LLM 客户端(S2) / 6 战略层(S3) / 7 态势位(S2)
 *    8 公开层 UI / 9 GM 面板 / 10 主流程编排
 *  S0~S1 范围：0/1/2/3/4/8/9/10；5/6/7 留桩。
 * ═══════════════════════════════════════════════════════════════════════════
 */
(function () {
  'use strict';

  // ═════════════════════════════════════════════════════════════════════
  // 0. 常量与配置
  // ═════════════════════════════════════════════════════════════════════

  const SCRIPT_NAME = 'AssistantDirector';
  const SCRIPT_VERSION = '0.2.3';
  // 注入走角色卡主世界书词条（MMS 同构）：constant 蓝灯 + at_depth system 0/15，
  // 首次创建定位置，之后只改 content 不动 position——用户可在世界书编辑器自由调整顺序
  const WB_ENTRY_SITUATION = '副导演-态势';
  const WB_ENTRY_SHADOWLINE = '副导演-暗线';
  const WB_ORDER = 15;
  // 注入模板：XML 标签分段 + 两空格缩进列表——LLM 注意力分区友好，人工维护直观
  const MEMO_OPEN = '<内部导演备忘（禁止以任何形式向玩家展示）>';
  const MEMO_CLOSE = '</内部导演备忘>';
  const SIT_OPEN = '<当前态势（禁止以任何形式向玩家展示）>';
  const SIT_CLOSE = '</当前态势>';
  const COMBAT_RULE_HINT =
    '【若本楼冲突升级 → 开战】按【战斗轮规则】输出 <Combat_block>：' +
    '我方/敌方各只写名字；敌方从上方词条中选（可加 *N 与 [变种]）。';
  const DEFAULT_VERDICT =
    '玩家行动在语义上构成对上述戒备的挑衅/侵入/暴露时开战或转入对峙；未构成则正常叙事。';

  // localStorage 键（设置与 UI 偏好，随浏览器走）
  const LS = {
    settings: 'ad_settings_v1',
    ui: 'ad_ui_v1',
    promptShadowline: 'ad_prompt_shadowline_v1', // 暗线位提示词预设（默认项锁定，自定义存快照）
    promptSituation: 'ad_prompt_situation_v1',   // 态势位提示词预设
  };
  // 聊天变量键（$ 前缀对 LLM 隐形，随聊天文件走）
  const CV = {
    cards: '$ad_cards',   // 态势卡片池（数组）
    state: '$ad_state',    // 运行时状态（弹药基准/上次注入文本等）
    report: '$ad_report',  // S3：最新报告
    roster: '$ad_roster',  // S4：名册+墓碑
    pending: '$ad_pending' // S2/S5：待登记+预约
  };

  const ALERT_LEVELS = ['松懈', '常规', '警戒', '严密'];

  // ═════════════════════════════════════════════════════════════════════
  // 1. 设置管理（localStorage，AiRadio 模式）
  // ═════════════════════════════════════════════════════════════════════

  function defaultEndpoint() {
    return { baseUrl: '', apiKey: '', model: '', temperature: 0.4, maxTokens: 4000 };
  }
  function defaultSettings() {
    return {
      enabledShadowline: true, // 暗线开关：报告推演（触发矩阵/手动📡）+ 暗线词条注入
      enabledSituation: true,  // 态势开关：态势词条注入 + 即时产卡 + 预约引爆（玩家自由决定开启）
      shadowline: defaultEndpoint(), // 暗线位（次高智力，天级+事件）
      situation: defaultEndpoint(),   // 态势位（快速小模型，随地点）
      enemyPool: '',            // 本轮战役敌人名单（手输，逗号/换行分隔）——产卡 menu 与暗线 ambush 预约"规模"的选用来源
      coreTeam: '',             // 主角核心白名单（手输，逗号/换行分隔）——这些人绝不背叛、绝不被指定为间谍
      extraRules: '',           // 附加铁律（手输，多行文本）——拼到暗线输入文末，用户给副导演的最高优先级注意事项（如世界观纠偏、尺度约束）
      worldSyncSituation: [],   // 态势位世界书同步：[{ book, entries }]——词条内容注入产卡输入
      worldSyncShadowline: [],  // 暗线位世界书同步：[{ book, entries }]——词条内容注入报告输入
      shadowlineFloors: 20,     // 副导演可见 AI 楼层数（默认对齐 LWB 总结窗口；0=全部历史；排除玩家输入与隐藏楼层）
      randomCombatEnabled: true, // 随机遭遇开关：每楼本地掷骰，命中即在用户本楼输入末尾追加强制开战指令
      randomCombatChance: 5,    // 随机遭遇概率（百分比/楼）
      debug: false,             // 调试模式：记录 LLM 请求/响应（环形日志 20 条 + 控制台输出）
    };
  }
  function normalizeSync(list) {
    return Array.isArray(list)
      ? list.filter(s => s && typeof s.book === 'string' && Array.isArray(s.entries))
          .map(s => ({ book: s.book, entries: s.entries.map(String) }))
      : [];
  }
  function loadSettings() {
    try {
      const raw = localStorage.getItem(LS.settings);
      if (!raw) return defaultSettings();
      const saved = JSON.parse(raw);
      const def = defaultSettings();
      // 迁移：旧单一 worldSync（无新键时）→ 复制到两套
      const legacy = normalizeSync(saved.worldSync);
      const hasSit = Array.isArray(saved.worldSyncSituation);
      const migrate = legacy.length && !hasSit && !Array.isArray(saved.worldSyncShadowline);
      // 旧总开关迁移：enabled:false → 双开关全关；未设置新键时随旧开关（默认双开）
      const legacyOn = saved.enabled !== false;
      return {
        enabledShadowline: saved.enabledShadowline !== undefined ? saved.enabledShadowline !== false : legacyOn,
        enabledSituation: saved.enabledSituation !== undefined ? saved.enabledSituation !== false : legacyOn,
        shadowline: Object.assign(def.shadowline, saved.shadowline || {}),
        situation: Object.assign(def.situation, saved.situation || {}),
        enemyPool: typeof saved.enemyPool === 'string' ? saved.enemyPool : '',
        coreTeam: typeof saved.coreTeam === 'string' ? saved.coreTeam : '',
        extraRules: typeof saved.extraRules === 'string' ? saved.extraRules : '',
        worldSyncSituation: migrate ? JSON.parse(JSON.stringify(legacy)) : normalizeSync(saved.worldSyncSituation),
        worldSyncShadowline: migrate ? JSON.parse(JSON.stringify(legacy)) : normalizeSync(saved.worldSyncShadowline),
        shadowlineFloors: Number.isFinite(saved.shadowlineFloors) ? saved.shadowlineFloors : 20,
        randomCombatEnabled: saved.randomCombatEnabled !== undefined ? saved.randomCombatEnabled !== false : true,
        randomCombatChance: Number.isFinite(saved.randomCombatChance) ? saved.randomCombatChance : 5,
        debug: saved.debug === true,
      };
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
      return p;
    } catch (e) { return { theme: 'paper' }; }
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

  const WB_SLOT = { [WB_ENTRY_SITUATION]: 'situation', [WB_ENTRY_SHADOWLINE]: 'shadowline' };

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
    const list = Array.isArray(names) ? names : [WB_ENTRY_SITUATION, WB_ENTRY_SHADOWLINE];
    const wbName = await resolveWbName();
    if (!wbName) return;
    let entries = [];
    try { entries = (await Promise.resolve(getWorldbook(wbName))) || []; }
    catch (e) { return; }
    if (!entries.some(e => e && list.includes(e.name) && e.enabled)) return;
    await Promise.resolve(updateWorldbookWith(wbName, es =>
      es.map(e => e && list.includes(e.name) ? { ...e, enabled: false } : e)));
  }

  // 重挂载/换聊天：按存档报告重建暗线词条（无报告则禁用，防上一聊天残留）
  function syncShadowlineEntry() {
    if (!SETTINGS.enabledShadowline) { disableWbEntries([WB_ENTRY_SHADOWLINE]); return; }
    const report = readChatVar(CV.report);
    if (report && Array.isArray(report.factions)) writeWbEntry(WB_ENTRY_SHADOWLINE, buildShadowlineInjection(report));
    else disableWbEntries([WB_ENTRY_SHADOWLINE]);
  }

  // 功能开关切换即时生效：关 → 词条下灯；开 → 强制一次重写重新上灯
  // （writeWbEntryNow 见词条 disabled 会原内容重开灯，merge3 基线不动——用户改动保留）
  function applySwitches() {
    if (SETTINGS.enabledShadowline) syncShadowlineEntry();
    else disableWbEntries([WB_ENTRY_SHADOWLINE]);
    if (SETTINGS.enabledSituation) { State.forceSituationWrite = true; scheduleDispatch('switch-on'); }
    else disableWbEntries([WB_ENTRY_SITUATION]);
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

  const RC_MARKER = '【🎲随机遭遇】';
  const RC_DIRECTIVE = '本轮用户触发随机战斗，按【战斗轮规则】输出 Combat_block 块';

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

  function onGenerationStarted(type, _opts, dryRun) {
    if (!SETTINGS.randomCombatEnabled) return;
    if (dryRun || type === 'swipe' || type === 'regenerate') return;
    const chat = (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) ? SillyTavern.getContext().chat : null;
    if (!Array.isArray(chat) || !chat.length) return;
    const last = chat[chat.length - 1];
    if (!last || last.is_user !== true) return;         // 只在用户刚发送的楼注入
    const mes = String(last.mes || '');
    if (mes.includes(RC_MARKER)) return;                // 防重复追加（含 swipe 后重跑）
    if (State.lastMode === 'safe') return;              // 安全区豁免
    if (combatInProgress()) return;                     // 战斗进行中不触发
    if (Math.random() * 100 >= Number(SETTINGS.randomCombatChance) || 0) return;
    last.mes = mes + '\n' + RC_MARKER + ' ' + RC_DIRECTIVE + '。';
    toast('🎲 随机遭遇触发');
    log(`随机遭遇命中（${SETTINGS.randomCombatChance}%/楼）——已注入用户本楼输入`);
  }


  // ═════════════════════════════════════════════════════════════════════
  // 3. 楼层监听状态机
  // ═════════════════════════════════════════════════════════════════════

  const State = {
    wbLast: { situation: '', shadowline: '' },  // 上次注入词条的「纯脚本内容」——merge3 的 base（≠词条现状即用户改过）
    forceSituationWrite: false, // 态势开关重开的一次性强写标记（不持久化——词条见 disabled 会重新上灯）
    lastLocationText: '',     // 当前地点原文
    lastLandmarkKey: '',      // 当前地标键（大区后首字段）——没变不触发产卡
    lastMode: '',             // 最近一次配发形态（card/safe/fallback/ambush）
    ammoBaseline: 0,          // 弹药基准（历史最高，规模降档参照）
    lastCardsRef: '',         // 卡片池指纹（检测外部改动）
    tickerHeads: [],          // 折叠态情报轮播头条（最近 ≤3 条，最新在前）
    pendingTimer: null,
  };

  function loadRuntimeState() {
    const s = readChatVar(CV.state) || {};
    const wl = s.wbLast || {};
    State.wbLast = { situation: wl.situation || '', shadowline: wl.shadowline || '' };
    State.lastLocationText = s.lastLocationText || '';
    State.lastLandmarkKey = s.lastLandmarkKey || '';
    State.lastMode = s.lastMode || '';
    State.ammoBaseline = s.ammoBaseline || 0;
    State.tickerHeads = Array.isArray(s.tickerHeads) ? s.tickerHeads : [];
  }
  function persistRuntimeState() {
    writeChatVar(CV.state, {
      wbLast: State.wbLast,
      lastLocationText: State.lastLocationText,
      lastLandmarkKey: State.lastLandmarkKey,
      lastMode: State.lastMode || '',
      ammoBaseline: State.ammoBaseline,
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
    if (!SETTINGS.enabledSituation && !SETTINGS.enabledShadowline) return;
    scheduleDispatch('floor-event');
  }
  function onChatChanged() {
    // 换聊天：运行时状态重置（情报流也清空），注入词条按新聊天重写。
    // wbLast 必须清空——词条里还残留上一聊天的内容，带旧 base 会被误判成用户改动
    State.wbLast = { situation: '', shadowline: '' };
    State.lastLocationText = '';
    State.lastLandmarkKey = '';
    State.ammoBaseline = 0;
    State.tickerHeads = [];
    Instant.tried = Object.create(null);   // 换聊天：分兵/未命中产卡记录清零
    Trigger.lastReportDate = '';           // 换聊天：触发基线重建（首次 dispatch 记基线不触发）
    Trigger.lastStage = '';
    Trigger.lastCity = '';
    Trigger.lastCombatResult = '';
    Trigger.lastFloorId = -1;
    Trigger.floorsSinceReport = 0;
    wbNameCache = null;   // 换卡/换聊天：重探角色卡主世界书
    if (!SETTINGS.enabledSituation && !SETTINGS.enabledShadowline) return;
    if (SETTINGS.enabledShadowline) syncShadowlineEntry();   // 暗线词条按新聊天报告重建（无报告禁用）
    else disableWbEntries([WB_ENTRY_SHADOWLINE]);
    scheduleDispatch('chat-changed'); // 态势词条随 dispatch 重写（关→下灯）
  }

  // ═════════════════════════════════════════════════════════════════════
  // 4. 态势卡片引擎
  // ═════════════════════════════════════════════════════════════════════

  // —— 地点文本归一化：剥 emoji / 变体符 / 零宽，压缩空白 ——————————

  const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{FE0E}\u{FE0F}]/gu;
  function norm(s) {
    return String(s == null ? '' : s)
      .replace(EMOJI_RE, '')
      .replace(/[\u3000\s]+/g, ' ')
      .trim();
  }

  // 三级匹配：① 归一化后与 place 全等 ② 与 alias 全等 ③ 双向包含
  // 得分：全等 place=3.0 / 全等 alias=2.8 / 包含=名字长度占地点串比例（<2.0）
  // 多卡命中取最高分——更长更具体的名字占比更高，天然择优。
  function matchCard(locationText, cards) {
    const L = norm(locationText);
    if (!L) return null;
    let best = null;
    for (const card of (cards || [])) {
      if (!card || !card.place) continue;
      const names = [card.place].concat(card.aliases || []);
      for (const raw of names) {
        const n = norm(raw);
        if (!n) continue;
        let score = 0;
        if (L === n) score = raw === card.place ? 3.0 : 2.8;
        else if (L.includes(n) || n.includes(L)) {
          score = Math.min(1.99, (n.length / Math.max(L.length, 1)) * 1.99);
        }
        if (score > 0 && (!best || score > best.score)) best = { card, score, matchedName: raw };
      }
    }
    return best;
  }

  // —— menu 解析："词条A*4~6/词条B*3~5/词条C" ————————————————

  function parseMenu(menu) {
    return String(menu || '')
      .split(/[\/／]/)
      .map(s => s.trim()).filter(Boolean)
      .map(seg => {
        let m = seg.match(/^(.+?)\s*[*×xX]\s*(\d+)\s*[~～\-—–]\s*(\d+)$/);
        if (m) return { name: m[1].trim(), min: +m[2], max: +m[3] };
        m = seg.match(/^(.+?)\s*[*×xX]\s*(\d+)$/);
        if (m) return { name: m[1].trim(), min: +m[2], max: +m[2] };
        return { name: seg, min: 0, max: 0 }; // 无数量标记：原样输出（仍受白名单约束的词条名）
      });
  }

  // —— stat_data 解析（我方状态）———————————————————————————

  // 属性串 "[❤️HP:100/100][🔮MP:110/110]…" → { cur, max } | null
  function parseAttr(attrStr, key) {
    const m = String(attrStr || '').match(new RegExp(key + '\\s*[:：]\\s*(\\d+)\\s*\\/\\s*(\\d+)'));
    if (!m) return null;
    return { cur: +m[1], max: +m[2] };
  }
  // 弹药串 "[🔩] [.45子弹：28][12号独头弹：0]" → 数字总和
  function parseAmmoTotal(ammoStr) {
    let sum = 0;
    const re = /[【\[]([^\]】]+?)[:：]\s*(\d+)[\]】]/g;
    let m;
    while ((m = re.exec(String(ammoStr || '')))) sum += +m[2];
    return sum;
  }
  // 角色列表归一（兼容 {角色:{…}} 包装与裸对象）
  function charList(stat) {
    return (stat['角色列表'] || [])
      .map(x => (x && x['角色']) ? x['角色'] : x)
      .filter(c => c && c['名字']);
  }

  // 规模随行重算：我方弱（有人倒地 / 弹药消耗过半）→ 取区间下限再-1（保底 1）；
  // 正常 → 区间中值。弹药基准取历史最高（弹药会跨楼自然消耗，基准只升不降）。
  function computeScale(entries, stat) {
    const chars = charList(stat);
    let downed = false;
    for (const c of chars) {
      const hp = parseAttr(c['属性'], 'HP');
      if (hp && hp.max > 0 && hp.cur <= 0) { downed = true; break; }
    }
    let ammoNow = 0;
    for (const c of chars) ammoNow += parseAmmoTotal(c['弹药']);
    State.ammoBaseline = Math.max(State.ammoBaseline || 0, ammoNow);
    const lowAmmo = State.ammoBaseline > 0 && ammoNow < State.ammoBaseline * 0.5;
    const penalized = downed || lowAmmo;
    return entries.map(e => {
      if (!e.max && !e.min) return Object.assign({}, e, { count: 0 });
      const count = penalized ? Math.max(e.min - 1, 1) : Math.round((e.min + e.max) / 2);
      return Object.assign({}, e, { count });
    });
  }

  // —— 注入文本拼装（三种形态；XML 标签包裹 + 两空格缩进）———————————

  // 命中卡片（menu 非空）：驻防 + 菜单（规模已随行重算）+ 反应 + 战斗轮提醒 + 判定标准
  function buildSituationText(card, scaledEntries, locationText) {
    const menuStr = scaledEntries
      .map(e => e.count > 0 ? `${e.name}*${e.count}` : e.name)
      .join('/');
    const alert = ALERT_LEVELS.includes(card.alert) ? card.alert : '常规';
    const verdict = card.verdict || DEFAULT_VERDICT;
    return [
      SIT_OPEN,
      `  ${locationText}`,
      `  驻守：${card.faction || '未知派系'}（${menuStr}），戒备等级：${alert}`,
      `  反应模式：${card.reaction || '（未提供——按戒备等级常识演出）'}`,
      `  ${COMBAT_RULE_HINT}`,
      `  判定标准：${verdict}`,
      SIT_CLOSE,
    ].join('\n');
  }

  // 绝对安全地点变体（命中卡片但 menu 为空，或卡片标记 safe）
  function buildSafeText(locationText) {
    return [
      SIT_OPEN,
      `  ${locationText}`,
      '  当前场景无可见敌人，但不排除剧情合理范围内的认知外突袭。',
      '  若冲突升级，按【战斗轮规则】输出 <Combat_block>。',
      SIT_CLOSE,
    ].join('\n');
  }

  // 通用兜底（卡片池未命中）
  function buildFallbackText(locationText) {
    return [
      SIT_OPEN,
      `  ${locationText}`,
      '  此地无驻防情报。若冲突升级，按【战斗轮规则】输出',
      '  <Combat_block>：敌方名字从世界书图鉴中按剧情合理性选择。禁止自创敌方数值。',
      SIT_CLOSE,
    ].join('\n');
  }

  // —— 主配发流程（纯程序，零 LLM）—————————————————————————

  function getCards() {
    const v = readChatVar(CV.cards);
    return Array.isArray(v) ? v : [];
  }
  function setCards(cards) {
    writeChatVar(CV.cards, cards || []);
    State.lastCardsRef = JSON.stringify(cards || []).length + ':' + (cards || []).length;
  }

  function dispatchNow(reason) {
    if (!SETTINGS.enabledSituation && !SETTINGS.enabledShadowline) return;   // 双开关全关：完全静默
    const stat = readLatestStatData();
    if (!stat) {
      log('无 stat_data 可用（MMS 未运行或尚无楼层变量），跳过本轮配发');
      disableWbEntries([WB_ENTRY_SITUATION]);   // 无数据聊天：禁用态势词条（暗线由 syncShadowlineEntry 管）
      updatePanelStatus('等待状态栏数据…');
      return;
    }
    const locationText = String(stat['地点'] || '').trim();
    if (!locationText) {
      logWarn('stat_data 缺少地点字段，跳过');
      return;
    }
    const sitOn = SETTINGS.enabledSituation;
    // 预约引爆作用于态势注入与卡片戒备——归态势开关（暗线开关只管埋雷，不管引爆）
    const ambushHit = sitOn ? checkAmbush(locationText, stat) : null;
    const cards = getCards();
    const hit = sitOn ? matchCard(locationText, cards) : null;

    let text = '';
    let mode = '';
    if (!sitOn) {
      mode = 'off';
    } else if (hit) {
      const entries = parseMenu(hit.card.menu);
      const hasMenu = entries.length > 0 && entries.some(e => e.min || e.max);
      if (hit.card.safe || !hasMenu) {
        text = buildSafeText(locationText); mode = 'safe';
      } else {
        const scaled = computeScale(entries, stat);
        text = buildSituationText(hit.card, scaled, locationText); mode = 'card';
      }
    } else {
      text = buildFallbackText(locationText); mode = 'fallback';
    }

    State.lastLocationText = locationText;
    State.lastMode = mode;
    // 地标键：大区后首字段（如"澳大利亚酒店 - 总统套房"）——地标没变（房间级小变化）不触发产卡
    const lKey = landmarkKey(locationText);
    const keyChanged = lKey !== State.lastLandmarkKey;
    State.lastLandmarkKey = lKey;
    let textFinal = text;
    if (ambushHit && textFinal) {
      // 主动接触态插到 </当前态势> 之前，保持 XML 包裹完整
      const line = `  【⚠ 主动接触态】${ambushHit['派系']}正在主动接触（预约引爆：${ambushHit['规模'] || ''}）——本楼遇敌概率极高，戒备已置顶。`;
      textFinal = textFinal.endsWith(SIT_CLOSE)
        ? textFinal.slice(0, -SIT_CLOSE.length) + line + '\n' + SIT_CLOSE
        : textFinal + '\n' + line;
      mode = 'ambush';
    }
    if (!sitOn) {
      disableWbEntries([WB_ENTRY_SITUATION]);   // 开关关闭：词条下灯（已禁用时幂等无调用）
      log(`态势开关关闭，跳过注入（${reason}）`);
    } else if (HAS_WB && (State.forceSituationWrite || textFinal !== State.wbLast.situation)) {
      State.forceSituationWrite = false;   // 开关重开的一次性强写（词条见 disabled 会重新上灯）
      writeWbEntry(WB_ENTRY_SITUATION, textFinal);   // 异步写词条（内部幂等 + merge3 用户改动兜底）
      pushTickerHead(mode, (hit && hit.card.place) || locationText);
      if (els.dot) els.dot.classList.add('on');   // 更新提醒：展开后熄灭
      log(`态势注入已更新（${mode}/${reason}）`, (hit && hit.card.place) || '→ 兜底');
    } else {
      log(`态势无变化，保持注入（${mode}/${reason}）`);
    }
    persistRuntimeState();
    updatePanelStatus(null, { mode, locationText, card: hit ? hit.card : null, text });
    updatePanelMeta(stat);
    if (IS_LIVE) {
      // S2：主地点未命中 && 地标键变化 → 产卡（地标没变不重复产）；分兵点位独立检查——归态势开关
      if (sitOn) triggerInstant(mode === 'fallback' && keyChanged, lKey, stat);
      if (SETTINGS.enabledShadowline) checkTriggers(stat);   // S3：触发矩阵（newday/号外/兜底）——归暗线开关
    }
  }

  // 预约引爆：$ad_pending.ambush 每楼检查（时间+地点命中 → 卡片戒备置顶 + 注入主动接触态标注）
  function checkAmbush(locationText, stat) {
    const pending = readChatVar(CV.pending);
    const list = pending && Array.isArray(pending.ambush) ? pending.ambush : [];
    if (!list.length) return null;
    const dateKey = statDateKey(stat);   // 如 "1925年 · 6月13日"
    const datePart = dateKey.replace(/\s/g, '');
    const remaining = [];
    let fired = null;
    for (const a of list) {
      const cond = a['条件'] || {};
      const timeStr = String(cond['时间'] || '').replace(/\s/g, '');
      // 时间命中：预约时间片段（月/日）与当前日期有交集，或预约未写时间
      const timeHit = !timeStr || (() => {
        const frags = timeStr.match(/\d{1,2}月\d{1,2}日|\d{1,2}\/\d{1,2}/g) || [];
        return !frags.length || frags.some(f => datePart.includes(f.replace(/\/|日/g, m => m === '/' ? '月' : '')));
      })();
      const placeList = Array.isArray(cond['地点∈']) ? cond['地点∈'] : [];
      const cardsNow = getCards();
      const curHit = matchCard(locationText, cardsNow);
      // 地点命中：①预约地点直接包含于当前地点串；②两者命中同一张卡片（预约写"达令港仓库"，
      // 当前地点是"达令港 · 伦道夫船运仓库"——借卡片别名/包含匹配对齐到同一驻防点）
      const placeHit = !placeList.length || placeList.some(p => {
        if (norm(locationText).includes(norm(p))) return true;
        const aHit = matchCard(p, cardsNow);
        return !!(aHit && curHit && aHit.card === curHit.card);
      });
      if (timeHit && placeHit) {
        fired = a;
        // 对应卡片戒备置顶
        const cards = getCards();
        for (const p of placeList) {
          const hit = matchCard(p, cards);
          if (hit) { hit.card.alert = a['引爆态'] === '严密' ? '严密' : (hit.card.alert || '警戒'); }
        }
        if (placeList.length) setCards(cards);
      } else remaining.push(a);
    }
    if (fired) {
      writeChatVar(CV.pending, { ambush: remaining, savedAt: Date.now() });
      log('预约引爆：', fired['派系'], fired['条件']);
      renderWire();
    }
    return fired;
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

  // —— 敌人名单（用户手输，本轮战役权威选项来源）+ 地标键（产卡触发粒度）—————————

  // 敌人名单：手输文本（逗号/顿号/换行分隔）→ 数组；为空表示未配置（menu 校验降级为结构校验）
  function getEnemyPool() {
    return String(SETTINGS.enemyPool || '')
      .split(/[,，、\n]/).map(s => s.trim()).filter(Boolean);
  }
  // 主角核心白名单：手输文本 → 数组；注入暗线输入，这些人不可能是间谍
  function getCoreTeam() {
    return String(SETTINGS.coreTeam || '')
      .split(/[,，、\n]/).map(s => s.trim()).filter(Boolean);
  }
  // menu 词条是否在用户手输名单内（相等或双向包含——用户可能写简写）
  function inEnemyPool(name, pool) {
    if (!pool || !pool.length) return true;   // 未配置名单：不校验（人类权威，卡片可在管理里人工审删）
    return pool.some(p => p === name || p.includes(name) || name.includes(p));
  }

  // 地标键：状态栏地点"大区 · 地标 …"中大区后的第一个字段（如"澳大利亚酒店 - 总统套房"）。
  // 产卡触发粒度锚：地标键没变（客厅→玄关级小变化）不更新；变了（换酒店）才触发产卡。
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

  // —— 世界书同步（按位独立配置：'situation' 态势位产卡 / 'shadowline' 暗线位报告）—————
  // 信息完整性优先：不做长度截断——缺信息导致的瞎编比长输入的稀释更危险
  async function getSyncedWorldbookText(slot) {
    const sync = (slot === 'shadowline' ? SETTINGS.worldSyncShadowline : SETTINGS.worldSyncSituation) || [];
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
  // N = SETTINGS.shadowlineFloors（默认 20，对齐 LWB 总结窗口；0=全部历史）；
  // 楼层过滤三字段：is_user（玩家楼）/ is_system（/hide 隐藏楼——真机实证 0-11 楼即此标记）/ is_hidden
  function getShadowlineFloorContext() {
    const limit = Number.isFinite(SETTINGS.shadowlineFloors) ? SETTINGS.shadowlineFloors : 20;
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

  // 最新楼正文（产卡语境输入；全量不截断）
  function readLatestFloorTail() {
    try {
      const msgs = getChatMessages(-1);
      const m = Array.isArray(msgs) ? msgs[0] : null;
      if (!m || !m.message) return '';
      return stripBlocks(m.message);
    } catch (e) { return ''; }
  }

  // ═════════════════════════════════════════════════════════════════════
  // 6. 战略层（暗线人格）：触发矩阵 → 全量输入 → 报告 → 硬校验 → 三路分发
  // ═════════════════════════════════════════════════════════════════════

  const Trigger = {
    busy: false,              // 报告生成中（并发触发直接跳过）
    lastReportDate: '',       // 上次报告时的游戏内日期（跨日检测）
    lastStage: '',            // 上次报告时的剧情阶段（变更→号外）
    lastCity: '',             // 上次报告时的城市（跨城市→号外）
    lastCombatResult: '',     // 上次看到的 $rpg_combat_result 指纹（变化→号外）
    lastFloorId: -1,          // 上次配发的楼层号（同日楼层计数去重）
    floorsSinceReport: 0,     // 同一游戏日内的楼层数（≥阈值→兜底）
  };
  const REPORT_FLOOR_CAP = 15;   // 同日兜底阈值（SPEC：15~20 取下限，宁可多推演）

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

  // 除名 = 墓碑：级联删该派系全部暗线（报告条目 + 提及它的阻力/预约整条删——交叉暗线，
  // 其他派系自身条目不动），废弃名单写入战略层输入（【墓碑（禁止复活）】），暗线词条即时重写
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
    // 级联①：最新报告——该派系条目 + 提及它的阻力整条删
    const report = readChatVar(CV.report);
    if (report && Array.isArray(report.factions)) {
      const before = report.factions.length;
      report.factions = report.factions.filter(f => !(f && f.name === name));
      const res = report.resistance && typeof report.resistance === 'object' ? report.resistance : {};
      if (Array.isArray(res.forbidden)) res.forbidden = res.forbidden.filter(x => x && !mentions(x.truth) && !mentions(x.path));
      if (Array.isArray(res.partial)) res.partial = res.partial.filter(x => !mentions(x));
      if (Array.isArray(res.friction)) res.friction = res.friction.filter(x => !mentions(x));
      report.resistance = res;
      if (Array.isArray(report['ambush预约'])) report['ambush预约'] = report['ambush预约'].filter(a => !(a && a['派系'] === name));
      writeChatVar(CV.report, report);
      writeWbEntry(WB_ENTRY_SHADOWLINE, buildShadowlineInjection(report));   // 暗线词条即时重写（无该派系版本）
      renderWire();   // surface 报纸同步去该派系
      log(`墓碑：${name} 已除名（报告 ${before}→${report.factions.length} 条，交叉暗线级联删除）`);
    }
    // 级联②：未引爆的预约（该派系的埋雷一并作废）
    const pending = readChatVar(CV.pending);
    if (pending && Array.isArray(pending.ambush) && pending.ambush.length) {
      const kept = pending.ambush.filter(a => !(a && a['派系'] === name));
      if (kept.length !== pending.ambush.length) {
        writeChatVar(CV.pending, { ambush: kept, savedAt: Date.now() });
      }
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
    let floorId = -1;
    try {
      const msgs = getChatMessages(-1);
      const m = Array.isArray(msgs) ? msgs[0] : null;
      if (m && m.message_id != null) floorId = m.message_id;
    } catch (e) { /* 楼号拿不到就不计数 */ }
    if (floorId > Trigger.lastFloorId) {
      Trigger.floorsSinceReport++;
      Trigger.lastFloorId = floorId;
    }
    const dateKey = statDateKey(stat);
    const stage = statStage(stat);
    const city = statCity(stat);
    const combat = JSON.stringify(readChatVar('$rpg_combat_result') || null);
    let reason = null;
    if (!Trigger.lastReportDate) {
      // 首次记录基线，不触发（避免安装即报告）
    } else if (dateKey && dateKey !== Trigger.lastReportDate) reason = 'newday';
    else if (stage && stage !== Trigger.lastStage) reason = 'stage-change';
    else if (city && city !== Trigger.lastCity) reason = 'city-change';
    else if (combat !== Trigger.lastCombatResult && combat !== 'null') reason = 'combat-result';
    else if (Trigger.floorsSinceReport >= REPORT_FLOOR_CAP) reason = 'floor-cap';
    Trigger.lastReportDate = dateKey || Trigger.lastReportDate;
    Trigger.lastStage = stage || Trigger.lastStage;
    Trigger.lastCity = city || Trigger.lastCity;
    Trigger.lastCombatResult = combat;
    if (reason) generateShadowlineReport(reason);
  }

  // —— 报告输入组装（信息完整性优先：五个数据源全量）—————————————

  async function buildShadowlineContext(stat) {
    const [worldSync] = await Promise.all([getSyncedWorldbookText('shadowline')]);
    const roster = getRoster();
    const lastReport = readChatVar(CV.report) || null;
    return {
      floorContext: getShadowlineFloorContext(),
      lwb: getLwbSummaryText(),
      worldSync,
      statData: stat,
      enemyPool: getEnemyPool(),   // ambush 预约"规模"的选用源——与态势位产卡同一名单（单一事实源）
      coreTeam: getCoreTeam(),
      extraRules: String(SETTINGS.extraRules || '').trim(),
      knownFactions: roster.factions, roster,
      lastReportFactions: lastReport && Array.isArray(lastReport.factions)
        ? lastReport.factions.map(f => ({ name: f.name, state: f.state, truth: f.truth })) : [],
    };
  }

  // —— 默认提示词（预设系统的默认项指向此函数；自定义预设存其文本快照）—————

  function DEFAULT_SHADOWLINE_SYS() {
    return [
      '你是开放世界的架构师、顶级权谋小说作家——为正文AI制造巫师3级别的叙事波折，而不是记录世界。',
      '任务：根据全部输入资料，输出一份 JSON 战略报告，推断各派系在玩家视线之外的动向。',
      '铁律：',
      '0. 认知定位：你的全部输出是你的推断与提案，不是既定事实——正文AI把它们当参考素材而非指令。以这种心态写作：动机写"最可能的解释"，行动写"正在准备的方案"，禁止上帝视角的确定性断言。三态诚实：延续上次报告的三态，前文明确演出过才标"已渗透"，真相落地才标"已兑现"，拿不准一律"推断中"。',
      '1. 反废话：严禁复述前文表层信息、玩家已知常识或主角团已推导的内容——你不是记录的庸才。除"从前文合理构思的报纸报道和街头传闻"可作事实引用外，其余全部写推断与设计；永远不顺水推舟写看似合理的废话。',
      '2. factions：每派系一条，字段结构必须照此（键名用英文）：{"name":"派系名","surface":"公开征兆一句话（展示给玩家）","truth":"幕后真相：前文很可能未出现过的深层动机+由动机生长的具体行动（仅注入正文AI）","contact":"主角团已引起其注意时：派出接触的具体人物（姓名/代号+伪装身份+真实目的），否则空串","scheme":"遵从动机为主角团设下的圈套（诱饵+真实杀招），无则空串","mole":"安插在主角团身边或社会面的间谍（优先选最无害、揭示时戏剧反转最大的人选；【主角核心白名单】人物严禁入选），无则空串","causes":["楼23"],"state":"推断中|已渗透|已兑现"}。surface 与 truth 成对、同一动向两个层次；causes=楼层出处数组（引用真实楼层号）。',
      '3. surface 必须是市民视角的公开信息——报纸社会新闻或街头传闻体（"城里发生了什么"），普通市民自然可见。严禁写成调查线索、内幕细节、人员调动内情或任何针对主角团的针对性情报——那些属于 truth/contact/mole 层。surface 须体现与其他派系的互动迹象，禁止静态环境描述。',
      '4. 圈套纪律：恰好 floor(N/2)（N=报告派系总数，向下取整）个派系对主角团设圈套（scheme 非空）——这是下限也是上限，全员针对主角团=失败。其余派系的动向必须围绕自身利益运转（自己的敌人、生意、日程、地盘纠纷），与主角团无关或仅顺带相遇。圈套建在主角团推理的漏洞上，像最苛刻的编辑一样审视前文。',
      '5. 尊重实力设定：主角团的前文战绩、背景靠山、警觉程度是硬约束——针对他们的算计必须匹配相应的谨慎、成本与失败风险；把强者当无防备的工具人是廉价的阴谋论。',
      '6. 深层动机必须从派系既得利益与前文行为中合理生长——推断可以大胆，动机必须有根。',
      '7. 墓碑名单中的派系禁止以任何形式复活或提及。',
      '8. 措辞紧凑：truth/contact/scheme/mole 每项一句话以内，禁止铺陈细节与心理描写长篇。',
      '9. resistance：forbidden={truth 禁泄真相, path 正确获取途径, leak_cost 过早泄露毁掉什么}；partial=强行调查应得的部分信息或误导；friction=来自已登场势力动机的环境阻力。',
      '10. ambush预约：主动来袭埋雷，结构 {"派系":"…","条件":{"时间":"游戏内日期或区间","地点∈":["…"]},"规模":"词条*N/…","引爆态":"严密"}，时间用游戏内日期。规模词条只能从【可选敌人名单】中选用（名单为空时自行按剧情合理性命名）——引爆发敌须与战斗链路（图鉴/卡片菜单）对得上。',
      '11. 只输出 JSON，禁止任何解释文字。顶层 schema：{"stage":"阶段判断","factions":[…],"resistance":{"forbidden":[…],"partial":[…],"friction":[…]},"roster_ops":[],"ambush预约":[…]}',
    ].join('\n');
  }

  const ShadowlinePrompt = makePresetStore(LS.promptShadowline, DEFAULT_SHADOWLINE_SYS);

  function buildShadowlineMessages(ctx) {
    const sys = ShadowlinePrompt.currentSys();
    const user = [
      // ① 世界书同步资料（按配置顺序）——暗线的世界知识基础
      `【世界书同步资料】\n${ctx.worldSync || '（无）'}`,
      // ② LWB 早期历史总结——对应已被隐藏（总结）的早期楼层的浓缩
      `【早期历史总结（LWB，对应已隐藏的早期楼层）】\n${ctx.lwb || '（无）'}`,
      // ③ 非隐藏楼层原文——与正文 AI 视野一致（仅 AI 楼层，━━ 分隔严格排版）
      `【非隐藏楼层原文（与正文 AI 视野一致）】\n${ctx.floorContext || '（无）'}`,
      // ④ 以下为辅助信息——暗线只管非玩家阵营：仅时空锚点与敌方动向，玩家队伍数值/资产/内心一律不发
      `【当前时空与敌方动向】\n${JSON.stringify({
        '日期和时间': ctx.statData['日期和时间'],
        '地点': ctx.statData['地点'],
        '敌方动向': (ctx.statData['人物'] && ctx.statData['人物']['敌人']) || [],
      }, null, 1)}`,
      // ④b 可选敌人名单——预约"规模"的敌方词条只能从中选（否则引爆发敌与图鉴/卡片菜单脱节，Combat_block 链路对不上）
      `【可选敌人名单（ambush 预约的"规模"只能从中选用）】\n${(ctx.enemyPool || []).join(' / ') || '（无——预约"规模"自行按剧情合理性命名）'}`,
      `【主角核心白名单（绝不背叛、绝不可能是间谍）】\n${(ctx.coreTeam || []).join(' / ') || '（未设置——正文长期塑造的核心同伴也可能被指定为间谍，建议在设置中填写）'}`,
      `【名册（已知派系）】\n${ctx.knownFactions.join(' / ') || '（无）'}`,
      `【墓碑（禁止复活）】\n${ctx.roster.tombstones.join(' / ') || '（无）'}`,
      `【上次报告的派系三态（延续用）】\n${ctx.lastReportFactions.length ? JSON.stringify(ctx.lastReportFactions, null, 1) : '（首次报告）'}`,
      // ⑧ 附加铁律（用户手输，最高优先级）——放文末：末尾注意力区块，压过前文的默认规则
      ...(ctx.extraRules ? [`【附加铁律（用户指定，优先级高于本文所有默认规则）】\n${ctx.extraRules}`] : []),
    ].join('\n\n');
    return [{ role: 'system', content: sys }, { role: 'user', content: user }];
  }

  // —— 报告硬校验（§4.3：不过即丢弃该条/重试，不阻塞其余产出）—————————

  const TRI_STATES = ['推断中', '已渗透', '已兑现'];
  function validateReport(report, ctx) {
    if (!report || typeof report !== 'object') return { report: null, errs: ['报告非对象'] };
    // 零校验模式（用户指示：先跑通看效果，未要求前不加限制）——只做结构整形与字段补默认，
    // 不丢弃任何条目、不触发重试，杜绝"生成了却静默丢弃"的 token 浪费
    let factions = (report.factions || []).map((f, i) => {
      f = (f && typeof f === 'object') ? f : {};
      // 键名容错：模型可能被示例带偏用中文键（真机实证"派系/真相/征兆/出处/状态"）——先映射再补默认
      const pick = (...keys) => { for (const k of keys) if (f[k] != null && f[k] !== '') return f[k]; return undefined; };
      f.name = pick('name', '派系', '名称') || `未命名派系${i + 1}`;
      f.truth = pick('truth', '真相') || '（真相未明）';
      f.surface = pick('surface', '征兆', '表面') || '（街头暂无可察异动）';
      const rawCauses = pick('causes', '出处');
      f.causes = (Array.isArray(rawCauses) && rawCauses.length) ? rawCauses : ['（出处未标注）'];
      const rawState = pick('state', '状态');
      f.state = TRI_STATES.includes(rawState) ? rawState : '推断中';
      // S4 扩展字段：接触人/圈套/间谍（中文键容错，缺省空串——无则不注入）
      f.contact = String(pick('contact', '接触', '接触人') || '');
      f.scheme = String(pick('scheme', '圈套') || '');
      f.mole = String(pick('mole', '间谍', '内线') || '');
      return f;
    });
    // 墓碑过滤（程序兜底，SPEC §4.4 删除=墓碑）：模型违反铁律 7 输出墓碑派系时整条丢弃——
    // 验收"墓碑派系在报告输出中断言为零"由此保证（提示词约束为主，程序兜底为辅）
    const dead = (ctx && ctx.roster && Array.isArray(ctx.roster.tombstones)) ? ctx.roster.tombstones : [];
    if (dead.length) {
      const dropped = factions.filter(f => dead.includes(f.name)).map(f => f.name);
      if (dropped.length) {
        factions = factions.filter(f => !dead.includes(f.name));
        logWarn('墓碑派系条目已丢弃（禁止复活）：', dropped.join('、'));
      }
    }
    const resistance = report.resistance && typeof report.resistance === 'object' ? report.resistance : {};
    resistance.forbidden = (resistance.forbidden || []).filter(x => x && x.truth && x.path);
    // 对象条目容错（真机实证 3.1P 输出 {target,result}/{source,effect} 对象）——按键取值拼接，防 [object Object]
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
    const ambush = (report['ambush预约'] || []).filter(a => a && a['派系'] && a['条件'] && typeof a['条件'] === 'object');
    return {
      report: {
        stage: String(report.stage || ''),
        factions, resistance,
        roster_ops: (report.roster_ops || []).map(String).filter(Boolean),
        'ambush预约': ambush,
        generatedAt: Date.now(), reason: Trigger.busyReason || '',
      }, errs: [],
    };
  }

  // —— 提炼注入（副导演-暗线词条：深度0 system 持续在场，报告后刷新）———

  function buildShadowlineInjection(report) {
    // 定位声明放开标签之后：副导演输出是推断与提案，正文AI参考演出而非执行——防按头
    // 派系行尾缀：接触人/圈套/间谍（非空才带——正文 AI 可借环境渗透演出，间谍揭示节奏由三态+禁泄控制）
    const extra = f => [
      f.contact && `｜接触：${f.contact}`,
      f.scheme && `｜圈套：${f.scheme}`,
      f.mole && `｜间谍：${f.mole}`,
    ].filter(Boolean).join('');
    // 段落 = [标签名, 列表行]；标签内两空格缩进 "- " 列表，段间空行
    const sections = [];
    const facts = report.factions.filter(f => f.state !== '推断中');
    if (facts.length) {
      sections.push(['世界引擎推断', facts.map(f =>
        `  - ${f.truth}【${f.state}·${(f.causes || [])[0] || ''}】${extra(f)}`)]);
    }
    const infers = report.factions.filter(f => f.state === '推断中');
    if (infers.length) {
      sections.push(['幕后动向（推断中·仅可环境渗透，禁止直接揭示）', infers.map(f =>
        `  - ${f.truth}【推断·${(f.causes || [])[0] || ''}】${extra(f)}`)]);
    }
    const forbidden = (report.resistance && report.resistance.forbidden) || [];
    if (forbidden.length) {
      sections.push(['禁泄清单（调查未抵达前禁止揭示）', forbidden.map(x =>
        `  - ${x.truth}【途径：${x.path}】`)]);
    }
    const partial = (report.resistance && report.resistance.partial) || [];
    if (partial.length) {
      sections.push(['调查阻力（强行调查只应得到以下层级的信息）', partial.map(p => `  - ${p}`)]);
    }
    const friction = (report.resistance && report.resistance.friction) || [];
    if (friction.length) {
      sections.push(['环境阻力（当前环境对行动的客观影响）', friction.map(f => `  - ${f}`)]);
    }
    const body = sections.map(([tag, items]) => `<${tag}>\n${items.join('\n')}\n</${tag}>`).join('\n\n');
    return [
      MEMO_OPEN,
      '',
      '以下是暗线世界引擎的推断——用于环境渗透、NPC 行为自洽与剧情伏笔参考，正文按合理性自由取舍。',
      '',
      body,
      '',
      MEMO_CLOSE,
    ].join('\n');
  }

  // —— 报告生成主流程 ——————————————————————————————————————

  async function generateShadowlineReport(reason) {
    if (Trigger.busy) { toast('📡 推演进行中，请稍候（上次任务未完成）'); return; }
    if (!SETTINGS.enabledShadowline) {
      if (reason === 'manual') toast('暗线推演已关闭——⚙ 设置 → 功能开关');
      log(`暗线开关关闭，跳过${reason}触发`);
      return;
    }
    const cfg = SETTINGS.shadowline;
    if (!cfg.baseUrl || !cfg.model) {
      log(`暗线位端点未配置，跳过${reason}触发`);
      toast('暗线位端点未配置——⚙ 设置 → 暗线位（Base URL / Model）');
      return;
    }
    Trigger.busy = true; Trigger.busyReason = reason;
    if (reason === 'manual') toast('📡 暗线推演已启动…完成后自动弹出报告');
    try {
      const stat = readLatestStatData();
      if (!stat) { log('报告触发但无 stat_data，跳过'); return; }
      const ctx = await buildShadowlineContext(stat);
      const messages = buildShadowlineMessages(ctx);
      // 调用 + 解析：仅当完全拿不到 JSON（网络失败/输出非 JSON——token 无法利用）才重试一次；
      // 解析成功后无论校验提示多少条都宽容落地，绝不因校验丢弃整份报告浪费 token
      let parsed = null, lastErr = '';
      for (let attempt = 1; attempt <= 2 && !parsed; attempt++) {
        try {
          const raw = await callLLM(cfg, messages, { timeoutMs: 180000, label: 'shadowline' });
          parsed = extractJson(raw);
        } catch (e) {
          lastErr = e.message || String(e);
          logWarn(`暗线报告第 ${attempt} 次调用失败：${lastErr}`);
          if (attempt === 1) toast('📡 首次调用失败，重试中…', 4000);
        }
      }
      if (!parsed) {
        logWarn(`暗线报告最终失败（保持上次注入）：${lastErr}`);
        toast(`暗线报告生成失败：${lastErr}`, 6000);
        return;
      }
      const { report, errs } = validateReport(parsed, ctx);
      if (errs.length) logWarn('报告宽容提示（条目已保留）：', errs.join('；'));
      if (!report) { toast('暗线报告生成失败：报告结构异常', 6000); return; }
      if (!report.factions.length) logWarn('报告 factions 为空——已存档落地（不重试不丢弃）');
      // 存档 + 分发（garrisons 已移除——态势由态势位全权负责，暗线不分散注意力）
      writeChatVar(CV.report, report);
      // 名册自动注册（新派系轻量登场；墓碑派系绝不回册——即使模型违反铁律输出）
      const roster = getRoster();
      for (const f of report.factions) if (!roster.factions.includes(f.name) && !roster.tombstones.includes(f.name)) roster.factions.push(f.name);
      for (const op of report.roster_ops) if (op && !roster.factions.includes(op) && !roster.tombstones.includes(op)) roster.factions.push(op);
      saveRoster(roster);
      // 提炼注入（世界书词条持续在场，报告后刷新；用户改过词条内容走 merge3 合并兜底）
      const injectText = buildShadowlineInjection(report);
      writeWbEntry(WB_ENTRY_SHADOWLINE, injectText);
      // 预约存档（$ad_pending）
      if (report['ambush预约'] && report['ambush预约'].length) {
        writeChatVar(CV.pending, { ambush: report['ambush预约'], savedAt: Date.now() });
      }
      Trigger.floorsSinceReport = 0;
      Trigger.lastReportDate = statDateKey(stat) || Trigger.lastReportDate;
      Trigger.lastStage = statStage(stat) || Trigger.lastStage;
      Trigger.lastCity = statCity(stat) || Trigger.lastCity;
      // S4 最小版：surface 公开征兆上折叠条 ticker（最新两条，倒序插入）
      for (const f of report.factions.slice(0, 2).reverse()) {
        const head = `${String(f.name || '').slice(0, 5)}：${String(f.surface || '').slice(0, 12)}`;
        if (State.tickerHeads[0] !== head) {
          State.tickerHeads.unshift(head);
          State.tickerHeads = State.tickerHeads.slice(0, 3);
        }
      }
      renderTicker();
      renderWire();   // S4：事件号外即时上报纸（灰卡/署名按接触状态渲染）
      toast(`暗线报告已生成（${reason}）：${report.factions.length} 派系动向`);
      log('暗线报告完成', `派系 ${report.factions.length}，预约 ${report['ambush预约'].length}`);
      openReportModal(report);   // GM 查看弹窗（手动/自动触发均弹出）
    } finally {
      Trigger.busy = false; Trigger.busyReason = '';
    }
  }

  // ═════════════════════════════════════════════════════════════════════
  // 7. 态势位（即时产卡）：未命中触发 → 输入组装 → 生成 → 白名单校验 → 回落
  // ═════════════════════════════════════════════════════════════════════

  const Instant = { busy: false, tried: Object.create(null) };  // tried: norm(地点)→true 防重复产卡

  // 分兵点位：角色"内心"含"不在场，前往X"类描述时提取 X（一次 LLM 调用产多卡）
  function collectOffscreenPlaces(stat) {
    const out = [];
    for (const c of charList(stat)) {
      const m = String(c['内心'] || '')
        .match(/不在场[，,]?\s*(?:正在|已经?)?(?:前往|赶往|在)([^，。,.、;；!?！？]{2,20})/);
      if (m) out.push(m[1].trim());
    }
    return [...new Set(out)];
  }

  // 卡片硬校验：结构 + menu 敌人名单（用户手输的战役名单为唯一权威，双向包含容错）；返回 null=通过
  function validateCard(card) {
    // 零校验模式：仅拦废数据（缺 place/faction 无法使用），menu/alert/aliases 宽容收下
    if (!card || typeof card !== 'object') return '非对象';
    if (!card.place || typeof card.place !== 'string') return '缺少 place';
    if (!card.faction || typeof card.faction !== 'string') return '缺少 faction';
    return null;
  }

  function DEFAULT_SITUATION_SYS() {
    return [
      '你是跑团世界模拟器的"态势位"生成器（快速、克制、结构遵循）。为给定地点各生成一张驻防态势卡。',
      '规则：',
      '1. place 用**地标级**名称（一所大学、一个山洞、一间旅馆、一座仓库）——禁止大区（"悉尼"），禁止房间级小地点（"某酒店303房"）。同一地标内的房间/楼层变化不产生新卡。',
      '2. menu 是可选敌方菜单，词条名只能从【可选敌人名单】中选用，仅在原词后加 *min~max 数量后缀，格式"词条A*min~max/词条B*N"；该地点无敌方驻防（民用/中立/己方据点）时 menu 为空字符串。',
      '3. alert 只能取：松懈/常规/警戒/严密。',
      '4. faction 用派系名（优先从【名册】选用；民用/中立场所可标注"无（中立场所）"类描述）。',
      '5. reaction 一句话：何类行为被容忍、何类触发敌意。verdict 一句话判定标准：何种行为构成对戒备的挑衅/侵入/暴露。',
      '6. 只输出 JSON 数组，禁止任何解释文字。每项结构：',
      '{"place":"地标名","aliases":["别名"],"faction":"派系","menu":"词条*min~max/…","alert":"常规","reaction":"…","verdict":"…"}',
    ].join('\n');
  }

  const SituationPrompt = makePresetStore(LS.promptSituation, DEFAULT_SITUATION_SYS);

  function buildInstantMessages(places, context) {
    const sys = SituationPrompt.currentSys();
    const user = [
      `【待登记地标】\n${places.map((p, i) => `${i + 1}. ${p}`).join('\n')}`,
      `【剧情上下文（最近正文节选）】\n${context.floorTail || '（无）'}`,
      `【可选敌人名单（menu 只能从中选用）】\n${(context.enemyPool || []).join(' / ') || '（无——menu 一律留空）'}`,
      `【世界书同步资料】\n${context.worldSync || '（无）'}`,
      `【名册（已知派系）】\n${(context.roster || []).join(' / ') || '（无）'}`,
    ].join('\n\n');
    return [{ role: 'system', content: sys }, { role: 'user', content: user }];
  }

  async function generateInstantCards(places, stat) {
    const cfg = SETTINGS.situation;
    if (!cfg.baseUrl || !cfg.model) { log('态势位端点未配置，跳过即时产卡'); return; }
    const [worldSync] = await Promise.all([getSyncedWorldbookText('situation')]);
    const roster = [...new Set(getCards().map(c => c.faction).filter(Boolean))];
    const floorTail = readLatestFloorTail();
    const ctx = { roster, floorTail, worldSync, enemyPool: getEnemyPool() };
    for (const p of places) Instant.tried[norm(p)] = true;
    let lastErr = '';
    for (let attempt = 1; attempt <= 2; attempt++) {          // 失败/全拒 → 重试 ≤1
      try {
        const raw = await callLLM(cfg, buildInstantMessages(places, ctx), { label: 'instant' });
        const arr = extractJson(raw);
        const list = Array.isArray(arr) ? arr : [arr];
        const okCards = [];
        for (const c of list) {
          const err = validateCard(c);
          if (err) { lastErr = `${(c && c.place) || '?'}：${err}`; logWarn('卡片校验拒绝', lastErr); continue; }
          okCards.push({
            place: String(c.place).trim(),
            aliases: (c.aliases || []).map(String),
            faction: String(c.faction).trim(),
            menu: String(c.menu || ''),
            alert: ALERT_LEVELS.includes(c.alert) ? c.alert : '常规',
            reaction: String(c.reaction || ''),
            verdict: String(c.verdict || ''),
            source: 'instant',
          });
        }
        if (!okCards.length) throw new Error(`全部卡片未过校验（${lastErr}）`);
        const cards = getCards();
        let added = 0;
        for (const c of okCards) {
          if (!cards.some(x => norm(x.place) === norm(c.place))) { cards.push(c); added++; }
        }
        if (added) {
          setCards(cards); renderWire(); renderTicker();
          toast(`新地点已登记：${okCards.map(c => c.place).join('、')}`);
          log(`即时产卡成功（${added} 张，第 ${attempt} 次尝试）`);
          scheduleDispatch('instant-card');   // 下一拍重新配发：当楼兜底 → 命中新卡
        } else log('产卡结果均已存在于卡片池，跳过');
        return;
      } catch (e) {
        lastErr = e.message || String(e);
        logWarn(`即时产卡第 ${attempt} 次失败：${lastErr}`);
      }
    }
    logWarn(`即时产卡最终失败（保持兜底注入）：${lastErr}`);
    toast(`产卡失败：${lastErr}`, 5000);
  }

  // dispatchNow 接线点：主地点未命中 + 分兵点位未命中 → 一次异步产卡（busy 防并发）
  function triggerInstant(mainMissed, mainPlace, stat) {
    if (Instant.busy) return;
    const cards = getCards();
    const targets = [];
    if (mainMissed && mainPlace && !Instant.tried[norm(mainPlace)]) targets.push(mainPlace);
    for (const p of collectOffscreenPlaces(stat)) {
      const n = norm(p);
      if (!Instant.tried[n] && !matchCard(p, cards)) targets.push(p);
    }
    if (!targets.length) return;
    Instant.busy = true;
    generateInstantCards(targets, stat)
      .catch(e => logWarn('generateInstantCards 异常', e))
      .finally(() => { Instant.busy = false; });
  }

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

    // 展开态面板：双耳古典大报头 → 当前态势通栏行 → 纵向连续情报流 → 报尾底注
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
          <button id="ad-btn-report" title="暗线推演：查看最新报告 / 手动触发（S3）">📡</button>
          <button id="ad-btn-recompute" title="按最新楼层立即重算态势注入">↻</button>
          <button id="ad-btn-cards" title="态势卡片池管理">🗂</button>
          <button id="ad-btn-roster" title="派系名册：名册/墓碑管理（S5）">📜</button>
          <button id="ad-btn-settings" title="双模型端点与开关">⚙</button>
        </span>
        <div class="ad-head-sub">
          <span id="ad-mast-date">—</span>
          <span class="stage" id="ad-mast-stage">—</span>
        </div>
      </div>
      <div class="ad-wire" id="ad-wire"><div id="ad-wire-body"></div></div>
      <div class="ad-colophon">本报仅刊载 <b>街头可见之事与公开传闻</b> ｜ 幕后真相须由读者自行抵达</div>`);
    UI_DOC.body.appendChild(panel);

    // 模态容器（设置/卡片/注入预览共用）
    const modal = el('div', { id: 'ad-modal' }, `<div class="ad-modal-box" id="ad-modal-box"></div>`);
    UI_DOC.body.appendChild(modal);

    els = { rail, panel, dot: rail.querySelector('#ad-rail-dot'), ticker: rail.querySelector('#ad-ticker'),
      wireBody: panel.querySelector('#ad-wire-body'),
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
      const report = readChatVar(CV.report);
      if (report && report.factions) openReportModal(report);
      else { toast('尚无报告——手动触发推演'); generateShadowlineReport('manual'); }
    });
    panel.querySelector('#ad-btn-recompute').addEventListener('click', () => {
      dispatchNow('manual'); toast('已按最新楼层重算态势');
    });
    panel.querySelector('#ad-btn-cards').addEventListener('click', openCardsModal);
    panel.querySelector('#ad-btn-roster').addEventListener('click', openRosterModal);
    panel.querySelector('#ad-btn-settings').addEventListener('click', openSettingsModal);

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
  function pushTickerHead(mode, placeOrLoc) {
    const label = mode === 'card' ? '驻防' : mode === 'safe' ? '安全区' : '新地界';
    const name = ((mode === 'card' ? String(placeOrLoc || '') : shortLoc(placeOrLoc)) || '未知地点').slice(0, 8);
    const head = `${name}·${label}`;
    if (State.tickerHeads[0] === head) return;
    State.tickerHeads.unshift(head);
    State.tickerHeads = State.tickerHeads.slice(0, 3);
    renderTicker();
  }

  function renderTicker() {
    if (!els.rail || !els.ticker) return;
    const heads = (State.tickerHeads || []).slice(0, 3);
    els.rail.classList.toggle('empty', heads.length === 0);
    els.ticker.innerHTML = heads.concat(heads).map(t => `<li>${esc(t)}</li>`).join('');
  }

  // 面板主体：当前态势行 + 情报条目流（S1 数据源=卡片池；S4 换 surface 真情报流）
  function compactMenu(menu) {
    return parseMenu(menu).map(e => {
      if (e.max > e.min) return `${e.name}${e.min}-${e.max}`;
      if (e.max) return `${e.name}×${e.max}`;
      return e.name;
    }).join('·');
  }

  function renderWire() {
    if (!els.wireBody) return;
    const cards = getCards();
    const hit = State.lastLocationText ? matchCard(State.lastLocationText, cards) : null;
    let html = '';

    if (State.lastLocationText) {
      const locShort = shortLoc(State.lastLocationText);
      let leadTitle = '';
      let leadBody = '';

      if (hit) {
        const entries = parseMenu(hit.card.menu);
        const safe = hit.card.safe || !entries.some(e => e.min || e.max);
        const menuStr = compactMenu(hit.card.menu);
        const alertLabel = safe ? '安全区' : `${hit.card.alert || '常规'}驻防中`;
        leadTitle = `${hit.card.place} · ${alertLabel}`;
        leadBody = `${hit.card.faction}驻守${menuStr ? '（' + menuStr + '）' : ''}。${hit.card.reaction || hit.card.verdict || '应邀客人以礼相待；亮械或闯入后场立即翻脸。'}`;
      } else {
        leadTitle = `${locShort || '当前地点'} · 通用兜底推演中`;
        leadBody = '此地暂无固定驻防档案。若冲突升级，敌方将按剧情合理性与世界书图鉴进行态势演化。';
      }

      html += `<div class="ad-nowline ad-lead-box" title="${esc(State.lastLocationText)}">
        <div class="ad-lead-stamp">PUBLIC RECORD</div>
        <div class="ad-lead-eyebrow">📍 当前所在地态势简报 · CURRENT SITUATION</div>
        <div class="ad-lead-title">${esc(leadTitle)}</div>
        <div class="ad-lead-body">${esc(leadBody)}</div>
      </div>`;
    }

    if (!cards.length) {
      html += `<div class="ad-empty">情报流为空——在 🗂 中导入卡片，或等待 S2 态势位自动产卡。</div>`;
    }

    // S4 完全体：报告 surface 公开征兆上报纸（有报告时替代卡片池成为玩家可见内容）。
    // 灰卡阶段揭示（接触即揭）：未接触派系 ？？？ 遮名（只可见征兆）；已接触署名 + 三态徽标；
    // 插件自动登记的派系带"新面孔"标记（预输入无）；新揭示首拍金色揭幕闪动；
    // 已接触但本轮无条目的名册派系给平静占位卡（漏更新不丢卡）。
    const report = readChatVar(CV.report);
    if (report && Array.isArray(report.factions) && report.factions.length) {
      const { roster, newly } = syncRevealState();
      const reportDate = report.generatedAt ? new Date(report.generatedAt).toLocaleDateString() : '';
      for (const f of report.factions) {
        if (roster.tombstones.includes(f.name)) continue;   // 墓碑兜底（级联已删，双保险）
        const shown = roster.revealed.includes(f.name);
        const fresh = !roster.manual.includes(f.name);      // 插件自建 → 新面孔（预输入无标记）
        const stateCls = f.state === '已兑现' ? 'hot' : '';
        html += `<div class="ad-item${shown ? '' : ' grey'}${newly.includes(f.name) ? ' unveil' : ''}">
          <div class="ad-item-header">
            <span class="ad-item-kicker">《悉尼宪报》 · ${esc(reportDate)}${fresh ? ' · <span class="ad-newcomer">新面孔</span>' : ''}</span>
            ${shown ? `<span class="ad-item-alert ${stateCls}">${esc(f.state || '推断中')}</span>` : ''}
          </div>
          <div class="ad-item-title"><span class="ad-item-place">${shown ? esc(f.name) : '？？？'}</span></div>
          <div class="ad-item-reaction">${esc(f.surface || '')}</div>
        </div>`;
      }
      // 平静占位：已接触（含预输入）但本轮报告无条目——"永远有卡，漏更新不丢卡"；
      // 未接触派系不出占位卡（不剧透存在感——它们只经征兆灰卡登场）
      const reportNames = new Set(report.factions.map(f => f.name));
      for (const name of roster.factions) {
        if (reportNames.has(name) || roster.tombstones.includes(name) || !roster.revealed.includes(name)) continue;
        html += `<div class="ad-item quiet">
          <div class="ad-item-header"><span class="ad-item-kicker">《悉尼宪报》 · 平静</span></div>
          <div class="ad-item-title"><span class="ad-item-place">${esc(name)}</span></div>
          <div class="ad-item-reaction">暂无可察异动。</div>
        </div>`;
      }
      els.wireBody.innerHTML = html;
      return;
    }

    for (const c of cards) {
      const entries = parseMenu(c.menu);
      const safe = c.safe || !entries.some(e => e.min || e.max);
      const menuStr = compactMenu(c.menu);
      const isHot = !safe && (c.alert === '警戒' || c.alert === '严密');
      const alertCls = safe ? 'safe' : (isHot ? 'hot' : '');
      const isHit = hit && hit.card.place === c.place;
      const kickerSource = c.source === 'daily' ? '《真理报》社会版' : '《情报汇编》';
      const statusLabel = safe ? '安全区' : (isHot ? (c.alert === '严密' ? '戒备扩充' : '火并升温') : esc(c.alert || '常规'));

      html += `<div class="ad-item${isHit ? ' hit' : ''}">
        <div class="ad-item-header">
          <span class="ad-item-kicker">${esc(kickerSource)} · 派系：${esc(c.faction || '未知')}</span>
          <span class="ad-item-alert ${alertCls}">${esc(statusLabel)}</span>
        </div>
        <div class="ad-item-title">
          <span class="ad-item-place">${esc(c.place)}</span>${menuStr ? `：<span class="menu">${esc(menuStr)}</span>` : ''}
        </div>
        <div class="ad-item-reaction">${esc(c.reaction || '现场暂无特殊反应记录，按常识与戒备等级演出。')}</div>
        ${c.verdict ? `<div class="ad-item-sub-wire">✦ 现场反应与判定：${esc(c.verdict)}</div>` : ''}
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

  // —— 设置弹窗 ——————————————————————————————————————————

  // —— 设置弹窗（可重渲染：世界书同步的增删/选书操作不丢其他输入）———

  let editSync = null;   // 编辑中的两套 worldSync 副本 { situation: [], shadowline: [] }

  function openSettingsModal() {
    editSync = {
      situation: JSON.parse(JSON.stringify(SETTINGS.worldSyncSituation || [])),
      shadowline: JSON.parse(JSON.stringify(SETTINGS.worldSyncShadowline || [])),
    };
    renderSettingsModal();
  }

  // 把表单输入收进 SETTINGS（不持久化——供 sync 操作重渲前保存现场）
  // worldSync 即时持久化：选书/勾词条/增删立即写回（不依赖"保存"按钮）；
  // 已选书未勾词条的来源保留（filter 只去 book 空的），防止"选书后重开被清空"
  function persistSyncNow() {
    SETTINGS.worldSyncSituation = editSync.situation.filter(x => x && x.book);
    SETTINGS.worldSyncShadowline = editSync.shadowline.filter(x => x && x.book);
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
        <div class="dim" style="font-size:10px;color:var(--ad-ink-faint);margin-bottom:8px">勾选的词条内容将注入${slot === 'shadowline' ? '暗线位（报告）' : '态势位（产卡）'}的输入。</div>
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
        <label style="width:auto;color:var(--ad-ink-strong)"><input type="checkbox" data-k="enabledShadowline" ${s.enabledShadowline ? 'checked' : ''}> 暗线推演（报告 + 暗线词条注入）</label>
        <label style="width:auto;color:var(--ad-ink-strong)"><input type="checkbox" data-k="enabledSituation" ${s.enabledSituation ? 'checked' : ''}> 态势配发（态势词条注入 + 即时产卡 + 预约引爆）</label>
      </div></div>
      <div class="ad-form-row" style="align-items:flex-start"><label style="padding-top:5px">🎲 随机遭遇</label><div style="display:flex;flex-direction:column;gap:4px">
        <label style="width:auto;color:var(--ad-ink-strong)"><input type="checkbox" data-k="randomCombatEnabled" ${s.randomCombatEnabled ? 'checked' : ''}> 每楼掷骰，命中即在用户本楼输入末尾追加"强制开战"指令</label>
        <div style="display:flex;align-items:center;gap:6px">
          <input type="number" step="1" min="0" max="100" data-k="randomCombatChance" value="${s.randomCombatChance}" style="width:64px">
          <span class="dim" style="font-size:9.5px;color:var(--ad-ink-faint)">% / 楼 · 安全区与战斗进行中不掷骰</span>
        </div>
      </div></div>
      <div class="ad-form-row" style="align-items:flex-start"><label style="padding-top:5px">本轮敌人名单</label>
        <textarea data-k="enemyPool" rows="3" placeholder="手输本轮战役可选敌人，逗号/换行分隔（产卡 menu 与暗线预约"规模"从中选用）&#10;例：萨里山剃刀党混混，黑帮职业杀手，悉尼常规巡警">${esc(s.enemyPool || '')}</textarea>
        <span class="dim" style="flex:none;font-size:9.5px;color:var(--ad-ink-faint)">留空则不校验 menu</span></div>
      <div class="ad-form-row" style="align-items:flex-start"><label style="padding-top:5px">主角核心白名单</label>
        <textarea data-k="coreTeam" rows="2" placeholder="手输绝不背叛的核心队友，逗号/换行分隔&#10;例：弗兰克，林有声">${esc(s.coreTeam || '')}</textarea>
        <span class="dim" style="flex:none;font-size:9.5px;color:var(--ad-ink-faint)">留空则任何人都可能是间谍</span></div>
      <div class="ad-form-row" style="align-items:flex-start"><label style="padding-top:5px">附加铁律</label>
        <textarea data-k="extraRules" rows="3" placeholder="手输给副导演的最高优先级注意事项（多行），拼到暗线输入文末，压过默认规则&#10;例：灰瘟与邪教无任何关系，禁止关联；主角团是身经百战的强者，算计他们必须有成本与风险">${esc(s.extraRules || '')}</textarea>
        <span class="dim" style="flex:none;font-size:9.5px;color:var(--ad-ink-faint)">世界观纠偏/尺度约束</span></div>
      <div class="ad-form-row"><label>副导演可见楼层</label><input type="number" step="1" min="0" data-k="shadowlineFloors" value="${s.shadowlineFloors}">
        <span class="dim" style="flex:none;font-size:9.5px;color:var(--ad-ink-faint)">0=全部历史；仅 AI 楼层，排除玩家输入</span></div>
      <div class="ad-form-row"><label>调试模式</label><label style="width:auto;color:var(--ad-ink-strong)">
        <input type="checkbox" data-k="debug" ${s.debug ? 'checked' : ''}> 记录 LLM 请求/响应（控制台 + 日志查看）</label></div>
      <div class="ad-btnrow" style="margin-top:2px"><button id="ad-debug-open">🐞 LLM 调试日志</button></div>
      ${syncSectionHtml('shadowline', '副导演 · 世界书同步（→ 报告输入）')}
      ${syncSectionHtml('situation', '态势位 · 世界书同步（→ 产卡输入）')}
      ${promptSectionHtml('shadowline', '暗线导演 · 提示词', ShadowlinePrompt)}
      ${ep('shadowline', '暗线位（次高智力 · 天级+事件）')}
      ${promptSectionHtml('situation', '态势产卡 · 提示词', SituationPrompt)}
      ${ep('situation', '态势位（快速小模型 · 随地点）')}
      <div class="ad-btnrow">
        <button class="primary" id="ad-set-save">保存</button>
        <button id="ad-set-close">关闭</button>
      </div>`);
    els.modalBox.querySelector('#ad-set-theme').value = currentTheme;

    // 全部设置项 change 即时持久化（不依赖"保存"按钮——敌人名单/端点/楼层窗口改完即生效）
    els.modalBox.querySelectorAll('[data-k]').forEach(el => {
      el.addEventListener('change', () => {
        collectFormToSettings();
        saveSettings(SETTINGS);
        // 双功能开关切换即时生效：关→词条下灯；开→强制重写重新上灯
        const k = el.getAttribute('data-k');
        if (k === 'enabledShadowline' || k === 'enabledSituation') applySwitches();
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
    bindPromptOps({ shadowline: ShadowlinePrompt, situation: SituationPrompt });

    els.modalBox.querySelector('#ad-debug-open').addEventListener('click', () => {
      collectFormToSettings();   // 先收表单（含调试开关），再打开日志
      openDebugModal();
    });

    els.modalBox.querySelector('#ad-set-save').addEventListener('click', () => {
      collectFormToSettings();
      persistSyncNow();
      applySwitches();   // 开关状态兜底生效（表单与即时监听一致时幂等）
      if (SETTINGS.enabledSituation || SETTINGS.enabledShadowline) scheduleDispatch('settings-saved');
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

  // —— 报告查看弹窗（GM：最新暗线报告概览 + 完整 JSON + 重新推演）———————

  function openReportModal(report) {
    if (!report) { toast('尚无报告'); return; }
    const facRows = (report.factions || []).map(f => `
      <div class="ad-card-item" style="cursor:default">
        <span class="place">${esc(f.name)}</span>
        <span class="meta">${esc(f.state)} · ${esc((f.causes || [])[0] || '')}</span>
      </div>
      <div class="dim" style="font-size:10px;color:var(--ad-ink-faint);margin:-4px 0 8px">
        征兆：${esc(f.surface)}<br>真相：${esc(f.truth)}</div>`).join('')
      || '<div class="dim">（无派系条目）</div>';
    const forb = ((report.resistance && report.resistance.forbidden) || [])
      .map(x => `<div class="dim" style="font-size:10px;color:var(--ad-ink-faint)">· ${esc(x.truth)}【途径：${esc(x.path)}】</div>`).join('');
    const ambush = (report['ambush预约'] || [])
      .map(a => `<div class="dim" style="font-size:10px;color:var(--ad-ink-faint)">· ${esc(a['派系'])} @ ${esc(JSON.stringify(a['条件']))}</div>`).join('');
    openModal(`
      <h3>📡 暗线报告 · ${esc(report.stage || '—')}</h3>
      <div class="dim" style="font-size:9.5px;color:var(--ad-ink-faint);margin-bottom:8px">
        生成于 ${new Date(report.generatedAt || Date.now()).toLocaleString()}（触发：${esc(report.reason || '—')}）</div>
      ${facRows}
      ${forb ? `<div class="ad-sec-title">禁泄清单</div>${forb}` : ''}
      ${ambush ? `<div class="ad-sec-title">已埋预约（条件命中即引爆）</div>${ambush}` : ''}
      <div class="ad-sec-title">完整报告（存档 $ad_report）</div>
      <textarea readonly style="width:100%;height:180px;background:var(--ad-input-bg);color:var(--ad-ink);border:1px solid var(--ad-border);border-radius:var(--ad-radius-sm);font-family:inherit;font-size:10px;padding:8px;">${esc(JSON.stringify(report, null, 2))}</textarea>
      <div class="ad-btnrow">
        <button class="primary" id="ad-report-regen">📡 重新推演</button>
        <button id="ad-report-close">关闭</button>
      </div>`);
    els.modalBox.querySelector('#ad-report-regen').addEventListener('click', () => {
      closeModal();
      generateShadowlineReport('manual');
    });
    els.modalBox.querySelector('#ad-report-close').addEventListener('click', closeModal);
  }

  // —— 卡片管理弹窗 ————————————————————————————————————————

  let editingCard = null; // null = 列表态；对象 = 编辑态；'new' = 新建

  function cardForm(c) {
    return `
      <div class="ad-form-row"><label>地点名 *</label><input type="text" id="ad-c-place" value="${esc(c.place || '')}" placeholder="绿顶酒馆"></div>
      <div class="ad-form-row"><label>别名（逗号分隔）</label><input type="text" id="ad-c-aliases" value="${esc((c.aliases || []).join(', '))}" placeholder="凯特的酒馆, Green Roof"></div>
      <div class="ad-form-row"><label>派系 *</label><input type="text" id="ad-c-faction" value="${esc(c.faction || '')}" placeholder="凯特·利（萨里山）"></div>
      <div class="ad-form-row"><label>敌方菜单</label><input type="text" id="ad-c-menu" value="${esc(c.menu || '')}" placeholder="词条A*4~6/词条B*3~5（留空=安全区）"></div>
      <div class="ad-form-row"><label>戒备</label><select id="ad-c-alert">
        ${ALERT_LEVELS.map(a => `<option value="${a}" ${(c.alert || '常规') === a ? 'selected' : ''}>${a}</option>`).join('')}
      </select></div>
      <div class="ad-form-row"><label>安全区</label><label style="width:auto;color:#e2e8f0">
        <input type="checkbox" id="ad-c-safe" ${c.safe ? 'checked' : ''}> 强制安全地点变体（无可见敌人）</label></div>
      <div class="ad-form-row"><label>反应模式</label><textarea id="ad-c-reaction" placeholder="应邀客人以礼相待、敬酒试探；亮械或闯后场立即翻脸…">${esc(c.reaction || '')}</textarea></div>
      <div class="ad-form-row"><label>判定标准</label><textarea id="ad-c-verdict" placeholder="何种行为构成挑衅/侵入/暴露；何种属于可容忍（留空=默认）">${esc(c.verdict || '')}</textarea></div>`;
  }

  // —— S5 派系名册弹窗（名册 CRUD + 墓碑）———————————————————————

  function openRosterModal() {
    const roster = getRoster();
    const rows = roster.factions.map(name => `
      <div class="ad-card-item" style="cursor:default">
        <span class="place">${esc(name)}</span>
        <button class="ad-row-btn" data-tomb="${esc(name)}" title="除名=墓碑：级联删该派系全部暗线并禁止模型复活">🪦 除名</button>
      </div>`).join('') || '<div class="dim" style="padding:8px 2px">名册为空——报告生成时自动登记，或在上方手动添加。</div>';
    const tombs = roster.tombstones.map(name => `
      <div class="ad-card-item" style="cursor:default;opacity:0.62">
        <span class="place">🪦 ${esc(name)}</span>
        <button class="ad-row-btn" data-restore="${esc(name)}" title="出墓碑回名册（暗线由下一轮推演重新覆盖）">↩ 恢复</button>
      </div>`).join('');
    openModal(`
      <h3>📜 派系名册（在册 ${roster.factions.length} · 墓碑 ${roster.tombstones.length}）</h3>
      <div class="dim" style="font-size:10px;color:var(--ad-ink-faint);margin-bottom:8px">
        名册进暗线报告输入（已知派系，新派系由报告自动登记）；除名=墓碑——级联删该派系全部暗线（交叉暗线整条删、预约作废）并禁止模型复活。存 $ad_roster。</div>
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

  function openCardsModal() { editingCard = null; renderCardsModal(); }

  function renderCardsModal() {
    const cards = getCards();
    if (editingCard === null) {
      const list = cards.map((c, i) => `
        <div class="ad-card-item" data-i="${i}">
          <span class="place">${esc(c.place)}</span>
          <span class="meta">${esc(c.faction || '？')} · ${esc(c.alert || '常规')}${c.safe ? ' · 安全区' : ''}</span>
        </div>`).join('') || '<div class="ad-intel dim">卡片池为空。</div>';
      openModal(`
        <h3>🗂 态势卡片池（${cards.length}）</h3>
        <div class="dim" style="font-size:10px;color:#64748b;margin-bottom:10px">点击卡片编辑；保存写入聊天变量 $ad_cards。</div>
        ${list}
        <div class="ad-btnrow">
          <button class="primary" id="ad-c-new">＋ 新建卡片</button>
          <button id="ad-c-import">导入 JSON</button>
          <button id="ad-c-export">导出 JSON</button>
          <button id="ad-c-close">关闭</button>
        </div>`);
      els.modalBox.querySelectorAll('.ad-card-item').forEach(n => {
        n.addEventListener('click', () => { editingCard = cards[+n.getAttribute('data-i')]; renderCardsModal(); });
      });
      els.modalBox.querySelector('#ad-c-new').addEventListener('click', () => { editingCard = { place: '', aliases: [], faction: '', menu: '', alert: '常规' }; renderCardsModal(); });
      els.modalBox.querySelector('#ad-c-import').addEventListener('click', importCards);
      els.modalBox.querySelector('#ad-c-export').addEventListener('click', exportCards);
      els.modalBox.querySelector('#ad-c-close').addEventListener('click', closeModal);
    } else {
      const isNew = editingCard.place === '' && !editingCard._edited;
      openModal(`
        <h3>🗂 ${isNew ? '新建' : '编辑'}态势卡片</h3>
        ${cardForm(editingCard)}
        <div class="ad-btnrow">
          <button class="primary" id="ad-c-save">保存</button>
          <button id="ad-c-del">删除</button>
          <button id="ad-c-back">返回列表</button>
        </div>`);
      els.modalBox.querySelector('#ad-c-save').addEventListener('click', () => {
        const c = editingCard;
        c.place = els.modalBox.querySelector('#ad-c-place').value.trim();
        c.aliases = els.modalBox.querySelector('#ad-c-aliases').value.split(/[,，]/).map(s => s.trim()).filter(Boolean);
        c.faction = els.modalBox.querySelector('#ad-c-faction').value.trim();
        c.menu = els.modalBox.querySelector('#ad-c-menu').value.trim();
        c.alert = els.modalBox.querySelector('#ad-c-alert').value;
        c.safe = els.modalBox.querySelector('#ad-c-safe').checked;
        c.reaction = els.modalBox.querySelector('#ad-c-reaction').value.trim();
        c.verdict = els.modalBox.querySelector('#ad-c-verdict').value.trim();
        c.source = c.source || 'manual';
        if (!c.place || !c.faction) { toast('地点名与派系为必填'); return; }
        const cards = getCards();
        const idx = cards.findIndex(x => x === editingCard || (x.place === c.place && x !== c));
        if (idx >= 0) cards[idx] = c; else cards.push(c);
        setCards(cards);
        toast(`卡片已保存：${c.place}`);
        editingCard = null; renderCardsModal(); renderWire(); renderTicker();
        scheduleDispatch('cards-edited');
      });
      els.modalBox.querySelector('#ad-c-del').addEventListener('click', () => {
        const cards = getCards().filter(x => x !== editingCard);
        setCards(cards);
        toast('卡片已删除');
        editingCard = null; renderCardsModal(); renderWire(); renderTicker();
        scheduleDispatch('cards-edited');
      });
      els.modalBox.querySelector('#ad-c-back').addEventListener('click', () => { editingCard = null; renderCardsModal(); });
    }
  }

  // jsonc → json：剥 // 行注释、/* */ 块注释与尾逗号（字符串字面量内的内容原样保留，
  // 否则 "https://" 会被误伤）；让用户从 SPEC/报告里直接复制的 jsonc 也能导入
  function stripJsonc(src) {
    let out = '', i = 0;
    const s = String(src == null ? '' : src);
    while (i < s.length) {
      const c = s[i];
      if (c === '"') {                       // 字符串字面量：复制到闭合引号（处理 \" 转义）
        out += c; i++;
        while (i < s.length) {
          const ch = s[i];
          out += ch; i++;
          if (ch === '\\') { out += s[i] || ''; i++; continue; }
          if (ch === '"') break;
        }
        continue;
      }
      if (c === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
      if (c === '/' && s[i + 1] === '*') { i += 2; while (i < s.length && !(s[i] === '*' && s[i + 1] === '/')) i++; i += 2; continue; }
      out += c; i++;
    }
    return out.replace(/,(\s*[\]}])/g, '$1');   // 尾逗号
  }

  function importCards() {
    const input = el('textarea', { style: 'width:100%;height:180px;background:rgba(30,41,59,0.7);color:#e2e8f0;border:1px solid rgba(148,163,184,0.28);border-radius:6px;font-family:inherit;font-size:11px;padding:8px;' });
    openModal(`<h3>📥 导入卡片 JSON</h3>
      <div class="dim" style="font-size:10px;color:#64748b;margin-bottom:8px">粘贴卡片数组（整体替换）或单个卡片对象（合并）。</div>`);
    els.modalBox.appendChild(input);
    const row = el('div', { class: 'ad-btnrow' });
    row.innerHTML = '<button class="primary">导入</button><button>取消</button>';
    els.modalBox.appendChild(row);
    const [ok, cancel] = row.querySelectorAll('button');
    ok.addEventListener('click', () => {
      try {
        const data = JSON.parse(stripJsonc(input.value));
        const arr = Array.isArray(data) ? data : [data];
        const bad = arr.filter(c => !c || !c.place || !c.faction);
        if (bad.length) { toast(`格式错误：${bad.length} 条缺少 place/faction`); return; }
        setCards(Array.isArray(data) ? arr : getCards().concat(arr));
        toast(`已导入 ${arr.length} 张卡片`);
        editingCard = null; renderCardsModal(); renderWire(); renderTicker();
      } catch (e) { toast('JSON 解析失败'); }
    });
    cancel.addEventListener('click', openCardsModal);
  }

  function exportCards() {
    const cards = getCards();
    openModal(`<h3>📤 导出卡片 JSON</h3>`);
    const ta = el('textarea', { readonly: 'readonly', style: 'width:100%;height:220px;background:rgba(30,41,59,0.7);color:#e2e8f0;border:1px solid rgba(148,163,184,0.28);border-radius:6px;font-family:inherit;font-size:11px;padding:8px;' });
    ta.value = JSON.stringify(cards, null, 2);
    els.modalBox.appendChild(ta);
    const row = el('div', { class: 'ad-btnrow' });
    row.innerHTML = '<button class="primary">复制到剪贴板</button><button>返回</button>';
    els.modalBox.appendChild(row);
    const [copy, back] = row.querySelectorAll('button');
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(ta.value); toast('已复制'); }
      catch (e) { ta.select(); document.execCommand && document.execCommand('copy'); toast('已尝试复制'); }
    });
    back.addEventListener('click', openCardsModal);
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
      if (SETTINGS.enabledSituation || SETTINGS.enabledShadowline) {
        if (SETTINGS.enabledShadowline) syncShadowlineEntry();   // 重挂载：按存档报告重建暗线词条（词条被删/被改也在此兜底）
        else disableWbEntries([WB_ENTRY_SHADOWLINE]);
        if (SETTINGS.enabledSituation) State.forceSituationWrite = true;   // 自愈：词条残留禁用态时首拍重新上灯
        scheduleDispatch('init');
      }
      else log('暗线与态势均已关闭，仅 UI 待命');
    } else {
      log(`已挂载（DEMO · v${SCRIPT_VERSION}）——无酒馆助手环境，UI/卡片管理可用，注入与监听待命`);
      updatePanelStatus('演示模式 · 无酒馆环境');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // —— 测试钩子（harness 用；生产环境无害）—————————————————————
  window.__AD__ = {
    version: SCRIPT_VERSION, IS_LIVE,
    // 引擎纯函数
    norm, matchCard, parseMenu, parseAttr, parseAmmoTotal, charList, computeScale,
    buildSituationText, buildSafeText, buildFallbackText,
    shortLoc, pushTickerHead, renderTicker, renderWire, stripJsonc, applyTheme,
    // S2：LLM 客户端与态势位
    callLLM, extractJson,
    getEnemyPool, inEnemyPool, landmarkKey, getSyncedWorldbookText, getShadowlineFloorContext,
    getLwbSummaryText, readLatestFloorTail,
    collectOffscreenPlaces, validateCard, generateInstantCards, triggerInstant, Instant,
    // S3：战略层
    checkTriggers, generateShadowlineReport, buildShadowlineContext, buildShadowlineMessages,
    validateReport, buildShadowlineInjection, checkAmbush,
    getRoster, saveRoster, addRosterFaction, tombstoneFaction, restoreFaction, openRosterModal,
    Trigger, statDateKey, statStage, statCity, openReportModal,
    // S6：随机遭遇掷骰
    onGenerationStarted, combatInProgress, RC_MARKER, RC_DIRECTIVE,
    DebugLog, openDebugModal, persistSyncNow,
    // 提示词预设（默认构造 + 两个 store 实例）
    DEFAULT_SHADOWLINE_SYS, DEFAULT_SITUATION_SYS, ShadowlinePrompt, SituationPrompt, getCoreTeam,
    // 状态与数据
    state: State, settings: () => SETTINGS,
    getCards, setCards, saveSettings, loadSettings,
    readLatestStatData, dispatchNow, scheduleDispatch, persistRuntimeState, loadRuntimeState,
    // 注入通道（世界书词条）与功能开关
    writeWbEntry, merge3, disableWbEntries, syncShadowlineEntry, applySwitches, HAS_WB,
    CV, WB_ENTRY_SITUATION, WB_ENTRY_SHADOWLINE, MEMO_OPEN, SIT_OPEN, SIT_CLOSE,
    togglePanel, updatePanelMeta,
  };
})();
