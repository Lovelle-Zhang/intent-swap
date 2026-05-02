export interface SwapRecord {
  id: string;
  timestamp: number;
  fromToken: string;
  toToken: string;
  amount: number;
  amountOut: string;
  txHash: string;
  chainId?: number;
  gasCostUSD?: string;
  priceImpact?: string;
  summary?: string;
}

const KEY = "intent-swap-history";

export function getHistory(): SwapRecord[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function addRecord(record: Omit<SwapRecord, "id">) {
  const history = getHistory();
  const newRecord = { ...record, id: `${Date.now()}-${Math.random().toString(36).slice(2)}` };
  localStorage.setItem(KEY, JSON.stringify([newRecord, ...history].slice(0, 50)));
  return newRecord;
}

export function clearHistory() {
  localStorage.removeItem(KEY);
}

export function getExplorerUrl(txHash: string, chainId?: number): string {
  if (chainId === 42161) return `https://arbiscan.io/tx/${txHash}`;
  if (chainId === 59144) return `https://lineascan.build/tx/${txHash}`;
  return `https://etherscan.io/tx/${txHash}`;
}

export function getExplorerName(chainId?: number): string {
  if (chainId === 42161) return "Arbiscan";
  if (chainId === 59144) return "Lineascan";
  return "Etherscan";
}
