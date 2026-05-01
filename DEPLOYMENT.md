# Intent-Swap 部署指南

## 📦 安装依赖

```bash
cd projects/intent-swap
npm install
```

## 🔑 环境变量配置

复制 `.env.local.example` 为 `.env.local`，填入以下 API keys：

```bash
cp .env.local.example .env.local
```

### 必需的 API Keys

1. **OpenAI API Key**
   - 用途：意图解析（LLM 模式）
   - 获取：https://platform.openai.com/api-keys
   - 变量：`OPENAI_API_KEY`

2. **WalletConnect Project ID**
   - 用途：RainbowKit 钱包连接
   - 获取：https://cloud.walletconnect.com
   - 变量：`NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`

3. **Gelato Relay API Key**
   - 用途：条件单自动执行
   - 获取：https://app.gelato.network
   - 变量：`GELATO_RELAY_API_KEY`

## 🚀 本地开发

```bash
npm run dev
```

访问：http://localhost:3000

## 🏗️ 构建

```bash
npm run build
npm start
```

## 📤 Vercel 部署

1. 连接 GitHub 仓库到 Vercel
2. 在 Vercel 项目设置中添加环境变量：
   - `OPENAI_API_KEY`
   - `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`
   - `GELATO_RELAY_API_KEY`
3. 部署

## 🔧 后端服务器（条件单监控）

后端代码位于：`projects/intent-swap-server/`

### 部署到服务器

```bash
# SSH 登录服务器
ssh root@8.133.170.62

# 上传代码
scp -r projects/intent-swap-server root@8.133.170.62:/root/

# 安装依赖
cd /root/intent-swap-server
npm install

# 启动服务（pm2）
pm2 start server.js --name intent-swap-server
pm2 save
```

### Nginx 配置

```nginx
# /etc/nginx/sites-available/api.o-sheepps.com

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

重启 Nginx：
```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 🎯 功能清单

### ✅ 已完成
- [x] 即时 swap（Uniswap V3）
- [x] 多链支持（Ethereum / Arbitrum / Linea）
- [x] 意图解析（中英文）
- [x] 滑点调整
- [x] Gas 估算
- [x] 条件单（Gelato 自动执行）
- [x] 订单管理页面
- [x] 历史记录

### 🔄 待优化
- [ ] Gelato Resolver（真正的价格条件检查）
- [ ] 更精确的 Gas 估算（链上 estimateGas）
- [ ] 网络切换自动刷新
- [ ] 更多 token 支持
- [ ] 批量操作（分批买入/卖出）

## 📝 注意事项

1. **Gelato 限制**
   - 当前实现使用定时触发（每小时检查）
   - 生产环境需要实现 Gelato Resolver 合约，实时检查价格条件
   - 参考：https://docs.gelato.network/web3-services/web3-functions

2. **Gas 估算**
   - 当前使用简化估算（固定 gas 量 + 固定 gas 价格）
   - 生产环境建议调用 `eth_estimateGas` 获取真实估算

3. **安全性**
   - 用户私钥由钱包管理，前端不接触
   - 条件单通过 Gelato 执行，无需托管资金
   - 建议添加最大滑点保护

## 🐛 故障排查

### 构建失败
- 检查 Node.js 版本（需要 >= 18）
- 删除 `node_modules` 和 `.next`，重新安装

### Gelato 任务创建失败
- 检查 `GELATO_RELAY_API_KEY` 是否正确
- 检查钱包地址是否有效
- 查看浏览器控制台错误信息

### 后端服务器无响应
- 检查 pm2 状态：`pm2 status`
- 查看日志：`pm2 logs intent-swap-server`
- 检查端口占用：`lsof -i :3002`

## 📚 相关文档

- Gelato Network: https://docs.gelato.network
- Uniswap V3: https://docs.uniswap.org/contracts/v3/overview
- wagmi: https://wagmi.sh
- RainbowKit: https://www.rainbowkit.com
