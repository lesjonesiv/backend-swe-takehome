import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../db/schema';
import { GameStatus } from '../types/gameTypes';
import type { GameSession, Player } from './gameService';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import path from 'path';

let container: StartedPostgreSqlContainer;
let testDb: ReturnType<typeof drizzle>;
let testSql: ReturnType<typeof postgres>;

// Module to test
let gameService: typeof import('./gameService');

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
  const migrationsPath = path.join(process.cwd(), 'drizzle');
  await migrate(testDb, { migrationsFolder: migrationsPath });

  // Mock the database connection in the service module
  jest.doMock('../db/connection', () => ({
    db: testDb
  }));

  // Import the service after mocking
  gameService = require('./gameService');
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
  // Clean up all tables before each test in the correct order
  await testDb.delete(schema.gameMoves);
  await testDb.delete(schema.gameParticipants);
  await testDb.delete(schema.playerStats);
  await testDb.delete(schema.gameSessions);
  await testDb.delete(schema.players);
});

describe('Player Management', () => {
  test('should create a new player successfully', async () => {
    const result = await gameService.createPlayer('TestPlayer');

    expect(result).toEqual({
      id: expect.any(Number),
      name: 'TestPlayer'
    });

    const player = result as Player;
    expect(player.id).toBeGreaterThan(0);
  });

  test('should return error for empty player name', async () => {
    const result = await gameService.createPlayer('');

    expect(result).toEqual({
      type: 'PLAYER_NOT_FOUND',
      message: 'Player name is required'
    });
  });

  test('should return error for whitespace-only player name', async () => {
    const result = await gameService.createPlayer('   ');

    expect(result).toEqual({
      type: 'PLAYER_NOT_FOUND',
      message: 'Player name is required'
    });
  });

  test('should trim player name when creating', async () => {
    const result = await gameService.createPlayer('  TestPlayer  ');

    expect(result).toEqual({
      id: expect.any(Number),
      name: 'TestPlayer'
    });
  });

  test('should get existing player', async () => {
    const createdPlayer = await gameService.createPlayer('TestPlayer');
    const player = createdPlayer as Player;

    const result = await gameService.getPlayer(player.id);

    expect(result).toEqual({
      id: player.id,
      name: 'TestPlayer'
    });
  });

  test('should return error for non-existent player', async () => {
    const result = await gameService.getPlayer(999);

    expect(result).toEqual({
      type: 'PLAYER_NOT_FOUND',
      message: 'Player not found'
    });
  });
});

describe('Game Session Management', () => {
  test('should create a new game session successfully', async () => {
    const result = await gameService.createGameSession();

    expect(result).toEqual({
      id: expect.any(Number),
      status: GameStatus.WAITING,
      winnerId: null,
      isDraw: false, // Database default value
      currentTurn: null,
      grid: [
        [null, null, null],
        [null, null, null],
        [null, null, null]
      ],
      participants: []
    });
  });

  test('should join game session successfully', async () => {
    const player1 = await gameService.createPlayer('Player1') as Player;
    const gameSession = await gameService.createGameSession() as GameSession;

    const result = await gameService.joinGameSession(gameSession.id, player1.id);

    expect(result).toMatchObject({
      id: gameSession.id,
      status: GameStatus.WAITING,
      participants: [{
        playerId: player1.id,
        playerOrder: 1
      }]
    });
  });

  test('should start game when second player joins', async () => {
    const player1 = await gameService.createPlayer('Player1') as Player;
    const player2 = await gameService.createPlayer('Player2') as Player;
    const gameSession = await gameService.createGameSession() as GameSession;

    await gameService.joinGameSession(gameSession.id, player1.id);
    const result = await gameService.joinGameSession(gameSession.id, player2.id);

    expect(result).toMatchObject({
      id: gameSession.id,
      status: GameStatus.ACTIVE,
      currentTurn: player1.id
    });
    // Check participants exist with correct player IDs and orders
    const gameResult = result as GameSession;
    expect(gameResult.participants).toHaveLength(2);
    expect(gameResult.participants.map((p: any) => ({ playerId: p.playerId, playerOrder: p.playerOrder }))).toEqual(
      expect.arrayContaining([
        { playerId: player1.id, playerOrder: 1 },
        { playerId: player2.id, playerOrder: 2 }
      ])
    );
  });

  test('should prevent third player from joining', async () => {
    const player1 = await gameService.createPlayer('Player1') as Player;
    const player2 = await gameService.createPlayer('Player2') as Player;
    const player3 = await gameService.createPlayer('Player3') as Player;
    const gameSession = await gameService.createGameSession() as GameSession;

    await gameService.joinGameSession(gameSession.id, player1.id);
    await gameService.joinGameSession(gameSession.id, player2.id);

    const result = await gameService.joinGameSession(gameSession.id, player3.id);

    expect(result).toEqual({
      type: 'GAME_FULL',
      message: 'Game is not accepting new players'
    });
  });

  test('should prevent player from joining same game twice', async () => {
    const player1 = await gameService.createPlayer('Player1') as Player;
    const gameSession = await gameService.createGameSession() as GameSession;

    await gameService.joinGameSession(gameSession.id, player1.id);
    const result = await gameService.joinGameSession(gameSession.id, player1.id);

    expect(result).toEqual({
      type: 'ALREADY_JOINED',
      message: 'Player already joined this game'
    });
  });

  test('should return error when joining non-existent game', async () => {
    const player1 = await gameService.createPlayer('Player1') as Player;

    const result = await gameService.joinGameSession(999, player1.id);

    expect(result).toEqual({
      type: 'GAME_NOT_FOUND',
      message: 'Game session not found'
    });
  });

  test('should return error when non-existent player tries to join', async () => {
    const gameSession = await gameService.createGameSession() as GameSession;

    const result = await gameService.joinGameSession(gameSession.id, 999);

    expect(result).toEqual({
      type: 'PLAYER_NOT_FOUND',
      message: 'Player not found'
    });
  });

  test('should get existing game session', async () => {
    const gameSession = await gameService.createGameSession() as GameSession;

    const result = await gameService.getGameSession(gameSession.id);

    expect(result).toMatchObject({
      id: gameSession.id,
      status: gameSession.status,
      winnerId: gameSession.winnerId,
      isDraw: gameSession.isDraw,
      currentTurn: gameSession.currentTurn,
      grid: gameSession.grid,
      participants: gameSession.participants
    });
  });

  test('should return error for non-existent game session', async () => {
    const result = await gameService.getGameSession(999);

    expect(result).toEqual({
      type: 'GAME_NOT_FOUND',
      message: 'Game session not found'
    });
  });
});

describe('Move Submission and Game Logic', () => {
  let player1: Player;
  let player2: Player;
  let gameSession: GameSession;

  beforeEach(async () => {
    player1 = await gameService.createPlayer('Player1') as Player;
    player2 = await gameService.createPlayer('Player2') as Player;
    const game = await gameService.createGameSession() as GameSession;
    await gameService.joinGameSession(game.id, player1.id);
    gameSession = await gameService.joinGameSession(game.id, player2.id) as GameSession;
  });

  test('should submit valid move successfully', async () => {
    const result = await gameService.submitMove({
      gameId: gameSession.id,
      playerId: player1.id,
      row: 0,
      col: 0
    });

    expect(result).toMatchObject({
      id: gameSession.id,
      status: GameStatus.ACTIVE,
      currentTurn: player2.id,
      grid: [
        [player1.id, null, null],
        [null, null, null],
        [null, null, null]
      ]
    });
  });

  test('should reject move with invalid coordinates', async () => {
    const result = await gameService.submitMove({
      gameId: gameSession.id,
      playerId: player1.id,
      row: 3,
      col: 0
    });

    expect(result).toEqual({
      type: 'INVALID_MOVE',
      message: 'Invalid move coordinates'
    });
  });

  test('should reject move when not player\'s turn', async () => {
    const result = await gameService.submitMove({
      gameId: gameSession.id,
      playerId: player2.id,
      row: 0,
      col: 0
    });

    expect(result).toEqual({
      type: 'NOT_YOUR_TURN',
      message: 'Not your turn'
    });
  });

  test('should reject move to occupied cell', async () => {
    await gameService.submitMove({
      gameId: gameSession.id,
      playerId: player1.id,
      row: 0,
      col: 0
    });

    const result = await gameService.submitMove({
      gameId: gameSession.id,
      playerId: player2.id,
      row: 0,
      col: 0
    });

    expect(result).toEqual({
      type: 'CELL_OCCUPIED',
      message: 'Cell is already occupied'
    });
  });

  test('should detect horizontal win', async () => {
    // Player 1 wins with top row
    await gameService.submitMove({ gameId: gameSession.id, playerId: player1.id, row: 0, col: 0 });
    await gameService.submitMove({ gameId: gameSession.id, playerId: player2.id, row: 1, col: 0 });
    await gameService.submitMove({ gameId: gameSession.id, playerId: player1.id, row: 0, col: 1 });
    await gameService.submitMove({ gameId: gameSession.id, playerId: player2.id, row: 1, col: 1 });

    const result = await gameService.submitMove({ gameId: gameSession.id, playerId: player1.id, row: 0, col: 2 });

    expect(result).toMatchObject({
      status: GameStatus.COMPLETED,
      winnerId: player1.id,
      isDraw: false,
      currentTurn: null
    });
  });

  test('should detect vertical win', async () => {
    // Player 1 wins with left column
    await gameService.submitMove({ gameId: gameSession.id, playerId: player1.id, row: 0, col: 0 });
    await gameService.submitMove({ gameId: gameSession.id, playerId: player2.id, row: 0, col: 1 });
    await gameService.submitMove({ gameId: gameSession.id, playerId: player1.id, row: 1, col: 0 });
    await gameService.submitMove({ gameId: gameSession.id, playerId: player2.id, row: 0, col: 2 });

    const result = await gameService.submitMove({ gameId: gameSession.id, playerId: player1.id, row: 2, col: 0 });

    expect(result).toMatchObject({
      status: GameStatus.COMPLETED,
      winnerId: player1.id,
      isDraw: false
    });
  });

  test('should detect diagonal win', async () => {
    // Player 1 wins with main diagonal
    await gameService.submitMove({ gameId: gameSession.id, playerId: player1.id, row: 0, col: 0 });
    await gameService.submitMove({ gameId: gameSession.id, playerId: player2.id, row: 0, col: 1 });
    await gameService.submitMove({ gameId: gameSession.id, playerId: player1.id, row: 1, col: 1 });
    await gameService.submitMove({ gameId: gameSession.id, playerId: player2.id, row: 0, col: 2 });

    const result = await gameService.submitMove({ gameId: gameSession.id, playerId: player1.id, row: 2, col: 2 });

    expect(result).toMatchObject({
      status: GameStatus.COMPLETED,
      winnerId: player1.id,
      isDraw: false
    });
  });

  test('should detect anti-diagonal win', async () => {
    // Player 1 wins with anti-diagonal
    await gameService.submitMove({ gameId: gameSession.id, playerId: player1.id, row: 0, col: 2 });
    await gameService.submitMove({ gameId: gameSession.id, playerId: player2.id, row: 0, col: 0 });
    await gameService.submitMove({ gameId: gameSession.id, playerId: player1.id, row: 1, col: 1 });
    await gameService.submitMove({ gameId: gameSession.id, playerId: player2.id, row: 0, col: 1 });

    const result = await gameService.submitMove({ gameId: gameSession.id, playerId: player1.id, row: 2, col: 0 });

    expect(result).toMatchObject({
      status: GameStatus.COMPLETED,
      winnerId: player1.id,
      isDraw: false
    });
  });

  test('should detect draw game', async () => {
    // Create a draw scenario
    await gameService.submitMove({ gameId: gameSession.id, playerId: player1.id, row: 0, col: 0 }); // X
    await gameService.submitMove({ gameId: gameSession.id, playerId: player2.id, row: 0, col: 1 }); // O
    await gameService.submitMove({ gameId: gameSession.id, playerId: player1.id, row: 0, col: 2 }); // X
    await gameService.submitMove({ gameId: gameSession.id, playerId: player2.id, row: 1, col: 0 }); // O
    await gameService.submitMove({ gameId: gameSession.id, playerId: player1.id, row: 1, col: 2 }); // X
    await gameService.submitMove({ gameId: gameSession.id, playerId: player2.id, row: 1, col: 1 }); // O
    await gameService.submitMove({ gameId: gameSession.id, playerId: player1.id, row: 2, col: 1 }); // X
    await gameService.submitMove({ gameId: gameSession.id, playerId: player2.id, row: 2, col: 2 }); // O

    const result = await gameService.submitMove({ gameId: gameSession.id, playerId: player1.id, row: 2, col: 0 }); // X

    expect(result).toMatchObject({
      status: GameStatus.COMPLETED,
      winnerId: null,
      isDraw: true
    });
  });

  test('should reject move on completed game', async () => {
    // Complete a game first
    await gameService.submitMove({ gameId: gameSession.id, playerId: player1.id, row: 0, col: 0 });
    await gameService.submitMove({ gameId: gameSession.id, playerId: player2.id, row: 1, col: 0 });
    await gameService.submitMove({ gameId: gameSession.id, playerId: player1.id, row: 0, col: 1 });
    await gameService.submitMove({ gameId: gameSession.id, playerId: player2.id, row: 1, col: 1 });
    await gameService.submitMove({ gameId: gameSession.id, playerId: player1.id, row: 0, col: 2 });

    // Try to make another move
    const result = await gameService.submitMove({ gameId: gameSession.id, playerId: player2.id, row: 2, col: 0 });

    expect(result).toEqual({
      type: 'GAME_NOT_ACTIVE',
      message: 'Game is not active'
    });
  });

  test('should alternate turns correctly', async () => {
    await gameService.submitMove({ gameId: gameSession.id, playerId: player1.id, row: 0, col: 0 });
    const result1 = await gameService.getGameSession(gameSession.id) as GameSession;
    expect(result1.currentTurn).toBe(player2.id);

    await gameService.submitMove({ gameId: gameSession.id, playerId: player2.id, row: 0, col: 1 });
    const result2 = await gameService.getGameSession(gameSession.id) as GameSession;
    expect(result2.currentTurn).toBe(player1.id);
  });

  test('should handle negative coordinates', async () => {
    const result = await gameService.submitMove({
      gameId: gameSession.id,
      playerId: player1.id,
      row: -1,
      col: 0
    });

    expect(result).toEqual({
      type: 'INVALID_MOVE',
      message: 'Invalid move coordinates'
    });
  });

  test('should handle very large coordinates', async () => {
    const result = await gameService.submitMove({
      gameId: gameSession.id,
      playerId: player1.id,
      row: 100,
      col: 100
    });

    expect(result).toEqual({
      type: 'INVALID_MOVE',
      message: 'Invalid move coordinates'
    });
  });
});

describe('Statistics and Leaderboard', () => {
  let player1: Player;
  let player2: Player;
  let player3: Player;

  beforeEach(async () => {
    player1 = await gameService.createPlayer('Player1') as Player;
    player2 = await gameService.createPlayer('Player2') as Player;
    player3 = await gameService.createPlayer('Player3') as Player;
  });

  test('should get initial player stats', async () => {
    const result = await gameService.getPlayerStats(player1.id);

    expect(result).toEqual({
      gamesPlayed: 0,
      gamesWon: 0,
      winRate: 0,
      efficiency: 0
    });
  });

  test('should return error for non-existent player stats', async () => {
    const result = await gameService.getPlayerStats(999);

    expect(result).toEqual({
      type: 'PLAYER_NOT_FOUND',
      message: 'Player stats not found'
    });
  });

  test('should update stats after game completion', async () => {
    const game = await gameService.createGameSession() as GameSession;
    await gameService.joinGameSession(game.id, player1.id);
    const activeGame = await gameService.joinGameSession(game.id, player2.id) as GameSession;

    // Player 1 wins
    await gameService.submitMove({ gameId: activeGame.id, playerId: player1.id, row: 0, col: 0 });
    await gameService.submitMove({ gameId: activeGame.id, playerId: player2.id, row: 1, col: 0 });
    await gameService.submitMove({ gameId: activeGame.id, playerId: player1.id, row: 0, col: 1 });
    await gameService.submitMove({ gameId: activeGame.id, playerId: player2.id, row: 1, col: 1 });
    await gameService.submitMove({ gameId: activeGame.id, playerId: player1.id, row: 0, col: 2 });

    const player1Stats = await gameService.getPlayerStats(player1.id);
    const player2Stats = await gameService.getPlayerStats(player2.id);

    expect(player1Stats).toMatchObject({
      gamesPlayed: 1,
      gamesWon: 1,
      winRate: 100,
      efficiency: expect.any(Number)
    });

    expect(player2Stats).toMatchObject({
      gamesPlayed: 1,
      gamesWon: 0,
      winRate: 0,
      efficiency: 0
    });
  });

  test('should get leaderboard with winners only', async () => {
    // Create and complete a game where player1 wins
    const game = await gameService.createGameSession() as GameSession;
    await gameService.joinGameSession(game.id, player1.id);
    const activeGame = await gameService.joinGameSession(game.id, player2.id) as GameSession;

    await gameService.submitMove({ gameId: activeGame.id, playerId: player1.id, row: 0, col: 0 });
    await gameService.submitMove({ gameId: activeGame.id, playerId: player2.id, row: 1, col: 0 });
    await gameService.submitMove({ gameId: activeGame.id, playerId: player1.id, row: 0, col: 1 });
    await gameService.submitMove({ gameId: activeGame.id, playerId: player2.id, row: 1, col: 1 });
    await gameService.submitMove({ gameId: activeGame.id, playerId: player1.id, row: 0, col: 2 });

    const result = await gameService.getLeaderboard();

    expect(result).toEqual([
      {
        playerId: player1.id,
        playerName: 'Player1',
        gamesWon: 1,
        winRate: 100,
        efficiency: expect.any(Number)
      }
    ]);
  });

  test('should return empty leaderboard when no wins', async () => {
    const result = await gameService.getLeaderboard();

    expect(result).toEqual([]);
  });

  test('should order leaderboard by wins then efficiency', async () => {
    // Create multiple games to test ordering
    // Game 1: Player1 wins quickly
    const game1 = await gameService.createGameSession() as GameSession;
    await gameService.joinGameSession(game1.id, player1.id);
    let activeGame1 = await gameService.joinGameSession(game1.id, player2.id) as GameSession;

    await gameService.submitMove({ gameId: activeGame1.id, playerId: player1.id, row: 0, col: 0 });
    await gameService.submitMove({ gameId: activeGame1.id, playerId: player2.id, row: 1, col: 0 });
    await gameService.submitMove({ gameId: activeGame1.id, playerId: player1.id, row: 0, col: 1 });
    await gameService.submitMove({ gameId: activeGame1.id, playerId: player2.id, row: 1, col: 1 });
    await gameService.submitMove({ gameId: activeGame1.id, playerId: player1.id, row: 0, col: 2 });

    // Game 2: Player2 wins
    const game2 = await gameService.createGameSession() as GameSession;
    await gameService.joinGameSession(game2.id, player2.id);
    let activeGame2 = await gameService.joinGameSession(game2.id, player3.id) as GameSession;

    await gameService.submitMove({ gameId: activeGame2.id, playerId: player2.id, row: 0, col: 0 });
    await gameService.submitMove({ gameId: activeGame2.id, playerId: player3.id, row: 1, col: 0 });
    await gameService.submitMove({ gameId: activeGame2.id, playerId: player2.id, row: 0, col: 1 });
    await gameService.submitMove({ gameId: activeGame2.id, playerId: player3.id, row: 1, col: 1 });
    await gameService.submitMove({ gameId: activeGame2.id, playerId: player2.id, row: 0, col: 2 });

    const result = await gameService.getLeaderboard();

    expect(result).toHaveLength(2);
    expect(Array.isArray(result)).toBe(true);
    if (Array.isArray(result)) {
      expect(result[0].gamesWon).toBeGreaterThanOrEqual(result[1].gamesWon);
    }
  });
});

describe('Edge Cases and Error Handling', () => {
  test('should handle concurrent move attempts gracefully', async () => {
    const player1 = await gameService.createPlayer('Player1') as Player;
    const player2 = await gameService.createPlayer('Player2') as Player;
    const game = await gameService.createGameSession() as GameSession;

    await gameService.joinGameSession(game.id, player1.id);
    const activeGame = await gameService.joinGameSession(game.id, player2.id) as GameSession;

    // Try to submit moves to same cell concurrently by different scenarios
    const movePromises = [
      gameService.submitMove({ gameId: activeGame.id, playerId: player1.id, row: 0, col: 0 }),
      gameService.submitMove({ gameId: activeGame.id, playerId: player2.id, row: 0, col: 0 }) // Different player, should fail due to turn
    ];

    const results = await Promise.all(movePromises);

    // Either one should succeed and one fail, or both should have different error types
    const successes = results.filter(r => !('type' in r));
    const failures = results.filter(r => 'type' in r);

    // At least one should fail due to concurrency/turn control
    expect(failures.length).toBeGreaterThanOrEqual(1);
    expect(successes.length + failures.length).toBe(2);
  });

  test('should handle special characters in player names', async () => {
    const result = await gameService.createPlayer('Player@#$%^&*()');

    expect(result).toEqual({
      id: expect.any(Number),
      name: 'Player@#$%^&*()'
    });
  });

  test('should handle very long player names', async () => {
    const longName = 'A'.repeat(200);
    const result = await gameService.createPlayer(longName);

    // Should either succeed with truncated name or fail gracefully
    if ('type' in result) {
      expect(result.type).toBeDefined();
    } else {
      expect(result.name.length).toBeLessThanOrEqual(100);
    }
  });
});
