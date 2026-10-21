// src/pgdb.ts
// PostgreSQL helper configured for Neon DB and Windows networking

import net from "node:net";
import dns from "node:dns";
import { Pool, type QueryResultRow } from "pg";
import * as dotenv from "dotenv";

dotenv.config({ path: "./.env" });

// Disable autoSelectFamily to prevent IPv6 timeout hangs on networks where IPv6 is unrouted
if (typeof net.setDefaultAutoSelectFamily === "function") {
  net.setDefaultAutoSelectFamily(false);
}
dns.setDefaultResultOrder("ipv4first");

let connectionString = process.env.DATABASE_URL || "";
// Neon connection pooler works reliably without SCRAM channel_binding
connectionString = connectionString.replace(/[?&]channel_binding=[^&]+/, "");

export const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false,
  },
});

/**
 * Execute a SQL query and return the resulting rows.
 * @param text The SQL query text with $1, $2 placeholders.
 * @param params Optional array of query parameters.
 * @returns Promise resolving to an array of rows of type T.
 */
export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: readonly unknown[]
): Promise<T[]> {
  const result = await pool.query<T>(text, params as any[]);
  return result.rows;
}

export { type QueryResultRow };
export default { query, pool };
