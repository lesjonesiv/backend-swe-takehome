import { db } from '../db/connection';
import { players, gameSessions, gameParticipants, gameMoves, playerStats } from '../db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { GameStatus } from '../types/gameTypes';

// Types for service functions
export interface GameSession {
  id: number;
  status: GameStatus;
  winnerId: number | null;
  isDraw: boolean | null;
  currentTurn: number | null;
  grid: (number | null)[][];
  participants: { playerId: number; playerOrder: number }[];
}

export interface Player {
  id: number;
  name: string;
}

export interface Move {
  gameId: number;
  playerId: number;
  row: number;
  col: number;
}

export interface GameError {
  type: 'INVALID_MOVE' | 'GAME_NOT_FOUND' | 'PLAYER_NOT_FOUND' | 'GAME_FULL' | 'NOT_YOUR_TURN' | 'CELL_OCCUPIED' | 'GAME_NOT_ACTIVE' | 'ALREADY_JOINED';
  message: string;
}

// Player management functions
export async function createPlayer(name: string): Promise<Player | GameError> {
  try {
    if (!name || name.trim().length === 0) {
      return { type: 'PLAYER_NOT_FOUND', message: 'Player name is required' };
    }

    const result = await db.insert(players).values({ name: name.trim() }).returning();

    // Initialize player stats
    await db.insert(playerStats).values({
      playerId: result[0].id,
      gamesPlayed: 0,
      gamesWon: 0,
      totalMoves: 0,
      winRate: 0,
      efficiency: 0
    });

    return { id: result[0].id, name: result[0].name };
  } catch (error) {
    return { type: 'PLAYER_NOT_FOUND', message: 'Failed to create player' };
  }
}

export async function getPlayer(playerId: number): Promise<Player | GameError> {
  try {
    const result = await db.select().from(players).where(eq(players.id, playerId));
    if (result.length === 0) {
      return { type: 'PLAYER_NOT_FOUND', message: 'Player not found' };
    }
    return { id: result[0].id, name: result[0].name };
  } catch (error) {
    return { type: 'PLAYER_NOT_FOUND', message: 'Failed to retrieve player' };
  }
}

// Game session management functions
export async function createGameSession(): Promise<GameSession | GameError> {
  try {
    const emptyGrid: (number | null)[][] = [
      [null, null, null],
      [null, null, null],
      [null, null, null]
    ];

    const result = await db.insert(gameSessions).values({
      status: GameStatus.WAITING,
      grid: emptyGrid
    }).returning();

    return {
      id: result[0].id,
      status: result[0].status as GameStatus,
      winnerId: result[0].winnerId,
      isDraw: result[0].isDraw,
      currentTurn: result[0].currentTurn,
      grid: result[0].grid as (number | null)[][],
      participants: []
    };
  } catch (error) {
    return { type: 'GAME_NOT_FOUND', message: 'Failed to create game session' };
  }
}

export async function joinGameSession(gameId: number, playerId: number): Promise<GameSession | GameError> {
  try {
    // Verify player exists
    const player = await getPlayer(playerId);
    if ('type' in player) {
      return player;
    }

    // Get game session
    const game = await getGameSession(gameId);
    if ('type' in game) {
      return game;
    }

    // Check if game is waiting
    if (game.status !== GameStatus.WAITING) {
      return { type: 'GAME_FULL', message: 'Game is not accepting new players' };
    }

    // Check if player already joined
    const existingParticipant = game.participants.find(p => p.playerId === playerId);
    if (existingParticipant) {
      return { type: 'ALREADY_JOINED', message: 'Player already joined this game' };
    }

    // Check if game is full
    if (game.participants.length >= 2) {
      return { type: 'GAME_FULL', message: 'Game is full' };
    }

    const playerOrder = game.participants.length + 1;

    // Join the game
    await db.insert(gameParticipants).values({
      gameId,
      playerId,
      playerOrder
    });

    // If this is the second player, start the game
    if (playerOrder === 2) {
      // First player (order 1) goes first
      const firstPlayer = await db.select()
        .from(gameParticipants)
        .where(and(eq(gameParticipants.gameId, gameId), eq(gameParticipants.playerOrder, 1)));

      await db.update(gameSessions)
        .set({
          status: GameStatus.ACTIVE,
          currentTurn: firstPlayer[0].playerId
        })
        .where(eq(gameSessions.id, gameId));
    }

    return getGameSession(gameId);
  } catch (error) {
    return { type: 'GAME_NOT_FOUND', message: 'Failed to join game session' };
  }
}

export async function getGameSession(gameId: number): Promise<GameSession | GameError> {
  try {
    const gameResult = await db.select().from(gameSessions).where(eq(gameSessions.id, gameId));
    if (gameResult.length === 0) {
      return { type: 'GAME_NOT_FOUND', message: 'Game session not found' };
    }

    const participantsResult = await db.select({
      playerId: gameParticipants.playerId,
      playerOrder: gameParticipants.playerOrder
    }).from(gameParticipants).where(eq(gameParticipants.gameId, gameId));

    const game = gameResult[0];
    return {
      id: game.id,
      status: game.status as GameStatus,
      winnerId: game.winnerId,
      isDraw: game.isDraw,
      currentTurn: game.currentTurn,
      grid: game.grid as (number | null)[][],
      participants: participantsResult
    };
  } catch (error) {
    return { type: 'GAME_NOT_FOUND', message: 'Failed to retrieve game session' };
  }
}

// Move validation and execution functions
export async function submitMove(move: Move): Promise<GameSession | GameError> {
  try {
    const { gameId, playerId, row, col } = move;

    // Validate move coordinates
    if (row < 0 || row > 2 || col < 0 || col > 2) {
      return { type: 'INVALID_MOVE', message: 'Invalid move coordinates' };
    }

    // Get current game state
    const game = await getGameSession(gameId);
    if ('type' in game) {
      return game;
    }

    // Check if game is active
    if (game.status !== GameStatus.ACTIVE) {
      return { type: 'GAME_NOT_ACTIVE', message: 'Game is not active' };
    }

    // Check if it's the player's turn
    if (game.currentTurn !== playerId) {
      return { type: 'NOT_YOUR_TURN', message: 'Not your turn' };
    }

    // Check if cell is empty
    if (game.grid[row][col] !== null) {
      return { type: 'CELL_OCCUPIED', message: 'Cell is already occupied' };
    }

    // Count current moves to determine move number
    const moveCount = await db.select({ count: sql<number>`count(*)` })
      .from(gameMoves)
      .where(eq(gameMoves.gameId, gameId));

    const moveNumber = Number(moveCount[0].count) + 1;

    // Execute the move
    const newGrid = game.grid.map(row => [...row]);
    newGrid[row][col] = playerId;

    // Record the move
    await db.insert(gameMoves).values({
      gameId,
      playerId,
      row,
      col,
      moveNumber
    });

    // Update game state
    await db.update(gameSessions)
      .set({ grid: newGrid })
      .where(eq(gameSessions.id, gameId));

    // Check for win condition
    const winner = checkWinner(newGrid);
    const isDraw = winner === null && isBoardFull(newGrid);

    if (winner || isDraw) {
      // Game is over
      await db.update(gameSessions)
        .set({
          status: GameStatus.COMPLETED,
          winnerId: winner,
          isDraw: isDraw,
          completedAt: new Date(),
          currentTurn: null
        })
        .where(eq(gameSessions.id, gameId));

      // Update player statistics
      await updatePlayerStats(gameId, winner, moveNumber);
    } else {
      // Switch turns
      const nextPlayerId = getNextPlayer(game.participants, playerId);
      await db.update(gameSessions)
        .set({ currentTurn: nextPlayerId })
        .where(eq(gameSessions.id, gameId));
    }

    return getGameSession(gameId);
  } catch (error) {
    return { type: 'INVALID_MOVE', message: 'Failed to submit move' };
  }
}

// Game state validation functions
function checkWinner(grid: (number | null)[][]): number | null {
  // Check rows
  for (let row = 0; row < 3; row++) {
    if (grid[row][0] !== null &&
        grid[row][0] === grid[row][1] &&
        grid[row][1] === grid[row][2]) {
      return grid[row][0];
    }
  }

  // Check columns
  for (let col = 0; col < 3; col++) {
    if (grid[0][col] !== null &&
        grid[0][col] === grid[1][col] &&
        grid[1][col] === grid[2][col]) {
      return grid[0][col];
    }
  }

  // Check diagonals
  if (grid[0][0] !== null &&
      grid[0][0] === grid[1][1] &&
      grid[1][1] === grid[2][2]) {
    return grid[0][0];
  }

  if (grid[0][2] !== null &&
      grid[0][2] === grid[1][1] &&
      grid[1][1] === grid[2][0]) {
    return grid[0][2];
  }

  return null;
}

function isBoardFull(grid: (number | null)[][]): boolean {
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      if (grid[row][col] === null) {
        return false;
      }
    }
  }
  return true;
}

function getNextPlayer(participants: { playerId: number; playerOrder: number }[], currentPlayerId: number): number {
  const currentPlayer = participants.find(p => p.playerId === currentPlayerId);
  if (!currentPlayer) {
    return participants[0].playerId;
  }

  const nextOrder = currentPlayer.playerOrder === 1 ? 2 : 1;
  const nextPlayer = participants.find(p => p.playerOrder === nextOrder);
  return nextPlayer ? nextPlayer.playerId : participants[0].playerId;
}

// Statistics and leaderboard functions
async function updatePlayerStats(gameId: number, winnerId: number | null, finalMoveNumber: number): Promise<void> {
  try {
    // Get all participants
    const participants = await db.select({
      playerId: gameParticipants.playerId
    }).from(gameParticipants).where(eq(gameParticipants.gameId, gameId));

    for (const participant of participants) {
      const playerId = participant.playerId;

      // Get current stats
      const currentStats = await db.select()
        .from(playerStats)
        .where(eq(playerStats.playerId, playerId));

      if (currentStats.length === 0) {
        // Create initial stats if they don't exist
        await db.insert(playerStats).values({
          playerId,
          gamesPlayed: 1,
          gamesWon: winnerId === playerId ? 1 : 0,
          totalMoves: 0,
          winRate: winnerId === playerId ? 10000 : 0, // 100% * 100
          efficiency: 0
        });
      } else {
        const stats = currentStats[0];
        const newGamesPlayed = (stats.gamesPlayed || 0) + 1;
        const newGamesWon = (stats.gamesWon || 0) + (winnerId === playerId ? 1 : 0);
        const newWinRate = Math.round((newGamesWon / newGamesPlayed) * 10000);

        // Calculate efficiency (average moves per win)
        let newEfficiency = stats.efficiency || 0;
        if (winnerId === playerId && newGamesWon > 0) {
          // For winner, add the moves from this game and recalculate average
          const movesInThisGame = Math.ceil(finalMoveNumber / 2); // Player makes every other move
          const totalWinMoves = ((stats.efficiency || 0) / 100) * ((stats.gamesWon || 0)) + movesInThisGame;
          newEfficiency = Math.round((totalWinMoves / newGamesWon) * 100);
        }

        await db.update(playerStats)
          .set({
            gamesPlayed: newGamesPlayed,
            gamesWon: newGamesWon,
            winRate: newWinRate,
            efficiency: newEfficiency,
            updatedAt: new Date()
          })
          .where(eq(playerStats.playerId, playerId));
      }
    }
  } catch (error) {
    // Log error but don't fail the game completion
    console.error('Failed to update player stats:', error);
  }
}

export async function getLeaderboard(): Promise<{ playerId: number; playerName: string; gamesWon: number; winRate: number; efficiency: number }[] | GameError> {
  try {
    const leaderboard = await db
      .select({
        playerId: players.id,
        playerName: players.name,
        gamesWon: playerStats.gamesWon,
        winRate: playerStats.winRate,
        efficiency: playerStats.efficiency
      })
      .from(playerStats)
      .innerJoin(players, eq(playerStats.playerId, players.id))
      .where(sql`${playerStats.gamesWon} > 0`)
      .orderBy(desc(playerStats.gamesWon), playerStats.efficiency)
      .limit(3);

    return leaderboard.map(entry => ({
      playerId: entry.playerId,
      playerName: entry.playerName,
      gamesWon: entry.gamesWon || 0,
      winRate: (entry.winRate || 0) / 100, // Convert back to percentage
      efficiency: (entry.efficiency || 0) / 100 // Convert back to average moves
    }));
  } catch (error) {
    return { type: 'GAME_NOT_FOUND', message: 'Failed to retrieve leaderboard' };
  }
}

export async function getPlayerStats(playerId: number): Promise<{ gamesPlayed: number; gamesWon: number; winRate: number; efficiency: number } | GameError> {
  try {
    const stats = await db.select()
      .from(playerStats)
      .where(eq(playerStats.playerId, playerId));

    if (stats.length === 0) {
      return { type: 'PLAYER_NOT_FOUND', message: 'Player stats not found' };
    }

    const stat = stats[0];
    return {
      gamesPlayed: stat.gamesPlayed || 0,
      gamesWon: stat.gamesWon || 0,
      winRate: (stat.winRate || 0) / 100,
      efficiency: (stat.efficiency || 0) / 100
    };
  } catch (error) {
    return { type: 'PLAYER_NOT_FOUND', message: 'Failed to retrieve player stats' };
  }
}