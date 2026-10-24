import { describe, expect, it } from 'vitest';
import { _test } from '../src/ui/audio';
import { SPEEDS, TRACK_IDS, saveSettings, settings, trackFor } from '../src/ui/settings';

describe('背景音乐曲谱', () => {
  it('每首每声部都是整小节、没有认不出的记号、音高在能听的范围里', () => {
    for (const [id, tr] of [...Object.entries(_test.TRACKS), ...Object.entries(_test.JINGLES).map(([k, v]) => [`乐句${k}`, v] as const)]) {
      for (const part of tr.parts) {
        const toks = part.notes.split(/\s+/).filter((x) => x && x !== '|');
        if (!id.startsWith('乐句')) expect(toks.length % 8, `${id} ${part.voice}`).toBe(0);
        for (const tk of toks) {
          const ok = part.voice === 'drum' ? /^[DxokcG.-]$/.test(tk) : /^([1-7][',]*(\+[1-7][',]*)*|-|\.)$/.test(tk);
          expect(ok, `${id} ${part.voice} 「${tk}」`).toBe(true);
        }
        const steps = _test.parse(part);
        expect(steps.length).toBe(toks.length);
        for (const st of steps) {
          if (st.tone === null || typeof st.tone === 'string') continue;
          for (const tn of typeof st.tone === 'number' ? [st.tone] : st.tone) {
            const f = tr.root * Math.pow(2, tn / 12);
            expect(f, `${id} ${part.voice}`).toBeGreaterThan(40);
            expect(f, `${id} ${part.voice}`).toBeLessThan(2500);
          }
        }
      }
    }
  });

  it('几个音用 + 连起来是和弦，延长照样算', () => {
    const st = _test.parse({ voice: 'sheng', oct: -1, notes: "1+5+1' - . 6,+3" });
    expect(st[0]).toEqual({ tone: [-12, -5, 0], len: 2 });
    expect(st[2].tone).toBeNull();
    expect(st[3]).toEqual({ tone: [-15, -8], len: 1 });
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
    expect(st.tracks).toEqual({});
  });

  it('选曲：每首曲子都有场合名；场合可以换曲、关掉，没改的放原曲', () => {
    expect([...TRACK_IDS].sort()).toEqual(Object.keys(_test.TRACKS).sort());
    saveSettings({ tracks: { battle: 'boss', town: 'off' } });
    expect(trackFor('battle')).toBe('boss');
    expect(trackFor('town')).toBeNull();
    expect(trackFor('field')).toBe('field');
    saveSettings({ tracks: {} });
    expect(trackFor('town')).toBe('town');
  });
});

describe('折行', () => {
  it('每行都不超宽、标点不打头、开括号不收尾，拼回去和原文一样', async () => {
    const { wrap, textWidth } = await import('../src/ui/textfit');
    const samples = [
      '每天三阵，你赢得越多本教派越可能拿下这一轮（赢3阵约95%）。结果第二天揭晓。',
      '「战」：每场战斗带它上场；其余随行副将在战斗中用「招将」换上来。',
      '【国战】60级以后「功能 → 国战」投奔魏、蜀、吴其中一国。AI 跟着补兵、打邻城；七天一个赛季。',
      '一路上做到的几件事能领奖了：「功能 → 福利 → 江湖行记」。一共七件，第七件送大乔。',
    ];
    for (const max of [120, 200, 280, 328]) {
      for (const s of samples) {
        const lines = wrap(s, max);
        expect(lines.join('')).toBe(s);
        lines.forEach((l, i) => {
          expect(textWidth(l), `${max}「${l}」`).toBeLessThanOrEqual(max);
          if (i > 0) expect('，。！？、；：）」』%'.includes(l[0]), `行首「${l}」`).toBe(false);
          if (i < lines.length - 1) expect('（「『【'.includes(l[l.length - 1]), `行尾「${l}」`).toBe(false);
        });
      }
    }
  });
});
