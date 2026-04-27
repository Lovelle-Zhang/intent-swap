const { ethers } = require('ethers');

// Mock mode for testing without real blockchain calls
const MOCK_MODE = process.env.MOCK_MODE === 'true';

// Arbitrum Sepolia testnet token addresses (mock addresses for demo)
const TOKENS = {
  USDT: '0x0000000000000000000000000000000000000001',
  USDC: '0x0000000000000000000000000000000000000002',
  WBTC: '0x0000000000000000000000000000000000000003',
  WETH: '0x0000000000000000000000000000000000000004',
};

async function swapToken(fromToken, toToken, amount, walletAddress) {
  console.log(`[Swap] ${fromToken} → ${toToken}, amount: ${amount}, wallet: ${walletAddress}`);

  if (MOCK_MODE) {
    // Simulate swap delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const mockTxHash = '0x' + Math.random().toString(16).slice(2, 66).padEnd(64, '0');
    console.log(`[Mock] Generated tx hash: ${mockTxHash}`);
    
    return {
      txHash: mockTxHash,
      fromToken,
      toToken,
      amount,
      status: 'mocked'
    };
  }

  // Real swap logic (1inch API + ethers.js)
  try {
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

    const fromAddress = TOKENS[fromToken];
    const toAddress = TOKENS[toToken];

    // Get quote from 1inch (chain 421614 = Arbitrum Sepolia)
    const quoteUrl = `https://api.1inch.dev/swap/v5.2/421614/quote?src=${fromAddress}&dst=${toAddress}&amount=${ethers.parseUnits(amount.toString(), 6)}`;
    
    const quoteResponse = await fetch(quoteUrl, {
      headers: { 'Authorization': `Bearer ${process.env.ONEINCH_API_KEY}` }
    });
    
    if (!quoteResponse.ok) {
      throw new Error(`1inch quote failed: ${quoteResponse.statusText}`);
    }

    const quote = await quoteResponse.json();

    // Get swap transaction data
    const swapUrl = `https://api.1inch.dev/swap/v5.2/421614/swap?src=${fromAddress}&dst=${toAddress}&amount=${ethers.parseUnits(amount.toString(), 6)}&from=${walletAddress}&slippage=1`;
    
    const swapResponse = await fetch(swapUrl, {
      headers: { 'Authorization': `Bearer ${process.env.ONEINCH_API_KEY}` }
    });

    if (!swapResponse.ok) {
      throw new Error(`1inch swap failed: ${swapResponse.statusText}`);
    }

    const swapData = await swapResponse.json();

    // Send transaction
    const tx = await wallet.sendTransaction(swapData.tx);
    await tx.wait();

    return {
      txHash: tx.hash,
      fromToken,
      toToken,
      amount,
      status: 'confirmed'
    };

  } catch (error) {
    console.error('[Swap Error]', error);
    throw error;
  }
}

module.exports = { swapToken };
