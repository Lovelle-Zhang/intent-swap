const STRATEGIES = {
  1: { USDC: 0.9, USDT: 0.1 },
  2: { USDC: 0.7, WBTC: 0.15, WETH: 0.15 },
  3: { USDC: 0.5, WBTC: 0.25, WETH: 0.25 },
  4: { WBTC: 0.4, WETH: 0.4, USDC: 0.2 },
  5: { WBTC: 0.5, WETH: 0.5 },
};

function getAllocation(riskLevel) {
  const level = Math.min(5, Math.max(1, Math.round(riskLevel)));
  return STRATEGIES[level];
}

module.exports = { getAllocation };
