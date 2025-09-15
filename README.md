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

## Scripts

- `npm run demo` - Standalone game simulation demonstration
- `npm run simulate` - Full database simulation (requires DATABASE_URL)
- `npm test` - Run all tests with testcontainers
- `npm run build` - Compile TypeScript

The demo shows multiple concurrent tic-tac-toe games, win detection, and leaderboard generation.
