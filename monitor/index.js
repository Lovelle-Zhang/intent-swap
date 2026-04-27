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

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  if (req.method === "POST" && req.url === "/orders") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const order = JSON.parse(body);
        addOrder(order);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
    });
    return;
  }

  if (req.method === "GET" && req.url === "/orders") {
    const orders = db.get("orders").value();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(orders));
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, orders: db.get("orders").size().value() }));
    return;
  }

  res.writeHead(404);
  res.end();
});

const PORT = process.env.PORT ?? 3001;
server.listen(PORT, () => {
  console.log(`[SERVER] Intent Swap Monitor running on port ${PORT}`);
  console.log(`[SERVER] Checking prices every minute`);
});
