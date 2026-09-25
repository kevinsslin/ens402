import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir,readFile,writeFile,access } from 'node:fs/promises';
import { resolve } from 'node:path';
const exec=promisify(execFile);const directory=resolve('.local/postgres');
await mkdir(directory,{recursive:true,mode:0o700});
let initialized=true;try{await access(`${directory}/data/PG_VERSION`);}catch{initialized=false;}
if(!initialized)await exec('initdb',['-D',`${directory}/data`,'-U','ens402','-A','trust','--no-locale']);
let running=true;try{await exec('pg_ctl',['-D',`${directory}/data`,'status']);}catch{running=false;}
if(!running)await exec('pg_ctl',['-D',`${directory}/data`,'-l',`${directory}/postgres.log`,'-o',`-h 127.0.0.1 -p 5442 -k ${directory}`,'-w','start']);
const database=await exec('psql',['-h','127.0.0.1','-p','5442','-U','ens402','-d','postgres','-Atc',"SELECT 1 FROM pg_database WHERE datname='ens402'"]);
if(database.stdout.trim()!=='1')await exec('createdb',['-h','127.0.0.1','-p','5442','-U','ens402','ens402']);
let env='';try{env=await readFile('.env','utf8');}catch{}
env=env.split('\n').filter(line=>!line.startsWith('DATABASE_URL=')).join('\n');
await writeFile('.env',`${env}\nDATABASE_URL=postgresql://ens402@127.0.0.1:5442/ens402\n`,{mode:0o600});
console.log('Project-local PostgreSQL is running on loopback port 5442. Root .env now points to it. Existing .env.local is preserved. Run pnpm db:migrate.');
