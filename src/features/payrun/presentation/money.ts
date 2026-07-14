export interface AtomicMoneyView {
  readonly amountAtomic: string;
  readonly decimals: number;
  readonly asset: string;
}

const CANONICAL_ATOMIC = /^(0|[1-9][0-9]*)$/;

export function formatAtomicMoney(money: AtomicMoneyView): string {
  if (!CANONICAL_ATOMIC.test(money.amountAtomic)) throw new Error("Amount must be a canonical atomic decimal string");
  if (!Number.isSafeInteger(money.decimals) || money.decimals < 0) throw new Error("Decimals must be a non-negative safe integer");
  if (money.asset.trim().length === 0) throw new Error("Asset is required");

  const padded = money.amountAtomic.padStart(money.decimals + 1, "0");
  if (money.decimals === 0) return `${padded} ${money.asset}`;
  const whole = padded.slice(0, -money.decimals);
  const fraction = padded.slice(-money.decimals).replace(/0+$/, "");
  return `${fraction ? `${whole}.${fraction}` : whole} ${money.asset}`;
}

export function addAtomicAmounts(amounts: readonly string[]): string {
  return amounts.reduce((total, amount) => {
    if (!CANONICAL_ATOMIC.test(amount)) throw new Error("Amount must be a canonical atomic decimal string");
    return total + BigInt(amount);
  }, 0n).toString();
}
