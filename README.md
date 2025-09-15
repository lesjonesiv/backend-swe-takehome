# Backend Grid-Based Game Engine

A distributed tic-tac-toe game engine with concurrent session management and player statistics.

## How It Works

The system manages multiple concurrent 3×3 tic-tac-toe games where:

- **Players** create accounts and join game sessions
- **Game Sessions** start when 2 players join, with first player going first
- **Moves** are validated for coordinates, turns, and cell availability
- **Win Detection** checks rows, columns, and diagonals after each move
- **Statistics** track games played, wins, win rates, and efficiency (avg moves per win)
- **Leaderboard** ranks top 3 players by wins, then by efficiency

All data is stored in PostgreSQL with proper concurrency handling for multiple simultaneous games.

## Quick Start

```bash
npm install
```

## Usage

### Start API Server
```bash
DATABASE_URL="postgresql://user:pass@localhost:5432/db" npm run server
```

### Test API Endpoints
```bash
# In another terminal (server must be running)
npm run test:api
```

### Demo Simulation (No Setup Required)
```bash
npm run demo
```

### Full Simulation (Requires Database)
```bash
DATABASE_URL="postgresql://user:pass@localhost:5432/db" npm run simulate
```

### Run Tests
```bash
npm test
```

## API Endpoints

- `POST /players` - Create player
- `GET /players/:id` - Get player info
- `GET /players/:id/stats` - Get player statistics
- `POST /games` - Create game session
- `GET /games/:id` - Get game state
- `POST /games/:id/join` - Join game
- `POST /games/:id/moves` - Submit move
- `GET /leaderboard` - Get top 3 players

## Scripts

- `npm run server` - Start API server (requires DATABASE_URL)
- `npm run test:api` - Test all API endpoints
- `npm run demo` - Standalone game simulation demonstration
- `npm run simulate` - Full database simulation (requires DATABASE_URL)
- `npm test` - Run all tests with testcontainers
- `npm run build` - Compile TypeScript

The demo shows multiple concurrent tic-tac-toe games, win detection, and leaderboard generation.
