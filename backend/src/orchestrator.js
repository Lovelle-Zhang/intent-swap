const { parseIntent } = require('./intentParser');
const { getAllocation } = require('./strategyEngine');
const { swapToken } = require('./executionEngine');

async function executeIntent(userInput, amountUSDT, walletAddress) {
  console.log(`[Orchestrator] Starting execution for: "${userInput}"`);
  console.log(`[Orchestrator] Amount: ${amountUSDT} USDT, Wallet: ${walletAddress}`);

  // Step 1: Parse intent
  const intent = await parseIntent(userInput);
  console.log('[Orchestrator] Parsed intent:', intent);

  // Step 2: Get allocation strategy
  const allocation = getAllocation(intent.risk_level);
  console.log('[Orchestrator] Allocation:', allocation);

  // Step 3: Execute swaps
  const results = [];
  for (const [token, ratio] of Object.entries(allocation)) {
    const portion = amountUSDT * ratio;
    console.log(`[Orchestrator] Swapping ${portion} USDT → ${token}`);
    
    try {
      const tx = await swapToken('USDT', token, portion, walletAddress);
      results.push({
        token,
        ratio,
        amount: portion,
        txHash: tx.txHash,
        status: tx.status
      });
    } catch (error) {
      results.push({
        token,
        ratio,
        amount: portion,
        error: error.message,
        status: 'failed'
      });
    }
  }

  console.log('[Orchestrator] Execution complete');

  return {
    intent,
    allocation,
    transactions: results
  };
}

module.exports = { executeIntent };
