import { config } from 'dotenv';
import { readiness } from '../packages/server/src/config';
import { Store } from '../packages/server/src/store';
config({path:'.env',quiet:true});
const report=readiness();console.log(JSON.stringify(report,null,2));
if(process.env.DATABASE_URL){const store=new Store(process.env.DATABASE_URL);try{await store.health();console.log('Database tables: ready');}catch{console.log('Database tables: unavailable; check DATABASE_URL and run pnpm db:migrate');}finally{await store.close();}}
