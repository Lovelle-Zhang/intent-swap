const cron = require("node-cron");
const low = require("lowdb");
const FileSync = require("lowdb/adapters/FileSync");
const nodemailer = require("nodemailer");

// DB 初始化
const adapter = new FileSync("orders.json");
const db = low(adapter);
db.defaults({ orders: [] }).write();

// 邮件配置（可选，没有就只打印日志）
const SMTP_HOST = process.env.SMTP_HOST ?? "";
const SMTP_USER = process.env.SMTP_USER ?? "";
const SMTP_PASS = process.env.SMTP_PASS ?? "";

const mailer = SMTP_HOST
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: 465,
      secure: true,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    })
  : null;

// Token ID 映射（CoinGecko）
const TOKEN_IDS = {
  ETH: "ethereum",
  WETH: "weth",
  BTC: "bitcoin",
  WBTC: "wrapped-bitcoin",
  ARB: "arbitrum",
  USDC: "usd-coin",
  USDT: "tether",
  DAI: "dai",
};

// 查价格
async function getPrices(tokens) {
  const ids = [...new Set(tokens.map((t) => TOKEN_IDS[t]).filter(Boolean))];
  if (ids.length === 0) return {};

  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=usd`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CoinGecko error: ${res.status}`);
  const data = await res.json();

  // 反转映射：coingecko_id → price
  const prices = {};
  for (const [symbol, id] of Object.entries(TOKEN_IDS)) {
    if (data[id]) prices[symbol] = data[id].usd;
  }
  return prices;
}

// 发通知
async function notify(order, currentPrice) {
  const msg = `🔔 Intent Swap Alert\n\n${order.summary}\n\nCurrent ${order.condition.token} price: $${currentPrice.toLocaleString()}\n\nGo to your app to execute the swap.`;
  console.log(`[TRIGGER] Order ${order.id}: ${msg}`);

  if (mailer && order.notifyEmail) {
    await mailer.sendMail({
      from: SMTP_USER,
      to: order.notifyEmail,
      subject: `Intent Swap: ${order.condition.token} condition triggered`,
      text: msg,
    });
    console.log(`[EMAIL] Sent to ${order.notifyEmail}`);
  }
}

// 添加订单（供前端 API 调用）
function addOrder(order) {
  db.get("orders").push({ ...order, status: "active" }).write();
  console.log(`[ORDER] Added: ${order.summary}`);
}

// 检查所有活跃订单
async function checkOrders() {
  const activeOrders = db.get("orders").filter({ status: "active" }).value();
  if (activeOrders.length === 0) return;

  const tokens = [...new Set(activeOrders.map((o) => o.condition.token))];

  let prices;
  try {
    prices = await getPrices(tokens);
  } catch (err) {
    console.error("[ERROR] Failed to fetch prices:", err.message);
    return;
  }

  console.log(`[CHECK] Prices: ${JSON.stringify(prices)}`);

  for (const order of activeOrders) {
    const { token, operator, targetPrice } = order.condition;
    const currentPrice = prices[token];
    if (!currentPrice) continue;

    const triggered =
      (operator === "below" && currentPrice <= targetPrice) ||
      (operator === "above" && currentPrice >= targetPrice);

    if (triggered) {
      await notify(order, currentPrice);
      // 标记为已触发
      db.get("orders").find({ id: order.id }).assign({ status: "triggered", triggeredAt: new Date().toISOString(), triggeredPrice: currentPrice }).write();
    }
  }
}

// 每分钟检查一次
cron.schedule("* * * * *", async () => {
  console.log(`[CRON] ${new Date().toISOString()} Checking orders...`);
  await checkOrders();
});

// HTTP 服务：接收前端推送的订单
const http = require("http");

// 共享密钥：仅 Next.js 服务端代理知道。绕过 Next.js 直接打这个端口的请求会被 401 拒。
// 部署时务必在 monitor 服务器和 Vercel 上设置相同的值。
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY ?? "";

if (!INTERNAL_API_KEY) {
  console.error("[FATAL] INTERNAL_API_KEY env var not set. POST /orders is disabled until you set it.");
}

function isAuthorized(req) {
  if (!INTERNAL_API_KEY) return false;
  const header = req.headers["authorization"] ?? "";
  // 取消"Bearer "前缀，剩余部分跟 key 做常量时间比较（避免 timing attack）
  const got = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (got.length !== INTERNAL_API_KEY.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) {
    diff |= got.charCodeAt(i) ^ INTERNAL_API_KEY.charCodeAt(i);
  }
  return diff === 0;
}

function jsonResponse(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  // Parse URL once (req.url may include ?query)
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // ─── /health ─── (public, no auth)
  if (req.method === "GET" && pathname === "/health") {
    return jsonResponse(res, 200, { ok: true, orders: db.get("orders").size().value() });
  }

  // ─── POST /orders ── create
  if (req.method === "POST" && pathname === "/orders") {
    if (!isAuthorized(req)) return jsonResponse(res, 401, { error: "Unauthorized" });
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const order = JSON.parse(body);
        addOrder(order);
        jsonResponse(res, 200, { ok: true, id: order.id ?? null });
      } catch {
        jsonResponse(res, 400, { error: "Invalid JSON" });
      }
    });
    return;
  }

  // ─── GET /orders?email=X ── list by email
  if (req.method === "GET" && pathname === "/orders") {
    if (!isAuthorized(req)) return jsonResponse(res, 401, { error: "Unauthorized" });
    const email = url.searchParams.get("email");
    if (!email) return jsonResponse(res, 400, { error: "Missing email query param" });
    const orders = db.get("orders").filter((o) => o.notifyEmail === email || o.email === email).value();
    return jsonResponse(res, 200, { orders });
  }

  // ─── DELETE /orders/:id?email=X ── cancel (with ownership check)
  if (req.method === "DELETE" && pathname.startsWith("/orders/")) {
    if (!isAuthorized(req)) return jsonResponse(res, 401, { error: "Unauthorized" });
    const id = pathname.slice("/orders/".length);
    if (!id) return jsonResponse(res, 400, { error: "Missing order id" });
    const email = url.searchParams.get("email");
    if (!email) return jsonResponse(res, 400, { error: "Missing email query param" });
    const order = db.get("orders").find((o) => String(o.id) === String(id)).value();
    if (!order) return jsonResponse(res, 404, { error: "Order not found" });
    const ownerEmail = order.notifyEmail || order.email;
    if (ownerEmail !== email) return jsonResponse(res, 403, { error: "Order does not belong to this email" });
    db.get("orders").remove((o) => String(o.id) === String(id)).write();
    console.log(`[CANCEL] Order ${id} cancelled by ${email}`);
    return jsonResponse(res, 200, { ok: true });
  }

  res.writeHead(404);
  res.end();
});

const PORT = process.env.PORT ?? 3001;
server.listen(PORT, () => {
  console.log(`[SERVER] Intent Swap Monitor running on port ${PORT}`);
  console.log(`[SERVER] Checking prices every minute`);
});
