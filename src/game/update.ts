// 安卓 App 检查更新：App 把网页打在包里，不会自己变新。发版时网站上放一份 version.json（构建时生成），
// App 启动后去看一眼，比自己新就提醒去下载安装包。网页版每次打开都是最新的，用不着。
export interface UpdateInfo {
  v: string;
  date: string;
  items: string[];
  apk: string;
}

// 0.1.10 比 0.1.9 新：按段比数字
export function newerThan(a: string, b: string): boolean {
  const pa = a.split('.').map((x) => parseInt(x, 10) || 0);
  const pb = b.split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d > 0;
  }
  return false;
}

// 网站上那份文件长得不对就当没查到
export function parseUpdate(raw: unknown, site: string): UpdateInfo | null {
  const r = raw as Partial<UpdateInfo> | null;
  if (!r || typeof r.v !== 'string' || !/^\d+(\.\d+)*$/.test(r.v)) return null;
  const items = Array.isArray(r.items) ? r.items.filter((x): x is string => typeof x === 'string') : [];
  const apk = typeof r.apk === 'string' && r.apk ? r.apk : 'download/pixel-sanguo.apk';
  return { v: r.v, date: typeof r.date === 'string' ? r.date : '', items, apk: new URL(apk, site).href };
}
