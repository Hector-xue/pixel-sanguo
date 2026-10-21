// 云存档面板：登录 / 注册、上传、下载、历史版本、自动同步。游戏里从「功能 → 退出」进，标题页也能进（换新设备时下载存档）。
import Phaser from 'phaser';
import { C } from '../art/palette';
import { classes } from '../data';
import type { ClassId } from '../core/types';
import {
  changePassword, download, info, loadCred, login, logout, markApplied, register, setAuto, upload,
} from '../game/cloud';
import type { CloudError, CloudInfo, CloudSummary } from '../game/cloud';
import { deserialize } from '../game/state';
import { store } from '../game/store';
import { overlayInput } from './input';
import { Button, Modal, confirm, frame, text, toast } from './widgets';

function when(t: number): string {
  if (!t) return '-';
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function brief(x: CloudSummary | null): string {
  if (!x) return '（没有存档）';
  const cls = classes[x.classId as ClassId]?.name ?? '';
  return `${x.server}·${x.name} ${x.level}级${cls}${x.reborn ? `（${x.reborn}转）` : ''}`;
}

const errText = (e: unknown) => (e as CloudError).message || '出错了';

export interface CloudHost extends Phaser.Scene {
  refresh?: () => void;
}

// inGame=false：标题页，只能登录和下载；onLoaded 在换了存档之后调用
export function cloudPanel(h: CloudHost, inGame: boolean, onLoaded: () => void): void {
  const m = new Modal(h, '云存档', { onClose: () => clearInputs() });
  const dyn = h.add.container(0, 0);
  m.inner.add(dyn);
  let inputs: HTMLInputElement[] = [];
  const clearInputs = () => {
    for (const el of inputs) el.remove();
    inputs = [];
  };
  const close = () => {
    clearInputs();
    m.close();
  };
  let cloud: CloudInfo | null = null;
  let busy = '';
  // 输入框每次重画都会重建：值记在这里，登录失败不用重输
  let accVal = '';
  let pwVal = '';

  const run = async (label: string, fn: () => Promise<void>) => {
    if (busy) return;
    busy = label;
    render();
    try {
      await fn();
    } catch (e) {
      if (m.active) toast(h, errText(e), 2600);
    } finally {
      busy = '';
      if (m.active) render();
    }
  };

  const apply = (rev: number, raw: string) => {
    let s;
    try {
      s = deserialize(raw);
    } catch (e) {
      toast(h, `云端存档读不了：${(e as Error).message}`, 2600);
      return;
    }
    store.set(s);
    markApplied(rev, raw);
    close();
    toast(h, `已换成云端存档（${s.player.name} ${s.player.level}级）`, 2400);
    onLoaded();
  };

  const pull = (rev?: number) => {
    const local = store.has() ? store.save : null;
    const go = () => run('下载中', async () => {
      const out = await download(rev);
      apply(out.rev, out.save);
    });
    if (local) confirm(h, `用云端存档替换本机的？本机现在是 ${local.player.name} ${local.player.level}级，替换后找不回来（可以先上传或导出）。`, go, '替换');
    else go();
  };

  const push = () => run('上传中', async () => {
    try {
      const out = await upload(store.save);
      toast(h, `已上传（云端第${out.rev}版）`);
    } catch (e) {
      const err = e as CloudError;
      if (err.code !== 'conflict') throw e;
      const sm = err.extra.summary as CloudSummary;
      busy = '';
      confirm(h, `云端已经有更新的存档：${brief(sm)}，${when(err.extra.at as number)}传的。用本机的覆盖它吗？（旧的还能在历史版本里找回）`, () => run('上传中', async () => {
        const out = await upload(store.save, true);
        toast(h, `已覆盖云端（第${out.rev}版）`);
      }), '覆盖');
    }
    cloud = await info();
  });

  const render = () => {
    dyn.removeAll(true);
    clearInputs();
    let y = m.cy + 4;
    const cred = loadCred();
    if (!cred) {
      dyn.add(text(h, m.cx, y, '登录后可以把存档存到 sanguo.ivyea.com 的服务器上，换手机、换浏览器也能接着玩。', { wrap: m.cw, color: C.darkBrown }));
      y += 44;
      dyn.add(text(h, m.cx, y + 5, '账号', { color: C.darkRed }));
      const acc = overlayInput(h, m.cx + 44, y, m.cw - 44, 24, accVal, 16);
      acc.placeholder = '3～16个字';
      acc.oninput = () => (accVal = acc.value);
      y += 32;
      dyn.add(text(h, m.cx, y + 5, '密码', { color: C.darkRed }));
      const pw = overlayInput(h, m.cx + 44, y, m.cw - 44, 24, pwVal, 64);
      pw.type = 'password';
      pw.oninput = () => (pwVal = pw.value);
      pw.placeholder = '至少6位';
      inputs = [acc, pw];
      y += 38;
      const half = Math.floor(m.cw / 2);
      dyn.add(new Button(h, m.cx, y, half - 4, 28, busy || '登录', () => run('登录中', async () => {
        cloud = await login(accVal, pwVal);
        toast(h, '登录成功');
      }), { style: 'red', disabled: !!busy }));
      dyn.add(new Button(h, m.cx + half, y, half, 28, '注册新账号', () => run('注册中', async () => {
        cloud = await register(accVal, pwVal);
        toast(h, '注册成功，已登录');
      }), { disabled: !!busy }));
      y += 40;
      dyn.add(text(h, m.cx, y, '密码只存加盐哈希，服务器看不到原文。忘了密码找不回，请记好。', { wrap: m.cw, color: C.gray }));
      return;
    }
    if (!cloud) {
      dyn.add(text(h, m.cx, y, busy ? `${busy}……` : '读取云端……', { color: C.brown }));
      if (!busy) void run('读取中', async () => void (cloud = await info()));
      return;
    }
    dyn.add(text(h, m.cx, y, `账号：${cred.account}`, { color: C.darkRed }));
    y += 20;
    const g = h.add.graphics();
    frame(g, m.cx, y, m.cw, 58, 'tan');
    dyn.add(g);
    dyn.add(text(h, m.cx + 8, y + 6, `云端：${brief(cloud.summary)}`, { color: C.darkBrown }));
    dyn.add(text(h, m.cx + 8, y + 22, cloud.rev ? `第${cloud.rev}版 · ${when(cloud.at)}` : '还没上传过', { color: C.brown }));
    dyn.add(text(h, m.cx + 8, y + 38, store.has() ? `本机：${store.save.server}·${store.save.player.name} ${store.save.player.level}级` : '本机：没有存档', { color: C.brown }));
    y += 66;
    if (busy) {
      dyn.add(text(h, m.cx, y, `${busy}……`, { color: C.red }));
      return;
    }
    const half = Math.floor(m.cw / 2);
    if (inGame) dyn.add(new Button(h, m.cx, y, half - 4, 30, '上传到云端', push, { style: 'red' }));
    dyn.add(new Button(h, inGame ? m.cx + half : m.cx, y, inGame ? half : m.cw, 30, '从云端下载', () => pull(), { style: 'red', disabled: !cloud.rev }));
    y += 38;
    if (inGame) {
      dyn.add(new Button(h, m.cx, y, m.cw, 26, `自动同步：${cred.auto ? '开（每5分钟有变化就传）' : '关'}`, () => {
        setAuto(!cred.auto);
        toast(h, cred.auto ? '自动同步关了' : '自动同步开了：存档有变化每5分钟传一次；云端被别的设备改过会停下来问你');
        render();
      }));
      y += 32;
    }
    if (cloud.history.length > 1) {
      dyn.add(text(h, m.cx, y, '历史版本（云端留最近3版）', { color: C.darkRed }));
      y += 18;
      for (const v of cloud.history) {
        dyn.add(text(h, m.cx + 4, y + 5, `第${v.rev}版 ${when(v.at)} ${v.summary.level}级`, { color: C.darkBrown }));
        dyn.add(new Button(h, m.cx + m.cw - 60, y, 60, 22, '取回', () => pull(v.rev)));
        y += 26;
      }
      y += 4;
    }
    dyn.add(new Button(h, m.cx, y, half - 4, 26, '改密码', () => passwordPanel(h)));
    dyn.add(new Button(h, m.cx + half, y, half, 26, '退出登录', () => run('退出中', async () => {
      await logout();
      cloud = null;
    })));
  };
  render();
}

function passwordPanel(h: CloudHost): void {
  const m = new Modal(h, '改云存档密码', { w: 300, h: 210, onClose: () => clean() });
  const old = overlayInput(h, m.cx + 60, m.cy + 8, m.cw - 60, 24, '', 64);
  const nw = overlayInput(h, m.cx + 60, m.cy + 42, m.cw - 60, 24, '', 64);
  old.type = nw.type = 'password';
  const clean = () => {
    old.remove();
    nw.remove();
  };
  m.inner.add(text(h, m.cx, m.cy + 13, '原密码', { color: C.darkRed }));
  m.inner.add(text(h, m.cx, m.cy + 47, '新密码', { color: C.darkRed }));
  m.inner.add(new Button(h, m.cx, m.cy + 82, m.cw, 28, '确定', async () => {
    try {
      await changePassword(old.value, nw.value);
      clean();
      m.close();
      toast(h, '密码改好了，别的设备要重新登录');
    } catch (e) {
      toast(h, errText(e), 2400);
    }
  }, { style: 'red' }));
  m.inner.add(text(h, m.cx, m.cy + 120, '改完别的设备上的登录会全部失效。', { wrap: m.cw, color: C.gray }));
}
