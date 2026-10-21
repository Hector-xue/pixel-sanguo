#!/usr/bin/env bash
# 构建并发布到 /var/www/sanguo（nginx 的 ops.ivyea.com /sanguo/，已挂 IvyeaOps 登录）
set -euo pipefail
cd "$(dirname "$0")"
npm test
npm run build
mkdir -p /var/www/sanguo
rsync -a --delete dist/ /var/www/sanguo/
echo "已发布：https://ops.ivyea.com/sanguo/"
