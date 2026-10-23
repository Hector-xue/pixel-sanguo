import { describe, expect, it } from 'vitest';
import { _test } from '../src/ui/audio';
import { SPEEDS, settings } from '../src/ui/settings';

describe('背景音乐曲谱', () => {
  it('每首每声部都是整小节、没有认不出的记号、音高在能听的范围里', () => {
    for (const [id, tr] of Object.entries(_test.TRACKS)) {
      for (const part of tr.parts) {
        const toks = part.notes.split(/\s+/).filter((x) => x && x !== '|');
        expect(toks.length % 8, `${id} ${part.voice}`).toBe(0);
        for (const tk of toks) {
          const ok = part.voice === 'drum' ? /^[DxoG.-]$/.test(tk) : /^([1-7][',]*|-|\.)$/.test(tk);
          expect(ok, `${id} ${part.voice} 「${tk}」`).toBe(true);
        }
        const steps = _test.parse(part);
        expect(steps.length).toBe(toks.length);
        for (const st of steps) {
          if (typeof st.tone !== 'number') continue;
          const f = tr.root * Math.pow(2, st.tone / 12);
          expect(f, `${id} ${part.voice}`).toBeGreaterThan(40);
          expect(f, `${id} ${part.voice}`).toBeLessThan(2500);
        }
      }
    }
  });

  it('延长记号算进前一个音的长度', () => {
    const st = _test.parse({ voice: 'dizi', notes: "6 - - 5 | 1' . 2, -" });
    expect(st[0]).toEqual({ tone: 9, len: 3 });
    expect(st[3]).toEqual({ tone: 7, len: 1 });
    expect(st[4]).toEqual({ tone: 12, len: 1 });
    expect(st[5].tone).toBeNull();
    expect(st[6]).toEqual({ tone: 2 - 12, len: 2 });
  });
});

describe('本机设置', () => {
  it('读不到本机存储时用默认：音效开、音乐小声、正常速度、每仗手动', () => {
    const st = settings();
    expect(st.sfx).toBe(2);
    expect(st.music).toBe(1);
    expect(SPEEDS).toContain(st.speed);
    expect(st.keepAuto).toBe(false);
    expect(st.shake).toBe(true);
  });
});
