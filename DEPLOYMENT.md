# Deployment Guide

## 1. Local Setup

### Install dependencies

```bash
git clone https://github.com/Lovelle-Zhang/intent-swap.git
cd intent-swap
npm install
```

Node.js **18+** required.

### Configure environment variables

```bash
cp .env.local.example .env.local
```

Required keys:

| Variable | Purpose | Source |
|---|---|---|
| `OPENAI_API_KEY` | LLM intent parsing | https://platform.openai.com/api-keys |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Wallet connect | https://cloud.walletconnect.com |
| `GELATO_RELAY_API_KEY` | Conditional-order automation | https://app.gelato.network |

> ⚠️ **Security note**: `GELATO_RELAY_API_KEY` should **not** have a `NEXT_PUBLIC_` prefix — it is used server-side only.

### Run

```bash
npm run dev          # http://localhost:3000
npm run build && npm start   # production build
```

---

## 2. Vercel Deployment (Frontend)

1. Connect the GitHub repo to Vercel.
2. Project settings → **Environment Variables**: add all three keys from above.
3. Push to `main` — Vercel auto-deploys.
4. Verify at your Vercel URL.

---

## 3. Backend Service (Order Monitor)

The conditional-order monitor lives in `backend/` and runs as a separate Node service. It exposes order CRUD + price polling endpoints.

### Deploy to a Linux server

```bash
# Copy code
scp -r backend/ root@<your-server>:/root/intent-swap-backend

# On the server
ssh root@<your-server>
cd /root/intent-swap-backend
npm install

# Run with PM2
pm2 start server.js --name intent-swap-backend
pm2 save
pm2 startup    # follow the printed command to enable boot autostart
```

### Nginx reverse proxy

Add to your server block (e.g. `/etc/nginx/sites-available/api.your-domain.com`):

```nginx
location /swap-orders {
    proxy_pass http://localhost:3002/orders;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
}

location /swap-prices {
    proxy_pass http://localhost:3002/prices;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
}
```

Reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## 4. Smart Contracts

Source: `contracts/ConditionalSwapVault.sol`
Deploy script: `contracts/deploy.js`

Currently deployed addresses are recorded in `src/lib/vault.ts`. Update that file after each new deployment.

> 📌 **TODO**: Arbitrum and Linea vault addresses are not yet deployed (placeholder `0x0...0` in `src/lib/vault.ts`).

---

## 5. Pre-Deploy Checklist

- [ ] `npm install` succeeds with no peer-dep warnings
- [ ] `npm run build` succeeds
- [ ] Local smoke test: connect wallet, run an instant swap, create a conditional order
- [ ] All three env vars are set in Vercel
- [ ] Backend service running (`pm2 status` shows `online`)
- [ ] Nginx reverse-proxy routes return 200

---

## 6. Troubleshooting

**Build fails**
- Confirm Node 18+ (`node -v`)
- Delete `node_modules/` and `.next/`, then `npm install`

**Gelato task creation fails**
- Verify `GELATO_RELAY_API_KEY` is set (server-side, not `NEXT_PUBLIC_`)
- Check the wallet has a non-zero balance for the source token
- Inspect the browser console + Vercel function logs

**Backend unreachable**
- `pm2 status` — is it running?
- `pm2 logs intent-swap-backend` — any crashes?
- `lsof -i :3002` — port available?

---

## 7. Known Limitations

1. **Conditional orders** use scheduled polling (hourly), not a real on-chain resolver. Production should implement a Gelato Web3 Function. See https://docs.gelato.network/web3-services/web3-functions.
2. **Gas estimates** are static heuristics. For precision, call `eth_estimateGas` on the actual swap calldata.
3. **Arbitrum / Linea vaults** not yet deployed — conditional orders are Ethereum-only for now.

---

## References

- Gelato: https://docs.gelato.network
- Uniswap V3: https://docs.uniswap.org/contracts/v3/overview
- wagmi: https://wagmi.sh
- RainbowKit: https://www.rainbowkit.com
