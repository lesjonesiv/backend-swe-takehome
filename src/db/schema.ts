import { pgTable, serial, varchar, integer, timestamp, boolean, json, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { GameStatus } from '../types/gameTypes';

// Enums
export const gameStatusEnum = pgEnum('game_status', [GameStatus.WAITING, GameStatus.ACTIVE, GameStatus.COMPLETED]);

// Players table
export const players = pgTable('players', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Game sessions table
export const gameSessions = pgTable('game_sessions', {
  id: serial('id').primaryKey(),
  status: gameStatusEnum('status').notNull().default(GameStatus.WAITING),
  winnerId: integer('winner_id').references(() => players.id),
  isDraw: boolean('is_draw').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
  currentTurn: integer('current_turn').references(() => players.id),
  grid: json('grid').notNull().default('[[null,null,null],[null,null,null],[null,null,null]]'),
});

// Game participants table (many-to-many between games and players)
export const gameParticipants = pgTable('game_participants', {
  id: serial('id').primaryKey(),
  gameId: integer('game_id').references(() => gameSessions.id).notNull(),
  playerId: integer('player_id').references(() => players.id).notNull(),
  joinedAt: timestamp('joined_at').defaultNow().notNull(),
  playerOrder: integer('player_order').notNull(), // 1 or 2
});

// Game moves table
export const gameMoves = pgTable('game_moves', {
  id: serial('id').primaryKey(),
  gameId: integer('game_id').references(() => gameSessions.id).notNull(),
  playerId: integer('player_id').references(() => players.id).notNull(),
  row: integer('row').notNull(),
  col: integer('col').notNull(),
  moveNumber: integer('move_number').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Player statistics table
export const playerStats = pgTable('player_stats', {
  id: serial('id').primaryKey(),
  playerId: integer('player_id').references(() => players.id).notNull(),
  gamesPlayed: integer('games_played').default(0),
  gamesWon: integer('games_won').default(0),
  totalMoves: integer('total_moves').default(0),
  winRate: integer('win_rate').default(0), // stored as percentage * 100 for precision
  efficiency: integer('efficiency').default(0), // average moves per win * 100 for precision
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Relations
export const playersRelations = relations(players, ({ many, one }) => ({
  gameParticipants: many(gameParticipants),
  gameMoves: many(gameMoves),
  wonGames: many(gameSessions),
  stats: one(playerStats, {
    fields: [players.id],
    references: [playerStats.playerId],
  }),
}));

export const gameSessionsRelations = relations(gameSessions, ({ many, one }) => ({
  participants: many(gameParticipants),
  moves: many(gameMoves),
  winner: one(players, {
    fields: [gameSessions.winnerId],
    references: [players.id],
  }),
  currentPlayer: one(players, {
    fields: [gameSessions.currentTurn],
    references: [players.id],
  }),
}));

export const gameParticipantsRelations = relations(gameParticipants, ({ one }) => ({
  game: one(gameSessions, {
    fields: [gameParticipants.gameId],
    references: [gameSessions.id],
  }),
  player: one(players, {
    fields: [gameParticipants.playerId],
    references: [players.id],
  }),
}));

export const gameMovesRelations = relations(gameMoves, ({ one }) => ({
  game: one(gameSessions, {
    fields: [gameMoves.gameId],
    references: [gameSessions.id],
  }),
  player: one(players, {
    fields: [gameMoves.playerId],
    references: [players.id],
  }),
}));

export const playerStatsRelations = relations(playerStats, ({ one }) => ({
  player: one(players, {
    fields: [playerStats.playerId],
    references: [players.id],
  }),
}));
