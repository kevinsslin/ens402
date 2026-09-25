import type { PolicyGateway, PolicyAuthorization } from './x402.js';

export function createHttpPolicyGateway(origin: string, request: typeof fetch = fetch): PolicyGateway {
  const base = new URL(origin);
  if (base.protocol !== 'https:' && base.hostname !== 'localhost') throw new Error('Policy API requires HTTPS');
  async function post<T>(path: string, body: unknown): Promise<T> {
    const response = await request(new URL(path, base), {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body), cache: 'no-store', redirect: 'error',
    });
    if (!response.ok) throw new Error(`Policy API failed with HTTP ${response.status}`);
    return response.json() as Promise<T>;
  }
  return {
    authorize: input => post<PolicyAuthorization>('/api/authorize', input),
    settle: input => post<void>('/api/settle', input),
  };
}
