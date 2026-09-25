import { config } from 'dotenv';
import { Store } from '../packages/server/src/store';
config({path:'.env',quiet:true});
if(!process.env.DATABASE_URL)throw new Error('Set DATABASE_URL in root .env');
const store=new Store(process.env.DATABASE_URL);
try { await store.migrate(); console.log('ENS402 tables installed. Existing application tables were not modified.'); } catch { console.error('Database migration failed. Check DATABASE_URL and database availability.'); process.exitCode=1; } finally { await store.close(); }
