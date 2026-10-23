import { describe, expect, it } from 'vitest';
import { newerThan, parseUpdate } from '../src/game/update';

describe('安卓 App 检查更新', () => {
  it('按段比版本号', () => {
    expect(newerThan('0.1.3', '0.1.2')).toBe(true);
    expect(newerThan('0.1.10', '0.1.9')).toBe(true);
    expect(newerThan('0.2', '0.1.9')).toBe(true);
    expect(newerThan('0.1.2', '0.1.2')).toBe(false);
    expect(newerThan('0.1.2', '0.1.3')).toBe(false);
    expect(newerThan('0.1.2.0', '0.1.2')).toBe(false);
  });

  it('读网站上的 version.json：安装包地址按网站补全，坏文件当没查到', () => {
    const site = 'https://sanguo.ivyea.com/';
    const ok = parseUpdate({ v: '0.1.3', date: '2026-10-24', items: ['a', 3, 'b'], apk: 'download/pixel-sanguo.apk' }, site);
    expect(ok).toEqual({ v: '0.1.3', date: '2026-10-24', items: ['a', 'b'], apk: 'https://sanguo.ivyea.com/download/pixel-sanguo.apk' });
    expect(parseUpdate({ v: '0.1.3' }, site)?.apk).toBe('https://sanguo.ivyea.com/download/pixel-sanguo.apk');
    expect(parseUpdate(null, site)).toBeNull();
    expect(parseUpdate({ v: '<html>' }, site)).toBeNull();
    expect(parseUpdate({ items: [] }, site)).toBeNull();
  });
});
