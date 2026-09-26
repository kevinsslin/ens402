import { config } from 'dotenv';
import { Store } from '../packages/server/src/store';
config({path:'.env',quiet:true});
const url=process.env.PRODUCTION_DATABASE_URL_UNPOOLED || process.env.PRODUCTION_DATABASE_URL;
if(!url || !new URL(url).hostname.endsWith('.neon.tech')) throw new Error('Expected a configured Neon production database');
const store=new Store(url);
try {await store.migrate();await store.health();console.log('Neon production migration and health check passed');} finally {await store.close();}
