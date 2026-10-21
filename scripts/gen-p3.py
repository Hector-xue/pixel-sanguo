#!/usr/bin/env python3
"""P3 内容生成器：陈留篇、濮阳篇、洛阳篇、长安篇、汉中篇 + 庐江（银两环）的地图、怪物、NPC、主线，
以及 6～16 级装备档、矿石、高级药。可重复运行：每次先删掉上次生成的条目再重建。

数值约定（全部【推定】，原版只查到地名和怪物等级）：
- 怪物等级照攻略原文（道士45 … 黄巾大盗85）摆在陈留、濮阳一线；85 级以后的地图、怪物是自己设计的。
- 任务经验 = 升级所需经验 × 系数；击杀 0.5、收集 0.6、头目 1.0、对话 0.12、引导 0.25。
用法：python3 scripts/gen-p3.py（在仓库根目录）
"""
import json
import os

ROOT = os.path.join(os.path.dirname(__file__), '..', 'src', 'data')


def load(name):
    with open(os.path.join(ROOT, name), encoding='utf-8') as f:
        return json.load(f)


def save(name, data):
    with open(os.path.join(ROOT, name), 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')


def exp_to_next(lv):
    return 30 * lv * lv + 70


# ===================== 怪物 =====================
W = {
    'war': {'con': 1.3, 'str': 1.4, 'int': 0.5, 'agi': 1},
    'tank': {'con': 1.7, 'str': 1.4, 'int': 0.5, 'agi': 0.8},
    'agi': {'con': 1.0, 'str': 1.2, 'int': 0.5, 'agi': 1.6},
    'sch': {'con': 1.1, 'str': 0.6, 'int': 1.5, 'agi': 1.0},
    'mys': {'con': 1.0, 'str': 0.6, 'int': 1.6, 'agi': 1.1},
}

# 怪物经验倍率随等级抬：中后期一级要的经验涨得快，免得练级拖太久（【推定】，用模拟调）
def exp_mul(lv):
    if lv < 60:
        return 1.3
    if lv < 85:
        return 1.6
    if lv < 110:
        return 2.0
    if lv < 135:
        return 2.3
    return 2.6


TIERS = [
    # (档, 等级, 矿石id, 矿石名, 套装名)
    (6, 50, 'hantie', '寒铁矿', '寒铁'),
    (7, 60, 'wujin', '乌金矿', '乌金'),
    (8, 70, 'chijin', '赤金矿', '赤金'),
    (9, 80, 'zijing', '紫晶矿', '紫晶'),
    (10, 90, 'yuntie', '陨铁', '陨铁'),
    (11, 100, 'xingchen', '星辰砂', '星辰'),
    (12, 110, 'longgu', '龙骨', '龙骨'),
    (13, 120, 'fengyu', '凤羽', '凤翎'),
    (14, 130, 'qilinjiao', '麒麟角', '麒麟'),
    (15, 140, 'shentie', '神铁', '神铁'),
    (16, 150, 'hunyuan', '混元晶', '混元'),
]
OLD_ORES = [(2, 10, 'tiekuang'), (3, 20, 'jingtie'), (4, 30, 'jinggang'), (5, 40, 'xuantie')]


def ore_for(lv, step=1):
    chain = OLD_ORES + [(t, l, o) for t, l, o, _, _ in TIERS]
    idx = 0
    for i, (_, l, _) in enumerate(chain):
        if l <= max(lv, 10):
            idx = i
    return chain[min(len(chain) - 1, idx + step - 1)][2]


def drug_for(lv):
    if lv < 70:
        return ('dahuan', 'yulu')
    if lv < 110:
        return ('jiuzhuan', 'qiongjiang')
    return ('xuelian', 'xianlu')


# id: (名字, 职业, 性别, 外形, 权重, 等级, 技能[(id,级,概率)], 额外)
MONSTERS = {
    # —— 陈留篇（攻略原文：道士45、术士/妖人45、僵尸/游魂50、力士/斧手55）——
    'daoshi': ('道士', 'mystic', 'male', 'm_daoshi', 'mys', 45, [('wulei', 3, 0.25)], {}),
    'shushi': ('术士', 'mystic', 'male', 'm_shushi', 'mys', 46, [('hufeng', 3, 0.25), ('wugu', 2, 0.15)], {}),
    'yaoren': ('妖人', 'scholar', 'male', 'm_yaoren', 'sch', 47, [('chenhuo', 3, 0.25)], {'quest': ('fushui', 0.45, 'm40')}),
    'youhun': ('游魂', 'mystic', 'female', 'm_youhun', 'mys', 49, [('wugu', 3, 0.3)], {'capturable': False}),
    'jiangshi': ('僵尸', 'warrior', 'male', 'm_jiangshi', 'tank', 51, [('sheming', 2, 0.15)], {'capturable': False, 'hpMul': 0.8}),
    'lishi': ('力士', 'warrior', 'male', 'm_lishi', 'tank', 54, [('lipi', 3, 0.25)], {}),
    'fushou': ('斧手', 'warrior', 'male', 'm_fushou', 'war', 55, [('sheming', 3, 0.2)], {}),
    'xianfenglingjun': ('西凉先锋领军', 'warrior', 'male', 'm_xianfeng', 'tank', 59, [('lipi', 4, 0.3), ('gujin', 3, 0.1)], {'boss': True}),
    # —— 濮阳篇（恶仆/女贼55、败类/凶徒/恶棍60、黄巾士兵/精兵65、四大盗75、矿石/宝石/白银/黄巾大盗85）——
    'epu': ('恶仆', 'warrior', 'male', 'm_epu', 'agi', 56, [('sheming', 3, 0.15)], {}),
    'nvzei2': ('女贼', 'scholar', 'female', 'm_nvzei', 'sch', 57, [('simian', 3, 0.25)], {'quest': ('zangwu', 0.45, 'm52')}),
    'bailei': ('败类', 'scholar', 'male', 'm_bailei', 'sch', 60, [('huadi', 4, 0.25)], {}),
    'xiongtu': ('凶徒', 'warrior', 'male', 'm_xiongtu', 'war', 61, [('sheming', 4, 0.2)], {}),
    'egun': ('恶棍', 'warrior', 'male', 'm_egun', 'tank', 62, [('lipi', 4, 0.2)], {}),
    'huangjinbing': ('黄巾士兵', 'warrior', 'male', 'm_hjbing', 'war', 65, [('lipi', 3, 0.15)], {}),
    'huangjinjingbing': ('黄巾精兵', 'warrior', 'male', 'm_hjjing', 'tank', 67, [('lipi', 4, 0.2), ('gujin', 3, 0.1)], {}),
    'huangjinqushuai': ('黄巾渠帅', 'mystic', 'male', 'm_hjqushuai', 'mys', 71, [('hufeng', 4, 0.3), ('wulei', 4, 0.2)], {'boss': True}),
    'duxingdadao': ('独行大盗', 'warrior', 'male', 'm_duxing', 'agi', 74, [('sheming', 4, 0.2)], {}),
    'caihuadadao': ('采花大盗', 'scholar', 'male', 'm_caihua', 'sch', 75, [('simian', 4, 0.25)], {}),
    'lvlindadao': ('绿林大盗', 'warrior', 'male', 'm_lvlin', 'war', 76, [('lipi', 4, 0.2)], {}),
    'jiangyangdadao': ('江洋大盗', 'mystic', 'male', 'm_jiangyang', 'mys', 77, [('yaohuo', 4, 0.25)], {'quest': ('cangbaotu', 0.4, 'm64')}),
    'kuangshidadao': ('矿石大盗', 'warrior', 'male', 'm_kuangshi', 'tank', 84, [('lipi', 4, 0.2)], {'oreChance': 0.35}),
    'baoshidadao': ('宝石大盗', 'scholar', 'male', 'm_baoshi', 'sch', 85, [('huadi', 4, 0.25)], {'gemChance': 0.25}),
    'baiyindadao': ('白银大盗', 'warrior', 'male', 'm_baiyin', 'agi', 85, [('sheming', 4, 0.2)], {'silverMul': 6}),
    'huangjindadao': ('黄巾大盗', 'mystic', 'male', 'm_hjdadao', 'mys', 86, [('wulei', 4, 0.25), ('wugu', 4, 0.15)], {}),
    'dadaoshouling': ('黄巾大盗首领', 'warrior', 'male', 'm_dadaoshouling', 'tank', 89, [('lipi', 5, 0.3), ('gujin', 4, 0.15)], {'boss': True}),
    # —— 洛阳篇（85 级以后自己设计）——
    'xiliangtieqi': ('西凉铁骑', 'warrior', 'male', 'm_xltieqi', 'war', 88, [('lipi', 4, 0.2)], {}),
    'xiliangmoushi': ('西凉谋士', 'scholar', 'male', 'm_xlmoushi', 'sch', 89, [('chenhuo', 4, 0.25)], {}),
    'huaxiong': ('华雄', 'warrior', 'male', 'm_huaxiong', 'tank', 93, [('lipi', 5, 0.3), ('sheming', 4, 0.15)], {'boss': True, 'historic': True}),
    'bingzhoulangqi': ('并州狼骑', 'warrior', 'male', 'm_langqi', 'agi', 94, [('sheming', 4, 0.2)], {}),
    'feixiongjun': ('飞熊军', 'warrior', 'male', 'm_feixiong', 'tank', 95, [('lipi', 4, 0.2), ('gujin', 3, 0.1)], {}),
    'lvbu': ('吕布', 'warrior', 'male', 'm_lvbu', 'agi', 100, [('lipi', 5, 0.35), ('sheming', 5, 0.2)], {'boss': True, 'historic': True, 'hpMul': 3.0}),
    'luanbing': ('西凉乱兵', 'warrior', 'male', 'm_luanbing', 'war', 101, [('sheming', 4, 0.2)], {}),
    'daomuzei': ('盗墓贼', 'scholar', 'male', 'm_daomu', 'sch', 103, [('huadi', 4, 0.25)], {}),
    'shimo': ('尸魔', 'mystic', 'male', 'm_shimo', 'mys', 105, [('wugu', 5, 0.3)], {'capturable': False}),
    'liru': ('李儒', 'scholar', 'male', 'm_liru', 'sch', 108, [('simian', 5, 0.3), ('chenhuo', 5, 0.2)], {'boss': True, 'historic': True}),
    # —— 长安篇 ——
    'xiliangshoujun': ('西凉守军', 'warrior', 'male', 'm_xlshoujun', 'tank', 108, [('gujin', 4, 0.15)], {}),
    'xiliangjianshou': ('西凉箭手', 'warrior', 'male', 'm_xljianshou', 'agi', 109, [('sheming', 4, 0.2)], {}),
    'qiangbing': ('羌兵', 'warrior', 'male', 'm_qiangbing', 'agi', 112, [('lipi', 4, 0.2)], {}),
    'qiangwushi': ('羌族巫师', 'mystic', 'female', 'm_qiangwu', 'mys', 113, [('yaohuo', 5, 0.25)], {}),
    'lijuebuqu': ('李傕部曲', 'warrior', 'male', 'm_lijue', 'war', 117, [('lipi', 5, 0.2)], {}),
    'guosibuqu': ('郭汜部曲', 'scholar', 'male', 'm_guosi', 'sch', 118, [('huadi', 5, 0.25)], {}),
    'xiliangqibing': ('西凉骑兵', 'warrior', 'male', 'm_xlqibing', 'agi', 122, [('sheming', 5, 0.2)], {'quest': ('junlingfu', 0.4, 'm92')}),
    'meiwushouwei': ('郿坞守卫', 'warrior', 'male', 'm_meiwu', 'tank', 127, [('gujin', 4, 0.15), ('lipi', 5, 0.2)], {}),
    'dongzhuo': ('董卓', 'warrior', 'male', 'm_dongzhuo', 'tank', 133, [('lipi', 5, 0.3), ('gujin', 5, 0.15)], {'boss': True, 'historic': True, 'hpMul': 3.2}),
    # —— 汉中篇 ——
    'zhandaoshouzu': ('栈道守卒', 'warrior', 'male', 'm_zhandao', 'war', 132, [('lipi', 5, 0.2)], {}),
    'shanxiao': ('山魈', 'mystic', 'male', 'm_shanxiao', 'mys', 134, [('hufeng', 5, 0.25)], {'capturable': False}),
    'weijunhuwei': ('魏军虎卫', 'warrior', 'male', 'm_huwei', 'tank', 138, [('gujin', 5, 0.15), ('lipi', 5, 0.2)], {}),
    'weijungongqi': ('魏军弓骑', 'warrior', 'male', 'm_gongqi', 'agi', 139, [('sheming', 5, 0.2)], {}),
    'guizu': ('五斗米鬼卒', 'warrior', 'male', 'm_guizu', 'war', 143, [('sheming', 5, 0.2)], {}),
    'jijiu': ('五斗米祭酒', 'mystic', 'male', 'm_jijiu', 'mys', 145, [('wulei', 5, 0.25), ('wugu', 5, 0.15)], {'quest': ('fulu', 0.4, 'm102')}),
    'bandunman': ('板楯蛮', 'warrior', 'male', 'm_bandun', 'tank', 149, [('lipi', 5, 0.25)], {}),
    'wugui': ('巫鬼', 'mystic', 'female', 'm_wugui', 'mys', 151, [('yaohuo', 5, 0.25)], {'capturable': False}),
    'tianshihufa': ('天师护法', 'scholar', 'male', 'm_hufa', 'sch', 155, [('simian', 5, 0.25), ('huadi', 5, 0.15)], {}),
    'tianshilishi': ('天师力士', 'warrior', 'male', 'm_tslishi', 'tank', 156, [('lipi', 5, 0.25)], {}),
    'zhanglu': ('张鲁', 'mystic', 'male', 'm_zhanglu', 'mys', 160, [('hufeng', 5, 0.3), ('wulei', 5, 0.25), ('wugu', 5, 0.15)], {'boss': True, 'historic': True, 'hpMul': 3.4}),
    # —— 庐江（银两环）——
    'lujiangtaobing': ('庐江逃兵', 'warrior', 'male', 'm_ljtaobing', 'war', 45, [('sheming', 3, 0.15)], {'quest': ('junzi', 0.5, 'silverRing')}),
}


def monster_def(mid):
    name, cls, gender, look, w, lv, sk, ex = MONSTERS[mid]
    hp, mp = drug_for(lv)
    drops = [{'item': hp, 'chance': 0.05}, {'item': mp, 'chance': 0.04}, {'item': ore_for(lv), 'chance': ex.get('oreChance', 0.05)}]
    if 'gemChance' in ex:
        drops.append({'item': f'gem_{["zuanshi", "lvbaoshi", "hongbaoshi", "lanbaoshi"][len(mid) % 4]}_{min(8, 2 + lv // 40)}', 'chance': ex['gemChance']})
    if 'quest' in ex:
        item, chance, q = ex['quest']
        # 任务物品只在对应主线任务进行时掉：按物品反查任务 id（银两环另算）
        if q != 'silverRing':
            q = next(x['id'] for x in QUESTS if x['type'] == 'collect' and x['target']['item'] == item)
        drops.insert(0, {'item': item, 'chance': chance, 'questOnly': q})
    d = {'name': name, 'class': cls, 'gender': gender, 'look': look, 'weights': W[w],
         'skills': [{'id': i, 'level': l, 'rate': r} for i, l, r in sk], 'drops': drops,
         'expMul': exp_mul(lv)}
    for k in ('hpMul', 'silverMul', 'capturable', 'historic'):
        if k in ex:
            d[k] = ex[k]
    if ex.get('boss'):
        d.update({'boss': True, 'capturable': False, 'noFlee': True, 'hpMul': ex.get('hpMul', 2.6), 'atkMul': 1.0,
                  'expMul': exp_mul(lv) * 6, 'silverMul': 10})
        d['drops'] = [{'item': ore_for(lv, 2), 'chance': 0.8}, {'item': 'gaojibaoxiang', 'chance': 0.5}]
    return d


# ===================== 地图 =====================
def grp(m, lo, hi, cmin=2, cmax=4):
    return {'monster': m, 'level': [lo, hi], 'count': [cmin, cmax]}


def boss(m, lv, escort, elv, n=2):
    return {'monster': m, 'level': [lv, lv], 'count': [1, 1], 'escort': {'monster': escort, 'level': elv, 'count': n}}


FULL = ['hospital', 'weapon', 'temple', 'smith', 'inn', 'bank', 'skillschool', 'stable']
SMALL = ['hospital', 'inn', 'skillschool']
LOCS = {
    # 陈留篇
    'chenliu': ('陈留', 'city', True, {'right': 'zhongmou', 'down': 'chenliujiaowai', 'left': 'dingtao', 'up': 'xianfeng1'}, ['chenliutaishou', 'caocao', 'jiaopai'], FULL + ['arena'], []),
    'chenliujiaowai': ('陈留郊外', 'farm', False, {'up': 'chenliu', 'left': 'chenliuxijiao'}, [], None, [grp('daoshi', 45, 47), grp('shushi', 45, 48)]),
    'chenliuxijiao': ('陈留西郊', 'forest', False, {'right': 'chenliujiaowai', 'down': 'luanzanggang'}, [], None, [grp('yaoren', 46, 49), grp('youhun', 48, 51)]),
    'luanzanggang': ('乱葬岗', 'tomb', False, {'up': 'chenliuxijiao'}, [], None, [grp('jiangshi', 50, 53), grp('youhun', 50, 52)]),
    'xianfeng1': ('先锋一营', 'camp', False, {'down': 'chenliu', 'up': 'xianfeng2'}, [], None, [grp('lishi', 53, 55), grp('fushou', 53, 55)]),
    'xianfeng2': ('先锋二营', 'camp', False, {'down': 'xianfeng1', 'up': 'xianfeng3'}, [], None, [grp('lishi', 54, 56), grp('fushou', 54, 57)]),
    'xianfeng3': ('先锋三营', 'camp', False, {'down': 'xianfeng2', 'up': 'xianfenglingjun', 'left': 'suanzao'}, [], None, [grp('fushou', 55, 58), grp('lishi', 56, 58)]),
    'xianfenglingjun': ('先锋领军', 'gate', False, {'down': 'xianfeng3'}, [], None, [boss('xianfenglingjun', 59, 'fushou', 57)]),
    # 濮阳篇
    'dingtao': ('定陶', 'village', True, {'right': 'chenliu', 'down': 'puyangnanjiao'}, ['dingtaoling'], SMALL + ['smith'], []),
    'puyangnanjiao': ('濮阳南郊', 'manor', False, {'up': 'dingtao', 'down': 'puyang'}, [], None, [grp('epu', 55, 58), grp('nvzei2', 55, 59)]),
    'puyang': ('濮阳', 'city', True, {'up': 'puyangnanjiao', 'left': 'puyangjiaowai', 'down': 'dongjun', 'right': 'juyeze'}, ['puyangtaishou', 'yingbing'], FULL + ['arena'], []),
    'puyangjiaowai': ('濮阳郊外', 'road', False, {'right': 'puyang'}, [], None, [grp('bailei', 59, 62), grp('xiongtu', 60, 63), grp('egun', 61, 64)]),
    'dongjun': ('东郡荒野', 'grass', False, {'up': 'puyang', 'down': 'huangjindaying'}, [], None, [grp('huangjinbing', 64, 67), grp('huangjinjingbing', 65, 67)]),
    'huangjindaying': ('黄巾大营', 'camp', False, {'up': 'dongjun'}, [], None, [grp('huangjinjingbing', 66, 69), boss('huangjinqushuai', 71, 'huangjinjingbing', 68)]),
    'juyeze': ('巨野泽', 'marsh', False, {'left': 'puyang', 'right': 'lvlinzhai'}, [], None, [grp('duxingdadao', 73, 76), grp('caihuadadao', 74, 77)]),
    'lvlinzhai': ('绿林寨', 'valley', False, {'left': 'juyeze', 'down': 'huangjinbaoku'}, [], None, [grp('lvlindadao', 75, 78), grp('jiangyangdadao', 76, 79)]),
    'huangjinbaoku': ('黄巾宝窟', 'cave', False, {'up': 'lvlinzhai', 'down': 'baokushenchu'}, [], None, [grp('kuangshidadao', 83, 86), grp('baoshidadao', 84, 87), grp('baiyindadao', 84, 87)]),
    'baokushenchu': ('宝窟深处', 'cave', False, {'up': 'huangjinbaoku'}, [], None, [grp('huangjindadao', 85, 88), boss('dadaoshouling', 89, 'huangjindadao', 87)]),
    # 洛阳篇
    'suanzao': ('酸枣大营', 'camp', True, {'right': 'xianfeng3', 'left': 'sishuiguan'}, ['yuanshao'], SMALL + ['smith'], []),
    'sishuiguan': ('汜水关', 'gate', False, {'right': 'suanzao', 'left': 'hulaoguan'}, [], None, [grp('xiliangtieqi', 86, 90), grp('xiliangmoushi', 87, 90), boss('huaxiong', 93, 'xiliangtieqi', 90)]),
    'hulaoguan': ('虎牢关', 'gate', False, {'right': 'sishuiguan', 'up': 'hulaochenglou', 'left': 'luoyangdongjiao'}, [], None, [grp('bingzhoulangqi', 92, 96), grp('feixiongjun', 93, 97)]),
    'hulaochenglou': ('虎牢关城楼', 'gate', False, {'down': 'hulaoguan'}, [], None, [boss('lvbu', 100, 'feixiongjun', 97)]),
    'luoyangdongjiao': ('洛阳东郊', 'ruins', False, {'right': 'hulaoguan', 'left': 'luoyang'}, [], None, [grp('luanbing', 99, 103)]),
    'luoyang': ('洛阳', 'city', True, {'right': 'luoyangdongjiao', 'up': 'mangshan', 'down': 'luoyanggong', 'left': 'hanguguan'}, ['wangyun', 'zuoci', 'yuelao'], FULL + ['arena'], []),
    'mangshan': ('邙山', 'hill', False, {'down': 'luoyang', 'up': 'mangshangumu'}, [], None, [grp('daomuzei', 101, 105), grp('luanbing', 101, 104)]),
    'mangshangumu': ('邙山古墓', 'tomb', False, {'down': 'mangshan'}, [], None, [grp('shimo', 103, 107), grp('daomuzei', 104, 107)]),
    'luoyanggong': ('洛阳宫废墟', 'ruins', False, {'up': 'luoyang'}, [], None, [grp('luanbing', 104, 107), boss('liru', 108, 'luanbing', 106)]),
    # 长安篇
    'hanguguan': ('函谷关', 'gate', False, {'right': 'luoyang', 'left': 'tongguan'}, [], None, [grp('xiliangshoujun', 107, 111), grp('xiliangjianshou', 107, 111)]),
    'tongguan': ('潼关', 'pass', False, {'right': 'hanguguan', 'left': 'changanjiaowai'}, [], None, [grp('qiangbing', 111, 115), grp('qiangwushi', 112, 115)]),
    'changanjiaowai': ('长安郊外', 'farm', False, {'right': 'tongguan', 'left': 'changan'}, [], None, [grp('lijuebuqu', 116, 120), grp('guosibuqu', 116, 120)]),
    'changan': ('长安', 'city', True, {'right': 'changanjiaowai', 'up': 'weishui', 'down': 'ziwugu'}, ['jingzhaoyin'], FULL + ['arena'], []),
    'weishui': ('渭水', 'river', False, {'down': 'changan', 'left': 'meiwu'}, [], None, [grp('xiliangqibing', 121, 125)]),
    'meiwu': ('郿坞', 'manor', False, {'right': 'weishui'}, [], None, [grp('meiwushouwei', 126, 130), boss('dongzhuo', 133, 'meiwushouwei', 130)]),
    # 汉中篇
    'ziwugu': ('子午谷', 'pass', False, {'up': 'changan', 'down': 'hanzhong'}, [], None, [grp('zhandaoshouzu', 131, 135), grp('shanxiao', 132, 135)]),
    'hanzhong': ('汉中', 'city', True, {'up': 'ziwugu', 'left': 'dingjunshan', 'right': 'yangpingguan', 'down': 'micangshan'}, ['yanpu'], FULL, []),
    'dingjunshan': ('定军山', 'hill', False, {'right': 'hanzhong'}, [], None, [grp('weijunhuwei', 136, 141), grp('weijungongqi', 137, 141)]),
    'yangpingguan': ('阳平关', 'gate', False, {'left': 'hanzhong'}, [], None, [grp('guizu', 142, 147), grp('jijiu', 143, 147)]),
    'micangshan': ('米仓山', 'pass', False, {'up': 'hanzhong', 'down': 'tianshitan'}, [], None, [grp('bandunman', 148, 152), grp('wugui', 149, 153)]),
    'tianshitan': ('天师坛', 'altar', False, {'up': 'micangshan'}, [], None, [grp('tianshihufa', 153, 157), grp('tianshilishi', 154, 158), boss('zhanglu', 160, 'tianshihufa', 157)]),
    # 庐江（银两环）
    'lujiang': ('庐江', 'village', True, {'up': 'qiaojun', 'down': 'lujiangjiaowai'}, ['lujiangduwei'], SMALL, []),
    'lujiangjiaowai': ('庐江郊外', 'river', False, {'up': 'lujiang'}, [], None, [{'monster': 'lujiangtaobing', 'level': [42, 48], 'count': [2, 4], 'label': '庐江逃兵群'}]),
}

NPCS = {
    'chenliutaishou': ('陈留太守', 'magistrate', ['西凉兵就屯在城北，陈留人心惶惶。']),
    'caocao': ('曹操', 'g_caocao_npc', ['宁我负人，毋人负我……这话你可别往外传。']),
    'jiaopai': ('教派使者', 'm_jiaopai', ['三十四级以后可以入教派，每天做教派任务攒声望。']),
    'dingtaoling': ('定陶令', 'magistrate2', ['濮阳南郊的恶仆横行乡里，没人敢管。']),
    'puyangtaishou': ('濮阳太守', 'official3', ['黄巾余党还在东郡荒野出没。']),
    'yingbing': ('佣兵头领', 'm_yingbing', ['一个人闯太险了，雇几个兄弟一起上吧。']),
    'yuanshao': ('袁绍', 'g_yuanshao_npc', ['十八路诸侯会盟讨董，我是盟主。']),
    'wangyun': ('王允', 'minister', ['洛阳被董贼烧成一片焦土……']),
    'zuoci': ('左慈', 'm_zuoci', ['百级之人，可以脱胎换骨，重选一条路。']),
    'yuelao': ('月老', 'elder', ['有缘千里来相会。']),
    'jingzhaoyin': ('京兆尹', 'official', ['长安城外全是李傕、郭汜的兵。']),
    'yanpu': ('阎圃', 'pedant3', ['汉中是五斗米道的地盘，张天师不好惹。']),
    'lujiangduwei': ('庐江都尉', 'official2', ['逃兵把军需都抢走了。帮我追回来，按件给赏钱。']),
    'wenquxing': ('文曲星', 'm_wenqu', ['每天五道三国题，答对有赏。']),
}


# ===================== 主线 =====================
def q(qid, title, giver, turn, typ, chapter, lv, hint, goal, accept, finish, target=None, flag=None, items=None, k=None):
    kk = k if k is not None else {'kill': 0.5, 'collect': 0.6, 'capture': 0.5, 'talk': 0.12, 'flag': 0.25}[typ]
    if typ == 'kill' and target and MONSTERS[target['monster']][7].get('boss'):
        kk = 1.0
    rew = {'exp': int(round(exp_to_next(lv) * kk / 100.0) * 100), 'silver': int(round(lv * lv * (1.2 if typ in ('kill', 'collect') else 0.6) / 100.0) * 100)}
    if items:
        rew['items'] = items
    d = {'id': qid, 'title': title, 'giver': giver, 'turnIn': turn, 'type': typ, 'hint': hint, 'goal': goal,
         'accept': [{'who': w, 'text': t} for w, t in accept], 'finish': [{'who': w, 'text': t} for w, t in finish],
         'reward': rew, 'chapter': chapter}
    if target:
        d['target'] = target
    if flag:
        d['flag'] = flag
    return d


def kill(m, n, at):
    return {'monster': m, 'count': n, 'at': at}


def collect(item, n, at, m):
    return {'item': item, 'count': n, 'at': at, 'monster': m}


def ore(lv, n=2, step=1):
    return {ore_for(lv, step): n}


QUESTS = [
    # —— 陈留篇 ——
    q('m36', '通往陈留', 'xuling', 'chenliutaishou', 'talk', '陈留篇', 44, '从中牟往左走，到陈留见陈留太守。', '与陈留的陈留太守对话',
      [('xuling', '陈留那边传来消息，西凉兵到了城北，太守在招人。你去吧。')],
      [('chenliutaishou', '许昌令举荐的人？来得正好。'), ('chenliutaishou', '城外不太平：郊外有道士装神弄鬼，西郊闹鬼，北边还屯着西凉兵。')]),
    q('m37', '装神弄鬼', 'chenliutaishou', 'chenliutaishou', 'kill', '陈留篇', 45, '去陈留郊外打败10个道士。陈留往下走。', '打败道士 ×10（陈留郊外）',
      [('chenliutaishou', '郊外那些道士自称太平道余脉，骗了不少乡民。打败十个，让百姓看清楚。')],
      [('chenliutaishou', '有人说他们背后还有术士撑腰。')], kill('daoshi', 10, 'chenliujiaowai'), items=ore(45)),
    q('m38', '入教', 'chenliutaishou', 'jiaopai', 'flag', '陈留篇', 45, '找陈留的教派使者，加入一个教派（功能 → 帮派）。', '加入一个教派',
      [('chenliutaishou', '一个人在外面闯荡，最好有个依靠。城里的教派使者在收人。')],
      [('jiaopai', '入了教，每天来做教派任务，声望高了教里有好处给你。')], flag='joinedSect'),
    q('m39', '术士', 'jiaopai', 'chenliutaishou', 'kill', '陈留篇', 46, '去陈留郊外打败10个术士。', '打败术士 ×10（陈留郊外）',
      [('jiaopai', '郊外的术士会呼风唤雨，你入了教，正好替教里出这口气。')],
      [('chenliutaishou', '术士一倒，道士们就散了。不过西郊的事更邪门。')], kill('shushi', 10, 'chenliujiaowai'), items={'jiuzhuan': 5}),
    q('m40', '符水', 'chenliutaishou', 'chenliutaishou', 'collect', '陈留篇', 47, '去陈留西郊打败妖人，夺回5份符水。', '夺回符水 ×5（陈留西郊）',
      [('chenliutaishou', '西郊的妖人拿符水给人喝，喝了的人就疯了。把符水抢回来，我请大夫看看是什么。')],
      [('chenliutaishou', '大夫说，这符水是拿坟头土调的……乱葬岗那边出事了。')], collect('fushui', 5, 'chenliuxijiao', 'yaoren')),
    q('m41', '游魂', 'chenliutaishou', 'chenliutaishou', 'kill', '陈留篇', 49, '去陈留西郊打败10个游魂。', '打败游魂 ×10（陈留西郊）',
      [('chenliutaishou', '西郊夜里有游魂飘出来，挨着就病。你去镇一镇。')],
      [('chenliutaishou', '游魂都是从乱葬岗那边来的。')], kill('youhun', 10, 'chenliuxijiao'), items=ore(50)),
    q('m42', '乱葬岗', 'chenliutaishou', 'chenliutaishou', 'kill', '陈留篇', 51, '去乱葬岗打败12个僵尸。陈留西郊往下走。', '打败僵尸 ×12（乱葬岗）',
      [('chenliutaishou', '乱葬岗的死人站起来了。妖人作的孽，总得有人收拾。')],
      [('chenliutaishou', '总算安静了。你歇几天，城里新开了擂台，去试试身手。')], kill('jiangshi', 12, 'luanzanggang'), items={'gaojibaoxiang': 1}),
    q('m43', '擂台', 'chenliutaishou', 'chenliutaishou', 'flag', '陈留篇', 51, '在「设施 → 擂台」打一场擂台赛。', '打一场擂台赛',
      [('chenliutaishou', '擂台上都是各地来的好手，打赢了有排位，有赏钱。')],
      [('chenliutaishou', '打得不错。曹孟德在城里招兵，他点名要见你。')], flag='arena'),
    q('m44', '孟德', 'chenliutaishou', 'caocao', 'talk', '陈留篇', 52, '去见陈留的曹操。', '与陈留的曹操对话',
      [('chenliutaishou', '曹操散了家财在陈留募兵，要讨董卓。他在城里。')],
      [('caocao', '我听说了，乱葬岗是你平的。'), ('caocao', '董卓的西凉先锋就扎在北边，三座营盘。帮我拔了它。')]),
    q('m45', '力士', 'caocao', 'caocao', 'kill', '陈留篇', 54, '去先锋一营打败12个力士。陈留往上走。', '打败力士 ×12（先锋一营）',
      [('caocao', '先锋一营的力士力气大，脑子慢。打败十二个。')],
      [('caocao', '好！西凉兵不过如此。')], kill('lishi', 12, 'xianfeng1'), items=ore(54)),
    q('m46', '斧手', 'caocao', 'caocao', 'kill', '陈留篇', 55, '去先锋二营打败12个斧手。', '打败斧手 ×12（先锋二营）',
      [('caocao', '二营的斧手是硬骨头，抗物理不够的别去硬碰。')],
      [('caocao', '你的本事越来越好了。跑环使者那边二环也开了，四十级以上就能接。')], kill('fushou', 12, 'xianfeng2'), items={'jiuzhuan': 5, 'qiongjiang': 5}),
    q('m47', '二环', 'caocao', 'caocao', 'flag', '陈留篇', 55, '在许昌跑环使者那里接二环，跑完第11环。', '跑完二环第11环',
      [('caocao', '跑环能练人。二环从第十一环开始，难一些，赏得也多。')],
      [('caocao', '不错。准备好了，就去端了三营。')], flag='ring2'),
    q('m48', '三营', 'caocao', 'caocao', 'kill', '陈留篇', 57, '去先锋三营打败15个斧手。', '打败斧手 ×15（先锋三营）',
      [('caocao', '三营是西凉先锋的主力。打败十五个斧手，他们的领军就坐不住了。')],
      [('caocao', '领军已经出营了，就在三营上面。')], kill('fushou', 15, 'xianfeng3'), items=ore(57)),
    q('m49', '先锋领军', 'caocao', 'caocao', 'kill', '陈留篇', 59, '去先锋领军打败西凉先锋领军。先锋三营往上走。', '打败西凉先锋领军（先锋领军）',
      [('caocao', '领军身边有斧手护着，抗物理堆高点再去。')],
      [('caocao', '先锋一破，董卓就知道关东有人了。'), ('caocao', '我要去会盟诸侯。你先往东，定陶、濮阳那边也乱，你去看看。')], kill('xianfenglingjun', 1, 'xianfenglingjun'), items={'gaojibaoxiang': 1, 'dajiangjunling': 1}),
    q('m50', '东去定陶', 'caocao', 'dingtaoling', 'talk', '濮阳篇', 59, '从陈留往左走，到定陶见定陶令。', '与定陶的定陶令对话',
      [('caocao', '定陶令是我的旧识，你拿我的信去。')],
      [('dingtaoling', '曹公的信我看了。'), ('dingtaoling', '南边濮阳南郊有户大族，家里的恶仆比强盗还凶。')]),
    # —— 濮阳篇 ——
    q('m51', '恶仆', 'dingtaoling', 'dingtaoling', 'kill', '濮阳篇', 56, '去濮阳南郊打败12个恶仆。定陶往下走。', '打败恶仆 ×12（濮阳南郊）',
      [('dingtaoling', '恶仆仗着主家的势，抢粮抢人。打败十二个。')],
      [('dingtaoling', '那户人家还养了一群女贼，专抢过路的商队。')], kill('epu', 12, 'puyangnanjiao'), items=ore(56)),
    q('m52', '赃物', 'dingtaoling', 'dingtaoling', 'collect', '濮阳篇', 57, '去濮阳南郊打败女贼，夺回6件赃物。', '夺回赃物 ×6（濮阳南郊）',
      [('dingtaoling', '女贼抢走的货要还给商户。夺回六件来。')],
      [('dingtaoling', '商户们感激得很。你去濮阳吧，太守那边更需要人。')], collect('zangwu', 6, 'puyangnanjiao', 'nvzei2'), items={'gaojibaoxiang': 1}),
    q('m53', '濮阳', 'dingtaoling', 'puyangtaishou', 'talk', '濮阳篇', 58, '从濮阳南郊往下走到濮阳，见濮阳太守。', '与濮阳的濮阳太守对话',
      [('dingtaoling', '濮阳就在南郊下面。')],
      [('puyangtaishou', '你就是平了南郊的那位？'), ('puyangtaishou', '濮阳郊外的败类、凶徒、恶棍，三拨人搅在一起，衙门的人都不敢出城。')]),
    q('m54', '败类', 'puyangtaishou', 'puyangtaishou', 'kill', '濮阳篇', 60, '去濮阳郊外打败12个败类。濮阳往左走。', '打败败类 ×12（濮阳郊外）',
      [('puyangtaishou', '先收拾败类，他们是出主意的。')],
      [('puyangtaishou', '败类一倒，凶徒们没了主心骨。')], kill('bailei', 12, 'puyangjiaowai'), items=ore(60)),
    q('m55', '凶徒', 'puyangtaishou', 'puyangtaishou', 'kill', '濮阳篇', 61, '去濮阳郊外打败12个凶徒。', '打败凶徒 ×12（濮阳郊外）',
      [('puyangtaishou', '凶徒下手狠，舍命一击打人不留余地，多备药。')],
      [('puyangtaishou', '城里新开了训练场，交银子就能挂着练，出远门前去练练。')], kill('xiongtu', 12, 'puyangjiaowai'), items={'jiuzhuan': 8}),
    q('m56', '训练', 'puyangtaishou', 'puyangtaishou', 'flag', '濮阳篇', 61, '在「功能 → 训练」开始一次训练。', '开始一次训练',
      [('puyangtaishou', '训练按时辰收银子，人不在也照样涨经验。')],
      [('puyangtaishou', '好。剩下的恶棍交给你了。')], flag='trained'),
    q('m57', '恶棍', 'puyangtaishou', 'puyangtaishou', 'kill', '濮阳篇', 62, '去濮阳郊外打败12个恶棍。', '打败恶棍 ×12（濮阳郊外）',
      [('puyangtaishou', '恶棍皮糙肉厚，耐心点打。')],
      [('puyangtaishou', '郊外总算能走人了。可东郡荒野那边，黄巾的旗子又竖起来了。')], kill('egun', 12, 'puyangjiaowai'), items=ore(62)),
    q('m58', '黄巾再起', 'puyangtaishou', 'puyangtaishou', 'kill', '濮阳篇', 65, '去东郡荒野打败15个黄巾士兵。濮阳往下走。', '打败黄巾士兵 ×15（东郡荒野）',
      [('puyangtaishou', '黄巾余党在东郡荒野聚了上千人。先打散他们的士兵。')],
      [('puyangtaishou', '他们退回大营了。黄巾大营里的精兵才是硬茬。')], kill('huangjinbing', 15, 'dongjun'), items={'gaojibaoxiang': 1}),
    q('m59', '黄巾精兵', 'puyangtaishou', 'puyangtaishou', 'kill', '濮阳篇', 67, '去黄巾大营打败15个黄巾精兵。东郡荒野往下走。', '打败黄巾精兵 ×15（黄巾大营）',
      [('puyangtaishou', '精兵会用固若金汤，打的时候先耗掉他们。')],
      [('puyangtaishou', '渠帅坐不住了。')], kill('huangjinjingbing', 15, 'huangjindaying'), items=ore(67)),
    q('m60', '渠帅', 'puyangtaishou', 'puyangtaishou', 'kill', '濮阳篇', 71, '去黄巾大营打败黄巾渠帅。', '打败黄巾渠帅（黄巾大营）',
      [('puyangtaishou', '渠帅会呼风唤雨，身边带着精兵。多带几个副将。')],
      [('puyangtaishou', '东郡平了。可黄巾的宝藏还在，听说埋在巨野泽那边。'), ('puyangtaishou', '跑环使者说三环也开了，六十级以上能接。')], kill('huangjinqushuai', 1, 'huangjindaying'), items={'gaojibaoxiang': 2, 'jiangjunling': 1}),
    q('m61', '三环', 'puyangtaishou', 'puyangtaishou', 'flag', '濮阳篇', 72, '在许昌跑环使者那里接三环，跑完第21环。', '跑完三环第21环',
      [('puyangtaishou', '巨野泽里大盗多，先去跑跑三环练练手。')],
      [('puyangtaishou', '好身手。巨野泽在濮阳右边。')], flag='ring3'),
    q('m62', '独行大盗', 'puyangtaishou', 'puyangtaishou', 'kill', '濮阳篇', 74, '去巨野泽打败12个独行大盗。濮阳往右走。', '打败独行大盗 ×12（巨野泽）',
      [('puyangtaishou', '独行大盗来去如风，速度快，先手打你。')],
      [('puyangtaishou', '泽里还有采花大盗，专挑落单的下手。')], kill('duxingdadao', 12, 'juyeze'), items=ore(74)),
    q('m63', '采花大盗', 'puyangtaishou', 'puyangtaishou', 'kill', '濮阳篇', 75, '去巨野泽打败12个采花大盗。', '打败采花大盗 ×12（巨野泽）',
      [('puyangtaishou', '采花大盗会四面楚歌，中了就动不了。带上会暗渡陈仓的副将。')],
      [('puyangtaishou', '大盗们都往绿林寨跑了。')], kill('caihuadadao', 12, 'juyeze'), items={'jiuzhuan': 10}),
    q('m64', '藏宝图', 'puyangtaishou', 'puyangtaishou', 'collect', '濮阳篇', 77, '去绿林寨打败江洋大盗，夺回5片藏宝图残片。', '夺回藏宝图残片 ×5（绿林寨）',
      [('puyangtaishou', '黄巾宝藏的藏宝图被撕成几片，在江洋大盗手里。')],
      [('puyangtaishou', '图拼起来了——宝窟就在绿林寨底下！')], collect('cangbaotu', 5, 'lvlinzhai', 'jiangyangdadao')),
    q('m65', '绿林', 'puyangtaishou', 'puyangtaishou', 'kill', '濮阳篇', 77, '去绿林寨打败15个绿林大盗。', '打败绿林大盗 ×15（绿林寨）',
      [('puyangtaishou', '下宝窟之前，先把寨子里的绿林大盗清干净，免得被抄后路。')],
      [('puyangtaishou', '路通了。宝窟里面的大盗……听说一个个都抱着金银。')], kill('lvlindadao', 15, 'lvlinzhai'), items=ore(77)),
    q('m66', '宝窟', 'puyangtaishou', 'puyangtaishou', 'kill', '濮阳篇', 84, '去黄巾宝窟打败12个矿石大盗。绿林寨往下走。', '打败矿石大盗 ×12（黄巾宝窟）',
      [('puyangtaishou', '宝窟里分了好几伙：矿石大盗、宝石大盗、白银大盗，各守一摊。')],
      [('puyangtaishou', '矿石你留着打装备吧。')], kill('kuangshidadao', 12, 'huangjinbaoku'), items=ore(84)),
    q('m67', '白银大盗', 'puyangtaishou', 'puyangtaishou', 'kill', '濮阳篇', 85, '去黄巾宝窟打败12个白银大盗。', '打败白银大盗 ×12（黄巾宝窟）',
      [('puyangtaishou', '白银大盗身上银子多，打下来都是你的。')],
      [('puyangtaishou', '首领就在宝窟深处。')], kill('baiyindadao', 12, 'huangjinbaoku'), items={'gaojibaoxiang': 1}),
    q('m68', '大盗首领', 'puyangtaishou', 'puyangtaishou', 'kill', '濮阳篇', 89, '去宝窟深处打败黄巾大盗首领。黄巾宝窟往下走。', '打败黄巾大盗首领（宝窟深处）',
      [('puyangtaishou', '首领会力劈华山，还有黄巾大盗护着。这是濮阳最后一仗。')],
      [('puyangtaishou', '黄巾宝藏充了军饷，濮阳总算太平。'), ('puyangtaishou', '曹公派人来，说十八路诸侯在酸枣会盟，请你过去。')], kill('dadaoshouling', 1, 'baokushenchu'), items={'gaojibaoxiang': 2, 'dajiangjunling': 1}),
    q('m69', '会盟', 'puyangtaishou', 'yuanshao', 'talk', '洛阳篇', 86, '去酸枣大营见盟主袁绍。陈留往上到先锋三营，再往左。', '与酸枣大营的袁绍对话',
      [('puyangtaishou', '酸枣在先锋三营西边。')],
      [('yuanshao', '曹孟德举荐的人？'), ('yuanshao', '董卓派华雄守汜水关，已经斩了我们好几员将。')]),
    # —— 洛阳篇 ——
    q('m70', '汜水关', 'yuanshao', 'yuanshao', 'kill', '洛阳篇', 88, '去汜水关打败15个西凉铁骑。酸枣大营往左走。', '打败西凉铁骑 ×15（汜水关）',
      [('yuanshao', '关前的西凉铁骑先清掉。')],
      [('yuanshao', '铁骑退了，关上还有谋士出主意。')], kill('xiliangtieqi', 15, 'sishuiguan'), items=ore(88)),
    q('m71', '西凉谋士', 'yuanshao', 'yuanshao', 'kill', '洛阳篇', 89, '去汜水关打败12个西凉谋士。', '打败西凉谋士 ×12（汜水关）',
      [('yuanshao', '谋士会趁火打劫，让你的人自相残杀。')],
      [('yuanshao', '华雄没了帮手，就看你了。')], kill('xiliangmoushi', 12, 'sishuiguan'), items={'jiuzhuan': 10, 'qiongjiang': 10}),
    q('m72', '斩华雄', 'yuanshao', 'yuanshao', 'kill', '洛阳篇', 93, '去汜水关打败华雄。', '打败华雄（汜水关）',
      [('yuanshao', '酒还温着，等你回来喝。')],
      [('yuanshao', '酒尚温时斩华雄！诸侯都在传你的名字。'), ('yuanshao', '下一关是虎牢关，守关的是吕布。')], kill('huaxiong', 1, 'sishuiguan'), items={'gaojibaoxiang': 2}),
    q('m73', '并州狼骑', 'yuanshao', 'yuanshao', 'kill', '洛阳篇', 94, '去虎牢关打败15个并州狼骑。汜水关往左走。', '打败并州狼骑 ×15（虎牢关）',
      [('yuanshao', '吕布的并州狼骑快得很，出手总在你前头。')],
      [('yuanshao', '狼骑散了，飞熊军还守着关。')], kill('bingzhoulangqi', 15, 'hulaoguan'), items=ore(94)),
    q('m74', '飞熊军', 'yuanshao', 'yuanshao', 'kill', '洛阳篇', 95, '去虎牢关打败15个飞熊军。', '打败飞熊军 ×15（虎牢关）',
      [('yuanshao', '飞熊军是董卓的亲兵，甲厚。')],
      [('yuanshao', '吕布亲自上城楼了。百级以下的人，别去送死。')], kill('feixiongjun', 15, 'hulaoguan'), items={'gaojibaoxiang': 1}),
    q('m75', '三英', 'yuanshao', 'yuanshao', 'kill', '洛阳篇', 100, '去虎牢关城楼打败吕布。虎牢关往上走。', '打败吕布（虎牢关城楼）',
      [('yuanshao', '人中吕布，马中赤兔。你要是能胜他，天下谁还敢小看你。')],
      [('yuanshao', '吕布退了！董卓烧了洛阳，挟天子去了长安。'), ('yuanshao', '洛阳城里王司徒还在，你去看看。')], kill('lvbu', 1, 'hulaochenglou'), items={'gaojibaoxiang': 2, 'dajiangjunling': 1}),
    q('m76', '焦土', 'yuanshao', 'wangyun', 'talk', '洛阳篇', 100, '过虎牢关、洛阳东郊，到洛阳见王允。', '与洛阳的王允对话',
      [('yuanshao', '洛阳在虎牢关西边。')],
      [('wangyun', '洛阳……只剩这些了。'), ('wangyun', '城里有位左慈先生，他说百级的人可以脱胎换骨。你去见见他。')]),
    q('m77', '转职', 'wangyun', 'zuoci', 'flag', '洛阳篇', 100, '找洛阳的左慈转职（重选性别、职业和头像）。不转职等级停在100级。', '完成转职',
      [('wangyun', '左慈先生就在城里。')],
      [('zuoci', '脱胎换骨，前路就宽了。往后的等级可以一直练到一百六十。')], flag='reborn'),
    q('m78', '东郊乱兵', 'zuoci', 'wangyun', 'kill', '洛阳篇', 101, '去洛阳东郊打败15个西凉乱兵。洛阳往右走。', '打败西凉乱兵 ×15（洛阳东郊）',
      [('zuoci', '王司徒正为城外的乱兵发愁，你去帮他。')],
      [('wangyun', '乱兵是董卓走时留下的，专挖皇陵。邙山那边更乱。')], kill('luanbing', 15, 'luoyangdongjiao'), items=ore(101)),
    q('m79', '邙山', 'wangyun', 'wangyun', 'kill', '洛阳篇', 103, '去邙山打败15个盗墓贼。洛阳往上走。', '打败盗墓贼 ×15（邙山）',
      [('wangyun', '邙山埋着历代帝王，盗墓贼成群结队。')],
      [('wangyun', '古墓里还有东西爬出来，叫什么尸魔。')], kill('daomuzei', 15, 'mangshan'), items={'xuelian': 5}),
    q('m80', '尸魔', 'wangyun', 'wangyun', 'kill', '洛阳篇', 105, '去邙山古墓打败12个尸魔。邙山往上走。', '打败尸魔 ×12（邙山古墓）',
      [('wangyun', '尸魔会下巫蛊，毒能叠好几层。')],
      [('wangyun', '古墓封上了。可放火烧城的李儒还藏在宫里。')], kill('shimo', 12, 'mangshangumu'), items=ore(105)),
    q('m81', '李儒', 'wangyun', 'wangyun', 'kill', '洛阳篇', 108, '去洛阳宫废墟打败李儒。洛阳往下走。', '打败李儒（洛阳宫废墟）',
      [('wangyun', '李儒是董卓的谋主，烧洛阳就是他出的主意。')],
      [('wangyun', '李儒伏诛。董卓在长安，你往西去。函谷关、潼关都有西凉兵。')], kill('liru', 1, 'luoyanggong'), items={'gaojibaoxiang': 2}),
    # —— 长安篇 ——
    q('m82', '函谷关', 'wangyun', 'wangyun', 'kill', '长安篇', 109, '去函谷关打败15个西凉守军。洛阳往左走。', '打败西凉守军 ×15（函谷关）',
      [('wangyun', '函谷关是西去长安的门户。')],
      [('wangyun', '守军退了，关上还有箭手。')], kill('xiliangshoujun', 15, 'hanguguan'), items=ore(109)),
    q('m83', '西凉箭手', 'wangyun', 'wangyun', 'kill', '长安篇', 110, '去函谷关打败15个西凉箭手。', '打败西凉箭手 ×15（函谷关）',
      [('wangyun', '箭手速度快，躲避高的人才好对付。')],
      [('wangyun', '函谷关通了。潼关外是羌人的地方。')], kill('xiliangjianshou', 15, 'hanguguan'), items={'xuelian': 5, 'xianlu': 5}),
    q('m84', '羌兵', 'wangyun', 'wangyun', 'kill', '长安篇', 113, '去潼关打败15个羌兵。函谷关往左走。', '打败羌兵 ×15（潼关）',
      [('wangyun', '董卓收了不少羌兵，守在潼关。')],
      [('wangyun', '羌人的巫师还在关上作法。')], kill('qiangbing', 15, 'tongguan'), items=ore(113)),
    q('m85', '羌族巫师', 'wangyun', 'jingzhaoyin', 'kill', '长安篇', 114, '去潼关打败12个羌族巫师，然后去长安见京兆尹。', '打败羌族巫师 ×12（潼关）',
      [('wangyun', '过了潼关就是长安。京兆尹是我的人，你去找他。')],
      [('jingzhaoyin', '王司徒的信我收到了。'), ('jingzhaoyin', '城外全是李傕、郭汜的部曲。')], kill('qiangwushi', 12, 'tongguan'), items={'gaojibaoxiang': 1}),
    q('m86', '李傕', 'jingzhaoyin', 'jingzhaoyin', 'kill', '长安篇', 118, '去长安郊外打败15个李傕部曲。长安往右走。', '打败李傕部曲 ×15（长安郊外）',
      [('jingzhaoyin', '李傕的兵抢了半个长安。')],
      [('jingzhaoyin', '郭汜那边也得收拾。')], kill('lijuebuqu', 15, 'changanjiaowai'), items=ore(118)),
    q('m87', '郭汜', 'jingzhaoyin', 'jingzhaoyin', 'kill', '长安篇', 118, '去长安郊外打败15个郭汜部曲。', '打败郭汜部曲 ×15（长安郊外）',
      [('jingzhaoyin', '郭汜的人会画地为牢，被围住就只能挨打。')],
      [('jingzhaoyin', '渭水边上还有西凉骑兵，他们手里有董卓的军令符。')], kill('guosibuqu', 15, 'changanjiaowai'), items={'xuelian': 8}),
    q('m88', '军令符', 'jingzhaoyin', 'jingzhaoyin', 'collect', '长安篇', 122, '去渭水打败西凉骑兵，夺回6块军令符。长安往上走。', '夺回军令符 ×6（渭水）',
      [('jingzhaoyin', '有了军令符，就能调开郿坞的守卫。')],
      [('jingzhaoyin', '军令符齐了。')], collect('junlingfu', 6, 'weishui', 'xiliangqibing'), items=ore(122)),
    q('m89', '渭水', 'jingzhaoyin', 'jingzhaoyin', 'kill', '长安篇', 123, '去渭水打败15个西凉骑兵。', '打败西凉骑兵 ×15（渭水）',
      [('jingzhaoyin', '骑兵不除，郿坞随时有援兵。')],
      [('jingzhaoyin', '董卓就在郿坞，渭水往左。')], kill('xiliangqibing', 15, 'weishui'), items={'gaojibaoxiang': 1}),
    q('m90', '郿坞', 'jingzhaoyin', 'jingzhaoyin', 'kill', '长安篇', 128, '去郿坞打败15个郿坞守卫。', '打败郿坞守卫 ×15（郿坞）',
      [('jingzhaoyin', '郿坞城墙和长安一样高，里面囤的粮够吃三十年。')],
      [('jingzhaoyin', '守卫垮了，董卓无路可走了。')], kill('meiwushouwei', 15, 'meiwu'), items=ore(128)),
    q('m91', '董卓', 'jingzhaoyin', 'jingzhaoyin', 'kill', '长安篇', 133, '去郿坞打败董卓。', '打败董卓（郿坞）',
      [('jingzhaoyin', '这一仗，天下人都看着。')],
      [('jingzhaoyin', '国贼伏诛！'), ('jingzhaoyin', '长安的事完了。汉中的阎圃派人来求援，说五斗米道作乱。子午谷往下就是汉中。')], kill('dongzhuo', 1, 'meiwu'), items={'gaojibaoxiang': 3, 'dajiangjunling': 1}),
    # —— 汉中篇 ——
    q('m92', '子午谷', 'jingzhaoyin', 'yanpu', 'kill', '汉中篇', 133, '去子午谷打败15个栈道守卒，然后到汉中见阎圃。长安往下走。', '打败栈道守卒 ×15（子午谷）',
      [('jingzhaoyin', '子午谷的栈道被五斗米道的人把守着。')],
      [('yanpu', '你从子午谷过来的？那条路可不好走。'), ('yanpu', '谷里还有山魈，夜里会学人说话。')], kill('zhandaoshouzu', 15, 'ziwugu'), items=ore(133)),
    q('m93', '山魈', 'yanpu', 'yanpu', 'kill', '汉中篇', 134, '去子午谷打败12个山魈。汉中往上走。', '打败山魈 ×12（子午谷）',
      [('yanpu', '山魈会呼风唤雨，商队都不敢走子午谷。')],
      [('yanpu', '谷道通了。定军山上又来了一伙魏军。')], kill('shanxiao', 12, 'ziwugu'), items={'xuelian': 10, 'xianlu': 8}),
    q('m94', '魏军虎卫', 'yanpu', 'yanpu', 'kill', '汉中篇', 139, '去定军山打败15个魏军虎卫。汉中往左走。', '打败魏军虎卫 ×15（定军山）',
      [('yanpu', '虎卫是曹家的精锐。')],
      [('yanpu', '弓骑还在山上放冷箭。')], kill('weijunhuwei', 15, 'dingjunshan'), items=ore(139)),
    q('m95', '魏军弓骑', 'yanpu', 'yanpu', 'kill', '汉中篇', 139, '去定军山打败15个魏军弓骑。', '打败魏军弓骑 ×15（定军山）',
      [('yanpu', '弓骑来去快，躲避高。')],
      [('yanpu', '定军山清了。阳平关里是五斗米道的鬼卒。')], kill('weijungongqi', 15, 'dingjunshan'), items={'gaojibaoxiang': 1}),
    q('m96', '鬼卒', 'yanpu', 'yanpu', 'kill', '汉中篇', 145, '去阳平关打败15个五斗米鬼卒。汉中往右走。', '打败五斗米鬼卒 ×15（阳平关）',
      [('yanpu', '入道的人头一年叫鬼卒。张天师手下有上万。')],
      [('yanpu', '祭酒身上带着符箓，拿来我认认。')], kill('guizu', 15, 'yangpingguan'), items=ore(145)),
    q('m97', '符箓', 'yanpu', 'yanpu', 'collect', '汉中篇', 145, '去阳平关打败五斗米祭酒，夺回6张符箓。', '夺回符箓 ×6（阳平关）',
      [('yanpu', '祭酒的符箓是天师亲手画的，能看出天师坛在哪。')],
      [('yanpu', '天师坛在米仓山底下。山里的板楯蛮是张鲁的盟友。')], collect('fulu', 6, 'yangpingguan', 'jijiu'), items={'xuelian': 10}),
    q('m98', '板楯蛮', 'yanpu', 'yanpu', 'kill', '汉中篇', 150, '去米仓山打败15个板楯蛮。汉中往下走。', '打败板楯蛮 ×15（米仓山）',
      [('yanpu', '板楯蛮打仗不要命，刀砍上去都不躲。')],
      [('yanpu', '山里还有巫鬼，是蛮人供的邪神。')], kill('bandunman', 15, 'micangshan'), items=ore(150)),
    q('m99', '巫鬼', 'yanpu', 'yanpu', 'kill', '汉中篇', 151, '去米仓山打败15个巫鬼。', '打败巫鬼 ×15（米仓山）',
      [('yanpu', '巫鬼的妖火能烧一片，抗妖火的宝石带上。')],
      [('yanpu', '天师坛就在山底。护法和力士守着。')], kill('wugui', 15, 'micangshan'), items={'gaojibaoxiang': 1}),
    q('m100', '天师护法', 'yanpu', 'yanpu', 'kill', '汉中篇', 155, '去天师坛打败15个天师护法。米仓山往下走。', '打败天师护法 ×15（天师坛）',
      [('yanpu', '护法会四面楚歌，一个人去会被围死。')],
      [('yanpu', '还剩力士。')], kill('tianshihufa', 15, 'tianshitan'), items=ore(155)),
    q('m101', '天师力士', 'yanpu', 'yanpu', 'kill', '汉中篇', 156, '去天师坛打败15个天师力士。', '打败天师力士 ×15（天师坛）',
      [('yanpu', '力士是张天师的贴身护卫。')],
      [('yanpu', '张鲁要亲自出手了。')], kill('tianshilishi', 15, 'tianshitan'), items={'xuelian': 10, 'xianlu': 10}),
    q('m102', '天师', 'yanpu', 'yanpu', 'kill', '汉中篇', 160, '去天师坛打败张鲁。', '打败张鲁（天师坛）',
      [('yanpu', '张天师在汉中二十多年，五斗米道的法术都在他身上。这是最后一仗。')],
      [('yanpu', '张天师认输了，愿意散了道众。'), ('yanpu', '从新手村一路走到汉中，你已经是天下有名的人物。')], kill('zhanglu', 1, 'tianshitan'), items={'gaojibaoxiang': 3, 'dajiangjunling': 2}),
    q('m103', '天下', 'yanpu', 'yanpu', 'talk', '汉中篇', 160, '主线全部完成。', '与阎圃对话',
      [('yanpu', '往后的天下，就看你自己了。')],
      [('yanpu', '擂台、斗将台、排行榜、跑环……想去哪就去哪吧。')]),
]
# 引导任务和主线里的收集物品的出处：怪物表里的 questOnly 要和任务 id 对上
assert {q_['id'] for q_ in QUESTS if q_['type'] == 'collect'} >= {'m40', 'm52', 'm64', 'm88', 'm97'}

QUEST_ITEMS = {
    'fushui': ('符水', '妖人拿来骗人的符水'),
    'zangwu': ('赃物', '女贼抢走的商货'),
    'cangbaotu': ('藏宝图残片', '黄巾宝藏的藏宝图碎片'),
    'junlingfu': ('军令符', '董卓的军令符'),
    'fulu': ('符箓', '五斗米道祭酒的符箓'),
}

DRUGS = {
    'jiuzhuan': {'name': '九转丹', 'cat': 'drug', 'hp': 3500, 'price': 900},
    'xuelian': {'name': '天山雪莲', 'cat': 'drug', 'hp': 8000, 'price': 2200},
    'qiongjiang': {'name': '琼浆', 'cat': 'drug', 'mp': 700, 'price': 300},
    'xianlu': {'name': '仙露', 'cat': 'drug', 'mp': 1600, 'price': 750},
}


def main():
    monsters = load('monsters.json')
    maps = load('maps.json')
    npcs = load('npcs.json')
    quests = load('quests.json')
    items = load('items.json')
    equips = load('equips.json')
    balance = load('balance.json')

    # 怪物
    for mid in MONSTERS:
        monsters[mid] = monster_def(mid)
    monsters['_srcP3'] = 'P3：道士45、术士/妖人45、僵尸/游魂50、力士/斧手55、恶仆/女贼55、败类/凶徒/恶棍60、黄巾士兵/精兵65、独行/采花/绿林/江洋大盗75、矿石/宝石/白银/黄巾大盗85 的名字和等级【实锤，攻略原文】；具体摆在哪张图、属性、技能、掉落【推定】；85级以后（华雄、吕布、李儒、董卓、张鲁一线）全部自己设计【推定】'

    # 地图
    locs = maps['locations']
    for lid, (name, art, town, exits, npc, fac, groups) in LOCS.items():
        d = {'name': name, 'art': art, 'exits': exits, 'npcs': npc, 'groups': groups}
        if town:
            d['town'] = True
            d['facilities'] = fac
        locs[lid] = d
    locs['zhongmou']['exits']['left'] = 'chenliu'
    locs['qiaojun']['exits']['down'] = 'lujiang'
    maps['locked'] = {}
    maps['_srcP3'] = '陈留 → 陈留郊外 → 陈留西郊 → 先锋一营…先锋领军；定陶 → 濮阳南郊 → 濮阳郊外；洛阳、虎牢关、庐江 这些地名【实锤】；地图怎么连、85级以后的地图【推定】'
    # 出口要成对
    for lid, d in locs.items():
        for dirn, to in d['exits'].items():
            if to.startswith('@'):
                continue
            back = {'up': 'down', 'down': 'up', 'left': 'right', 'right': 'left'}[dirn]
            assert locs[to]['exits'].get(back) == lid, f'{lid}.{dirn} -> {to} 不成对'

    # NPC
    for nid, (name, look, lines) in NPCS.items():
        d = {'name': name, 'look': look, 'lines': lines}
        if nid == 'lujiangduwei':
            d['silverRing'] = True
        if nid == 'zuoci':
            d['rebirth'] = True
        if nid == 'jiaopai':
            d['sect'] = True
        if nid == 'yingbing':
            d['mercenary'] = True
        if nid == 'yuelao':
            d['marriage'] = True
        if nid == 'wenquxing':
            d['wenqu'] = True
        npcs[nid] = d
    # 许昌加文曲星和跳蚤市场
    xc = locs['xuchang']
    if 'wenquxing' not in xc['npcs']:
        xc['npcs'].append('wenquxing')
    if 'market' not in xc['facilities']:
        xc['facilities'].append('market')

    # 主线：m35 改成真正的过渡，m36 以后整段重建
    main_q = [x for x in quests['main'] if int(x['id'][1:]) <= 35]
    m35 = main_q[-1]
    m35['finish'] = [{'who': 'xuling', 'text': '陈留的路打通了。歇够了，就往西去吧。'}]
    m35['hint'] = '许昌篇完成了，回许昌令那里交差。'
    quests['main'] = main_q + QUESTS

    # 物品：任务物品、高级药、新矿石
    for iid, (name, desc) in QUEST_ITEMS.items():
        items[iid] = {'name': name, 'cat': 'misc', 'quest': True, 'price': 0, 'desc': desc}
    items['junzi'] = {'name': '军资', 'cat': 'misc', 'price': 0, 'desc': '庐江逃兵抢走的军资，交给庐江都尉换赏钱'}
    # 药放在原有药品后面（字典顺序决定医馆列表顺序）
    rebuilt = {}
    for k, v in items.items():
        rebuilt[k] = v
        if k == 'dahuan':
            rebuilt['jiuzhuan'] = DRUGS['jiuzhuan']
            rebuilt['xuelian'] = DRUGS['xuelian']
        if k == 'yulu':
            rebuilt['qiongjiang'] = DRUGS['qiongjiang']
            rebuilt['xianlu'] = DRUGS['xianlu']
    items = rebuilt
    prev = 'xuantie'
    for t, lv, oid, oname, _ in TIERS:
        # 卖价是打造费的十分之一左右，免得打怪掉矿卖钱比打造还赚
        price = lv * lv
        items[oid] = {'name': oname, 'cat': 'ore', 'price': price, 'tier': t, 'desc': f'打造{t}级装备用的矿石，3块{items[prev]["name"]}可以合成1块'}
        prev = oid
    # 宝石珍矿放到矿石链后面，保持矿石链连续
    zk = items.pop('zhenkuang')
    items['zhenkuang'] = zk

    # 装备档 6～16
    eq = equips
    eq['tiers'] = eq['tiers'][:5]
    for k in list(eq['stats']):
        for s_ in eq['stats'][k]:
            eq['stats'][k][s_] = eq['stats'][k][s_][:5]
    for k in eq['names']:
        if k == 'weapon':
            for c in eq['names']['weapon']:
                eq['names']['weapon'][c] = eq['names']['weapon'][c][:5]
        else:
            eq['names'][k] = eq['names'][k][:5]
    eq['sockets'] = eq['sockets'][:5]
    eq['attrReq']['weapon'] = eq['attrReq']['weapon'][:5]
    SUFFIX = {'head': '盔', 'neck': '项链', 'wrist': '护腕', 'armor': '甲', 'boots': '靴'}
    WSUF = {'warrior': '剑', 'scholar': '扇', 'mystic': '杖'}
    for t, lv, oid, _, setname in TIERS:
        eq['tiers'].append({'level': lv, 'ore': oid, 'oreN': 3, 'silver': int(round(lv * lv * 5 / 1000.0) * 1000)})
        r = lv / 40.0
        for slot, st in eq['stats'].items():
            for key, arr in st.items():
                if key in ('crit', 'counter', 'dodge'):
                    arr.append(min(12, arr[4] + (t - 5)))
                elif key == 'phys':
                    arr.append(arr[4] + 5 * (t - 5))
                else:
                    arr.append(int(round(arr[4] * r)))
        for slot, suf in SUFFIX.items():
            eq['names'][slot].append(setname + suf)
        for c, suf in WSUF.items():
            eq['names']['weapon'][c].append(setname + suf)
        eq['sockets'].append(2 if t <= 10 else 3)
        eq['attrReq']['weapon'].append(int(lv * 0.9))
    eq['_srcP3'] = '6～16级装备（50～150级）、矿石名、套装名全部【推定】：原版只查到玄铁一套'

    # 平衡表：转职前等级上限、化境、矿石合成费、宝石上限
    balance['levelCapBeforeRebirth'] = 100
    balance['_levelCapSrc'] = '【实锤】100级可以转职，排行榜上有160级的；【推定】不转职停在100级'
    balance['ore']['combineSilver'] = [200, 600, 1500] + [int(round(l * l * 1.2 / 100.0) * 100) for _, l, _, _, _ in TIERS]
    balance['skill']['huajingLevel'] = 90
    balance['skill']['huajingMul'] = 1.25
    balance['skill']['_huajingSrc'] = '【实锤】90级并且熟练度满了，技能进入化境；【推定】化境算第6级，威力再乘1.25'
    balance['gem']['maxLevel'] = 8
    balance['gem']['combineSilver'] = [300, 1000, 3000, 8000, 20000, 50000, 120000]
    items['gems']['levels'] = 8

    save('monsters.json', monsters)
    save('maps.json', maps)
    save('npcs.json', npcs)
    save('quests.json', quests)
    save('items.json', items)
    save('equips.json', equips)
    save('balance.json', balance)
    print('monsters', len(MONSTERS), 'locations', len(LOCS), 'quests', len(QUESTS), 'tiers', len(equips['tiers']))


if __name__ == '__main__':
    main()
