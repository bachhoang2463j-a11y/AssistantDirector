// build.mjs —— 将 src/content.js 打包为酒馆助手脚本 JSON（AiRadio 外壳同构）
// 用法：node build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const srcPath = path.join(root, 'src', 'content.js');
const outPath = path.join(root, '酒馆助手脚本-副导演.json');

const content = fs.readFileSync(srcPath, 'utf-8');

// 从 UserScript 头提取版本号，外壳与 content 保持同步
const verMatch = content.match(/@version\s+([\d.]+)/);
const version = verMatch ? verMatch[1] : '0.0.0';

const script = {
  type: 'script',
  enabled: true,   // 导入即启用（悬浮窗 UI 挂主页面 document，脚本跑在酒馆助手的隐藏 iframe 里）
  name: 'Assistant Director (副导演·世界模拟器)',
  id: '8f3c2a54-6d1b-4e7a-9c45-2b8ad0e91f47',
  content,
  info: `AIRP 世界模拟器 v${version}：态势卡片配发（每楼注入）+ 暗线推演 + 公开情报贴边栏。当前实现 S0~S1（骨架/卡片引擎）。`,
  button: { enabled: true, buttons: [] },
  data: {},
  export_with: { data: true, button: true },
};

fs.writeFileSync(outPath, JSON.stringify(script, null, 2), 'utf-8');
console.log(`✓ 已打包 → ${outPath}（v${version}，content ${content.length} 字符）`);
