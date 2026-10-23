import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
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

// 网页版离线缓存：把这次构建的全部文件（连同 public 里的字体、图标）写进 sw.js 的预缓存清单，
// 版本号带上清单的哈希——文件一变 sw.js 就变，浏览器才会装新版（见 scripts/sw-template.js、src/ui/swupdate.ts）
function serviceWorker() {
  const skip = (f: string) => f === 'version.json' || f === 'sw.js' || f.startsWith('download/') || f.endsWith('.txt');
  const walk = (dir: string, pre = ''): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f), `${pre}${f}/`) : [`${pre}${f}`]));
  return {
    name: 'service-worker',
    enforce: 'post' as const,
    generateBundle(this: { emitFile(f: { type: 'asset'; fileName: string; source: string }): void }, _o: unknown, bundle: Record<string, unknown>) {
      const files = [...new Set([...Object.keys(bundle), ...walk('public')])].filter((f) => !skip(f)).sort();
      const list = ['./', ...files.map((f) => `./${f}`)];
      const v: string = JSON.parse(readFileSync('package.json', 'utf8')).version;
      // public 里的文件名不带哈希（图标、字体），内容也算进去：换了图标 sw.js 也会变
      const h = createHash('sha1').update(list.join('\n'));
      for (const f of walk('public').filter((x) => !skip(x)).sort()) h.update(readFileSync(join('public', f)));
      const hash = h.digest('hex').slice(0, 8);
      const src = readFileSync('scripts/sw-template.js', 'utf8').replace('__VERSION__', `${v}-${hash}`).replace('__PRECACHE__', JSON.stringify(list));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: src });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [versionFile(), serviceWorker()],
  build: {
    chunkSizeWarningLimit: 2000,
    // Phaser 单独一个文件：引擎很少变，发新版时文件名（内容哈希）不变，浏览器缓存接着用，只重新下游戏本身
    rollupOptions: { output: { manualChunks: { phaser: ['phaser'] } } },
  },
  // 平常只跑 tests；SIM=1 时跑 sims 里的长模拟（npm run sim:endgame）
  test: { include: [process.env.SIM ? 'sims/**/*.test.ts' : 'tests/**/*.test.ts'] },
} as never);
