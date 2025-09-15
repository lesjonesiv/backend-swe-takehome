import {
  createPlayer,
  createGameSession,
  joinGameSession,
  submitMove,
  getLeaderboard,
  getPlayerStats,
  type Player,
  type GameSession
} from './services/gameService';

// Simulation configuration
const NUM_PLAYERS = 4;
const NUM_GAMES = 5;

interface SimulationResults {
  totalGames: number;
  completedGames: number;
  draws: number;
  leaderboard: any[];
  playerStats: any[];
}

async function simulateGame(player1: Player, player2: Player): Promise<{ winner: Player | null, moves: number }> {
  const game = await createGameSession() as GameSession;

  await joinGameSession(game.id, player1.id);
  const activeGame = await joinGameSession(game.id, player2.id) as GameSession;

  let currentPlayer = player1;
  let moveCount = 0;
  let gameResult: any;

  // Play until game ends (max 9 moves for 3x3 grid)
  while (moveCount < 9) {
    // Simple strategy: try moves in order
    let moveMade = false;

    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const move = await submitMove({
          gameId: activeGame.id,
          playerId: currentPlayer.id,
          row,
          col
        });

        if (!('type' in move)) {
          gameResult = move;
          moveCount++;
          moveMade = true;
          break;
        }
      }
      if (moveMade) break;
    }

    if (!moveMade) break;

    // Check if game ended
    if (gameResult.status === 'completed') {
      if (gameResult.winnerId === player1.id) return { winner: player1, moves: moveCount };
      if (gameResult.winnerId === player2.id) return { winner: player2, moves: moveCount };
      if (gameResult.isDraw) return { winner: null, moves: moveCount };
    }

    // Switch players
    currentPlayer = currentPlayer.id === player1.id ? player2 : player1;
  }

  return { winner: null, moves: moveCount };
}

async function runSimulation(): Promise<SimulationResults> {
  console.log('🎮 Starting Game Simulation...');
  console.log(`Players: ${NUM_PLAYERS}, Games: ${NUM_GAMES}`);
  console.log('================================');

  // Create players
  const players: Player[] = [];
  for (let i = 1; i <= NUM_PLAYERS; i++) {
    const player = await createPlayer(`Player${i}`) as Player;
    players.push(player);
    console.log(`Created ${player.name} (ID: ${player.id})`);
  }

  console.log('\n🚀 Starting concurrent games...\n');

  let completedGames = 0;
  let draws = 0;

  // Create games sequentially for better performance and debugging
  for (let gameNum = 1; gameNum <= NUM_GAMES; gameNum++) {
    const player1 = players[Math.floor(Math.random() * NUM_PLAYERS)];
    let player2 = players[Math.floor(Math.random() * NUM_PLAYERS)];

    // Ensure different players
    while (player2.id === player1.id) {
      player2 = players[Math.floor(Math.random() * NUM_PLAYERS)];
    }

    try {
      const result = await simulateGame(player1, player2);

      if (result.winner) {
        console.log(`Game ${gameNum}: ${result.winner.name} wins in ${result.moves} moves`);
      } else {
        console.log(`Game ${gameNum}: Draw in ${result.moves} moves`);
        draws++;
      }
      completedGames++;
    } catch (error) {
      console.log(`Game ${gameNum}: Failed - ${error}`);
    }
  }

  console.log('\n📊 Final Results:');
  console.log('=================');

  // Get leaderboard
  const leaderboard = await getLeaderboard();
  console.log('\n🏆 Top 3 Players (by wins and efficiency):');

  if (Array.isArray(leaderboard) && leaderboard.length > 0) {
    leaderboard.forEach((entry, index) => {
      console.log(`${index + 1}. ${entry.playerName}: ${entry.gamesWon} wins, ${entry.winRate.toFixed(1)}% win rate, ${entry.efficiency.toFixed(1)} avg moves/win`);
    });
  } else {
    console.log('No winners in this simulation');
  }

  // Get all player stats
  console.log('\n📈 All Player Statistics:');
  const playerStats = [];
  for (const player of players) {
    const stats = await getPlayerStats(player.id);
    if (!('type' in stats)) {
      playerStats.push({ player: player.name, ...stats });
      console.log(`${player.name}: ${stats.gamesPlayed} games, ${stats.gamesWon} wins, ${stats.winRate.toFixed(1)}% win rate`);
    }
  }

  console.log(`\n✅ Simulation Complete: ${completedGames}/${NUM_GAMES} games, ${draws} draws`);

  return {
    totalGames: NUM_GAMES,
    completedGames,
    draws,
    leaderboard: Array.isArray(leaderboard) ? leaderboard : [],
    playerStats
  };
}

// Validation function
async function validateResults(results: SimulationResults): Promise<boolean> {
  console.log('\n🔍 Validating Results...');

  let isValid = true;

  // Check that games were completed
  if (results.completedGames !== results.totalGames) {
    console.log(`❌ Expected ${results.totalGames} games, got ${results.completedGames}`);
    isValid = false;
  }

  // Check leaderboard ordering
  for (let i = 1; i < results.leaderboard.length; i++) {
    const prev = results.leaderboard[i - 1];
    const curr = results.leaderboard[i];

    if (prev.gamesWon < curr.gamesWon) {
      console.log(`❌ Leaderboard ordering error: ${prev.playerName} (${prev.gamesWon}) before ${curr.playerName} (${curr.gamesWon})`);
      isValid = false;
    }
  }

  // Check that efficiency is only for winners
  results.leaderboard.forEach(entry => {
    if (entry.gamesWon === 0 && entry.efficiency > 0) {
      console.log(`❌ Player ${entry.playerName} has efficiency but no wins`);
      isValid = false;
    }
  });

  if (isValid) {
    console.log('✅ All validations passed!');
  }

  return isValid;
}

// Main execution
async function main() {
  try {
    // Check if database is available
    const testConnection = process.env.DATABASE_URL;
    if (!testConnection) {
      console.log('ℹ️  No DATABASE_URL found. This simulation requires a database connection.');
      console.log('ℹ️  Please set DATABASE_URL environment variable or run the simulation via tests.');
      console.log('ℹ️  Example: npm test -- --testNamePattern="simulation"');
      process.exit(0);
    }

    const results = await runSimulation();
    const isValid = await validateResults(results);

    if (!isValid) {
      process.exit(1);
    }

    console.log('\n🎉 Simulation successful!');
  } catch (error) {
    console.error('❌ Simulation failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { runSimulation, validateResults };
