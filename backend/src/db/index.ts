import Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema.js'

const sqlite = new Database(process.env.DATABASE_URL ?? 'local.db')
// adds vec_distance_cosine(), used to rank chunks
sqliteVec.load(sqlite)

export const db = drizzle(sqlite, { schema })

export function runMigrations() {
  migrate(db, { migrationsFolder: `${import.meta.dirname}/../../drizzle` })
}
