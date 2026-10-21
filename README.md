# 像素三国

回合制三国题材像素网页单机游戏（竖屏，手机浏览器 / 安卓 App）。画面、剧情、人物造型全部原创。方案见 [docs/设计方案.md](docs/设计方案.md)。

当前进度：**P1 新手村**。

## 开发

```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm test           # 战斗规则单测 + 6 种职业性别的自动通关模拟
npm run build
./deploy.sh        # 构建并发布到 https://ops.ivyea.com/sanguo/（需要 IvyeaOps 登录）
```

## 目录

- `src/core/` 战斗内核（纯逻辑、带随机种子，可测）
- `src/game/` 存档与游戏规则、开战/战后结算、AI 玩家氛围
- `src/data/*.json` 全部数值表，`_src` 字段标了【实锤】【单源】【推定】，改表不用改代码
- `src/art/` 程序生成的像素美术（32 色调色板、纸娃娃人物、地点场景、图标）
- `src/ui/`、`src/scenes/` 界面
- `src/sim/autoplay.ts` 自动通关模拟，调数值后跑 `npm test` 看节奏
- `artpreview.html` 美术预览页（开发服务器下打开）

字体：Fusion Pixel 12px（SIL OFL 1.1，见 `public/fonts/OFL.txt`）。
