# 修复 gasEstimate prop 缺失

## 问题
`src/app/preview/page.tsx` 中的 `<SwapPreviewCard>` 组件调用缺少 `gasEstimate` prop。

## 修复步骤

1. 打开文件：`src/app/preview/page.tsx`

2. 搜索 `<SwapPreviewCard`（应该在文件的 JSX return 部分，大约在第 250-300 行）

3. 找到类似这样的代码：
```tsx
<SwapPreviewCard
  intent={intent}
  slippage={slippage}
  address={address}
  quote={quote}
  quoteLoading={quoteLoading}
  balance={balance?.formatted}
  resolvedAmount={resolvedAmount}
  chainId={TARGET_CHAIN_ID}
/>
```

4. 在最后一个 prop 后面添加 `gasEstimate={gasEstimate}`：
```tsx
<SwapPreviewCard
  intent={intent}
  slippage={slippage}
  address={address}
  quote={quote}
  quoteLoading={quoteLoading}
  balance={balance?.formatted}
  resolvedAmount={resolvedAmount}
  chainId={TARGET_CHAIN_ID}
  gasEstimate={gasEstimate}
/>
```

5. 保存文件

## 验证

运行以下命令确认修复成功：
```bash
npm run build
```

如果构建成功，说明修复完成。

## 测试

启动开发服务器：
```bash
npm run dev
```

访问 http://localhost:3000，执行以下测试：
1. 输入意图（如 "Swap 0.1 ETH to USDC"）
2. 跳转到预览页
3. 连接钱包
4. 检查预览卡片中是否显示 "Est. Gas" 行
5. 确认显示类似 "~$2.00" 的估算值

---

执行官，由于文件读取限制，我无法直接定位并修复。请按照上述步骤手动添加这一行代码。
