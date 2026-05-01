# 快速修复指南

## 问题
`src/app/preview/page.tsx` 中的 `<SwapPreviewCard>` 缺少 `gasEstimate` prop。

## 解决方案

### 方法 1：手动搜索修复（推荐）

1. 打开 `src/app/preview/page.tsx`
2. 按 `Ctrl+F` 搜索 `<SwapPreviewCard`
3. 找到类似这样的代码块（应该在文件的 return 语句中）：

```tsx
<SwapPreviewCard
  intent={intent}
  slippage={slippage}
  address={address}
  quote={quote}
  quoteLoading={quoteLoading}
  balance={balance ? `${Number(balance.formatted).toFixed(4)} ${balance.symbol}` : undefined}
  resolvedAmount={resolvedAmount}
  chainId={TARGET_CHAIN_ID}
/>
```

4. 在最后一个 prop 后添加一行：
```tsx
<SwapPreviewCard
  intent={intent}
  slippage={slippage}
  address={address}
  quote={quote}
  quoteLoading={quoteLoading}
  balance={balance ? `${Number(balance.formatted).toFixed(4)} ${balance.symbol}` : undefined}
  resolvedAmount={resolvedAmount}
  chainId={TARGET_CHAIN_ID}
  gasEstimate={gasEstimate}
/>
```

5. 保存文件

### 方法 2：使用 VS Code 全局替换

1. 打开 `src/app/preview/page.tsx`
2. 按 `Ctrl+H` 打开替换
3. 查找：
```
chainId={TARGET_CHAIN_ID}
/>
```
4. 替换为：
```
chainId={TARGET_CHAIN_ID}
gasEstimate={gasEstimate}
/>
```
5. 点击"全部替换"（应该只有一处）

## 验证

运行以下命令确认修复成功：

```bash
npm run build
```

如果构建成功，说明修复完成。

## 测试

```bash
npm run dev
```

访问 http://localhost:3000，测试：
1. 输入意图（如 "Swap 0.1 ETH to USDC"）
2. 跳转到预览页
3. 连接钱包
4. 检查是否显示 "Est. Gas: ~$2.00"

---

执行官，请按照上述方法之一修复，然后告诉我结果。
