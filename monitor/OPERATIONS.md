# Operations Guide

This document covers the production runtime for the conditional-order monitor service (`monitor/server.js`). For the Next.js app deployment, see the project root [`DEPLOYMENT.md`](../DEPLOYMENT.md).

## Architecture

```
┌────────────────────┐      ┌───────────────────────────┐      ┌─────────────────────┐
│  Next.js (Vercel)  │      │ monitor/server.js (Aliyun)│      │  Arbitrum vault     │
│                    │      │                           │      │  + Uniswap V3       │
│  /api/orders POST  ├──────▶ POST /swap-orders         │      │                     │
│  (Bearer-auth)     │      │  (auth via INTERNAL_API_  │      │                     │
│                    │      │   KEY, persists to        │      │                     │
│                    │      │   orders.json + lowdb)    │      │                     │
│                    │      │                           │      │                     │
│  Browser UI        ◀──────┤ Web Push                  │      │                     │
│                    │      │                           │      │                     │
└────────────────────┘      │ setInterval 60s:          ├──────▶ vault.executeOrder()│
                            │  - DeFiLlama price fetch  │      │  (when order.exec   │
                            │  - check prev → current   │      │   present)          │
                            │    crossing target        │      │                     │
                            │  - if crossed:            │      └─────────────────────┘
                            │     · email via Resend    │
                            │     · WeChat via Server   │
                            │       Chan                │
                            │     · Web Push            │
                            │     · vault.executeOrder  │
                            │       if order has signed │
                            │       exec payload        │
                            └───────────────────────────┘
```

**Single source of truth**: `/root/intent-swap-server/orders.json` (lowdb). One file, atomic writes per assign.

## Production host

- **Server**: Aliyun ECS, IP `8.133.170.62`, hostname `iZuf6i07mld5al8bd13qtyZ`
- **Domain**: `api.o-sheepps.com` → 8.133.170.62 (A record)
- **Node**: 16.20.2 via nvm at `/root/.nvm/versions/node/v16.20.2/bin/`
- **Process manager**: pm2 (`/root/.nvm/versions/node/v16.20.2/bin/pm2`)
- **Code**: `/root/intent-swap-server/server.js` (this file, kept in sync with this repo)
- **DB**: `/root/intent-swap-server/orders.json` + `subscriptions.json`
- **Logs**: `/root/.pm2/logs/intent-swap-server-{out,error}.log`

Currently running under pm2 process name `intent-swap-server` (id 3). View status: `pm2 list`.

## Environment variables

Set in `/root/intent-swap-server/.env` (auto-loaded by dotenv).

| Var | Required | Purpose |
|---|---|---|
| `INTERNAL_API_KEY` | **yes** | Shared secret with Vercel `/api/orders` proxy. Bearer-auth on `/swap-orders`. Must match Vercel's value. |
| `KEEPER_PRIVATE_KEY` | for auto-execute | Private key of the wallet authorized to call `vault.executeOrder()`. Must match the vault's on-chain `keeper()`. |
| `ARBITRUM_RPC_URL` | optional | Override default `https://arb1.arbitrum.io/rpc`. |
| `RESEND_API_KEY` | for email | From https://resend.com — HTTP API key. Replaces Gmail SMTP (GFW-blocked from China host). |
| `RESEND_FROM` | optional | Sender label. Default `Intent Swap <onboarding@resend.dev>`. Verify a custom domain in Resend to use your own. |
| `SCT_KEY` | for WeChat | Server Chan (sctapi.ftqq.com) token. |
| `VAPID_PUBLIC` / `VAPID_PRIVATE` | for Web Push | Generate once with `npx web-push generate-vapid-keys`. |
| `VAPID_SUBJECT` | optional | `mailto:` for VAPID claim. Default `mailto:ops@example.com`. |
| `PORT` | optional | Default 3001. Reverse-proxy fronts this to 443. |

Also see pm2's per-process env (set via `ecosystem.config.js` if present). To inspect: `pm2 env <id>`.

## Notification channels — reliability & why

A triggered order fan-outs to three channels in `Promise.allSettled` (one failing doesn't block the others). Their real-world reliability differs a lot:

| Channel | Per-user? | Reliable? | Notes |
|---|---|---|---|
| **Email (Resend)** | ✅ yes | ✅ everywhere | The only globally-dependable per-user channel. Runs over HTTPS to Resend, unaffected by the GFW (unlike the old Gmail SMTP, which was blocked from the China host). **Treat email as the primary channel.** |
| **Web Push (VAPID)** | ✅ yes | ⚠️ partial | Works on overseas desktop/Android. **Broken in mainland China** (Chrome/Edge push routes through Google FCM, which is GFW-blocked) and **iOS only if the site is installed as a PWA** (Safari tabs can't receive it). The frontend hides the "Enable browser notifications" button for likely-CN users (timezone/`zh-CN` heuristic) and steers them to email. |
| **WeChat (Server Chan)** | ❌ **owner-only** | ✅ for the owner | `SCT_KEY` is a single Server Chan token bound to the project owner's WeChat — every alert goes to that one person, **not** to the end user who placed the order. It's effectively an ops/monitoring alert, not a user notification channel. Per-user WeChat would require a separate binding (Server Chan per user, or a WeChat Official Account) that doesn't exist yet. |

**Operational implication:** if a user reports "I didn't get notified," check email delivery first (Resend dashboard / logs). Push silence is expected for CN users. WeChat reaching the owner is normal and unrelated to per-user delivery.

If `GET /vapid-public-key` ever returns an empty `publicKey`, the `VAPID_PUBLIC`/`VAPID_PRIVATE` env vars got dropped on the host — Web Push is silently disabled until they're restored.

## Deploying changes

### Updating server.js (or any monitor file)

Currently the production server doesn't have `git` installed and `/root/intent-swap-server/` isn't a git checkout. Updates are pushed via `scp`:

```bash
# From your laptop (this repo)
scp monitor/server.js     root@8.133.170.62:/root/intent-swap-server/server.js
scp monitor/vault-abi.json root@8.133.170.62:/root/intent-swap-server/vault-abi.json
ssh root@8.133.170.62 'export PATH=/root/.nvm/versions/node/v16.20.2/bin:$PATH; \
  cd /root/intent-swap-server && \
  cp server.js server.js.bak.$(date +%Y%m%d-%H%M%S) && \
  node -c server.js && pm2 restart intent-swap-server --update-env'
```

For dependency changes (after editing `package.json`):

```bash
scp monitor/package.json root@8.133.170.62:/root/intent-swap-server/package.json
ssh root@8.133.170.62 'export PATH=/root/.nvm/versions/node/v16.20.2/bin:$PATH; \
  cd /root/intent-swap-server && npm install && pm2 restart intent-swap-server --update-env'
```

### First-time deploy on a fresh host

```bash
# On the new host
mkdir -p /root/intent-swap-server && cd /root/intent-swap-server
# Copy files from this repo's monitor/ dir
# Then:
npm install
cp .env.example .env  # fill in keys
pm2 start server.js --name intent-swap-server
pm2 save
```

## Rolling back

Every deploy creates a `.bak.<timestamp>` next to `server.js`. To roll back:

```bash
ssh root@8.133.170.62 'export PATH=/root/.nvm/versions/node/v16.20.2/bin:$PATH; \
  cd /root/intent-swap-server && \
  ls -1t server.js.bak.* | head -5 && \
  cp server.js.bak.YYYYMMDD-HHMMSS server.js && \
  pm2 restart intent-swap-server'
```

`orders.json` is harder — it's append-only (lowdb). If corrupted, restore from a prior snapshot. There's no automatic backup configured yet; consider adding a daily cron `cp orders.json orders.json.$(date +%Y%m%d)` to a safe directory.

## Common operations

### Check pending orders
```bash
ssh root@8.133.170.62 'cat /root/intent-swap-server/orders.json | python3 -m json.tool | head -50'
```

### Tail logs
```bash
ssh root@8.133.170.62 'export PATH=/root/.nvm/versions/node/v16.20.2/bin:$PATH; pm2 logs intent-swap-server --lines 100'
```

### Manually execute one signed order
The repo ships `monitor/manual-exec.js` for this — copy to the server and run:
```bash
scp monitor/manual-exec.js root@8.133.170.62:/root/intent-swap-server/manual-exec.js
ssh root@8.133.170.62 'export PATH=/root/.nvm/versions/node/v16.20.2/bin:$PATH; \
  cd /root/intent-swap-server && node manual-exec.js <order-id>'
```

### Force a triggered state (testing)
Edit `orders.json` to set `prev` price feed manually, or wait for natural crossing.

## Known limitations

- **Auto-execute is Arbitrum-only.** Mainnet vault still owned by the original deployer wallet (not the consolidated wallet) and Linea has no vault.
- **Crossing detection** requires the previous tick to be on the other side of the target. A condition that's already true at order-creation time never auto-fires from the cron — only via manual `manual-exec.js`.
- **Single-hop Uniswap V3 only** (0.3% fee tier). No multi-hop routing yet.
- **Price feed** is DeFiLlama (`coins.llama.fi`). One-minute polling. CoinGecko alternate path lives in client-side `src/lib/prices.ts` for UI display only.
- **No retry queue** for failed notifications. A failed email is logged but not requeued.

## Critical paths to monitor

After any deploy, verify these still work:
- `GET /health` returns `{ok: true}`
- Boot log shows `[BOOT] vault ABI loaded (26 entries)`
- A test trigger fires all three channels (email, WeChat, Web Push)
- An order with `exec` field broadcasts a real Arbitrum tx within ~10s of the crossing
