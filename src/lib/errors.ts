/**
 * 把技术性错误信息转换成用户友好的提示
 */
export function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();

  if (lower.includes("rejected") || lower.includes("denied") || lower.includes("user rejected"))
    return "You cancelled the transaction.";
  if (lower.includes("insufficient funds") || lower.includes("insufficient balance"))
    return "Insufficient balance to complete this swap.";
  if (lower.includes("no liquidity") || lower.includes("liquidity"))
    return "No liquidity available for this pair. Try a different amount or token.";
  if (lower.includes("slippage") || lower.includes("price impact") || lower.includes("too little received"))
    return "Price moved too much. Try increasing slippage tolerance.";
  if (lower.includes("deadline") || lower.includes("expired"))
    return "Transaction expired. Please try again.";
  if (lower.includes("network") || lower.includes("fetch") || lower.includes("connection"))
    return "Network error. Check your connection and try again.";
  if (lower.includes("gas") || lower.includes("out of gas"))
    return "Transaction ran out of gas. Try again with a higher gas limit.";
  if (lower.includes("nonce"))
    return "Transaction conflict. Please wait a moment and try again.";
  if (lower.includes("allowance") || lower.includes("approve"))
    return "Token approval failed. Please try again.";
  if (lower.includes("quote") || lower.includes("route"))
    return "Could not find a route for this swap. Try a different pair.";

  return "Something went wrong. Please try again.";
}
