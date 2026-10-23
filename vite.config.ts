import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

// 发版时网站上放一份 version.json：安卓 App 启动时拿它和自己比，比自己新就提醒去下载（见 src/ui/update.ts）。
// 更新要点取 changelog.json 第一条，版本号对不上（忘了写更新说明）就只给版本号
function versionFile() {
  return {
    name: 'version-json',
    generateBundle(this: { emitFile(f: { type: 'asset'; fileName: string; source: string }): void }) {
      const v: string = JSON.parse(readFileSync('package.json', 'utf8')).version;
      const top = JSON.parse(readFileSync('src/data/changelog.json', 'utf8'))[0] ?? {};
      const same = top.v === v;
      const info = { v, date: same ? top.date : '', items: same ? top.items : [], apk: 'download/pixel-sanguo.apk' };
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify(info) });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [versionFile()],
  build: {
    chunkSizeWarningLimit: 2000,
    // Phaser 单独一个文件：引擎很少变，发新版时文件名（内容哈希）不变，浏览器缓存接着用，只重新下游戏本身
    rollupOptions: { output: { manualChunks: { phaser: ['phaser'] } } },
  },
  // 平常只跑 tests；SIM=1 时跑 sims 里的长模拟（npm run sim:endgame）
  test: { include: [process.env.SIM ? 'sims/**/*.test.ts' : 'tests/**/*.test.ts'] },
} as never);
