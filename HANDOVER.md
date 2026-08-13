# 立直麻将（雀魂风格网页版）项目交接文档

> 复制本文档到新对话，新 AI 无需看原对话即可无缝接手。

## 1. 项目概述

纯静态、零构建、无框架、无后端、无 CDN 运行时依赖的网页版日麻（立直麻将）。视觉/交互高度模仿「雀魂」，支持人机对战、AI 观战、牌谱导入导出、段位战绩、VR（WebXR）以及「外挂模式」（仿万宁象棋的整活玩法）。

- **技术栈**：原生 HTML + CSS + 原生 JS（无 ES Module、无框架、无构建步骤）。脚本通过 `<script>` 标签按序加载，所有函数挂全局作用域。
- **运行**：直接双击 `mahjong/index.html`（`file://` 协议即可跑），或 `npx serve .` 后浏览器打开。无热更新（纯静态）。
- **测试**：`node test-core.js` 等（见第 14 节），或一键 `npm test`。Node 环境即可，无浏览器依赖（UI 测试用假 DOM）。
- **构建**：无构建命令。

## 2. 项目目录结构

```
mahjong/
├── index.html           # 入口页：牌桌 DOM + 外挂浮动球/面板 + fx特效层 + 按序加载所有 JS
├── package.json         # 仅 test 脚本（无依赖），npm test 一键跑 6 个测试
├── README.md            # 项目说明/在线地址/部署/测试/开源协议
├── CHANGELOG.md         # 更新日志（当前 v1.3.0）
├── HANDOVER.md          # 本文档
├── .gitignore           # 忽略 node_modules/esa.jsonc/esa.toml/.dev
├── .nojekyll            # 让 GitHub Pages 按原样托管（不做 Jekyll 处理）
├── 开发提示词.md         # 最初的完整需求规格（497 行，含规则/AI/UI/踩坑清单）
├── css/
│   └── style.css        # 全部样式+动画+响应式+外挂面板+3D透视（唯一 CSS 文件，~830 行）
├── js/
│   ├── tiles.js         # 牌常量/牌墙/计数/宝牌映射/赤宝牌/family/排序/辅助函数
│   ├── cheats.js        # 外挂模式：18 个外挂定义 + 役满牌型库 + 触发逻辑
│   ├── yaku.js          # 规则引擎：和牌判定/向听/拆牌/役/符/得点/役满（含双倍役满）
│   ├── ai.js            # 三档 AI（easy/normal/hard）打牌/立直/副露决策
│   ├── expert-ai.js     # 专家 AI（蒙特卡洛 roll-out，带 shanten 缓存）
│   ├── game.js          # 对局状态机/副露/结算/连庄/振听/牌谱序列化/外挂钩子
│   ├── effects.js       # 胡牌特效层（满贯分级/役满大招/粒子/震动）
│   ├── three.min.js     # Three.js r128 UMD（本地化，MIT，VR 用）
│   ├── ui.js            # 渲染/交互/音效/设置/牌谱 UI/外挂面板（最大文件 ~1180 行）
│   ├── replay.js        # 牌谱导入导出 + 回放播放器（ReplayPlayer）
│   ├── dictionary.js    # 役种图鉴数据（YAKU_DICT）
│   ├── meta.js          # 段位/战绩/成就 + 开挂战绩（localStorage）
│   └── vr.js            # WebXR 3D 牌桌（Pico 优先，无头显自动 2D）
├── img/                 # 35 张牌面 PNG（34 面 + Back，CC0，600×800）
├── sound/               # 11 个音效（Kenney CC0）
├── test-core.js         # 规则单元测试 + AI 全自动对局（点数守恒）
├── test-advanced.js     # 赤宝牌/役满双倍/振听/流局罚符
├── test-replay.js       # 牌谱序列化/恢复/回放 往返
├── test-cheats.js       # 外挂触发/次数/点数守恒
├── test-ui.js           # 假 DOM UI 冒烟测试（含 CSS 规则断言）
└── test-shanten.js      # 向听公式 vs 暴力 BFS 对照（慢，~1-2 分钟）
```

**JS 脚本加载顺序（必须严格保持）**：`tiles → cheats → yaku → ai → expert-ai → game → effects → three.min → ui → replay → dictionary → meta → vr`。因为无模块化，函数都靠全局作用域引用，顺序错了会 `ReferenceError`。

## 3. 已完成的工作（按模块）

**规则引擎（`js/tiles.js` + `js/yaku.js` + `js/game.js`）**
- 完整日麻：和牌判定（标准/七对/国士/含4张同牌七对）、向听、听牌、拆牌、符数、得点、役种（`yaku.js`）
- **振听**：舍牌振听/临时振听/立直后振听，只限制荣和不限制自摸（`game.js` 的 `canRon`）
- **赤宝牌**：牌 ID 34-36（赤五万/筒/索），`tiles.js` 的 `family()`/`isRed()`；结构计数折叠、宝牌额外+1
- **役满/双倍役满**：大三元/大四喜(双)/小四喜/字一色/绿一色/清老头/九莲/纯九莲(双)/四暗刻/四暗刻单骑(双)/国士/国士十三面(双)，可叠加（`yaku.js` 的 `detectGlobalYakuman` + `evaluateDecomp`）
- **流局罚符**：总额固定 3000 点，不听者平分缴、听牌者平分得（`game.js` 的 `_ryuukyoku`）
- 连庄本场、点数守恒（四人分数和恒 100000）

**AI（`js/ai.js` + `js/expert-ai.js`）**
- 四档难度：简单/普通/困难/专家（专家=蒙特卡洛 roll-out + 困难AI防守）

**UI/交互（`js/ui.js` + `css/style.css` + `index.html`）**
- 雀魂风格布局：深蓝夜色+木框+呢面牌桌、四家名牌、真实视角旋转、宝牌金光闪烁、摸切变暗
- 左右两家手牌**竖向紧叠**（外八倾斜 + `perspective+rotateY+skewX` 3D 透视 + 牌背渐变立体）
- 牌河：侧家竖向往下码（`grid-auto-flow: column`），西家在内侧右、东家在内侧左
- 胡牌特效：满贯分级全屏/役满大招（粒子+震动）/役名逐条弹出/里宝牌翻开/分数滚动（`effects.js`）
- 移动端响应式（桌面/平板/手机竖屏）+ 触控
- 开局设置：局数/模式/AI难度/昵称/行动速度/外挂下拉
- **双击打牌/摸切**设置（`ui.js` 的 `selectHandTile`/`discardTile`）
- 牌谱导入导出 + 回放播放器（`replay.js`）
- 段位/战绩/成就 + 役种图鉴（`meta.js` + `dictionary.js`）
- VR 3D 牌桌（`vr.js`，WebXR/Pico）

**外挂模式（`js/cheats.js`）**
- 18 个外挂：透视之眼/神之一手/心想事成/无限复制/心想事成+/开局天胡/一键胡牌/印钞机/永远连庄/炸牌/偷天换日/篡改宝牌/掀桌重洗/读心术/催眠大师/傀儡线/时光倒流（`game.js` 加 `cheat` 状态 + `takeSnapshot`/`applySnapshot`/`cheatUndo` + `_aiChooseDiscard` 傀儡钩子 + `_resolveClaims` 催眠钩子 + `_endRound` 永远连庄钩子 + `_startTurn` 心想事成+钩子）
- 开挂局单独记「开挂战绩」（`meta.js` 的 `recordCheatGame`/`mahjong-cheat-meta`）

## 4. 进行中/未完成的工作

- **VR 3D 牌桌**：`vr.js` 已实现但**未经真机验证**（需要 Pico 头显/支持 WebXR 的 Chromium）。手柄射线交互为基础版，真机后需微调。
- 无其他未完成项，主功能均已完成并上线。

## 5. 踩过的坑与解决方案

1. **PowerShell 改 JS 文件破坏中文编码**（`js/game.js` 曾用 `Set-Content` 批量替换导致乱码、`node --check` 报语法错）→ **教训：永远用 `edit` 工具改文件，别用 PowerShell 的 `Get-Content`/`Set-Content` 读写源码**。
2. **test-shanten 的 BFS 在向听≥4 时状态空间爆炸**（120s 超时）→ 加节点预算 + 时间墙（`deadline`），超预算标记 SKIP 不判失败。当前有 1 个 SKIP 用例（"4搭+5孤"）。
3. **流局罚符 division by zero**：全员听牌时 `notenSeats.length===0` 导致 `NaN` → 条件改为 `if (tenpaiSeats.length && notenSeats.length)`。
4. **赤宝牌导致 `isHonor(34)` 误判**（`t>=27` 把赤五当字牌）→ 所有 `isHonor/isTerminal/isYakuhai/suitOf/numOf/tileName/doraOf` 内部先 `family(t)`。
5. **赤五牌结构操作乱序/越界**：`counts()[tile]` 用赤五 ID 会越界 → 所有按 tile 索引 `counts` 处用 `counts(...)[family(tile)]`；移除/选牌用 `pickTile`/`removeTilesByFamily`。
6. **GitHub 推送被墙**（github.com:443 连不上）→ 用 `git config http.proxy http://127.0.0.1:7890`（前提：Clash/mihomo 在 7890 端口运行），推完 `git config --unset`。
7. **ESA 部署不能用 mahjong 根目录直接 `-a .`**（会带上 `.git/` 和测试文件）→ 把运行文件（index.html + css/js/img/sound）复制到临时目录 + `esa.jsonc` 再 commit/deploy。
8. **AI 观战卡死在副露等待**（历史坑，已修）：人类判定用 `find(...isHuman)` 被三元改成 -1 导致永远等人类 → 现在 `humanSeat` 统一为 -1 表示无人类。
9. **摸牌动画反复重播/幽灵摸牌**（历史坑，已修）：用全局 `drawnTile` 判断会误判 → 每个玩家各自 `lastDrawn` 字段判断。

## 6. 重要决策与约定

- **纯静态铁律**：无 ES Module、无 fetch、无构建、相对路径、`file://` 可跑（这是部署 ESA 的硬性前提）。
- **牌 ID 编码**：0-8 万、9-17 筒、18-26 索、27-30 东南西北、31-33 白发中；34-36 赤五万/筒/索。`family(t)` 把赤五折叠回普通五（34→4、35→13、36→22）。
- **`counts(tiles)` 返回 34 长数组**（赤五折叠进普通五），供所有结构计算（canWin/shanten/拆牌）；赤五的宝牌额外+1 用 `countRed()` 单独算。
- **座位映射**：`seat0=东(屏幕右)`、`seat1=南(你/屏幕下)`、`seat2=西(屏幕左)`、`seat3=北(屏幕上)`；`humanSeat` 默认 1，`allAI` 时 -1。
- **役满叠加**：役满 yaku 各自带 `han:13`(单)/`han:26`(双)，`basicPoints = Math.floor(han/13)*8000`，`limitName` 按 `han/13` 输出「役满/双倍役满/三倍役满」。
- **外挂隔离**：开挂局不写 `mahjong-meta`（正常战绩），单独写 `mahjong-cheat-meta`。
- **专家 AI 用主线程蒙特卡洛**（不做 Web Worker，因 `file://` 下 Worker 受 CORS 限制），带 `_shantenCache` 缓存。
- **牌谱**：`serialize()` 全量快照（含 `snapshot`/`events`/`debugLog`），`Game.restore()` 恢复继续；`ReplayPlayer` 按 events 重建四家明牌回放。
- **音效/设置持久化**：`localStorage` key `mahjong-settings`（scale/difficulty/sound/volume/playerName/doubleClick）与 `mahjong-meta`、`mahjong-cheat-meta`。
- 命名风格：类用 PascalCase（`Game`/`ReplayPlayer`），工具对象用 PascalCase（`UI`/`AI`/`Cheats`/`Meta`/`Effects`/`VR`），函数 camelCase（`canWin`/`shanten`/`evaluateWin`/`buildWall`）。

## 7. 已知问题与 TODO

- **VR 未经真机验证**（`js/vr.js`）：桌面 2D 正常，WebXR 手柄交互需真机调试。
- **四暗刻荣和（双碰）未降级**（`js/yaku.js` 的 `concealedTri===4` 判定）：按暗刻计数，双碰荣和仍算四暗刻（标准应降为三暗刻+对对和），罕见边界。
- **test-shanten 有 1 个 SKIP 用例**（"4搭+5孤"，BFS 病态爆炸），其余全过。
- **双击打牌**用原生 `dblclick` 事件，有约 300-500ms 的判定延迟（属正常双击语义）。
- 手机竖屏手牌无法做到每张 44px（14 张物理放不下），已尽量放大并支持横向滚动。

## 8. 关键代码片段

**牌 ID 与 family（`js/tiles.js`）**：
```js
function family(t) { return t === 34 ? 4 : t === 35 ? 13 : t === 36 ? 22 : t; }
function isRed(t) { return t >= 34; }
function counts(tiles) { // 34 长，赤五折叠
  const c = new Array(34).fill(0);
  for (const t of tiles) c[family(t)]++;
  return c;
}
function buildWall() { // 136 张，含 3 枚赤五
  const a = [];
  for (let t = 0; t < 34; t++) for (let i = 0; i < 4; i++) a.push(t);
  const rep = (from, to) => { const i = a.indexOf(from); if (i >= 0) a[i] = to; };
  rep(4, 34); rep(13, 35); rep(22, 36);
  return shuffle(a);
}
```

**向听精确公式（`js/yaku.js` 的 `shanten`，已暴力验证）**：
```js
// 有雀头: 8 - 2m - t - 1 + max(0, m+t+1-5)
// 无雀头: (m+t>=5 ? 9 : 8) - 2m - t + max(0, m+t-5)
// 完成态 -1；另与七对/国士的向听取最小
```

**和牌总入口 `evaluateWin(ctx)`（`js/yaku.js`）**：返回 `{yaku, han, fu, basic, limit, doraHan, uraHan}` 或 null；役满组合后 `doraHan/uraHan` 置 0。

**ESA 部署配置（临时目录的 `esa.jsonc`）**：
```jsonc
{ "name": "majiang", "description": "雀魂风格网页版日麻", "assets": { "directory": "." } }
```

## 9. 环境与依赖

- **Node.js**：v24.18.0（仅用于跑测试，运行游戏不需要 Node）。
- **npm 依赖**：本项目 `mahjong/package.json` **无依赖**（只有 test 脚本）。父目录 `package.json` 有 `@alicloud/pop-core`（用于 DNS 管理，与游戏无关）。
- **全局工具**：`esa-cli`（阿里云 ESA 部署 CLI）、`gh`（GitHub CLI）、`mihomo`/Clash（代理，GitHub 推送需要）。
- **无 `.env`**。阿里云 AccessKey/GitHub token 等凭据在**父目录的 `MEMORY.md`**（不在仓库内、不提交）。
- **默认端口**：无（纯静态）；本地预览用任意静态服务器（如 `npx serve` 默认 3000）。

## 10. 外部资源

- **牌面贴图**：`FluffyStuff/riichi-mahjong-tiles`（CC0），`img/*.png`（Man1-9/Pin1-9/Sou1-9/Ton/Nan/Shaa/Pei/Haku/Hatsu/Chun/Back，600×800）。
- **音效**：Kenney UI / Digital Audio（CC0），`sound/*.wav|ogg`（click1-5、switch10/20/30、high_up、low_down、pep_sound_1）。
- **Three.js**：r128 UMD（MIT），`js/three.min.js`（本地化，约 603KB）。
- **无外部 API/数据库**：全部本地，localStorage 持久化。
- **部署平台**：GitHub Pages（`https://tianshan233.github.io/majiang/`）+ 阿里云 ESA（`http://majiang.elsword.top/`，CNAME `majiang.ebe343d4.er.aliyun-esa.net`）。

## 11. Git 状态

- 仓库：`https://github.com/tianshan233/majiang`（公开）。
- **分支**：`main`（当前工作分支）。
- **无未提交改动**（最近提交 `58c3a2d`）。
- 最近提交（倒序）：`58c3a2d` 开局选难度+昵称+外挂下拉+手牌3D透视+双击打牌 → `fb95424` 牌河竖向码放+外挂模式 → `25a7bcb` 左右手牌竖向+更新日志 → `c648a3b` 流局罚符+红五排序 → `1f601fa` init。
- 最新 Release：**v1.3.0**。

## 12. 调试与开发流程

- **启动**：无 dev server。直接开 `index.html`，改代码后刷新浏览器。
- **热更新**：无（纯静态）。
- **调试技巧**：浏览器 F12 Console；引擎维护 `debugLog`（每步手牌明文），界面「导出日志」按钮可复制/下载完整对局日志；`game.serialize()` 可导出当前状态 JSON 排查。
- **快速定位规则问题**：先 `node test-core.js`（规则单测）+ `node test-advanced.js`（高级规则），再单独构造牌型验证。
- **AI 观战**：把「模式」选 AI 观战，快速观察整局行为。

## 13. 打包与部署

- **构建**：无（纯静态，直接部署源文件）。
- **部署到 GitHub**（需代理）：`git add -A && git commit -m "..."`，然后 `git config http.proxy http://127.0.0.1:7890 && git push origin main && git config --unset http.proxy`。GitHub Pages 已开启（.nojekyll 已加）。
- **部署到 ESA**（两条命令，在含 `esa.jsonc` 的临时目录执行）：
  1. `esa-cli commit -n majiang -a . --no-bundle -d "说明"`
  2. `esa-cli deploy -n majiang -a . -e production`
- **发 Release**：`gh release create vX.Y.Z --title "..." --notes-file <md文件>`。
- 部署前记得把运行文件复制到临时目录（避开 `.git`/测试文件）。

## 14. 测试情况

| 测试 | 内容 | 状态 |
|---|---|---|
| `node test-core.js` | 规则单测 + AI 全自动对局点数守恒 | ✅ 56 过 |
| `node test-advanced.js` | 赤宝牌/役满双倍/振听/流局罚符 | ✅ 32 过 |
| `node test-replay.js` | 牌谱序列化/恢复/回放往返 | ✅ 21 过 |
| `node test-cheats.js` | 外挂触发/次数/点数守恒 | ✅ 20 过 |
| `node test-ui.js` | 假 DOM UI 冒烟 + CSS 断言 | ✅ 56 过 |
| `node test-shanten.js` | 向听公式 vs 暴力 BFS | ✅ 全一致（1 个 SKIP） |

`npm test` 一键全跑（注意 test-shanten 较慢约 1-2 分钟）。**当前全绿**。

## 15. 性能与兼容性注意

- **专家 AI 是性能瓶颈**：主线程蒙特卡洛，每手约数十~数百 ms，观战专家局会稍慢（有意为之，未用 Worker）。
- **test-shanten 的 BFS 慢**：向听≥4 时状态空间爆炸，已加预算/时间墙。
- **浏览器兼容**：目标现代 Chromium/移动端（WebXR 需 Pico 浏览器或支持 WebXR 的 Chromium）；`body.style.zoom`（牌桌缩放）为 Chromium 特性。
- **响应式**：桌面(≥1080)/平板(768-1080)/手机竖屏(<640) 三档；`viewport` 已禁缩放，`touch-action: manipulation` 消除点击延迟。
- `file://` 下无 Worker、无 ES Module（受 CORS 限制）——这是「专家 AI 不并行」「无模块化」的根本原因。

## 16. 给新对话的接手建议

**先读的文件（按顺序）**：
1. `README.md` + `CHANGELOG.md`（了解全貌）
2. `js/tiles.js`（牌模型，最基础）
3. `js/yaku.js`（规则引擎核心）
4. `js/game.js`（状态机，最复杂）
5. `js/ui.js`（渲染/交互入口）
6. `index.html`（DOM 结构与脚本顺序）

**建议的下一步任务优先级**：
1. **VR 真机验证**（`js/vr.js`，需 Pico/WebXR 环境，当前最大遗留项）
2. 四暗刻荣和降级（`js/yaku.js`，规则严谨性小修）
3. 任意用户提出的新 UI/玩法需求（改动通常集中在 `js/ui.js` + `css/style.css`）

**铁律提醒**：改 JS 文件用 `edit` 工具（PowerShell 会毁中文编码）；保持零构建/相对路径/`file://` 可跑；改完跑 `npm test`；部署走第 13 节流程（GitHub 需代理）。

---

在线地址：🐙 https://tianshan233.github.io/majiang/ · 🀄 http://majiang.elsword.top/
