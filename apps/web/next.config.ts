import type { NextConfig } from 'next';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
loadEnv({ path: resolve(process.cwd(), '../../.env'), quiet: true });

const config: NextConfig = { devIndicators: false, serverExternalPackages: ['pg', '@privy-io/node', 'undici'] };
export default config;
