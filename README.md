# 像素三国

回合制三国题材像素网页单机游戏（竖屏，手机浏览器 / 安卓 App）。画面、剧情、人物造型全部原创。方案见 [docs/设计方案.md](docs/设计方案.md)。

当前进度：**P3 群雄**（新手村、许昌、陈留、濮阳、洛阳、长安、汉中全线，1～160级，含转职）。各期内容见 `docs/设计方案.md` 第四节。

**在线试玩：https://sanguo.ivyea.com/**（同一份内容也在 https://hector-xue.github.io/pixel-sanguo/ ，两个网址存档不互通）（手机浏览器打开，竖屏；「添加到主屏幕」后全屏运行，和 App 一样从桌面图标进）。存档在浏览器本地，换浏览器/设备用「功能 → 退出 → 导出存档」带走。

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
- `src/game/` 里 P2 的系统各一个文件：`smith`（武器店、打造、宝石）、`generals`（招贤、副将养成）、`ring`（跑环）、`welfare`（签到、在线奖励、宝箱、体力）、`town`（钱庄、馆驿、孔庙、军马场）、`dig`（挖宝）、`casino`（娱乐场）
- `src/game/` 里 P3 的系统：`arena`（擂台、斗将台、决斗场、恶人值）、`rivals`（AI 玩家名册和镜像）、`sect`（教派）、`training`（训练）、`rebirth`（转职、副将转生）、`events`（抢宝、银两环、文曲星、幸运王、节日）、`social`（婚姻、结拜、组队）、`stall`（摆摊）、`achv`（成就、称号、排行榜）
- `scripts/gen-p3.py` 生成 P3 的地图、怪物、NPC、主线、6～16 级装备档（改了脚本重新跑一遍，可重复运行）
- `src/art/chrome.ts` 界面质感层（照原版老版：石纹边框、深蓝面板、金黄渐变按钮、火焰底、菱形指令、沙地战场）
- `src/sim/autoplay.ts` 自动通关模拟（1 级打到汉中篇结束），调数值后跑 `npm test` 看节奏
- `artpreview.html` 美术预览页（开发服务器下打开）

字体：Fusion Pixel 12px（SIL OFL 1.1，见 `public/fonts/OFL.txt`）。原字体缺「颍」「骢」「箓」「谡」四个字，用 `scripts/patch-font.py` 拿字体里已有的部件拼上了（颍=颖的「匕」+小「水」+「页」，骢=驰的「马」+聪的「总」，箓=符的竹字头+压扁的「录」，谡=说的「讠」+稷的「畟」）。新增文案前先查字体里有没有缺字。
