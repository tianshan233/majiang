# 立直麻将（雀魂风格）网页版

> 本游戏由 **DeepSeek AI 编写生成**。

纯静态、零构建、无后端、无 CDN 运行时依赖的日麻（立直麻将）游戏。视觉与交互高度模仿「雀魂」，支持人机对战、AI 观战、牌谱导入导出与回放、段位战绩成就、VR（WebXR/Pico）等。

## 在线试玩

- 🀄 **阿里云 ESA**：<http://majiang.elsword.top/>
- 🐙 **GitHub Pages**：<https://tianshan233.github.io/majiang/>

- 直接双击 `index.html`（`file://` 协议）即可运行
- 可像静态页面一样部署到阿里云 ESA / GitHub Pages

## 更新日志

详见 [CHANGELOG.md](CHANGELOG.md)。

## 快速开始

**本地运行**
- 方式一：直接双击 `mahjong/index.html`（`file://` 协议，无需服务器）
- 方式二：`cd mahjong && npx serve .` 或任意静态服务器，浏览器打开

**部署到阿里云 ESA**
1. 将 `mahjong/` 目录内的所有文件（`index.html`、`css/`、`js/`、`img/`、`sound/`）作为站点根上传到 ESA 静态托管 / OSS 源站
2. 默认首页设为 `index.html`
3. 无需任何构建、环境变量或后端配置；`.png/.wav/.ogg/.css/.js` 的 MIME 均为标准识别

**部署到 GitHub Pages**
1. 将 `mahjong/` 目录推送到仓库
2. Pages 发布源选择该目录（或把其内容放到仓库根）
3. 也可将 GitHub 仓库直接接 ESA 作为源站

## 测试

```bash
cd mahjong
node test-core.js      # 规则单元测试 + AI 全自动对局（点数守恒）
node test-advanced.js  # 赤宝牌 / 役满（含双倍役满）/ 振听
node test-replay.js    # 牌谱序列化 / 恢复 / 回放 往返
node test-ui.js        # 假 DOM UI 冒烟测试
node test-shanten.js   # 向听公式 vs 暴力对照（较慢，约 1~2 分钟）
```

或一键：`npm test`

## 功能

- **完整日麻规则**：136 张（无赤宝牌默认，赤宝牌可选）、振听、立直、一发、宝牌/里宝牌、符数得点（四舍五入到 100）、流局、连庄本场、点数守恒
- **役种**：立直/一发/平和/断幺九/一杯口/役牌/三色同顺/一气通贯/混全/对对/三暗刻/混老头/七对子/二杯口/纯全/混一色/清一色，以及全部役满（大三元/大四喜/小四喜/字一色/绿一色/清老头/九莲/四暗刻/国士），含**双倍役满**（大四喜、国士无双十三面、四暗刻单骑、纯正九莲宝灯）与役满叠加
- **AI**：简单/普通/困难/专家（蒙特卡洛搜索）四档；人机对战 + AI 观战
- **牌谱**：JSON 导入导出、恢复继续、逐步回放播放器
- **段位/战绩/成就**：段位分、顺位统计、和牌率、役种图鉴收集、成就系统
- **特效**：满贯分级全屏特效、役满大招（粒子+震动）、役名逐条弹出、里宝牌翻开、分数滚动
- **多终端**：桌面/平板/手机竖屏响应式、触控操作
- **VR**：WebXR（Pico 优先）3D 牌桌，无头显自动退回 2D

## 目录结构

```
index.html            入口（script 标签按序加载，无模块化）
css/style.css         样式 + 动画 + 响应式
img/*.png             34 张牌面 + 牌背（CC0，本地化）
sound/*.wav|ogg       音效（CC0，本地化）
js/tiles.js           牌常量/洗牌/计数/宝牌映射/赤宝牌
js/yaku.js            和牌判定/向听/拆牌/役/符/得点/役满
js/ai.js              三档 AI 决策
js/expert-ai.js       专家 AI（蒙特卡洛）
js/game.js            对局状态机/副露/结算/连庄/牌谱序列化
js/effects.js         胡牌特效层
js/ui.js              渲染/交互/音效/设置/牌谱 UI
js/replay.js          牌谱导入导出 + 回放播放器
js/dictionary.js      役种图鉴数据
js/meta.js            段位/战绩/成就
js/three.min.js       Three.js r128（UMD，本地化，MIT）
js/vr.js              WebXR 3D 牌桌
test-*.js             node 测试脚本
```

## 开源资源与授权

- 牌面：`FluffyStuff/riichi-mahjong-tiles`（CC0 公有领域）
- 音效：Kenney UI / Digital Audio（CC0）
- Three.js r128（MIT License）

## 已知局限

- **VR 未经真机验证**：3D 牌桌基于 WebXR，需 Pico 浏览器 / 支持 WebXR 的 Chromium 访问（`https` 或 `file://`）；桌面 2D 始终可用。手柄射线交互为基础版，建议真机调试后微调
- **专家 AI 为单线程蒙特卡洛**：受 `file://` 限制未使用 Web Worker，思考时可能短暂阻塞 UI（约数十~数百毫秒/手）
- **手机竖屏手牌无法做到每张 44px**：14 张牌在窄屏物理上无法每张 44px，已尽量放大并支持横向滚动；触控热区已优化
- **四暗刻荣和（双碰）**：按暗刻计数（未严格降级为三暗刻+对对和，罕见边界）
- **天和/地和**：基础版（概率触发）
- 牌谱回放为四家明牌视角（无战争迷雾）

## 设置持久化

- `localStorage: mahjong-settings`：牌桌缩放 / AI 难度 / 音效开关与音量
- `localStorage: mahjong-meta`：段位分 / 战绩 / 成就
