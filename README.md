# Intent Swap

一句话，自动配置你的资产。

## 这是什么

一个基于自然语言意图的代币兑换系统。用户输入一句话（比如"我想稳健增长"），系统自动解析风险偏好，生成资产配置策略，并执行链上兑换。

**当前状态：测试版（Mock模式）**

## 技术栈

- **Frontend**: Next.js 14 + TypeScript + Tailwind CSS
- **Backend**: Node.js + Express
- **LLM**: OpenAI GPT-4o-mini（意图解析）
- **Blockchain**: Arbitrum Sepolia testnet
- **Swap**: 1inch API（当前为Mock模式）

## 快速开始

### 1. 安装依赖

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 2. 配置环境变量

```bash
cd backend
cp .env.example .env
```

编辑 `.env` 文件：

```env
OPENAI_API_KEY=your_openai_api_key
PRIVATE_KEY=your_testnet_private_key
RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
MOCK_MODE=true
PORT=3001
```

**重要：**
- `MOCK_MODE=true` 时，不会发起真实链上交易，只会模拟执行
- `PRIVATE_KEY` 仅用于测试网，**永远不要使用真实资金的私钥**

### 3. 启动服务

```bash
# Terminal 1: Backend
cd backend
npm run dev

# Terminal 2: Frontend
cd frontend
npm run dev
```

访问 http://localhost:3000

## 使用示例

输入示例：
- "我想稳健增长，长期持有" → 风险等级2，长期
- "全仓梭哈，今晚就要" → 风险等级5，短期
- "保守一点，避避险" → 风险等级1，中期

系统会自动：
1. 解析意图（风险等级、时间周期）
2. 生成资产配置（USDC/USDT/WBTC/WETH）
3. 执行兑换（当前为Mock模式）

## 架构

```
用户输入
  ↓
Intent Parser (LLM)
  ↓
Strategy Engine (规则)
  ↓
Execution Engine (1inch)
  ↓
结果展示
```

## 风险等级策略

| 等级 | 配置 |
|------|------|
| 1 | USDC 90%, USDT 10% |
| 2 | USDC 70%, WBTC 15%, WETH 15% |
| 3 | USDC 50%, WBTC 25%, WETH 25% |
| 4 | WBTC 40%, WETH 40%, USDC 20% |
| 5 | WBTC 50%, WETH 50% |

## 注意事项

⚠️ **这是测试版本**
- 当前运行在 Mock 模式
- 不会发起真实链上交易
- 仅用于演示和测试

⚠️ **安全提醒**
- 永远不要在 `.env` 中使用真实资金的私钥
- 测试网代币没有价值
- 上线前需要完整的安全审计

## 下一步

- [ ] 接入真实 1inch API（testnet）
- [ ] 添加滑点保护
- [ ] 实现分批执行
- [ ] Gas 优化
- [ ] MEV 保护
- [ ] 前端接入 MetaMask
- [ ] 添加交易历史记录

## License

MIT
