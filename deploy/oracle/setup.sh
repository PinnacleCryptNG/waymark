#!/usr/bin/env bash
# One-shot setup for an Oracle Cloud Always Free Ampere VM (Ubuntu 24.04).
# Runs the WAYMARK server in Docker behind Caddy, which gets a free HTTPS
# certificate for <ip-with-dashes>.sslip.io (phone microphones need HTTPS).
#
#   curl -fsSL https://raw.githubusercontent.com/PinnacleCryptNG/waymark/<branch>/deploy/oracle/setup.sh | sudo bash -s -- <branch>
#
# Re-run it to deploy the latest code from the branch.
set -euo pipefail

BRANCH="${1:-claude/great-wozniak-b49f5r}"
REPO="https://github.com/PinnacleCryptNG/waymark.git"
SRC=/opt/waymark
DATA=/var/lib/waymark

apt-get update -q
DEBIAN_FRONTEND=noninteractive apt-get install -y -q docker.io caddy git curl iptables-persistent

# Oracle's Ubuntu images reject everything except SSH in iptables, on top of the cloud security list.
for port in 80 443; do
  iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null ||
    iptables -I INPUT 5 -p tcp -m state --state NEW --dport "$port" -j ACCEPT
done
netfilter-persistent save

if [ -d "$SRC/.git" ]; then
  git -C "$SRC" fetch -q origin "$BRANCH" && git -C "$SRC" checkout -q -B "$BRANCH" FETCH_HEAD
else
  git clone -q --branch "$BRANCH" "$REPO" "$SRC"
fi

docker build --build-arg WHISPER_MODEL=base.en -q -t waymark -f "$SRC/backend/Dockerfile" "$SRC"
mkdir -p "$DATA/db" "$DATA/models"
docker rm -f waymark >/dev/null 2>&1 || true
docker run -d --name waymark --restart unless-stopped \
  -p 127.0.0.1:8080:8080 \
  -v "$DATA/db:/data" -v "$DATA/models:/srv/backend/models" \
  waymark

IP="$(curl -fsS https://api.ipify.org)"
HOST="${IP//./-}.sslip.io"
cat > /etc/caddy/Caddyfile <<CADDY
$HOST {
  encode gzip
  reverse_proxy 127.0.0.1:8080
}
CADDY
systemctl restart caddy

echo "Waiting for the server (first start downloads the voice models)..."
for _ in $(seq 1 120); do
  curl -fsS http://127.0.0.1:8080/api/health >/dev/null 2>&1 && break
  sleep 5
done
curl -fsS http://127.0.0.1:8080/api/health && echo
echo "WAYMARK is live at https://$HOST"
