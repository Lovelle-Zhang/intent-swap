require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { executeIntent } = require('./orchestrator');
const { parseIntent } = require('./intentParser');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    mockMode: process.env.MOCK_MODE === 'true',
    timestamp: new Date().toISOString()
  });
});

// Debug endpoint: parse intent only
app.post('/api/parse', async (req, res) => {
  try {
    const { userInput } = req.body;
    
    if (!userInput) {
      return res.status(400).json({ error: 'userInput is required' });
    }

    const intent = await parseIntent(userInput);
    res.json({ intent });
  } catch (error) {
    console.error('[API Error]', error);
    res.status(500).json({ error: error.message });
  }
});

// Main execution endpoint
app.post('/api/execute', async (req, res) => {
  try {
    const { userInput, amount, walletAddress } = req.body;

    if (!userInput || !amount || !walletAddress) {
      return res.status(400).json({ 
        error: 'Missing required fields: userInput, amount, walletAddress' 
      });
    }

    const result = await executeIntent(userInput, amount, walletAddress);
    res.json(result);
  } catch (error) {
    console.error('[API Error]', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`[Server] Running on http://localhost:${PORT}`);
  console.log(`[Server] Mock mode: ${process.env.MOCK_MODE === 'true'}`);
});
