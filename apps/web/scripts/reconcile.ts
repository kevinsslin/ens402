import '../load-env';
import { Pool } from 'pg';
import { verifySettlement } from '../src/lib/policy.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');
const local = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(connectionString).hostname);
const pool = new Pool({ connectionString, ssl: local ? false : { rejectUnauthorized: true } });
try {
  const rows = await pool.query<{
    id: string; agent_wallet: string; pay_to: string; amount_atomic: string; transaction_hash: string;
  }>("SELECT id,agent_wallet,pay_to,amount_atomic::text,transaction_hash FROM reservations WHERE status='uncertain' AND transaction_hash IS NOT NULL LIMIT 100");
  let settled = 0;
  for (const row of rows.rows) {
    const valid = await verifySettlement({
      payer: row.agent_wallet as `0x${string}`,
      payTo: row.pay_to as `0x${string}`,
      amountAtomic: row.amount_atomic,
    }, row.transaction_hash as `0x${string}`).catch(() => false);
    if (!valid) continue;
    const updated = await pool.query("UPDATE reservations SET status='settled' WHERE id=$1 AND status='uncertain'", [row.id]);
    settled += updated.rowCount ?? 0;
  }
  process.stdout.write(`Reconciled ${settled} of ${rows.rowCount ?? 0} uncertain payments with hashes\n`);
} finally { await pool.end(); }
