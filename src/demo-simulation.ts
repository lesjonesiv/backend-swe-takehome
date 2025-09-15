// Demo simulation script to showcase game functionality
// This demonstrates the core simulation without requiring database setup

interface DemoPlayer {
  id: number;
  name: string;
  wins: number;
  games: number;
  totalMoves: number;
}

interface DemoGame {
  player1: DemoPlayer;
  player2: DemoPlayer;
  winner: DemoPlayer | null;
  moves: number;
}

// Simple tic-tac-toe game logic simulation
function simulateGame(player1: DemoPlayer, player2: DemoPlayer): DemoGame {
  // Simple random game outcome with realistic move counts
  const moves = Math.floor(Math.random() * 5) + 5; // 5-9 moves
  const outcome = Math.random();

  let winner: DemoPlayer | null = null;

  if (outcome < 0.4) {
    winner = player1;
    player1.wins++;
    player1.totalMoves += Math.ceil(moves / 2);
  } else if (outcome < 0.8) {
    winner = player2;
    player2.wins++;
    player2.totalMoves += Math.ceil(moves / 2);
  }
  // else draw - no winner

  player1.games++;
  player2.games++;

  return { player1, player2, winner, moves };
}

function calculateEfficiency(player: DemoPlayer): number {
  return player.wins > 0 ? player.totalMoves / player.wins : 0;
}

function generateLeaderboard(players: DemoPlayer[]): DemoPlayer[] {
  return players
    .filter(p => p.wins > 0)
    .sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      return calculateEfficiency(a) - calculateEfficiency(b);
    })
    .slice(0, 3);
}

async function runDemoSimulation(): Promise<void> {
  console.log('🎮 Demo Game Simulation');
  console.log('========================');
  console.log('Simulating multiple concurrent tic-tac-toe games...\n');

  // Create demo players
  const players: DemoPlayer[] = [
    { id: 1, name: 'Alice', wins: 0, games: 0, totalMoves: 0 },
    { id: 2, name: 'Bob', wins: 0, games: 0, totalMoves: 0 },
    { id: 3, name: 'Charlie', wins: 0, games: 0, totalMoves: 0 },
    { id: 4, name: 'Diana', wins: 0, games: 0, totalMoves: 0 },
    { id: 5, name: 'Eve', wins: 0, games: 0, totalMoves: 0 },
    { id: 6, name: 'Frank', wins: 0, games: 0, totalMoves: 0 },
  ];

  console.log('👥 Players:', players.map(p => p.name).join(', '));
  console.log('\n🎯 Running 15 concurrent games...\n');

  const games: DemoGame[] = [];
  let draws = 0;

  // Simulate 15 games
  for (let i = 1; i <= 15; i++) {
    const player1 = players[Math.floor(Math.random() * players.length)];
    let player2 = players[Math.floor(Math.random() * players.length)];

    while (player2.id === player1.id) {
      player2 = players[Math.floor(Math.random() * players.length)];
    }

    const game = simulateGame(player1, player2);
    games.push(game);

    if (game.winner) {
      console.log(`Game ${i}: ${game.winner.name} beats ${game.winner === player1 ? player2.name : player1.name} in ${game.moves} moves`);
    } else {
      console.log(`Game ${i}: ${player1.name} vs ${player2.name} - Draw in ${game.moves} moves`);
      draws++;
    }
  }

  console.log('\n📊 Final Results:');
  console.log('==================');

  // Generate leaderboard
  const leaderboard = generateLeaderboard(players);

  console.log('\n🏆 Top 3 Players (by wins, then efficiency):');
  leaderboard.forEach((player, index) => {
    const winRate = (player.wins / player.games) * 100;
    const efficiency = calculateEfficiency(player);
    console.log(`${index + 1}. ${player.name}: ${player.wins} wins, ${winRate.toFixed(1)}% win rate, ${efficiency.toFixed(1)} avg moves/win`);
  });

  console.log('\n📈 All Player Statistics:');
  players.forEach(player => {
    const winRate = player.games > 0 ? (player.wins / player.games) * 100 : 0;
    console.log(`${player.name}: ${player.games} games, ${player.wins} wins, ${winRate.toFixed(1)}% win rate`);
  });

  console.log(`\n✅ Simulation Complete: 15 games, ${draws} draws`);

  // Validate results
  console.log('\n🔍 Validating Results...');

  const totalGamesPlayed = players.reduce((sum, p) => sum + p.games, 0);
  const expectedTotalGames = 15 * 2; // Each game has 2 participants

  if (totalGamesPlayed === expectedTotalGames) {
    console.log('✅ Game count validation passed');
  } else {
    console.log(`❌ Game count mismatch: expected ${expectedTotalGames}, got ${totalGamesPlayed}`);
  }

  // Validate leaderboard ordering
  let orderingValid = true;
  for (let i = 1; i < leaderboard.length; i++) {
    if (leaderboard[i-1].wins < leaderboard[i].wins) {
      orderingValid = false;
      break;
    }
  }

  if (orderingValid) {
    console.log('✅ Leaderboard ordering validation passed');
  } else {
    console.log('❌ Leaderboard ordering validation failed');
  }

  console.log('\n🎉 Demo simulation completed successfully!');
}

// Run the demo
if (require.main === module) {
  runDemoSimulation().catch(console.error);
}

export { runDemoSimulation };