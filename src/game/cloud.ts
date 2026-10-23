// 云存档客户端：账号密码登录 sanguo.ivyea.com 的云存档服务，上传 / 下载 / 自动同步。
// 登录信息（令牌）单独存在本机，不放进存档里（不然上传存档会把令牌一起传上去）。
// 版本号 rev = 本机存档对应云端的哪个版本。上传带上它，云端更新过就会被拒（409），由玩家决定覆盖还是先下载。
import type { Save } from './state';
import { serialize } from './state';
import { store } from './store';

// 套壳 App（Capacitor）里跑：页面来自 https://localhost
export function isApp(): boolean {
  return !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
}

export const CLOUD_BASE: string = (import.meta.env.VITE_CLOUD_BASE as string | undefined) ?? 'https://sanguo.ivyea.com/api/cloud';
const KEY = 'pxsg.cloud.v1';
const AUTO_MS = 5 * 60000;

export interface CloudCred {
  account: string;
  token: string;
  rev: number;
  auto: boolean;
  // 上次同步成功的时间、那时存档的指纹（没变就不传）
  syncedAt: number;
  // 和云端对上的是第几个存档位（老凭据没有，按第一个算）
  slot?: number;
  hash: string;
}

export interface CloudSummary {
  name: string;
  level: number;
  classId: string;
  server: string;
  reborn: number;
  battles: number;
}

export interface CloudInfo {
  account: string;
  rev: number;
  at: number;
  summary: CloudSummary | null;
  history: { rev: number; at: number; summary: CloudSummary }[];
}

export class CloudError extends Error {
  constructor(public code: string, msg: string, public extra: Record<string, unknown> = {}) {
    super(msg);
  }
}

export function loadCred(): CloudCred | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CloudCred) : null;
  } catch {
    return null;
  }
}

function saveCred(c: CloudCred | null): void {
  try {
    if (c) localStorage.setItem(KEY, JSON.stringify(c));
    else localStorage.removeItem(KEY);
  } catch {
    // 本地存不了就只在这次打开有效
  }
}

async function call<T>(name: string, body: Record<string, unknown>, token?: string): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${CLOUD_BASE}/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
  } catch {
    throw new CloudError('network', '连不上云存档服务器，检查一下网络');
  }
  let data: Record<string, unknown> = {};
  try {
    data = await r.json();
  } catch {
    throw new CloudError('server', `云存档服务器返回了看不懂的内容（${r.status}）`);
  }
  if (!r.ok) {
    if (r.status === 401 && token) saveCred(null);
    throw new CloudError(String(data.error ?? r.status), String(data.msg ?? `出错了（${r.status}）`), data);
  }
  return data as T;
}

export function fingerprint(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return `${text.length}-${(h >>> 0).toString(36)}`;
}

async function enter(kind: 'register' | 'login', account: string, password: string): Promise<CloudInfo> {
  const out = await call<CloudInfo & { token: string }>(kind, { account: account.trim(), password });
  // 新登录：本机存档和云端是什么关系还不知道，rev 记 0，第一次上传如果云端已有存档会先问
  saveCred({ account: out.account, token: out.token, rev: 0, auto: loadCred()?.auto ?? false, syncedAt: 0, hash: '' });
  return out;
}

export const register = (account: string, password: string) => enter('register', account, password);
export const login = (account: string, password: string) => enter('login', account, password);

export async function logout(): Promise<void> {
  const c = loadCred();
  saveCred(null);
  if (c) await call('logout', {}, c.token).catch(() => undefined);
}

export async function info(): Promise<CloudInfo> {
  const c = loadCred();
  if (!c) throw new CloudError('no_token', '还没登录');
  return call<CloudInfo>('info', {}, c.token);
}

export async function upload(s: Save, force = false): Promise<{ rev: number; at: number }> {
  const c = loadCred();
  if (!c) throw new CloudError('no_token', '还没登录');
  const text = serialize(s);
  const out = await call<{ rev: number; at: number }>('upload', { save: text, base: c.rev, force }, c.token);
  saveCred({ ...c, rev: out.rev, syncedAt: Date.now(), hash: fingerprint(text), slot: store.slot });
  return out;
}

// 下载回来的是存档原文，由调用方 deserialize 后决定要不要用；用了再 markApplied
export async function download(rev?: number): Promise<{ rev: number; at: number; save: string; summary: CloudSummary }> {
  const c = loadCred();
  if (!c) throw new CloudError('no_token', '还没登录');
  return call('download', rev ? { rev } : {}, c.token);
}

export function markApplied(rev: number, text: string): void {
  const c = loadCred();
  if (c) saveCred({ ...c, rev, syncedAt: Date.now(), hash: fingerprint(text), slot: store.slot });
}

export async function changePassword(old: string, password: string): Promise<void> {
  const c = loadCred();
  if (!c) throw new CloudError('no_token', '还没登录');
  const out = await call<{ token: string }>('password', { old, password }, c.token);
  saveCred({ ...c, token: out.token });
}

export function setAuto(on: boolean): void {
  const c = loadCred();
  if (c) saveCred({ ...c, auto: on });
}

// 自动同步：开着、存档变了、离上次超过 5 分钟（due=true 时不等）就传一次。
// 云端被别的设备更新过（冲突）就关掉自动同步，返回提示让玩家去手动处理。
let busy = false;
let lastTry = 0;
export async function autoTick(s: Save, due = false): Promise<string | null> {
  const c = loadCred();
  if (!c?.auto || busy) return null;
  // 只自动同步和云端对得上的那个存档位（换到别的存档位玩，不会把另一个角色传上去盖掉）
  if ((c.slot ?? 0) !== store.slot) return null;
  const now = Date.now();
  if (!due && now - Math.max(c.syncedAt, lastTry) < AUTO_MS) return null;
  if (fingerprint(serialize(s)) === c.hash) return null;
  busy = true;
  lastTry = now;
  try {
    await upload(s);
    return null;
  } catch (e) {
    const err = e as CloudError;
    if (err.code === 'conflict') {
      setAuto(false);
      return '云端的存档被别的设备更新过，自动同步先停了。去「功能 → 设置 → 云存档」看看要用哪一份。';
    }
    if (err.code === 'bad_token' || err.code === 'no_token') return '云存档登录失效了，自动同步停了，请重新登录';
    // 网络不好就下次再试，不打扰
    return null;
  } finally {
    busy = false;
  }
}
