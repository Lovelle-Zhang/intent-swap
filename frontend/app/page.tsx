'use client';

import { useState } from 'react';

export default function Home() {
  const [userInput, setUserInput] = useState('');
  const [amount, setAmount] = useState(100);
  const [walletAddress, setWalletAddress] = useState('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  const handleExecute = async () => {
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const response = await fetch('http://localhost:3001/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userInput, amount, walletAddress })
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }

      const data = await response.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black text-gray-100 p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-4xl font-bold mb-2 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
          Intent Swap
        </h1>
        <p className="text-gray-400 mb-8">一句话，自动配置你的资产</p>

        <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 shadow-2xl border border-gray-700">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                你希望这笔资金变成什么状态？
              </label>
              <textarea
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                placeholder="例如：我想稳健增长，长期持有"
                className="w-full h-24 px-4 py-3 bg-gray-900/50 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  金额 (USDT)
                </label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="w-full px-4 py-3 bg-gray-900/50 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  钱包地址
                </label>
                <input
                  type="text"
                  value={walletAddress}
                  onChange={(e) => setWalletAddress(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-900/50 border border-gray-600 rounded-lg text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <button
              onClick={handleExecute}
              disabled={loading || !userInput}
              className="w-full py-4 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl"
            >
              {loading ? '执行中...' : '开始转换'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-6 p-4 bg-red-900/30 border border-red-700 rounded-lg">
            <p className="text-red-400">错误: {error}</p>
          </div>
        )}

        {result && (
          <div className="mt-6 space-y-4">
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 border border-gray-700">
              <h2 className="text-xl font-semibold mb-4 text-blue-400">解析结果</h2>
              <div className="space-y-2 text-sm">
                <p><span className="text-gray-400">意图:</span> {result.intent.intent}</p>
                <p><span className="text-gray-400">风险等级:</span> {result.intent.risk_level}/5</p>
                <p><span className="text-gray-400">时间周期:</span> {result.intent.time_horizon}</p>
              </div>
            </div>

            <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 border border-gray-700">
              <h2 className="text-xl font-semibold mb-4 text-purple-400">资产配置</h2>
              <div className="space-y-2">
                {Object.entries(result.allocation).map(([token, ratio]: [string, any]) => (
                  <div key={token} className="flex justify-between items-center">
                    <span className="font-medium">{token}</span>
                    <span className="text-gray-400">{(ratio * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 border border-gray-700">
              <h2 className="text-xl font-semibold mb-4 text-green-400">执行结果</h2>
              <div className="space-y-3">
                {result.transactions.map((tx: any, i: number) => (
                  <div key={i} className="p-3 bg-gray-900/50 rounded-lg">
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-medium">{tx.token}</span>
                      <span className={tx.status === 'mocked' ? 'text-yellow-400' : 'text-green-400'}>
                        {tx.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-400">金额: {tx.amount.toFixed(2)} USDT</p>
                    <p className="text-xs text-gray-500 break-all mt-1">
                      {tx.txHash}
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-center text-gray-400 italic">
                资产已进入新的平衡状态
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
