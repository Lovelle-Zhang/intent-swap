if (!globalThis.fetch) { const nf = require("node-fetch"); globalThis.fetch = nf.default || nf; globalThis.Headers = nf.Headers; globalThis.Request = nf.Request; globalThis.Response = nf.Response; }
try { require("dotenv").config(); } catch {}
const express = require("express");
const axios = require("axios");
const webpush = require("web-push");
const low = require("lowdb");
const FileSync = require("lowdb/adapters/FileSync");

const app = express();
app.use(express.json());

// ── On-chain auto-execute via ConditionalSwapVault (added by claude) ───────
const _fs = require("fs");
const _path = require("path");
const KEEPER_PRIVATE_KEY = process.env.KEEPER_PRIVATE_KEY || "";
const ARB_RPC = process.env.ARBITRUM_RPC_URL || "https://arb1.arbitrum.io/rpc";

let VAULT_ABI = null;
try {
  const json = JSON.parse(_fs.readFileSync(_path.join(__dirname, "vault-abi.json"), "utf8"));
  VAULT_ABI = json.abi || json;
  console.log(`[BOOT] vault ABI loaded (${VAULT_ABI.length} entries)`);
} catch (e) {
  console.warn(`[BOOT] no vault ABI — on-chain execution disabled (${e.message})`);
}

const VAULT_ADDRESSES = { 42161: "0x3e89119234c0635e861cce71efa274f1defd6818" };
let _viemClients = null;
async function getViemClients() {
  if (_viemClients) return _viemClients;
  if (!KEEPER_PRIVATE_KEY || !VAULT_ABI) return null;
  const { createWalletClient, createPublicClient, http } = await import("viem");
  const { privateKeyToAccount } = await import("viem/accounts");
  const { arbitrum } = await import("viem/chains");
  const pk = KEEPER_PRIVATE_KEY.startsWith("0x") ? KEEPER_PRIVATE_KEY : "0x" + KEEPER_PRIVATE_KEY;
  const account = privateKeyToAccount(pk);
  _viemClients = {
    walletClients: { 42161: createWalletClient({ account, chain: arbitrum, transport: http(ARB_RPC) }) },
    publicClients: { 42161: createPublicClient({ chain: arbitrum, transport: http(ARB_RPC) }) },
  };
  console.log(`[EXEC] keeper configured: ${account.address}`);
  return _viemClients;
}

async function executeOnChain(order) {
  const exec = order.exec;
  if (!exec) return { skipped: "not-executable" };
  if (exec.chainId !== 42161) return { skipped: `chain ${exec.chainId} not supported yet` };
  const vaultAddr = VAULT_ADDRESSES[exec.chainId];
  if (!vaultAddr || vaultAddr.toLowerCase() !== String(exec.vaultAddress).toLowerCase()) {
    return { skipped: "vault address mismatch" };
  }
  const clients = await getViemClients();
  if (!clients) return { skipped: "keeper not configured" };
  const orderStruct = {
    user: exec.user,
    tokenIn: exec.tokenIn,
    tokenOut: exec.tokenOut,
    amountIn: BigInt(exec.amountIn),
    amountOutMinimum: BigInt(exec.amountOutMinimum),
    path: exec.path,
    isMultiHop: !!exec.isMultiHop,
    nonce: BigInt(exec.nonce),
    deadline: BigInt(exec.deadline),
  };
  const hash = await clients.walletClients[exec.chainId].writeContract({
    address: vaultAddr,
    abi: VAULT_ABI,
    functionName: "executeOrder",
    args: [orderStruct, exec.signature],
  });
  console.log(`[EXEC] tx submitted ${hash}`);
  const receipt = await clients.publicClients[exec.chainId].waitForTransactionReceipt({ hash });
  return { hash, status: receipt.status };
}


// ── WeChat notification via Server Chan (added by claude) ───────────────────
const SCT_KEY = process.env.SCT_KEY || "";
if (!SCT_KEY) console.warn("[BOOT] SCT_KEY not set — WeChat notifications disabled.");

function sendWechat(title, desp) {
  if (!SCT_KEY) return Promise.resolve({ ok: false, error: "SCT_KEY not set" });
  return new Promise((resolve) => {
    const https = require("https");
    const url = "https://sctapi.ftqq.com/" + SCT_KEY + ".send?title=" + encodeURIComponent(title) + "&desp=" + encodeURIComponent(desp);
    https.get(url, (res) => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => { console.log("[WECHAT]", d.slice(0, 200)); resolve({ ok: res.statusCode < 400, body: d }); });
    }).on("error", (e) => { console.error("[WECHAT ERR]", e.message); resolve({ ok: false, error: e.message }); });
  });
}
// ── end claude patch ────────────────────────────────────────────────────────






// CORS
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});


// ─── Auth: bearer key 验证 (added by claude) ────────────────────────────────
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || "";
if (!INTERNAL_API_KEY) console.error("[FATAL] INTERNAL_API_KEY not set — /swap-orders endpoints disabled");
function requireKey(req, res, next) {
  if (!INTERNAL_API_KEY) return res.status(503).json({ error: "Server misconfigured" });
  const h = req.headers["authorization"] || "";
  const got = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (got.length !== INTERNAL_API_KEY.length) return res.status(401).json({ error: "Unauthorized" });
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ INTERNAL_API_KEY.charCodeAt(i);
  if (diff !== 0) return res.status(401).json({ error: "Unauthorized" });
  next();
}

// DB
const adapter = new FileSync("orders.json");
const db = low(adapter);
db.defaults({ orders: [], pushSubscriptions: [], subscriptions: [] }).write();

// 订阅 DB（独立文件，避免和 orders.json 混）
const subAdapter = new FileSync("subscriptions.json");
const subDb = low(subAdapter);
subDb.defaults({ subscriptions: [], usedTxHashes: [] }).write();

// VAPID (Web Push) — generate with: npx web-push generate-vapid-keys
const VAPID_PUBLIC  = process.env.VAPID_PUBLIC  || "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:ops@example.com";
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
} else {
  console.warn("[BOOT] VAPID_PUBLIC / VAPID_PRIVATE not set — Web Push disabled.");
}



// ── Email via Resend (added by claude) ──────────────────────────────────────
// Replaces the Gmail SMTP path which is GFW-blocked on the China-based host.
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const RESEND_FROM    = process.env.RESEND_FROM    || "Intent Swap <onboarding@resend.dev>";
if (!RESEND_API_KEY) console.warn("[BOOT] RESEND_API_KEY not set — email delivery disabled.");

async function sendEmail({ to, subject, text, html }) {
  if (!RESEND_API_KEY) return { ok: false, error: "RESEND_API_KEY not set" };
  try {
    const body = { from: RESEND_FROM, to: [to], subject };
    if (html) body.html = html;
    if (text) body.text = text;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": "Bearer " + RESEND_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.message || ("status " + res.status) };
    return { ok: true, id: data?.id };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}
// ── end claude patch ────────────────────────────────────────────────────────

// ── Notification helpers (added by claude) ──────────────────────────────────
function txExplorerUrl(hash, chainId) {
  if (!hash) return null;
  if (chainId === 42161) return `https://arbiscan.io/tx/${hash}`;
  if (chainId === 59144) return `https://lineascan.build/tx/${hash}`;
  return `https://etherscan.io/tx/${hash}`;
}

function emailHtml({ executed, fromToken, toToken, amount, token, currentPrice, targetPrice, operator, txUrl, orderId, executeDeepUrl }) {
  const status = executed
    ? `<span style="display:inline-block;padding:2px 8px;font-size:11px;background:#dcfce7;color:#166534;border-radius:4px;">Executed on-chain</span>`
    : `<span style="display:inline-block;padding:2px 8px;font-size:11px;background:#fef3c7;color:#92400e;border-radius:4px;">Action required</span>`;
  const cta = executed
    ? `<a href="https://intent-swap-phi.vercel.app/activity?filter=orders" style="display:inline-block;background:#f59e0b;color:#1c1917;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:500;font-size:13px;">View your activity →</a>`
    : `<a href="${executeDeepUrl || "https://intent-swap-phi.vercel.app"}" style="display:inline-block;background:#f59e0b;color:#1c1917;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:500;font-size:13px;">Execute swap →</a>`;
  const title = executed
    ? `Swap executed: ${fromToken} → ${toToken}`
    : `${token} price ${operator === "below" ? "dropped" : "rose"} past your target`;
  return `<div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#fafaf9;color:#1c1917;">
  <div style="border-bottom:2px solid #f59e0b;padding-bottom:12px;margin-bottom:24px;">
    <div style="color:#78716c;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;">⬡ Intent Swap</div>
  </div>
  <div style="margin-bottom:8px;">${status}</div>
  <h1 style="font-size:20px;font-weight:500;margin:0 0 24px;line-height:1.4;">${title}</h1>
  <table style="width:100%;font-size:14px;border-collapse:collapse;">
    <tr><td style="color:#78716c;padding:8px 0;border-bottom:1px solid #e7e5e4;">Pair</td><td style="text-align:right;padding:8px 0;border-bottom:1px solid #e7e5e4;">${fromToken} → ${toToken}</td></tr>
    <tr><td style="color:#78716c;padding:8px 0;border-bottom:1px solid #e7e5e4;">Amount</td><td style="text-align:right;padding:8px 0;border-bottom:1px solid #e7e5e4;">${amount} ${fromToken}</td></tr>
    <tr><td style="color:#78716c;padding:8px 0;border-bottom:1px solid #e7e5e4;">${token} price</td><td style="text-align:right;padding:8px 0;border-bottom:1px solid #e7e5e4;">$${currentPrice.toFixed(2)}</td></tr>
    <tr><td style="color:#78716c;padding:8px 0;">Your target</td><td style="text-align:right;padding:8px 0;">${operator} $${targetPrice.toLocaleString()}</td></tr>
  </table>
  <div style="text-align:center;margin:32px 0 16px;">${cta}</div>
  <div style="color:#a8a29e;font-size:11px;text-align:center;margin-top:32px;border-top:1px solid #e7e5e4;padding-top:16px;">
    Order <code style="font-family:ui-monospace,monospace;">${orderId}</code>${executed && txUrl ? ` · <a href="${txUrl}" style="color:#78716c;text-decoration:underline;">Tx on explorer ↗</a>` : ""}
  </div>
</div>`;
}

function wechatMarkdown({ executed, fromToken, toToken, amount, token, currentPrice, targetPrice, operator, txUrl, orderId, executeDeepUrl }) {
  const lines = executed ? [
    `### ✓ Swap executed`,
    `**${fromToken} → ${toToken}** · auto`,
    ``,
    `| | |`,
    `|---|---|`,
    `| 触发价 | $${currentPrice.toFixed(2)} |`,
    `| 数量 | ${amount} ${fromToken} |`,
    `| 目标 | ${operator} $${targetPrice.toLocaleString()} |`,
    `| 状态 | 已上链 ✓ |`,
    ``,
    `[查看我的订单 →](https://intent-swap-phi.vercel.app/activity?filter=orders)`,
    ``,
    `链上凭证：[查看交易 ↗](${txUrl})`,
    ``,
    `Order: \`${orderId}\``,
  ] : [
    `### ${token} 价格 ${operator === "below" ? "跌破" : "突破"} 目标`,
    `**${fromToken} → ${toToken}** · 待手动执行`,
    ``,
    `| | |`,
    `|---|---|`,
    `| 当前价 | $${currentPrice.toFixed(2)} |`,
    `| 你的目标 | ${operator} $${targetPrice.toLocaleString()} |`,
    `| 数量 | ${amount} ${fromToken} |`,
    ``,
    `[立即执行 →](${executeDeepUrl || "https://intent-swap-phi.vercel.app"})`,
    ``,
    `Order: \`${orderId}\``,
  ];
  return lines.join("\n");
}
// ── end claude patch ────────────────────────────────────────────────────────





// 价格缓存
const priceCache = {};
const prevPriceCache = {};

// Token price slugs for DeFiLlama (chain:address). Mix of Ethereum/Arbitrum addresses.
const TOKEN_ADDRESSES = {
  ETH:  "ethereum:0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  WETH: "ethereum:0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  USDC: "ethereum:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  USDT: "ethereum:0xdAC17F958D2ee523a2206206994597C13D831ec7",
  WBTC: "ethereum:0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
  BTC:  "ethereum:0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",   // alias → WBTC price
  DAI:  "ethereum:0x6B175474E89094C44Da98b954EedeAC495271d0F",
  ARB:  "arbitrum:0x912CE59144191C1204E64559FE8253a0e49E6548",
};

async function getPrice(token) {
  const slug = TOKEN_ADDRESSES[token.toUpperCase()];
  if (!slug) return null;
  try {
    const res = await axios.get(`https://coins.llama.fi/prices/current/${slug}`, { timeout: 5000 });
    return res.data.coins[slug]?.price ?? null;
  } catch {
    return null;
  }
}

// RPC endpoints per chain
const RPC_URLS = {
  1:     "https://rpc.flashbots.net",
  42161: "https://arb1.arbitrum.io/rpc",
  59144: "https://rpc.linea.build",
};

async function broadcastSignedTx(signedTx, chainId) {
  const rpc = RPC_URLS[chainId] || RPC_URLS[1];
  try {
    const res = await axios.post(rpc, {
      jsonrpc: "2.0",
      method: "eth_sendRawTransaction",
      params: [signedTx],
      id: 1,
    }, { timeout: 10000 });
    if (res.data.error) throw new Error(res.data.error.message);
    return { success: true, txHash: res.data.result };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// 发 Web Push 通知
async function sendWebPush(orderId, title, body, url) {
  const subs = db.get("pushSubscriptions").filter({ orderId }).value();
  if (subs.length === 0) return;
  const payload = JSON.stringify({ title, body, url });
  for (const sub of subs) {
    try {
      await webpush.sendNotification(sub.subscription, payload);
      console.log(`[webpush] Sent to orderId ${orderId}`);
    } catch (err) {
      console.warn(`[webpush] Failed for orderId ${orderId}:`, err.message);
      // 订阅失效时清理
      if (err.statusCode === 410 || err.statusCode === 404) {
        db.get("pushSubscriptions").remove({ orderId }).write();
      }
    }
  }
}

async function sendAlert(order, currentPrice) {
  const { email, condition, id, fromToken, toToken, amount, signedTx, chainId } = order;
  const { token, operator, targetPrice } = condition;

  let txHash = null;
  let autoExecuted = false;

  // 尝试自动执行预签名交易
  if (signedTx) {
    console.log(`[${new Date().toISOString()}] Attempting auto-execute for order ${id}...`);
    const result = await broadcastSignedTx(signedTx, chainId || 1);
    if (result.success) {
      txHash = result.txHash;
      autoExecuted = true;
      console.log(`[${new Date().toISOString()}] Auto-executed order ${id}: tx ${txHash}`);
    } else {
      console.warn(`[${new Date().toISOString()}] Auto-execute failed for order ${id}: ${result.error}`);
    }
  }


  // Vault EIP-712 path (added by claude)
  if (!autoExecuted && order.exec) {
    try {
      const r = await executeOnChain(order);
      if (r.hash && r.status === "success") {
        txHash = r.hash;
        autoExecuted = true;
        console.log(`[VAULT] order ${id} executed: ${txHash}`);
      } else {
        console.warn(`[VAULT] order ${id} failed: ${r.skipped || r.error || r.status}`);
      }
    } catch (e) {
      console.error(`[VAULT] order ${id} threw:`, e.message);
    }
  }

  // ── Notifications (chain-aware, each channel isolated) ──
  const chainIdForUrl = order?.exec?.chainId || chainId || 1;
  const txUrl = txExplorerUrl(txHash, chainIdForUrl);
  const executeDeepUrl = `https://intent-swap-phi.vercel.app/execute?from=${encodeURIComponent(fromToken)}&to=${encodeURIComponent(toToken)}&amount=${encodeURIComponent(amount)}&orderId=${encodeURIComponent(id)}`;
  const notifData = {
    executed: autoExecuted,
    fromToken, toToken, amount,
    token, currentPrice, targetPrice, operator,
    txUrl, orderId: id, executeDeepUrl,
  };
  const wxTitle = autoExecuted ? `Intent Swap · 已执行 ${fromToken}→${toToken}` : `Intent Swap · ${token} 价格警报`;
  const emailSubject = autoExecuted
    ? `[Intent Swap] ✓ ${fromToken} → ${toToken} executed`
    : `[Intent Swap] ${token} price alert · execute now`;
  const wxBody = wechatMarkdown(notifData);
  const emailHtmlStr = emailHtml(notifData);
  const emailTextFallback = `${autoExecuted ? "Swap executed" : "Price alert"}: ${fromToken} → ${toToken} (${token} now ${currentPrice.toFixed(2)}, target ${operator} ${targetPrice.toLocaleString()}). View: ${txUrl || "https://intent-swap-phi.vercel.app"}`;

  // Mark before sending so we know what was attempted even if process crashes
  db.get("orders").find({ id }).assign({
    triggered: true, triggeredAt: Date.now(), triggerPrice: currentPrice, txHash, autoExecuted,
  }).write();

  // Fire all channels in parallel; each isolated
  await Promise.allSettled([
    sendWechat(wxTitle, wxBody).then(r => !r.ok && console.error("[WECHAT]", r.error)).catch(e => console.error("[WECHAT]", e.message)),
    email ? sendEmail({ to: email, subject: emailSubject, text: emailTextFallback, html: emailHtmlStr })
      .then(r => !r.ok && console.error("[EMAIL]", r.error)).catch(e => console.error("[EMAIL]", e.message))
      : Promise.resolve(),
  ]);
}

// 每分钟检查条件单
async function checkOrders() {
  const orders = db.get("orders").filter({ triggered: false }).value();
  if (orders.length === 0) return;

  console.log(`[${new Date().toISOString()}] Checking ${orders.length} pending orders...`);

  for (const order of orders) {
    const { condition } = order;
    const price = await getPrice(condition.token);
    if (!price) continue;

    const prev = prevPriceCache[condition.token];
    prevPriceCache[condition.token] = price;
    priceCache[condition.token] = price;

    if (!prev) continue;

    const crossedBelow = condition.operator === "below" && prev > condition.targetPrice && price <= condition.targetPrice;
    const crossedAbove = condition.operator === "above" && prev < condition.targetPrice && price >= condition.targetPrice;

    if (crossedBelow || crossedAbove) {
      console.log(`[${new Date().toISOString()}] Order ${order.id} triggered: ${condition.token} $${prev.toFixed(2)} → $${price.toFixed(2)} (target: $${condition.targetPrice})`);
      await sendAlert(order, price);
    }
  }
}

setInterval(checkOrders, 60 * 1000);
checkOrders();

// 每天清理 7 天前已触发的订单
setInterval(() => {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const before = db.get("orders").size().value();
  db.get("orders").remove((o) => o.triggered && o.triggeredAt < cutoff).write();
  const after = db.get("orders").size().value();
  if (before !== after) console.log(`[cleanup] Removed ${before - after} old orders`);
}, 24 * 60 * 60 * 1000);

// ─── API Routes ────────────────────────────────────────────────────────────

// GET /vapid-public-key — 前端拿 VAPID 公钥
app.get("/vapid-public-key", (req, res) => {
  res.json({ publicKey: VAPID_PUBLIC });
});

// POST /push-subscribe — 保存 Web Push 订阅
app.post("/push-subscribe", (req, res) => {
  const { orderId, subscription } = req.body;
  if (!orderId || !subscription || !subscription.endpoint) {
    return res.status(400).json({ error: "Missing orderId or subscription" });
  }
  // 去重：同一 orderId + endpoint 只存一条
  const exists = db.get("pushSubscriptions")
    .find({ orderId, "subscription.endpoint": subscription.endpoint })
    .value();
  if (!exists) {
    db.get("pushSubscriptions").push({ orderId, subscription, createdAt: Date.now() }).write();
  }
  console.log(`[webpush] Subscription saved for orderId ${orderId}`);
  res.json({ success: true });
});

// POST /swap-orders — 提交条件单（email 现在可选）
app.post("/swap-orders", requireKey, (req, res) => {
  const { email, fromToken, toToken, amount, condition, exec } = req.body;
  if (!condition || !condition.token || !condition.operator || condition.targetPrice == null) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const order = {
    id,
    email: email || null,
    fromToken,
    toToken,
    amount,
    condition,
    triggered: false,
    createdAt: Date.now(),
    exec: exec || null,
  };
  db.get("orders").push(order).write();
  console.log(`[${new Date().toISOString()}] New order ${id}: ${condition.token} ${condition.operator} $${condition.targetPrice}`);
  res.json({ success: true, id });
});

// GET /swap-orders?email=xxx — 查询订单
app.get("/swap-orders", requireKey, (req, res) => {
  const { email } = req.query;
  const orders = email
    ? db.get("orders").filter({ email }).orderBy("createdAt", "desc").value()
    : db.get("orders").orderBy("createdAt", "desc").value();
  res.json({ orders });
});

// DELETE /swap-orders/:id — 取消订单
app.delete("/swap-orders/:id", requireKey, (req, res) => {
  const { id } = req.params;
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: "Missing email query param" });
  const exists = db.get("orders").find({ id }).value();
  if (!exists) return res.status(404).json({ error: "Order not found" });
  if (exists.email !== email) return res.status(403).json({ error: "Order does not belong to this email" });
  db.get("orders").remove({ id }).write();
  // 同时清理该订单的 push 订阅
  db.get("pushSubscriptions").remove({ orderId: id }).write();
  console.log(`[${new Date().toISOString()}] Order ${id} cancelled`);
  res.json({ success: true });
});

// GET /prices — 当前价格
app.get("/prices", async (req, res) => {
  const tokens = ["ETH", "USDC", "WBTC", "DAI", "USDT"];
  const prices = {};
  for (const t of tokens) {
    prices[t] = priceCache[t] ?? (await getPrice(t));
    if (prices[t]) priceCache[t] = prices[t];
  }
  res.json(prices);
});

// GET /health
app.get("/health", (req, res) => res.json({ ok: true, orders: db.get("orders").size().value() }));

// ─── 订阅接口 ────────────────────────────────────────────────────────────────

// POST /subscriptions — 前端验证通过后记录订阅（防重放）
app.post("/subscriptions", (req, res) => {
  const { email, txHash, activatedAt, expiresAt } = req.body;
  if (!email || !txHash) {
    return res.status(400).json({ error: "email and txHash required" });
  }

  // 防重放：同一 txHash 只能激活一次
  const alreadyUsed = subDb.get("usedTxHashes").includes(txHash).value();
  if (alreadyUsed) {
    return res.status(409).json({ error: "Transaction already used" });
  }

  // 记录 txHash
  subDb.get("usedTxHashes").push(txHash).write();

  // 更新或新增订阅
  const existing = subDb.get("subscriptions").find({ email }).value();
  if (existing) {
    subDb.get("subscriptions")
      .find({ email })
      .assign({ txHash, activatedAt, expiresAt, updatedAt: Date.now() })
      .write();
  } else {
    subDb.get("subscriptions").push({
      email,
      txHash,
      activatedAt: activatedAt || Date.now(),
      expiresAt: expiresAt || (Date.now() + 30 * 24 * 60 * 60 * 1000),
      createdAt: Date.now(),
    }).write();
  }

  console.log(`[subscription] Activated for ${email}, expires ${new Date(expiresAt).toISOString()}`);
  res.json({ success: true });
});

// GET /subscriptions/check?email=xxx — 检查订阅状态
app.get("/subscriptions/check", (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: "email required" });

  const sub = subDb.get("subscriptions").find({ email }).value();
  if (!sub) return res.json({ active: false });

  const active = sub.expiresAt > Date.now();
  res.json({ active, expiresAt: sub.expiresAt });
});

const PORT = 3002;
app.listen(PORT, () => console.log(`[${new Date().toISOString()}] intent-swap-server running on port ${PORT}`));
