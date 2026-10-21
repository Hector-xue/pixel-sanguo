# 像素三国

回合制三国题材像素网页单机游戏（竖屏，手机浏览器 / 安卓 App）。画面、剧情、人物造型全部原创。方案见 [docs/设计方案.md](docs/设计方案.md)。

当前进度：**P1 新手村**。

**在线试玩：https://hector-xue.github.io/pixel-sanguo/**（手机浏览器打开，竖屏；「添加到主屏幕」后全屏运行，和 App 一样从桌面图标进）。存档在浏览器本地，换浏览器/设备用「功能 → 退出 → 导出存档」带走。

## 开发

```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm test           # 战斗规则单测 + 6 种职业性别的自动通关模拟
npm run build
```

推到 `main` 后 GitHub Actions 会自动跑单测、构建并发布到 GitHub Pages（`.github/workflows/pages.yml`），单测不过不会发布。

```bash
npx vite-node scripts/make-icons.ts   # 重新生成主屏图标（改了头像画法时）
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
