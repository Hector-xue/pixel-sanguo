// 网页版离线缓存（构建时由 vite.config.ts 填进版本号和文件清单，生成 dist/sw.js）
// 页面：联网优先（4 秒连不上就用缓存里的），所以联网时打开的永远是最新版；
// 带哈希的资源（assets/）、字体、图标：缓存优先，内容变了文件名就变。
// 云存档接口、version.json、安卓安装包不走缓存。
const VERSION = '__VERSION__';
const CACHE = `pxsg-${VERSION}`;
const PRECACHE = __PRECACHE__;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('pxsg-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// 页面上点了「刷新」：新版本马上接管
self.addEventListener('message', (e) => {
  if (e.data === 'skip') self.skipWaiting();
});

const index = () => new URL('./index.html', self.registration.scope).href;

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/api/') || url.pathname.endsWith('/version.json') || url.pathname.includes('/download/') || url.pathname.endsWith('/sw.js')) return;
  if (req.mode === 'navigate') {
    e.respondWith(new Promise((resolve) => {
      let done = false;
      const fallback = () => caches.match(index()).then((r) => r || fetch(req));
      const timer = setTimeout(() => {
        if (!done) {
          done = true;
          resolve(fallback());
        }
      }, 4000);
      fetch(req).then((res) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (res.ok) caches.open(CACHE).then((c) => c.put(index(), res.clone()));
        resolve(res);
      }).catch(() => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(fallback());
      });
    }));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok && (url.pathname.includes('/assets/') || url.pathname.includes('/fonts/'))) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
    }
    return res;
  })));
});
