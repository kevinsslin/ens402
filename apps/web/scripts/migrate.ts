import '../load-env';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');
const local = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(connectionString).hostname);
const pool = new Pool({ connectionString, ssl: local ? false : { rejectUnauthorized: true } });
try {
  const sql = await readFile(new URL('../sql/001_initial.sql', import.meta.url), 'utf8');
  await pool.query(sql);
  process.stdout.write('HuFu schema migrated\n');
} finally { await pool.end(); }
