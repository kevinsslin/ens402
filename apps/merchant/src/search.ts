const entries = [
  {
    title: 'x402 payment requirements',
    summary: 'A resource server returns HTTP 402 with the network, asset, exact amount, and payTo needed for a signed payment.',
    url: 'https://docs.x402.org/core-concepts/http-402',
    tags: ['x402', 'payment', 'http', '402', 'payto', 'agent'],
  },
  {
    title: 'Bazaar service discovery',
    summary: 'Facilitator catalogs help agents find candidate x402 services. Listings do not independently authorize the payee.',
    url: 'https://docs.x402.org/extensions/bazaar',
    tags: ['bazaar', 'discovery', 'catalog', 'service', 'agent'],
  },
  {
    title: 'ENSv2 resolver permissions',
    summary: 'Permissioned resolvers can scope write access to one ENS name and one record key while treasury controls address records.',
    url: 'https://docs.ens.domains/ensv2/resolver/permissioned-resolver',
    tags: ['ens', 'ensv2', 'resolver', 'permission', 'address', 'role'],
  },
  {
    title: 'EIP-3009 transfer authorization',
    summary: 'A payer signs a bounded token transfer authorization offchain. A facilitator can submit it for onchain settlement.',
    url: 'https://eips.ethereum.org/EIPS/eip-3009',
    tags: ['eip3009', 'signature', 'usdc', 'authorization', 'settlement'],
  },
  {
    title: 'World ID for Agents',
    summary: 'A verified human can authorize an agent policy expansion without treating identity proof as a merchant risk score.',
    url: 'https://docs.world.org/world-id/overview',
    tags: ['world', 'identity', 'human', 'approval', 'agent'],
  },
  {
    title: 'Base Sepolia test payments',
    summary: 'Base Sepolia is the test network used for HuFu x402 payments and canonical testnet USDC.',
    url: 'https://docs.base.org/base-chain/quickstart/connecting-to-base',
    tags: ['base', 'sepolia', 'testnet', 'usdc', 'payment'],
  },
] as const;

function words(value: string): string[] {
  return [...new Set(value.toLowerCase().match(/[a-z0-9]+/g) ?? [])].filter(word => word.length > 1);
}

export function searchKnowledge(query: string) {
  const terms = words(query.slice(0, 100));
  return entries.map(entry => {
    const title = words(entry.title);
    const tags = new Set<string>(entry.tags);
    const summary = new Set(words(entry.summary));
    const score = terms.reduce((total, term) => total +
      (title.includes(term) ? 4 : 0) + (tags.has(term) ? 3 : 0) + (summary.has(term) ? 1 : 0), 0);
    return { ...entry, score };
  }).filter(entry => entry.score > 0).sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, 3);
}

export function corpusSize(): number { return entries.length; }
