import { Pool, type PoolClient } from 'pg';

let pool: Pool | undefined;

export function database(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(connectionString).hostname);
  pool ??= new Pool({ connectionString, max: 5, ssl: local ? false : { rejectUnauthorized: true } });
  return pool;
}

export async function transaction<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await database().connect();
  try {
    await client.query('BEGIN');
    const result = await run(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
