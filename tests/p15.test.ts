import { describe, expect, it, vi } from 'vitest';

const mem = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
});
vi.stubGlobal('window', { addEventListener() {}, setTimeout, clearTimeout });

describe('返回键', () => {
  it('先关最上面那层；场景处理了就不往下；什么都没开时按两次才退出', async () => {
    const B = await import('../src/ui/back');
    B._test.reset();
    const warn = vi.fn();
    B.setBackWarn(warn);
    const closed: string[] = [];
    const offA = B.pushBack(() => closed.push('底下的弹窗'));
    const offB = B.pushBack(() => closed.push('上面的弹窗'));
    expect(B.handleBack(1000)).toBe(true);
    expect(closed).toEqual(['上面的弹窗']);
    offB();
    expect(B.handleBack(1100)).toBe(true);
    expect(closed).toEqual(['上面的弹窗', '底下的弹窗']);
    offA();
    // 战斗里：场景说处理了，就不会退出
    B.setSceneBack(() => true);
    expect(B.handleBack(1200)).toBe(true);
    expect(warn).not.toHaveBeenCalled();
    // 主界面：第一次提示，两秒内再按才退出；隔久了重新提示
    B.setSceneBack(null);
    expect(B.handleBack(5000)).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(B.handleBack(6500)).toBe(false);
    expect(B.handleBack(20000)).toBe(true);
    expect(warn).toHaveBeenCalledTimes(2);
  });
});

describe('天气', () => {
  it('同一天同一片地方天气一样；洞里没天气；冬天才下雪', async () => {
    const Wx = await import('../src/game/weather');
    const d = new Date(2026, 0, 15);
    expect(Wx.seasonOf(d)).toBe('winter');
    expect(Wx.seasonOf(new Date(2026, 6, 1))).toBe('summer');
    expect(Wx.weatherOf('xuchang', 'city', d)).toBe(Wx.weatherOf('xuchangjiaowai', 'grass', d));
    expect(Wx.weatherOf('baodong', 'cave', d)).toBe('clear');
    // 夏天一年里不下雪；冬天总有几天下雪
    const days = (m: number) => Array.from({ length: 28 }, (_, i) => Wx.weatherOf('xuchang', 'city', new Date(2026, m, i + 1)));
    expect(days(6)).not.toContain('snow');
    expect([...days(0), ...days(1), ...days(11)]).toContain('snow');
    expect(days(6)).toContain('rain');
  });
});

describe('振动设置', () => {
  it('没选过振动的才算「没表态」；老玩家默认关', async () => {
    const S = await import('../src/ui/settings');
    expect(S.settings().vibrate).toBe(false);
    expect(S.hasVibrateChoice()).toBe(false);
    S.saveSettings({ vibrate: true });
    expect(S.hasVibrateChoice()).toBe(true);
  });
});
