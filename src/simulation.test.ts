import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './db/schema';
import { runSimulation, validateResults } from './simulation';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import path from 'path';

let container: StartedPostgreSqlContainer;
let testDb: ReturnType<typeof drizzle>;
let testSql: ReturnType<typeof postgres>;

beforeAll(async () => {
  // Start PostgreSQL container
  container = await new PostgreSqlContainer('postgres:15')
    .withDatabase('test_db')
    .withUsername('test_user')
    .withPassword('test_pass')
    .start();

  const connectionString = container.getConnectionUri();
  testSql = postgres(connectionString);
  testDb = drizzle(testSql, { schema });

  // Run migrations
  const migrationsPath = path.join(process.cwd(), 'drizzle');
  await migrate(testDb, { migrationsFolder: migrationsPath });

  // Mock the database connection in the service module
  jest.doMock('./db/connection', () => ({
    db: testDb
  }));
}, 60000);

afterAll(async () => {
  if (testSql) {
    await testSql.end();
  }
  if (container) {
    await container.stop();
  }
  jest.clearAllMocks();
});

beforeEach(async () => {
  // Clean up all tables before each test
  await testDb.delete(schema.gameMoves);
  await testDb.delete(schema.gameParticipants);
  await testDb.delete(schema.playerStats);
  await testDb.delete(schema.gameSessions);
  await testDb.delete(schema.players);
});

describe('Game Simulation', () => {
  test('should run complete simulation and validate results', async () => {
    console.log('\n🎮 Running Game Simulation Test...\n');

    const results = await runSimulation();

    // Basic validations
    expect(results.totalGames).toBe(5);
    expect(results.completedGames).toBe(5);
    expect(results.draws).toBeGreaterThanOrEqual(0);
    expect(results.leaderboard).toBeInstanceOf(Array);
    expect(results.playerStats).toBeInstanceOf(Array);

    // Validate leaderboard ordering
    for (let i = 1; i < results.leaderboard.length; i++) {
      const prev = results.leaderboard[i - 1];
      const curr = results.leaderboard[i];
      expect(prev.gamesWon).toBeGreaterThanOrEqual(curr.gamesWon);
    }

    // Validate that all players have stats
    expect(results.playerStats).toHaveLength(4);

    // Run comprehensive validation
    const isValid = await validateResults(results);
    expect(isValid).toBe(true);

    console.log('\n✅ Simulation test completed successfully!');
  }, 120000); // 2 minute timeout for full simulation

  test('should handle concurrent games correctly', async () => {
    console.log('\n🔄 Testing concurrent game handling...\n');

    const results = await runSimulation();

    // Check that we got expected number of games
    expect(results.completedGames).toBe(results.totalGames);

    // Check that at least some games completed
    expect(results.completedGames).toBeGreaterThan(0);

    // Check that stats are consistent
    const totalGamesFromStats = results.playerStats.reduce((sum, player) => sum + player.gamesPlayed, 0);
    expect(totalGamesFromStats).toBe(results.totalGames * 2); // Each game has 2 players

    console.log('\n✅ Concurrent game test completed!');
  }, 120000);

  test('should generate valid leaderboard data', async () => {
    console.log('\n🏆 Testing leaderboard functionality...\n');

    const results = await runSimulation();

    // Check leaderboard structure
    results.leaderboard.forEach(entry => {
      expect(entry).toHaveProperty('playerId');
      expect(entry).toHaveProperty('playerName');
      expect(entry).toHaveProperty('gamesWon');
      expect(entry).toHaveProperty('winRate');
      expect(entry).toHaveProperty('efficiency');

      expect(typeof entry.playerId).toBe('number');
      expect(typeof entry.playerName).toBe('string');
      expect(typeof entry.gamesWon).toBe('number');
      expect(typeof entry.winRate).toBe('number');
      expect(typeof entry.efficiency).toBe('number');

      expect(entry.gamesWon).toBeGreaterThan(0); // Leaderboard should only show winners
      expect(entry.winRate).toBeGreaterThan(0);
      expect(entry.winRate).toBeLessThanOrEqual(100);
    });

    // Check that leaderboard has at most 3 entries
    expect(results.leaderboard.length).toBeLessThanOrEqual(3);

    console.log('\n✅ Leaderboard test completed!');
  }, 120000);
});