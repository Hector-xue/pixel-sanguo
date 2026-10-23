#!/usr/bin/env python3
"""
像素三国的云存档（sanguo.ivyea.com/api/cloud/*）。

# 做什么
- 账号 + 密码注册登录，登录后拿一个令牌（只存令牌的哈希）；密码用 PBKDF2 加盐存。
- 上传：带上「我上次同步时的版本号 base」。服务器上的版本比 base 新（别的设备传过）就回 409，
  让玩家自己决定覆盖还是先下载，**绝不静默覆盖**。每个账号保留最近 3 个版本，可以退回上一个。
- 下载：取最新版或指定版本。
- 存档位：游戏里有 3 个存档位，每个位子在云端各存各的（slot 0～2，版本号各自从 1 数起）；
  不带 slot 的老版本客户端按第一个位子算。

# 防护
- 同一 IP：注册每小时 5 次、登录每 10 分钟 20 次、其余请求每分钟 60 次；所有来源合计写入每小时上限。
- 同一账号连错 10 次密码锁 30 分钟。
- 单个存档 ≤ 2MB，必须是像素三国的存档格式（v=1、有 player）；账号总数有上限。
- 磁盘：剩余空间不够就停收上传（这台机器还跑着别的服务，写满盘会把它们一起拖垮）。

依赖：只用标准库。监听 127.0.0.1，nginx 反代 /api/cloud/ 过来（带 X-Real-IP）。
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
import shutil
import sqlite3
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

DB_PATH = os.environ.get("CLOUD_DB", "/var/lib/pixel-sanguo-cloud/cloud.db")
LISTEN = os.environ.get("CLOUD_LISTEN", "127.0.0.1:8032")
ORIGINS = set(filter(None, os.environ.get(
    "CLOUD_ORIGINS",
    "https://sanguo.ivyea.com,https://hector-xue.github.io,https://localhost,capacitor://localhost,http://localhost,"
    "http://127.0.0.1:5173,http://localhost:5173",
).split(",")))
MAX_SAVE = int(os.environ.get("CLOUD_MAX_SAVE_KB", "2048")) * 1024
MAX_ACCOUNTS = int(os.environ.get("CLOUD_MAX_ACCOUNTS", "20000"))
MIN_FREE = int(os.environ.get("CLOUD_MIN_FREE_MB", "2048")) * 1024 * 1024
WRITES_PER_HOUR = int(os.environ.get("CLOUD_WRITES_PER_HOUR", "3000"))
KEEP = 3
PBKDF2_ROUNDS = int(os.environ.get("CLOUD_PBKDF2_ROUNDS", "200000"))
TOKEN_DAYS = 180
LOCK_FAILS, LOCK_SECONDS = 10, 1800
ACCOUNT_RE = re.compile(r"^[A-Za-z0-9_一-鿿]{3,16}$")

LIMITS = {"register": (3600.0, 5), "login": (600.0, 20), "other": (60.0, 60)}
_hits: dict = {}
_writes: list = []
_lock = threading.Lock()
_db_lock = threading.Lock()
_db = None


class ApiError(Exception):
    def __init__(self, status: int, code: str, msg: str, extra: dict | None = None):
        super().__init__(msg)
        self.status, self.code, self.msg, self.extra = status, code, msg, extra or {}


def db() -> sqlite3.Connection:
    global _db
    if _db is None:
        os.makedirs(os.path.dirname(DB_PATH) or ".", exist_ok=True)
        _db = sqlite3.connect(DB_PATH, check_same_thread=False)
        _db.execute("PRAGMA journal_mode=WAL")
        _db.executescript(
            """
            CREATE TABLE IF NOT EXISTS accounts (
              account TEXT PRIMARY KEY, salt BLOB NOT NULL, hash BLOB NOT NULL, created REAL NOT NULL,
              fails INTEGER NOT NULL DEFAULT 0, locked_until REAL NOT NULL DEFAULT 0);
            CREATE TABLE IF NOT EXISTS tokens (
              token_hash TEXT PRIMARY KEY, account TEXT NOT NULL, created REAL NOT NULL, last REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS saves (
              account TEXT NOT NULL, slot INTEGER NOT NULL DEFAULT 0, rev INTEGER NOT NULL, at REAL NOT NULL,
              summary TEXT NOT NULL, data BLOB NOT NULL, PRIMARY KEY (account, slot, rev));
            """
        )
        _migrate(_db)
        _db.commit()
    return _db


def _migrate(c: sqlite3.Connection) -> None:
    """老库的 saves 没有 slot 列（主键是 account+rev）：整表搬进新表，原有存档都算第一个位子。"""
    cols = [r[1] for r in c.execute("PRAGMA table_info(saves)")]
    if "slot" in cols:
        return
    c.executescript(
        """
        BEGIN;
        CREATE TABLE saves_new (
          account TEXT NOT NULL, slot INTEGER NOT NULL DEFAULT 0, rev INTEGER NOT NULL, at REAL NOT NULL,
          summary TEXT NOT NULL, data BLOB NOT NULL, PRIMARY KEY (account, slot, rev));
        INSERT INTO saves_new (account, slot, rev, at, summary, data) SELECT account, 0, rev, at, summary, data FROM saves;
        DROP TABLE saves;
        ALTER TABLE saves_new RENAME TO saves;
        COMMIT;
        """
    )


def _rate_ok(ip: str, kind: str) -> bool:
    window, cap = LIMITS[kind]
    now = time.time()
    key = (ip, kind)
    with _lock:
        hits = [t for t in _hits.get(key, []) if now - t < window]
        ok = len(hits) < cap
        if ok:
            hits.append(now)
        _hits[key] = hits
        # 顺手清理过期的 IP，免得字典一直长
        if len(_hits) > 5000:
            for k in [k for k, v in _hits.items() if not v or now - v[-1] > 3600]:
                _hits.pop(k, None)
        return ok


def _write_ok() -> bool:
    now = time.time()
    with _lock:
        _writes[:] = [t for t in _writes if now - t < 3600]
        if len(_writes) >= WRITES_PER_HOUR:
            return False
        _writes.append(now)
        return True


def _free_bytes() -> int:
    try:
        d = os.path.dirname(DB_PATH) or "."
        return shutil.disk_usage(d if os.path.isdir(d) else "/").free
    except OSError:
        return 0


def _hash_pw(pw: str, salt: bytes) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", pw.encode("utf-8"), salt, PBKDF2_ROUNDS)


def _check_account(acc: object) -> str:
    a = str(acc or "").strip()
    if not ACCOUNT_RE.match(a):
        raise ApiError(400, "bad_account", "账号要 3～16 个字（字母、数字、下划线或汉字）")
    return a


def _check_password(pw: object) -> str:
    p = str(pw or "")
    if not 6 <= len(p) <= 64:
        raise ApiError(400, "bad_password", "密码要 6～64 位")
    return p


def _summary(text: str) -> dict:
    try:
        s = json.loads(text)
    except ValueError:
        raise ApiError(400, "bad_save", "存档不是有效的 JSON")
    p = s.get("player") if isinstance(s, dict) else None
    if not isinstance(s, dict) or s.get("v") != 1 or not isinstance(p, dict) or not p.get("name"):
        raise ApiError(400, "bad_save", "这不是像素三国的存档")
    p3 = s.get("p3") if isinstance(s.get("p3"), dict) else {}
    return {
        "name": str(p.get("name"))[:16], "level": int(p.get("level") or 0), "classId": str(p.get("classId") or "")[:16],
        "server": str(s.get("server") or "")[:16], "reborn": int(p3.get("reborn") or 0), "battles": int(s.get("battles") or 0),
    }


def _issue_token(acc: str) -> str:
    tok = secrets.token_urlsafe(32)
    now = time.time()
    c = db()
    c.execute("INSERT INTO tokens VALUES (?,?,?,?)", (hashlib.sha256(tok.encode()).hexdigest(), acc, now, now))
    # 一个账号最多留 10 个登录（多设备），多了删最旧的
    c.execute("DELETE FROM tokens WHERE account=? AND token_hash NOT IN (SELECT token_hash FROM tokens WHERE account=? ORDER BY last DESC LIMIT 10)", (acc, acc))
    return tok


def _auth(header: str) -> str:
    if not header.startswith("Bearer "):
        raise ApiError(401, "no_token", "请先登录")
    th = hashlib.sha256(header[7:].strip().encode()).hexdigest()
    c = db()
    row = c.execute("SELECT account, last FROM tokens WHERE token_hash=?", (th,)).fetchone()
    if not row or time.time() - row[1] > TOKEN_DAYS * 86400:
        raise ApiError(401, "bad_token", "登录已失效，请重新登录")
    c.execute("UPDATE tokens SET last=? WHERE token_hash=?", (time.time(), th))
    # 只读的接口（info / download）后面不会再 commit：这里不提交就会一直占着写锁
    c.commit()
    return row[0]


SLOTS = 3


def _slot(body: dict) -> int:
    try:
        n = int(body.get("slot") or 0)
    except (TypeError, ValueError):
        n = -1
    if not 0 <= n < SLOTS:
        raise ApiError(400, "bad_slot", "存档位不对")
    return n


def _latest(acc: str, slot: int):
    return db().execute("SELECT rev, at, summary FROM saves WHERE account=? AND slot=? ORDER BY rev DESC LIMIT 1", (acc, slot)).fetchone()


def _info(acc: str, slot: int = 0) -> dict:
    """这个位子的最新版和历史版本，外加三个位子各自的最新版（slots，空位不列）。"""
    rows = db().execute("SELECT rev, at, summary FROM saves WHERE account=? AND slot=? ORDER BY rev DESC", (acc, slot)).fetchall()
    hist = [{"rev": r, "at": int(at * 1000), "summary": json.loads(sm)} for r, at, sm in rows]
    top = hist[0] if hist else None
    tops = db().execute(
        "SELECT slot, MAX(rev) FROM saves WHERE account=? GROUP BY slot ORDER BY slot", (acc,)
    ).fetchall()
    slots = []
    for sl, rv in tops:
        r = db().execute("SELECT at, summary FROM saves WHERE account=? AND slot=? AND rev=?", (acc, sl, rv)).fetchone()
        slots.append({"slot": sl, "rev": rv, "at": int(r[0] * 1000), "summary": json.loads(r[1])})
    return {"account": acc, "slot": slot, "rev": top["rev"] if top else 0, "at": top["at"] if top else 0,
            "summary": top["summary"] if top else None, "history": hist, "slots": slots}


# ===== 各个接口 =====
def api_register(body: dict, ip: str) -> dict:
    acc = _check_account(body.get("account"))
    pw = _check_password(body.get("password"))
    if not _write_ok():
        raise ApiError(503, "busy", "服务器有点忙，过一会儿再试")
    c = db()
    if c.execute("SELECT 1 FROM accounts WHERE account=?", (acc,)).fetchone():
        raise ApiError(409, "taken", "这个账号已经有人用了")
    if c.execute("SELECT COUNT(*) FROM accounts").fetchone()[0] >= MAX_ACCOUNTS:
        raise ApiError(503, "full", "云存档账号满了，暂时不能注册")
    salt = secrets.token_bytes(16)
    c.execute("INSERT INTO accounts (account, salt, hash, created) VALUES (?,?,?,?)", (acc, salt, _hash_pw(pw, salt), time.time()))
    tok = _issue_token(acc)
    c.commit()
    return {"token": tok, **_info(acc)}


def api_login(body: dict, ip: str) -> dict:
    acc = _check_account(body.get("account"))
    pw = str(body.get("password") or "")
    c = db()
    row = c.execute("SELECT salt, hash, fails, locked_until FROM accounts WHERE account=?", (acc,)).fetchone()
    if not row:
        raise ApiError(401, "wrong", "账号或密码不对")
    salt, h, fails, locked = row
    if locked > time.time():
        raise ApiError(429, "locked", f"密码错太多次，{int((locked - time.time()) / 60) + 1} 分钟后再试")
    if not hmac.compare_digest(_hash_pw(pw, salt), h):
        fails += 1
        c.execute("UPDATE accounts SET fails=?, locked_until=? WHERE account=?", (0 if fails >= LOCK_FAILS else fails, time.time() + LOCK_SECONDS if fails >= LOCK_FAILS else 0, acc))
        c.commit()
        raise ApiError(401, "wrong", "账号或密码不对")
    c.execute("UPDATE accounts SET fails=0, locked_until=0 WHERE account=?", (acc,))
    tok = _issue_token(acc)
    c.commit()
    return {"token": tok, **_info(acc)}


def api_info(body: dict, acc: str) -> dict:
    return _info(acc, _slot(body))


def api_upload(body: dict, acc: str) -> dict:
    text = body.get("save")
    if not isinstance(text, str):
        raise ApiError(400, "bad_save", "没带存档")
    if len(text.encode("utf-8")) > MAX_SAVE:
        raise ApiError(413, "too_big", "存档太大了")
    if _free_bytes() < MIN_FREE:
        raise ApiError(503, "disk", "服务器空间不够，暂时不能上传")
    summary = _summary(text)
    base = int(body.get("base") or 0)
    slot = _slot(body)
    c = db()
    top = _latest(acc, slot)
    cur = top[0] if top else 0
    if cur != base and not body.get("force"):
        raise ApiError(409, "conflict", "云端的存档比你上次同步的新（可能是别的设备传的）", {"rev": cur, "at": int(top[1] * 1000), "summary": json.loads(top[2])})
    if not _write_ok():
        raise ApiError(503, "busy", "服务器有点忙，过一会儿再试")
    rev = cur + 1
    now = time.time()
    c.execute("INSERT INTO saves (account, slot, rev, at, summary, data) VALUES (?,?,?,?,?,?)",
              (acc, slot, rev, now, json.dumps(summary, ensure_ascii=False), text.encode("utf-8")))
    c.execute("DELETE FROM saves WHERE account=? AND slot=? AND rev <= ?", (acc, slot, rev - KEEP))
    c.commit()
    return {"rev": rev, "at": int(now * 1000), "summary": summary, "slot": slot}


def api_download(body: dict, acc: str) -> dict:
    rev = body.get("rev")
    slot = _slot(body)
    c = db()
    if rev:
        row = c.execute("SELECT rev, at, summary, data FROM saves WHERE account=? AND slot=? AND rev=?", (acc, slot, int(rev))).fetchone()
    else:
        row = c.execute("SELECT rev, at, summary, data FROM saves WHERE account=? AND slot=? ORDER BY rev DESC LIMIT 1", (acc, slot)).fetchone()
    if not row:
        raise ApiError(404, "empty", "云端这个存档位还没有存档" if slot else "云端还没有存档")
    return {"rev": row[0], "at": int(row[1] * 1000), "summary": json.loads(row[2]), "save": row[3].decode("utf-8"), "slot": slot}


def api_logout(body: dict, acc: str, header: str) -> dict:
    th = hashlib.sha256(header[7:].strip().encode()).hexdigest()
    c = db()
    c.execute("DELETE FROM tokens WHERE token_hash=?", (th,))
    c.commit()
    return {"ok": True}


def api_password(body: dict, acc: str) -> dict:
    old = str(body.get("old") or "")
    new = _check_password(body.get("password"))
    c = db()
    salt, h = c.execute("SELECT salt, hash FROM accounts WHERE account=?", (acc,)).fetchone()
    if not hmac.compare_digest(_hash_pw(old, salt), h):
        raise ApiError(401, "wrong", "原密码不对")
    ns = secrets.token_bytes(16)
    c.execute("UPDATE accounts SET salt=?, hash=? WHERE account=?", (ns, _hash_pw(new, ns), acc))
    # 改了密码，其他设备的登录全部作废
    c.execute("DELETE FROM tokens WHERE account=?", (acc,))
    tok = _issue_token(acc)
    c.commit()
    return {"token": tok}


PUBLIC = {"register": api_register, "login": api_login}
PRIVATE = {"info": api_info, "upload": api_upload, "download": api_download, "password": api_password}


class Handler(BaseHTTPRequestHandler):
    server_version = "pixel-sanguo-cloud"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):  # noqa: D401  只记方法路径和状态，不记正文
        pass

    def _cors(self) -> None:
        o = self.headers.get("Origin", "")
        if o in ORIGINS:
            self.send_header("Access-Control-Allow-Origin", o)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Max-Age", "86400")

    def _send(self, status: int, payload: dict) -> None:
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self._cors()
        self.end_headers()
        self.wfile.write(raw)

    def _ip(self) -> str:
        return self.headers.get("X-Real-IP") or self.client_address[0]

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        if self.path.rstrip("/").endswith("/health"):
            return self._send(200, {"ok": True})
        self._send(404, {"error": "not_found", "msg": "没有这个接口"})

    def do_POST(self) -> None:  # noqa: N802
        name = self.path.split("?")[0].rstrip("/").rsplit("/", 1)[-1]
        ip = self._ip()
        try:
            n = int(self.headers.get("Content-Length") or 0)
            if n > MAX_SAVE + 4096:
                # 正文太大直接拒，不读进内存
                self.close_connection = True
                raise ApiError(413, "too_big", "存档太大了")
            body_raw = self.rfile.read(n) if n else b"{}"
            kind = name if name in ("register", "login") else "other"
            if not _rate_ok(ip, kind):
                raise ApiError(429, "rate", "请求太频繁，歇一会儿再试")
            try:
                body = json.loads(body_raw.decode("utf-8") or "{}")
            except ValueError:
                raise ApiError(400, "bad_json", "请求格式不对")
            if not isinstance(body, dict):
                raise ApiError(400, "bad_json", "请求格式不对")
            with _db_lock:
                if name in PUBLIC:
                    out = PUBLIC[name](body, ip)
                elif name in PRIVATE or name == "logout":
                    header = self.headers.get("Authorization", "")
                    acc = _auth(header)
                    out = api_logout(body, acc, header) if name == "logout" else PRIVATE[name](body, acc)
                else:
                    raise ApiError(404, "not_found", "没有这个接口")
            self._send(200, out)
        except ApiError as e:
            self._send(e.status, {"error": e.code, "msg": e.msg, **e.extra})
        except Exception as e:  # noqa: BLE001
            print(f"[cloud] {name} 出错：{type(e).__name__}: {e}", flush=True)
            self._send(500, {"error": "server", "msg": "服务器出错了"})


def make_server(listen: str = LISTEN) -> ThreadingHTTPServer:
    host, port = listen.rsplit(":", 1)
    db()
    return ThreadingHTTPServer((host, int(port)), Handler)


if __name__ == "__main__":
    srv = make_server()
    print(f"[cloud] listening on {LISTEN}, db={DB_PATH}", flush=True)
    srv.serve_forever()
