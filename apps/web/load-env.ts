import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';

config({ path: process.env.HUFU_ENV_FILE ?? fileURLToPath(new URL('../../.env.local', import.meta.url)), quiet: true });
