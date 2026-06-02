#!/usr/bin/env bash
# refresh-monitor-tunnel.sh
#
# When the Cloudflare Quick Tunnel URL rotates (cloudflared service restart
# or server reboot), Vercel's MONITOR_URL env points at the stale URL and
# every /api/orders POST returns 502 "Failed to reach monitor service".
#
# This script:
#   1. SSHes to the Aliyun monitor host
#   2. Reads the currently-active trycloudflare.com URL from journald
#   3. Replaces Vercel's MONITOR_URL with <new-url>/swap-orders
#   4. Triggers a Vercel redeploy so the new value takes effect
#   5. Smoke-tests the end-to-end POST path
#
# Background: the long-term fix is a CF named tunnel bound to a stable
# hostname (e.g. monitor.intent-swap.app), but that requires adding
# intent-swap.app as a CF zone (NS swap) — deferred until we have spare
# time for the DNS migration. Until then, this script is the rotation
# response: should take ~90s end-to-end.

set -euo pipefail

ALIYUN_HOST="${ALIYUN_HOST:-root@8.133.170.62}"
VERCEL_PROJ_ID="${VERCEL_PROJ_ID:-prj_ODHI83HLLvvjyCeQz5qCimlSWTd2}"
VERCEL_AUTH="${HOME}/Library/Application Support/com.vercel.cli/auth.json"

echo "==> [1/5] reading current tunnel URL from Aliyun journald"
TUNNEL_URL=$(ssh -o ConnectTimeout=8 "$ALIYUN_HOST" \
  'journalctl -u cloudflared-quick --no-pager | grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" | tail -1')

if [ -z "$TUNNEL_URL" ]; then
  echo "ERROR: no trycloudflare.com URL found in journald — is cloudflared-quick running?" >&2
  ssh "$ALIYUN_HOST" 'systemctl status cloudflared-quick --no-pager | head -10' >&2 || true
  exit 1
fi
NEW_MONITOR_URL="${TUNNEL_URL}/swap-orders"
echo "    tunnel = $TUNNEL_URL"
echo "    will set MONITOR_URL = $NEW_MONITOR_URL"

echo "==> [2/5] loading Vercel CLI token"
if [ ! -f "$VERCEL_AUTH" ]; then
  echo "ERROR: Vercel CLI auth.json not found at $VERCEL_AUTH" >&2
  echo "Run: npx vercel login" >&2
  exit 1
fi
VC_TOKEN=$(python3 -c "import json; print(json.load(open('$VERCEL_AUTH'))['token'])")

echo "==> [3/5] replacing MONITOR_URL via Vercel REST API"
ENV_ID=$(curl -fsS "https://api.vercel.com/v10/projects/${VERCEL_PROJ_ID}/env" \
  -H "Authorization: Bearer $VC_TOKEN" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for e in d.get('envs',[]):
  if e.get('key')=='MONITOR_URL' and 'production' in e.get('target',[]):
    print(e.get('id')); break
")
if [ -n "$ENV_ID" ]; then
  curl -fsS -X DELETE "https://api.vercel.com/v10/projects/${VERCEL_PROJ_ID}/env/${ENV_ID}" \
    -H "Authorization: Bearer $VC_TOKEN" >/dev/null
fi
curl -fsS -X POST "https://api.vercel.com/v10/projects/${VERCEL_PROJ_ID}/env" \
  -H "Authorization: Bearer $VC_TOKEN" -H "Content-Type: application/json" \
  --data "{\"key\":\"MONITOR_URL\",\"value\":\"${NEW_MONITOR_URL}\",\"type\":\"encrypted\",\"target\":[\"production\"]}" \
  >/dev/null
echo "    env updated"

echo "==> [4/5] triggering Vercel redeploy (this takes ~90s)"
(cd "$(dirname "$0")/.." && npx vercel redeploy https://intent-swap.app 2>&1 | tail -6)

echo "==> [5/5] smoke-test end-to-end POST"
RES=$(curl -sS -m 30 -X POST https://intent-swap.app/api/orders \
  -H "Content-Type: application/json" \
  -d '{"email":"zynono@gmail.com","fromToken":"ETH","toToken":"USDC","amount":0.01,"condition":{"token":"ETH","operator":"below","targetPrice":1}}' \
  -w "\nhttp:%{http_code}")
echo "    $RES"
if echo "$RES" | grep -q '"ok":true'; then
  echo "✅ tunnel refreshed successfully"
else
  echo "⚠️  smoke test did not return ok:true — investigate Vercel logs"
  echo "    npx vercel logs intent-swap.app | tail -50"
  exit 1
fi
