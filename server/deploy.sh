#!/usr/bin/env bash
# 把云存档服务部署到本机：拷代码副本到 /opt、装 systemd 单元、建专用用户、重启并检查健康。
# 新的起不来就自动换回原来的代码和单元。用法：sudo bash server/deploy.sh
set -euo pipefail
cd "$(dirname "$0")"
UNIT=/etc/systemd/system/pixel-sanguo-cloud.service
OPT=/opt/pixel-sanguo-cloud
DATA=/var/lib/pixel-sanguo-cloud
HEALTH=http://127.0.0.1:8032/api/cloud/health
stamp=$(date +%Y%m%d-%H%M%S)

python3 -m py_compile cloud_api.py
id sanguo-cloud >/dev/null 2>&1 || useradd --system --no-create-home --home-dir "$DATA" --shell /sbin/nologin sanguo-cloud

# 备份现在的单元和代码，起不来就换回去
[ -f "$UNIT" ] && cat "$UNIT" > "$UNIT.bak-$stamp"
[ -f "$OPT/cloud_api.py" ] && cat "$OPT/cloud_api.py" > "$OPT/cloud_api.py.bak-$stamp"
install -d -m 0755 "$OPT"
install -m 0644 cloud_api.py "$OPT/cloud_api.py"
install -m 0644 pixel-sanguo-cloud.service "$UNIT"
# 数据目录交给专用用户（StateDirectory 也会做，这里先做一遍免得第一次起不来）
install -d -m 0700 -o sanguo-cloud -g sanguo-cloud "$DATA"
chown -R sanguo-cloud:sanguo-cloud "$DATA"

systemctl daemon-reload
systemctl restart pixel-sanguo-cloud
for i in $(seq 1 20); do
  if curl -sf "$HEALTH" >/dev/null; then
    echo "云存档服务已更新，健康检查通过"
    exit 0
  fi
  sleep 0.5
done

echo "新版起不来，换回原来的" >&2
journalctl -u pixel-sanguo-cloud -n 30 --no-pager >&2 || true
[ -f "$UNIT.bak-$stamp" ] && cat "$UNIT.bak-$stamp" > "$UNIT"
[ -f "$OPT/cloud_api.py.bak-$stamp" ] && cat "$OPT/cloud_api.py.bak-$stamp" > "$OPT/cloud_api.py"
systemctl daemon-reload
systemctl restart pixel-sanguo-cloud
exit 1
