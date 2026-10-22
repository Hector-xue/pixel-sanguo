# 像素三国

回合制三国题材像素网页单机游戏（竖屏，手机浏览器 / 安卓 App）。画面、剧情、人物造型全部原创。方案见 [docs/设计方案.md](docs/设计方案.md)。

当前进度：**P4 天下**（新手村到汉中全线 1～160 级含转职，加上国战沙盘、军团争霸、跨区大战、云存档、安卓 App）。各期内容见 `docs/设计方案.md` 第四节。

**在线试玩：https://sanguo.ivyea.com/**（同一份内容也在 https://hector-xue.github.io/pixel-sanguo/ ，两个网址存档不互通）（手机浏览器打开，竖屏；「添加到主屏幕」后全屏运行，和 App 一样从桌面图标进）。存档在浏览器本地；换浏览器/设备用「功能 → 退出 → 云存档」登录上传，新设备在标题页「云存档」下载（也可以导出存档文件带走）。

**安卓 App**：https://sanguo.ivyea.com/download/pixel-sanguo.apk （安卓手机打开标题页也有「下载安卓版」按钮）。网页打包进 App，离线能玩；存档和网页版分开，用云存档互相同步。

## 开发

```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm test           # 战斗规则单测 + 6 种职业性别的自动通关模拟
npm run build
```

推到 `main` 后 GitHub Actions 会自动跑单测、构建，用 Capacitor 打安卓包并签名，再一起发布到 GitHub Pages（`.github/workflows/pages.yml`）。单测不过不会发布；安卓包编不出来网页照发（那一版不带安装包）。签名密钥在仓库 secret `ANDROID_KEYSTORE_B64` / `ANDROID_KEYSTORE_PASSWORD`（换了密钥，老用户就不能覆盖升级了）。

云存档服务在 `server/cloud_api.py`（只用 Python 标准库 + sqlite），部署在 sanguo.ivyea.com 那台机器上（systemd `pixel-sanguo-cloud`，监听 127.0.0.1:8032，nginx 把 `/api/cloud/` 转过去）。测试：`python3 -m unittest discover -s server`。

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
- `src/game/` 里 P4 的系统：`guozhan`（国战沙盘：城池、AI 回合、出征驻守、守将、战功官职、赛季）、`contest`（军团争霸、跨区大战）、`cloud`（云存档客户端）
- `scripts/gen-p3.py` 生成 P3 的地图、怪物、NPC、主线、6～16 级装备档；`scripts/gen-p4.py` 生成国战的城池、兵种、守将和争霸、跨区的配置（改了脚本重新跑一遍，可重复运行）
- `server/` 云存档服务和它的接口测试
- `src/art/title.ts` 标题页背景（全彩分层远景、桃花、飘云飞鸟落花）、金色招牌字、标题页小图标
- `src/ui/screen.ts` 全屏（安卓网页第一次点屏幕自动进全屏、标题页左上角开关）、进出全屏后按新高度重排、浏览器顶栏随场景换色；App 的沉浸模式在 `scripts/android/MainActivity.java`（CI 打包时替换模板）
- `src/art/chrome.ts` 界面质感层（照原版老版：石纹边框、深蓝面板、金黄渐变按钮、火焰底、菱形指令、沙地战场）
- `src/sim/autoplay.ts` 自动通关模拟（1 级打到汉中篇结束），调数值后跑 `npm test` 看节奏
- `artpreview.html` 美术预览页（开发服务器下打开）

字体：Fusion Pixel 12px（SIL OFL 1.1，见 `public/fonts/OFL.txt`）。原字体缺「颍」「骢」「箓」「谡」四个字，用 `scripts/patch-font.py` 拿字体里已有的部件拼上了（颍=颖的「匕」+小「水」+「页」，骢=驰的「马」+聪的「总」，箓=符的竹字头+压扁的「录」，谡=说的「讠」+稷的「畟」）。新增文案前先查字体里有没有缺字。
