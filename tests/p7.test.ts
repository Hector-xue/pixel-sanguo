// 阵法（解锁、相克、加成落到双方身上、最好的阵）、徽章（找到、不重复、里程碑）、教派任务不限次数
import { describe, expect, it } from 'vitest';
import { deserialize, newSave, serialize } from '../src/game/state';
import { BEATS, FORMS, FORM_ORDER, bestFormation, clash, enemyFormation, myFormation, setFormation } from '../src/game/formation';
import type { FormId } from '../src/game/formation';
import { BADGE_GOALS, badgeCount, badgeSpot, badgeTotal, findBadge } from '../src/game/badges';
import { startGroupBattle } from '../src/game/encounter';
import { joinSect, takeSectTask } from '../src/game/sect';
import { locations } from '../src/data';

const fresh = () => newSave({ server: '豫州', name: '测试', gender: 'male', classId: 'warrior', avatar: 0, seed: 7 });

describe('阵法', () => {
  it('五个阵首尾相克成一圈', () => {
    for (const id of FORM_ORDER) {
      expect(clash(id, BEATS[id])).toBe(1);
      expect(clash(BEATS[id], id)).toBe(-1);
    }
    const seen = new Set<FormId>();
    let cur: FormId = 'fengshi';
    for (let i = 0; i < 5; i++) {
      seen.add(cur);
      cur = BEATS[cur];
    }
    expect(seen.size).toBe(5);
    expect(cur).toBe('fengshi');
  });

  it('按等级解锁；没解锁的布不了', () => {
    const s = fresh();
    expect(setFormation(s, 'bagua')).toContain('50级');
    expect(myFormation(s)).toBe('changshe');
    s.player.level = 20;
    expect(setFormation(s, 'yulin')).toContain('鱼鳞阵');
    expect(myFormation(s)).toBe('yulin');
    s.player.level = 5;
    expect(myFormation(s)).toBe('changshe');
  });

  it('开战时阵法和克制都算进双方数值；新手区的怪不列阵', () => {
    const s = fresh();
    const low = Object.values(locations).flatMap((l) => l.groups).find((g) => g.level[1] < 10)!;
    expect(enemyFormation(low)).toBeNull();
    const g = Object.values(locations).flatMap((l) => l.groups).find((x) => x.level[0] >= 12 && enemyFormation(x))!;
    const theirs = enemyFormation(g)!;
    s.player.level = 60;
    const beat = FORM_ORDER.find((id) => BEATS[id] === theirs)!;
    setFormation(s, 'changshe');
    const b0 = startGroupBattle(s, g, 11);
    setFormation(s, beat);
    const b1 = startGroupBattle(s, g, 11);
    expect(b1.forms).toEqual({ ally: beat, enemy: theirs, clash: 1 });
    const atk = (b: typeof b0) => b.units.find((u) => u.kind === 'player')!.atk;
    const eatk = (b: typeof b0) => b.units.find((u) => u.side === 'enemy')!.atk;
    expect(atk(b1)).toBeGreaterThan(Math.round(atk(b0) / (1 + (FORMS.changshe.atk ?? 0))));
    expect(eatk(b1)).toBeLessThanOrEqual(eatk(b0));
    expect(bestFormation(s, theirs)).toBe(beat);
  });

  it('老存档补上阵法和徽章', () => {
    const s = fresh() as unknown as { p5: Record<string, unknown> };
    delete s.p5.formation;
    delete s.p5.badges;
    const back = deserialize(serialize(s as never));
    expect(myFormation(back)).toBe('changshe');
    expect(back.p5.badges).toEqual({});
  });
});

describe('徽章', () => {
  it('每个地方一枚、位置固定；找到给盘缠，不能重复拿；集满有大礼', () => {
    expect(badgeSpot('cunbei')).toEqual(badgeSpot('cunbei'));
    expect(badgeSpot('cunbei')).not.toEqual(badgeSpot('cunnan'));
    const s = fresh();
    const silver = s.player.silver;
    expect(findBadge(s, 'cunbei')[0]).toContain('村北山林印');
    expect(s.player.silver).toBeGreaterThan(silver);
    expect(findBadge(s, 'cunbei')).toEqual([]);
    const ids = Object.keys(locations).filter((k) => k !== 'cunbei');
    let goals = 0;
    for (const id of ids) if (findBadge(s, id).some((l) => l.startsWith('集齐'))) goals++;
    expect(badgeCount(s)).toBe(badgeTotal());
    expect(goals + 0).toBe(BADGE_GOALS.length);
  });
});

describe('教派', () => {
  it('任务不限次数，交了就能接下一个', () => {
    const s = fresh();
    s.player.level = 40;
    joinSect(s, 'qinglong');
    for (let i = 0; i < 8; i++) {
      expect(takeSectTask(s)).toContain('教派任务');
      s.p3.sect.task = null;
    }
  });
});
