// 新手体验：主线里插的四个教学任务（采集、灶台、徽章、布阵）能接能交、做过的接了就算完成；老存档按任务 id 换算位置；
// 江湖指引每条只出一次；国战本国名将助阵、守将带被动
import { describe, expect, it } from 'vitest';
import { acceptQuest, currentQuest, deserialize, migrateMain, newSave, serialize, turnInQuest } from '../src/game/state';
import { gather } from '../src/game/life';
import { cook } from '../src/game/life';
import { findBadge } from '../src/game/badges';
import { setFormation } from '../src/game/formation';
import { pendingTips } from '../src/game/guide';
import { mainQuests } from '../src/data';

const fresh = () => newSave({ server: '豫州', name: '测试', gender: 'male', classId: 'warrior', avatar: 0, seed: 7 });
const at = (id: string) => mainQuests.findIndex((q) => q.id === id);

describe('新手教学任务', () => {
  it('采集、灶台、徽章、布阵四个任务都在主线里，做到了就能交', () => {
    const s = fresh();
    s.player.level = 12;
    s.main.step = at('m7a');
    acceptQuest(s);
    s.location = 'cundong';
    gather(s, 'herb', [2]);
    expect(s.main.state).toBe('ready');
    expect(turnInQuest(s)).toBeTruthy();
    expect(currentQuest(s)?.id).toBe('m7b');
    acceptQuest(s);
    s.location = 'xinshoucun';
    expect(cook(s, 'cai_yaozhou')).toContain('草药粥');
    expect(s.main.state).toBe('ready');
    s.main.step = at('m8a');
    s.main.state = 'available';
    acceptQuest(s);
    findBadge(s, 'cuizhushanzhuang');
    expect(s.main.state).toBe('ready');
    s.main.step = at('m15a');
    s.main.state = 'available';
    acceptQuest(s);
    setFormation(s, 'fengshi');
    expect(s.main.state).toBe('ready');
  });

  it('接任务之前就做过的，接了直接算完成', () => {
    const s = fresh();
    s.flags.badge = true;
    s.main.step = at('m8a');
    acceptQuest(s);
    expect(s.main.state).toBe('ready');
  });

  it('老存档（没有这四个任务的版本）按任务 id 换算到新位置', () => {
    const s = fresh();
    const raw = JSON.parse(serialize(s));
    // 旧表里 m9 是第 9 个
    raw.main = { step: 9, state: 'active', count: 2 };
    const back = deserialize(JSON.stringify(raw));
    expect(mainQuests[back.main.step].id).toBe('m9');
    expect(back.main.count).toBe(2);
    expect(back.main.qv).toBe(2);
    // 已经是新版本的不再换算
    migrateMain(back);
    expect(mainQuests[back.main.step].id).toBe('m9');
    // 旧表全部做完的还是全部做完
    raw.main = { step: 104, state: 'done', count: 0 };
    expect(deserialize(JSON.stringify(raw)).main.step).toBe(mainQuests.length);
  });
});

describe('江湖指引', () => {
  it('到了等级提示新阵法；羁绊成形、福利可领各提示一次；看过的不再出', () => {
    const s = fresh();
    expect(pendingTips(s).length).toBe(0);
    s.player.level = 36;
    s.battles = 10;
    const keys = pendingTips(s).map((t) => t.key);
    expect(keys).toContain('form_yulin');
    expect(keys).toContain('form_heyi');
    expect(keys).not.toContain('form_bagua');
    expect(keys).toContain('supply');
    for (const k of keys) s.flags[`tip_${k}`] = true;
    expect(pendingTips(s).length).toBe(0);
  });
});
