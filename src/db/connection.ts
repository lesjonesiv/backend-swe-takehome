import { drizzle } from 'drizzle-orm/postgres-js';
import * as postgres from 'postgres';
import * as schema from './schema';

const connection = postgres.default(process.env.DATABASE_URL || 'postgresql://localhost:5432/postgres');

export const db = drizzle(connection, { schema });
