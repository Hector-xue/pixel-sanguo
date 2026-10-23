import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { startGroupBattle } from '../src/game/encounter';
import { locations } from '../src/data';
import { addGeneral, deploySlots, deployedUids, deserialize, isDeployed, makeGeneral, moveToInn, newSave, serialize, toggleDeploy } from '../src/game/state';

function team(level: number) {
  const s = newSave({ server: 'x', name: '测试', gender: 'male', classId: 'warrior', avatar: 0, seed: 3 });
  s.player.level = level;
  const rng = new Rng(5);
  for (let i = 0; i < 3; i++) addGeneral(s, makeGeneral(s, 'caokou', Math.max(1, level - 2), rng));
  return s;
}

describe('出战位', () => {
  it('1 级一个、30 级两个、60 级三个', () => {
    expect(deploySlots(team(29))).toBe(1);
    expect(deploySlots(team(30))).toBe(2);
    expect(deploySlots(team(60))).toBe(3);
  });

  it('出战位满了提示几级再开；下场腾位；进馆驿也腾位', () => {
    const s = team(30);
    const [a, b, c] = s.generals.map((g) => g.uid);
    expect(deployedUids(s)).toEqual([a]);
    expect(toggleDeploy(s, b)).toContain('出战');
    expect(deployedUids(s)).toEqual([a, b]);
    expect(toggleDeploy(s, c)).toContain('60级');
    expect(toggleDeploy(s, a)).toContain('休息');
    expect(deployedUids(s)).toEqual([b]);
    expect(s.activeGeneral).toBe(b);
    toggleDeploy(s, c);
    moveToInn(s, b);
    expect(deployedUids(s)).toEqual([c]);
    expect(isDeployed(s, b)).toBe(false);
  });

  it('野外战斗带上全部出战副将；读档后还在；掉级不会超出出战位', () => {
    const s = team(60);
    for (const g of s.generals) if (!isDeployed(s, g.uid)) toggleDeploy(s, g.uid);
    const loc = Object.values(locations).find((l) => !l.town && l.groups.length)!;
    const b = startGroupBattle(s, loc.groups[0], 9);
    expect(b.units.filter((u) => u.side === 'ally' && u.kind === 'general').length).toBe(3);
    const s2 = deserialize(serialize(s));
    expect(deployedUids(s2).length).toBe(3);
    s2.player.level = 29;
    expect(deployedUids(s2).length).toBe(1);
  });
});
