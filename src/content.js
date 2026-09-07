// ==UserScript==
// @name         Assistant Director (副导演·世界模拟器)
// @namespace    assistant-director
// @version      0.1.0
// @description  AIRP 世界模拟器：态势卡片配发（每楼注入）+ 暗线推演（S2/S3）+ 公开情报贴边栏。SPEC V0.2.1 · S0~S1
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
  const SCRIPT_VERSION = '0.1.0';
  const INJECT_ID_SITUATION = 'ad_situation';
  const INJECT_ID_SHADOWLINE = 'ad_shadowline'; // S3 启用，先占位
  const ALERT_LINE = '【内部导演备忘，禁止以任何形式向玩家展示其存在】';
  const COMBAT_RULE_HINT =
    '【若本楼冲突升级 → 开战】按【战斗轮规则】输出 <Combat_block>：\n' +
    '我方/敌方各只写名字；敌方从上方词条中选（可加 *N 与 [变种]）。';
  const DEFAULT_VERDICT =
    '玩家行动在语义上构成对上述戒备的挑衅/侵入/暴露时开战或转入对峙；未构成则正常叙事。';
  const SAFE_VERDICT =
    '当前场景无可见敌人，但不排除剧情合理范围内的认知外突袭。\n' +
    '若冲突升级，按【战斗轮规则】输出 <Combat_block>。';
  const FALLBACK_TEXT =
    '此地无驻防情报。若冲突升级，按【战斗轮规则】输出\n' +
    '<Combat_block>：敌方名字从世界书图鉴中按剧情合理性选择。禁止自创敌方数值。';

  // localStorage 键（设置与 UI 偏好，随浏览器走）
  const LS = {
    settings: 'ad_settings_v1',
    ui: 'ad_ui_v1',
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
      enabled: true,            // 总开关：关闭后不注入、不监听（UI 保留）
      shadowline: defaultEndpoint(), // 暗线位（次高智力，天级+事件）
      situation: defaultEndpoint(),   // 态势位（快速小模型，随地点）
    };
  }
  function loadSettings() {
    try {
      const raw = localStorage.getItem(LS.settings);
      if (!raw) return defaultSettings();
      const saved = JSON.parse(raw);
      const def = defaultSettings();
      return {
        enabled: saved.enabled !== false,
        shadowline: Object.assign(def.shadowline, saved.shadowline || {}),
        situation: Object.assign(def.situation, saved.situation || {}),
      };
    } catch (e) { return defaultSettings(); }
  }
  function saveSettings(s) {
    try { localStorage.setItem(LS.settings, JSON.stringify(s)); } catch (e) { log('warn', '设置保存失败', e); }
  }
  function loadUiPrefs() {
    try { return JSON.parse(localStorage.getItem(LS.ui) || '{}') || {}; } catch (e) { return {}; }
  }
  function saveUiPrefs(p) {
    try { localStorage.setItem(LS.ui, JSON.stringify(p)); } catch (e) { /* 忽略 */ }
  }

  let SETTINGS = loadSettings();

  // ═════════════════════════════════════════════════════════════════════
  // 2. 酒馆环境适配
  // ═════════════════════════════════════════════════════════════════════

  const log = (...a) => console.log(`[${SCRIPT_NAME}]`, ...a);
  const logWarn = (...a) => console.warn(`[${SCRIPT_NAME}]`, ...a);

  // LIVE = 酒馆助手脚本环境（或 harness 的完整 mock——两者 API 同构）
  function detectLive() {
    return typeof getVariables === 'function'
      && typeof insertOrAssignVariables === 'function'
      && typeof injectPrompts === 'function'
      && typeof uninjectPrompts === 'function'
      && typeof eventOn === 'function'
      && typeof tavern_events !== 'undefined';
  }
  const IS_LIVE = detectLive();

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

  // —— 注入封装（持续在场 + 替换式刷新）———————————————————

  let injectedIds = [];
  function injectReplace(id, content) {
    try {
      if (injectedIds.includes(id)) uninjectPrompts([id]);
      const ret = injectPrompts([{ id, position: 'in_chat', depth: 0, role: 'system', content }]);
      if (ret && typeof ret.uninject === 'function') { /* 真实 API 返回句柄；id 路径已足够 */ }
      if (!injectedIds.includes(id)) injectedIds.push(id);
      return true;
    } catch (e) { logWarn('injectReplace 失败', id, e); return false; }
  }
  function uninjectAll() {
    try { if (injectedIds.length) uninjectPrompts(injectedIds.slice()); }
    catch (e) { /* 忽略 */ }
    injectedIds = [];
  }

  // —— 事件封装 ——————————————————————————————————————————

  const EVT = {
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

  // ═════════════════════════════════════════════════════════════════════
  // 3. 楼层监听状态机
  // ═════════════════════════════════════════════════════════════════════

  const State = {
    lastInjectedText: '',     // 幂等：相同内容不重注
    lastLocationText: '',     // 当前地点原文
    ammoBaseline: 0,          // 弹药基准（历史最高，规模降档参照）
    lastCardsRef: '',         // 卡片池指纹（检测外部改动）
    tickerHeads: [],          // 折叠态情报轮播头条（最近 ≤3 条，最新在前）
    pendingTimer: null,
  };

  function loadRuntimeState() {
    const s = readChatVar(CV.state) || {};
    State.lastInjectedText = s.lastInjectedText || '';
    State.lastLocationText = s.lastLocationText || '';
    State.ammoBaseline = s.ammoBaseline || 0;
    State.tickerHeads = Array.isArray(s.tickerHeads) ? s.tickerHeads : [];
  }
  function persistRuntimeState() {
    writeChatVar(CV.state, {
      lastInjectedText: State.lastInjectedText,
      lastLocationText: State.lastLocationText,
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
    if (!SETTINGS.enabled) return;
    scheduleDispatch('floor-event');
  }
  function onChatChanged() {
    // 换聊天：运行时状态重置（情报流也清空），注入重建
    State.lastInjectedText = '';
    State.lastLocationText = '';
    State.ammoBaseline = 0;
    State.tickerHeads = [];
    if (!SETTINGS.enabled) return;
    scheduleDispatch('chat-changed');
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

  // —— 注入文本拼装（三种形态）—————————————————————————————

  // 命中卡片（menu 非空）：驻防 + 菜单（规模已随行重算）+ 反应 + 战斗轮提醒 + 判定标准
  function buildSituationText(card, scaledEntries, locationText) {
    const menuStr = scaledEntries
      .map(e => e.count > 0 ? `${e.name}*${e.count}` : e.name)
      .join('/');
    const alert = ALERT_LEVELS.includes(card.alert) ? card.alert : '常规';
    const verdict = card.verdict || DEFAULT_VERDICT;
    return [
      ALERT_LINE,
      `【当前态势 · ${locationText}】`,
      `驻守：${card.faction || '未知派系'}（${menuStr}），戒备等级：${alert}`,
      `反应模式：${card.reaction || '（未提供——按戒备等级常识演出）'}`,
      COMBAT_RULE_HINT,
      `判定标准：${verdict}`,
    ].join('\n');
  }

  // 绝对安全地点变体（命中卡片但 menu 为空，或卡片标记 safe）
  function buildSafeText(locationText) {
    return `${ALERT_LINE}\n【当前态势 · ${locationText}】${SAFE_VERDICT}`;
  }

  // 通用兜底（卡片池未命中）
  function buildFallbackText(locationText) {
    return `${ALERT_LINE}\n【当前态势 · ${locationText}】${FALLBACK_TEXT}`;
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
    const stat = readLatestStatData();
    if (!stat) {
      log('无 stat_data 可用（MMS 未运行或尚无楼层变量），跳过本轮配发');
      updatePanelStatus('等待状态栏数据…');
      return;
    }
    const locationText = String(stat['地点'] || '').trim();
    if (!locationText) {
      logWarn('stat_data 缺少地点字段，跳过');
      return;
    }
    const cards = getCards();
    const hit = matchCard(locationText, cards);

    let text;
    let mode;
    if (hit) {
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
    if (text !== State.lastInjectedText) {
      if (IS_LIVE && injectReplace(INJECT_ID_SITUATION, text)) {
        State.lastInjectedText = text;
        pushTickerHead(mode, hit ? hit.card.place : locationText);
        if (els.dot) els.dot.classList.add('on');   // 更新提醒：展开后熄灭
        log(`态势注入已更新（${mode}/${reason}）`, hit ? `→ ${hit.card.place}` : '→ 兜底');
      }
    } else {
      log(`态势无变化，保持注入（${mode}/${reason}）`);
    }
    persistRuntimeState();
    updatePanelStatus(null, { mode, locationText, card: hit ? hit.card : null, text });
    updatePanelMeta(stat);
  }

  // ═════════════════════════════════════════════════════════════════════
  // 5. LLM 客户端 —— S2 落地（双端点 fetch /chat/completions）
  // ═════════════════════════════════════════════════════════════════════
  // （占位：S0/S1 不发起任何 LLM 调用）

  // ═════════════════════════════════════════════════════════════════════
  // 6. 战略层（暗线人格） —— S3 落地
  // ═════════════════════════════════════════════════════════════════════
  // （占位：触发矩阵 / 报告 schema 校验 / 提炼注入 ad_shadowline）

  // ═════════════════════════════════════════════════════════════════════
  // 7. 态势位（即时产卡） —— S2 落地
  // ═════════════════════════════════════════════════════════════════════
  // （占位：未命中触发 → 输入组装 → 生成 → 白名单校验 → 回落）

  // ═════════════════════════════════════════════════════════════════════
  // 8. 公开层 UI（贴边折叠栏，自 demo_story_director.html 移植）
  // ═════════════════════════════════════════════════════════════════════

  // 挂载目标：酒馆助手的全局脚本运行在隐藏 iframe 里（Iframe.vue v-show=false），
  // UI 必须挂到主页面 document 才可见；harness/直开页面时 window===parent 走 document。
  const UI_DOC = (window !== window.parent && window.parent && window.parent.document)
    ? window.parent.document
    : document;

  const UI_CSS = `
  #ad-rail { position: fixed; right: 0; top: 28%; width: 30px; z-index: 99990;
    background: linear-gradient(180deg, rgba(15,23,42,0.96), rgba(2,6,23,0.96));
    border: 1px solid rgba(148,163,184,0.28); border-right: none;
    border-radius: 8px 0 0 8px; display: flex; flex-direction: column; align-items: center;
    cursor: pointer; user-select: none; padding: 9px 0 7px;
    transition: width .25s ease, box-shadow .3s ease; }
  #ad-rail:hover { box-shadow: -6px 0 24px rgba(251,191,36,0.13); }
  #ad-rail:hover .ad-rail-star { color: #fbbf24; }
  .ad-rail-star { font-size: 12px; line-height: 1; color: rgba(251,191,36,0.55);
    padding-bottom: 5px; transition: color .25s; }
  #ad-rail-dot { width: 7px; height: 7px; border-radius: 50%; background: #fbbf24;
    opacity: 0; transition: opacity .3s; box-shadow: 0 0 8px rgba(251,191,36,0.55);
    animation: ad-dot-pulse 1.6s ease-in-out infinite; }
  #ad-rail-dot.on { opacity: 1; }
  @keyframes ad-dot-pulse { 0%,100% { transform: scale(1); box-shadow: 0 0 4px rgba(251,191,36,0.55);} 50% { transform: scale(1.5); box-shadow: 0 0 12px rgba(251,191,36,0.55);} }
  .ad-rail-ticker { height: 26vh; overflow: hidden; margin-top: 8px; width: 100%; position: relative;
    mask-image: linear-gradient(180deg, transparent, #000 18%, #000 82%, transparent);
    -webkit-mask-image: linear-gradient(180deg, transparent, #000 18%, #000 82%, transparent); }
  #ad-rail.empty .ad-rail-ticker { display: none; }
  .ad-rail-ticker ul { list-style: none; position: absolute; left: 0; right: 0; margin: 0; padding: 0;
    animation: ad-tick 14s linear infinite; }
  @keyframes ad-tick { from { transform: translateY(0); } to { transform: translateY(-50%); } }
  .ad-rail-ticker li { writing-mode: vertical-rl; letter-spacing: 3px; font-size: 9px;
    color: #94a3b8; padding: 0 0 16px 0; display: block; margin: 0 auto; width: 16px; }
  .ad-rail-ticker li:first-child { color: #fde68a; }

  #ad-panel { position: fixed; right: -400px; top: 4vh; bottom: 4vh; width: 372px; z-index: 99995;
    background: linear-gradient(180deg, rgba(15,23,42,0.98), rgba(2,6,23,0.98));
    border: 1px solid rgba(148,163,184,0.28); border-radius: 10px 0 0 10px;
    display: flex; flex-direction: column; font-family: 'Courier New', 'SimSun', monospace; color: #cbd5e1;
    transition: right .38s cubic-bezier(0.22, 1, 0.36, 1); box-shadow: -18px 0 48px rgba(0,0,0,0.5); }
  #ad-panel.open { right: 0; }
  .ad-masthead { padding: 14px 16px 10px; border-bottom: 3px double #94a3b8; position: relative; }
  .ad-masthead::after { content: ''; position: absolute; left: 16px; right: 16px; bottom: 3px; border-bottom: 1px solid rgba(148,163,184,0.28); }
  .ad-mast-top { display: flex; justify-content: space-between; align-items: baseline;
    font-size: 9px; letter-spacing: 2px; color: #64748b; margin-bottom: 6px; }
  .ad-mast-title { text-align: center; font-size: 17px; letter-spacing: 8px; color: #e2e8f0;
    font-weight: bold; text-indent: 8px; }
  .ad-mast-title .co { color: #fbbf24; }
  .ad-mast-sub { display: flex; justify-content: center; gap: 14px; margin-top: 7px;
    font-size: 10px; letter-spacing: 2px; color: #94a3b8; }
  .ad-mast-sub .stage { color: #fbbf24; }
  .ad-mast-sub .sep::before { content: '·'; color: #94a3b8; }
  .ad-wire { flex: 1; overflow-y: auto; padding: 12px 14px 18px; }
  .ad-wire::-webkit-scrollbar { width: 5px; }
  .ad-wire::-webkit-scrollbar-thumb { background: rgba(148,163,184,0.25); border-radius: 3px; }
  .ad-wire-rule { display: flex; align-items: center; gap: 10px; font-size: 9px; letter-spacing: 3px;
    color: #64748b; margin: 4px 0 12px; }
  .ad-wire-rule::before, .ad-wire-rule::after { content: ''; flex: 1; border-top: 1px solid rgba(148,163,184,0.28); }

  .ad-faction { background: rgba(30,41,59,0.55); border: 1px solid rgba(148,163,184,0.28);
    border-left: 3px solid rgba(251,191,36,0.55); border-radius: 6px;
    padding: 10px 12px 11px; margin-bottom: 12px; transition: border-color .3s; }
  .ad-faction:hover { border-left-color: #fbbf24; }
  .ad-fac-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
  .ad-fac-name { font-size: 12px; letter-spacing: 3px; color: #e2e8f0; }
  .ad-fac-name::before { content: '❧ '; color: rgba(251,191,36,0.55); }
  .ad-fac-status { font-size: 8px; letter-spacing: 2px; padding: 2px 7px;
    border: 1px solid rgba(148,163,184,0.28); border-radius: 99px; color: #94a3b8; }
  .ad-fac-status.active { color: #fbbf24; border-color: rgba(251,191,36,0.55); background: rgba(251,191,36,0.14); }
  .ad-intel { padding: 6px 0 6px 12px; position: relative; font-size: 12px; line-height: 1.75; }
  .ad-intel + .ad-intel { border-top: 1px dashed rgba(148,163,184,0.16); }
  .ad-intel::before { content: ''; position: absolute; left: 0; top: 12px; bottom: 10px; border-left: 1px solid rgba(148,163,184,0.28); }
  .ad-intel .dim { color: #64748b; font-size: 10px; }
  .ad-colophon { border-top: 3px double #94a3b8; position: relative; padding: 7px 16px;
    font-size: 8.5px; letter-spacing: 2px; color: #64748b; text-align: center; }
  .ad-colophon::before { content: ''; position: absolute; left: 16px; right: 16px; top: 3px; border-top: 1px solid rgba(148,163,184,0.28); }
  .ad-colophon b { color: rgba(251,191,36,0.55); font-weight: normal; }
  .ad-toolbar { display: flex; gap: 6px; padding: 8px 12px; border-top: 1px solid rgba(148,163,184,0.18); }
  .ad-toolbar button { flex: 1; background: rgba(30,41,59,0.7); color: #cbd5e1;
    border: 1px solid rgba(148,163,184,0.28); border-radius: 5px; font-family: inherit;
    font-size: 10.5px; letter-spacing: 1px; padding: 5px 4px; cursor: pointer; transition: all .2s; }
  .ad-toolbar button:hover { border-color: rgba(251,191,36,0.55); color: #fbbf24; }

  #ad-modal { position: fixed; inset: 0; z-index: 99999; display: none;
    background: rgba(2,6,23,0.72); align-items: center; justify-content: center; }
  #ad-modal.open { display: flex; }
  .ad-modal-box { width: min(680px, 92vw); max-height: 86vh; overflow-y: auto;
    background: #0f172a; border: 1px solid rgba(148,163,184,0.35); border-radius: 10px;
    padding: 18px 20px; font-family: 'Courier New', 'SimSun', monospace; color: #cbd5e1;
    box-shadow: 0 24px 64px rgba(0,0,0,0.6); }
  .ad-modal-box h3 { font-size: 13px; letter-spacing: 4px; color: #fbbf24; margin: 0 0 14px;
    border-bottom: 1px solid rgba(148,163,184,0.28); padding-bottom: 8px; }
  .ad-form-row { display: flex; align-items: center; gap: 10px; margin-bottom: 9px; font-size: 11.5px; }
  .ad-form-row label { width: 110px; color: #94a3b8; letter-spacing: 1px; flex: none; }
  .ad-form-row input[type=text], .ad-form-row input[type=number], .ad-form-row textarea, .ad-form-row select {
    flex: 1; background: rgba(30,41,59,0.7); border: 1px solid rgba(148,163,184,0.28); border-radius: 5px;
    color: #e2e8f0; font-family: inherit; font-size: 11.5px; padding: 5px 8px; }
  .ad-form-row textarea { resize: vertical; min-height: 52px; line-height: 1.5; }
  .ad-form-row input:focus, .ad-form-row textarea:focus { outline: none; border-color: rgba(251,191,36,0.55); }
  .ad-sec-title { font-size: 11px; letter-spacing: 3px; color: #fbbf24; margin: 14px 0 8px; }
  .ad-sec-title::before { content: '✶ '; }
  .ad-card-item { display: flex; justify-content: space-between; align-items: center; gap: 8px;
    background: rgba(30,41,59,0.55); border: 1px solid rgba(148,163,184,0.2); border-radius: 6px;
    padding: 7px 10px; margin-bottom: 7px; font-size: 11.5px; cursor: pointer; }
  .ad-card-item:hover { border-color: rgba(251,191,36,0.45); }
  .ad-card-item .place { color: #e2e8f0; }
  .ad-card-item .meta { color: #64748b; font-size: 10px; }
  .ad-btnrow { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
  .ad-btnrow button { background: rgba(30,41,59,0.9); color: #cbd5e1; border: 1px solid rgba(148,163,184,0.35);
    border-radius: 6px; font-family: inherit; font-size: 11px; letter-spacing: 1px;
    padding: 6px 14px; cursor: pointer; }
  .ad-btnrow button:hover { border-color: #fbbf24; color: #fbbf24; }
  .ad-btnrow button.primary { border-color: rgba(251,191,36,0.55); color: #fbbf24; }
  .ad-toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%);
    background: rgba(15,23,42,0.95); border: 1px solid rgba(251,191,36,0.45); color: #fde68a;
    border-radius: 8px; padding: 8px 18px; font-size: 12px; letter-spacing: 1px; z-index: 100000;
    font-family: 'Courier New', monospace; box-shadow: 0 8px 28px rgba(0,0,0,0.5); }
  `;

  let els = {};

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

    // 折叠态贴边条（极简：✦ 手柄 + 未读点 + 情报轮播；空态收缩为小胶囊）
    const rail = el('aside', { id: 'ad-rail', title: '世界情报 · 点击展开' }, `
      <div class="ad-rail-star">✦</div>
      <div id="ad-rail-dot"></div>
      <div class="ad-rail-ticker"><ul id="ad-ticker"></ul></div>`);
    UI_DOC.body.appendChild(rail);

    // 展开态面板
    const panel = el('aside', { id: 'ad-panel' }, `
      <div class="ad-masthead">
        <div class="ad-mast-top"><span>ASSISTANT DIRECTOR</span><span id="ad-mast-world">SYDNEY · 1925</span></div>
        <div class="ad-mast-title">世界<span class="co"> gazette </span>情报增刊</div>
        <div class="ad-mast-sub">
          <span id="ad-mast-date">—</span>
          <span class="sep stage" id="ad-mast-stage">—</span>
        </div>
      </div>
      <div class="ad-wire" id="ad-wire">
        <div class="ad-wire-rule">态 势 与 卡 片 池</div>
        <div id="ad-wire-body"></div>
      </div>
      <div class="ad-toolbar">
        <button id="ad-btn-recompute" title="按最新楼层立即重算态势注入">↻ 重算</button>
        <button id="ad-btn-cards" title="态势卡片池管理">🗂 卡片</button>
        <button id="ad-btn-settings" title="双模型端点与开关">⚙ 设置</button>
      </div>
      <div class="ad-colophon">本报仅刊载 <b>街头可见之事</b> · 真相须由读者自行抵达</div>`);
    UI_DOC.body.appendChild(panel);

    // 模态容器（设置/卡片/注入预览共用）
    const modal = el('div', { id: 'ad-modal' }, `<div class="ad-modal-box" id="ad-modal-box"></div>`);
    UI_DOC.body.appendChild(modal);

    els = { rail, panel, dot: rail.querySelector('#ad-rail-dot'), ticker: rail.querySelector('#ad-ticker'),
      wireBody: panel.querySelector('#ad-wire-body'),
      mastDate: panel.querySelector('#ad-mast-date'), mastStage: panel.querySelector('#ad-mast-stage'),
      mastWorld: panel.querySelector('#ad-mast-world'), modal, modalBox: modal.querySelector('#ad-modal-box') };

    // 交互
    rail.addEventListener('click', () => togglePanel(true));
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
    UI_DOC.addEventListener('click', e => {
      if (els.panel.classList.contains('open')
        && !els.panel.contains(e.target) && !els.rail.contains(e.target)
        && !els.modal.contains(e.target)) togglePanel(false);
    });
    panel.querySelector('#ad-btn-recompute').addEventListener('click', () => {
      dispatchNow('manual'); toast('已按最新楼层重算态势');
    });
    panel.querySelector('#ad-btn-cards').addEventListener('click', openCardsModal);
    panel.querySelector('#ad-btn-settings').addEventListener('click', openSettingsModal);

    if (loadUiPrefs().panelOpen) togglePanel(true, true);
    renderWire(); renderTicker();
  }

  function togglePanel(open, silent) {
    const willOpen = open !== undefined ? open : !els.panel.classList.contains('open');
    els.panel.classList.toggle('open', willOpen);
    if (willOpen) els.dot.classList.remove('on');
    const p = loadUiPrefs(); p.panelOpen = willOpen; saveUiPrefs(p);
    if (willOpen && !silent) renderWire();
  }

  function toast(msg) {
    const t = el('div', { class: 'ad-toast' }, esc(msg));
    UI_DOC.body.appendChild(t);
    setTimeout(() => t.remove(), 2200);
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

  // 面板主体：当前态势 + 卡片池按派系分组（S1 占位形态，S4 换 surface 情报卡）
  function renderWire() {
    const cards = getCards();
    const groups = new Map();
    for (const c of cards) {
      const key = c.faction || '未标注派系';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(c);
    }
    let html = '';
    if (State.lastLocationText) {
      html += `<div class="ad-faction"><div class="ad-fac-head">
          <span class="ad-fac-name">当前态势</span>
          <span class="ad-fac-status active" id="ad-cur-mode">—</span></div>
        <div class="ad-intel">${esc(State.lastLocationText)}</div></div>`;
    }
    if (!groups.size) {
      html += `<div class="ad-faction"><div class="ad-intel dim">卡片池为空——在 🗂 卡片 中手工填卡，或等待 S2 态势位自动产卡。</div></div>`;
    }
    for (const [fac, list] of groups) {
      const items = list.map(c => {
        const alert = ALERT_LEVELS.includes(c.alert) ? c.alert : '常规';
        const safe = c.safe || !parseMenu(c.menu).some(e => e.min || e.max);
        const badge = safe ? '安全区' : alert;
        return `<div class="ad-intel">${esc(c.place)} <span class="dim">· 戒备 ${esc(badge)}${c.source === 'instant' ? ' · 初判' : ''}</span></div>`;
      }).join('');
      html += `<div class="ad-faction"><div class="ad-fac-head">
          <span class="ad-fac-name">${esc(fac)}</span>
          <span class="ad-fac-status">${list.length} 处</span></div>${items}</div>`;
    }
    els.wireBody.innerHTML = html;
  }

  // dispatch 后刷新状态徽标与报头
  function updatePanelStatus(waiting, info) {
    if (waiting != null) {
      const cur = els.wireBody && els.wireBody.querySelector('#ad-cur-mode');
      if (cur) cur.textContent = waiting;
      return;
    }
    renderWire(); renderTicker();
    if (info && info.mode) {
      const cur = els.wireBody && els.wireBody.querySelector('#ad-cur-mode');
      if (cur) cur.textContent = info.mode === 'card' ? '驻防注入'
        : info.mode === 'safe' ? '安全区注入' : '通用兜底';
    }
  }

  // 报头：日期/阶段（"⏰ 1925年 · 6月13日 · 12:40 · 潜伏期" → 两段）
  function updatePanelMeta(stat) {
    const raw = String(stat['日期和时间'] || '');
    const parts = raw.replace(EMOJI_RE, '').split('·').map(s => s.trim()).filter(Boolean);
    if (parts.length >= 3) {
      els.mastDate.textContent = `${parts[0]}${parts[1] || ''}`;
      els.mastStage.textContent = parts[parts.length - 1] || '—';
    } else if (parts.length) {
      els.mastDate.textContent = parts[0];
      els.mastStage.textContent = '—';
    }
  }

  // ═════════════════════════════════════════════════════════════════════
  // 9. GM 面板（设置 / 卡片管理）
  // ═════════════════════════════════════════════════════════════════════

  function closeModal() { els.modal.classList.remove('open'); }
  function openModal(html) { els.modalBox.innerHTML = html; els.modal.classList.add('open'); }

  // —— 设置弹窗 ——————————————————————————————————————————

  function openSettingsModal() {
    const s = SETTINGS;
    const ep = (slot, title) => `
      <div class="ad-sec-title">${title}</div>
      <div class="ad-form-row"><label>Base URL</label><input type="text" data-k="${slot}.baseUrl" value="${esc(s[slot].baseUrl)}" placeholder="https://…/v1"></div>
      <div class="ad-form-row"><label>API Key</label><input type="text" data-k="${slot}.apiKey" value="${esc(s[slot].apiKey)}" placeholder="sk-…"></div>
      <div class="ad-form-row"><label>Model</label><input type="text" data-k="${slot}.model" value="${esc(s[slot].model)}" placeholder="模型名"></div>
      <div class="ad-form-row"><label>温度</label><input type="number" step="0.1" min="0" max="2" data-k="${slot}.temperature" value="${s[slot].temperature}"></div>
      <div class="ad-form-row"><label>maxTokens</label><input type="number" step="100" min="256" data-k="${slot}.maxTokens" value="${s[slot].maxTokens}"></div>`;
    openModal(`
      <h3>⚙ 副导演 · 设置</h3>
      <div class="ad-form-row"><label>总开关</label><label style="width:auto;color:#e2e8f0">
        <input type="checkbox" data-k="enabled" ${s.enabled ? 'checked' : ''}> 启用（关闭后不注入、不监听）</label></div>
      <div class="dim" style="font-size:10px;color:#64748b;margin:4px 0 2px">S0 仅持久化配置；暗线位于 S3、态势位于 S2 接入调用。</div>
      ${ep('shadowline', '暗线位（次高智力 · 天级+事件）')}
      ${ep('situation', '态势位（快速小模型 · 随地点）')}
      <div class="ad-btnrow">
        <button class="primary" id="ad-set-save">保存</button>
        <button id="ad-set-close">关闭</button>
      </div>`);
    els.modalBox.querySelector('#ad-set-save').addEventListener('click', () => {
      els.modalBox.querySelectorAll('[data-k]').forEach(input => {
        const path = input.getAttribute('data-k').split('.');
        let obj = SETTINGS;
        for (let i = 0; i < path.length - 1; i++) obj = obj[path[i]];
        const key = path[path.length - 1];
        obj[key] = input.type === 'checkbox' ? input.checked
          : input.type === 'number' ? Number(input.value) : input.value.trim();
      });
      saveSettings(SETTINGS);
      if (!SETTINGS.enabled) uninjectAll();
      else scheduleDispatch('settings-saved');
      toast('设置已保存');
      closeModal();
    });
    els.modalBox.querySelector('#ad-set-close').addEventListener('click', closeModal);
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
      bindEvent(EVT.received, onFloorEvent);
      bindEvent(EVT.updated, onFloorEvent);
      bindEvent(EVT.swiped, onFloorEvent);
      bindEvent(EVT.chatChanged, onChatChanged);
      log(`已挂载（LIVE · v${SCRIPT_VERSION}），等待楼层事件`);
      if (SETTINGS.enabled) scheduleDispatch('init');
      else log('总开关关闭，仅 UI 待命');
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
    shortLoc, pushTickerHead, renderTicker, stripJsonc,
    // 状态与数据
    state: State, settings: () => SETTINGS,
    getCards, setCards, saveSettings, loadSettings,
    readLatestStatData, dispatchNow, scheduleDispatch, persistRuntimeState, loadRuntimeState,
    injectReplace, uninjectAll,
    CV, INJECT_ID_SITUATION, INJECT_ID_SHADOWLINE, ALERT_LINE,
    togglePanel, updatePanelMeta,
  };
})();
