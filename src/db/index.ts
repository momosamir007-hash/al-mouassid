import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl && process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
  console.warn("DATABASE_URL is not defined in environment variables");
}
const globalForDb = globalThis as typeof globalThis & { __arenaNextJsPostgresqlPool?: Pool };
export const pool = globalForDb.__arenaNextJsPostgresqlPool ?? new Pool({
  connectionString: databaseUrl || "postgresql://postgres:postgres@127.0.0.1:5432/app_db",
  max: Number.isFinite(Number(process.env.PG_POOL_MAX)) ? Math.max(1, Math.min(5, Number(process.env.PG_POOL_MAX))) : 2,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 5_000,
  allowExitOnIdle: process.env.NODE_ENV !== "production",
});
globalForDb.__arenaNextJsPostgresqlPool = pool;
export const db = drizzle(pool);
