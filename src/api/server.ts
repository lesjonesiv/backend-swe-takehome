import express from 'express';
import {
  createPlayer,
  createGameSession,
  joinGameSession,
  getGameSession,
  submitMove,
  getLeaderboard,
  getPlayerStats
} from '../services/gameService';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Create player
app.post('/players', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const result = await createPlayer(name);
    if ('type' in result) {
      return res.status(400).json({ error: result.message });
    }

    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get player
app.get('/players/:id', async (req, res) => {
  try {
    const playerId = parseInt(req.params.id);
    if (isNaN(playerId)) {
      return res.status(400).json({ error: 'Invalid player ID' });
    }

    const result = await getPlayer(playerId);
    if ('type' in result) {
      return res.status(404).json({ error: result.message });
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get player stats
app.get('/players/:id/stats', async (req, res) => {
  try {
    const playerId = parseInt(req.params.id);
    if (isNaN(playerId)) {
      return res.status(400).json({ error: 'Invalid player ID' });
    }

    const result = await getPlayerStats(playerId);
    if ('type' in result) {
      return res.status(404).json({ error: result.message });
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create game session
app.post('/games', async (req, res) => {
  try {
    const result = await createGameSession();
    if ('type' in result) {
      return res.status(500).json({ error: result.message });
    }

    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get game session
app.get('/games/:id', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id);
    if (isNaN(gameId)) {
      return res.status(400).json({ error: 'Invalid game ID' });
    }

    const result = await getGameSession(gameId);
    if ('type' in result) {
      return res.status(404).json({ error: result.message });
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Join game session
app.post('/games/:id/join', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id);
    const { playerId } = req.body;

    if (isNaN(gameId)) {
      return res.status(400).json({ error: 'Invalid game ID' });
    }
    if (!playerId || isNaN(parseInt(playerId))) {
      return res.status(400).json({ error: 'Valid player ID is required' });
    }

    const result = await joinGameSession(gameId, parseInt(playerId));
    if ('type' in result) {
      if (result.type === 'GAME_NOT_FOUND') {
        return res.status(404).json({ error: result.message });
      }
      return res.status(400).json({ error: result.message });
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Submit move
app.post('/games/:id/moves', async (req, res) => {
  try {
    const gameId = parseInt(req.params.id);
    const { playerId, row, col } = req.body;

    if (isNaN(gameId)) {
      return res.status(400).json({ error: 'Invalid game ID' });
    }
    if (!playerId || isNaN(parseInt(playerId))) {
      return res.status(400).json({ error: 'Valid player ID is required' });
    }
    if (row === undefined || col === undefined || isNaN(parseInt(row)) || isNaN(parseInt(col))) {
      return res.status(400).json({ error: 'Valid row and col coordinates are required' });
    }

    const result = await submitMove({
      gameId,
      playerId: parseInt(playerId),
      row: parseInt(row),
      col: parseInt(col)
    });

    if ('type' in result) {
      if (result.type === 'GAME_NOT_FOUND') {
        return res.status(404).json({ error: result.message });
      }
      return res.status(400).json({ error: result.message });
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get leaderboard
app.get('/leaderboard', async (req, res) => {
  try {
    const result = await getLeaderboard();
    if ('type' in result) {
      return res.status(500).json({ error: result.message });
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Import getPlayer function (missing from original imports)
import { getPlayer } from '../services/gameService';

// Start server
app.listen(port, () => {
  console.log(`🚀 Game API server running on port ${port}`);
  console.log(`📋 Health check: http://localhost:${port}/health`);
});

export default app;