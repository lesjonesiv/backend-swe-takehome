import { drizzle } from 'drizzle-orm/postgres-js';

export const db = drizzle(process.env.DATABASE_URL || 'postgresql://localhost:5432/postgres');
