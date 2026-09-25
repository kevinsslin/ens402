import { config } from 'dotenv';
import { mkdir, writeFile } from 'node:fs/promises';
import { InterceptaProvider } from '../packages/sdk/src/intercepta';
import { evaluateRisk } from '../packages/sdk/src/index';
config({ path: '.env', quiet: true });
const provider = new InterceptaProvider({ apiKey: process.env.INTERCEPTA_API_KEY ?? '' });
const address = '0x0d775e010f0b6c32c9468d43ba599ef47d596e47';
try {
  const evidence = await provider.screen(address);
  const cached = await provider.screen(address);
  const report = { checkedAt: new Date().toISOString(), evidence, decision: evaluateRisk(evidence, address, Math.floor(Date.now() / 1000)), cacheVerified: cached.cached, settlement: 'not attempted' };
  await mkdir('docs/validation', { recursive: true });
  await writeFile('docs/validation/intercepta-adapter-live.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch { console.error('Intercepta live check failed. Payment held. No credentials logged.'); process.exitCode = 1; }
