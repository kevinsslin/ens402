/** Read Envio's complete registration candidates. Live state is still resolved at a fixed block. */
export async function journalCandidates(url: string, toBlock: bigint, options: { signal?: AbortSignal; maxEvents?: number } = {}) {
  const endpoint = new URL(url);
  if (endpoint.username || endpoint.password || (endpoint.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(endpoint.hostname))) throw Error("Use a trusted HTTPS Envio GraphQL endpoint");
  async function query(query: string, variables: object = {}) {
    const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", ...(process.env.ENVIO_GRAPHQL_ADMIN_SECRET ? { "x-hasura-admin-secret": process.env.ENVIO_GRAPHQL_ADMIN_SECRET } : {}) }, body: JSON.stringify({ query, variables }), signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(30000) });
    if (!response.ok) throw Error("Envio GraphQL unavailable");
    const result = await response.json(); if (result.errors?.length || !result.data) throw Error("Envio GraphQL query failed"); return result.data;
  }
  const head = await query('{ IndexedHead_by_pk(id: "11155111") { blockNumber } }');
  if (!head.IndexedHead_by_pk || BigInt(head.IndexedHead_by_pk.blockNumber) < toBlock) throw Error("Envio has not indexed requested snapshot block");
  const labels: Record<string, string[]> = {};
  let cursor = "";
  let count = 0;
  for (;;) {
    const data = await query('query Candidates($block: numeric!, $cursor: String!) { NativeEvent(where: {chainId: {_eq: 11155111}, kind: {_eq: "Registry.LabelRegistered"}, blockNumber: {_lte: $block}, id: {_gt: $cursor}}, order_by: {id: asc}, limit: 1000) { id contract params } }', { block: String(toBlock), cursor });
    const rows = data.NativeEvent;
    if (!Array.isArray(rows)) throw Error("Invalid Envio journal response");
    count += rows.length;
    if (count > (options.maxEvents ?? 100000)) throw Error("Journal candidate limit exceeded");
    for (const row of rows) { const params = JSON.parse(row.params); if (typeof params.label !== "string") throw Error("Invalid registration event"); (labels[row.contract.toLowerCase()] ??= []).push(params.label); }
    if (rows.length < 1000) break;
    const next = rows.at(-1).id;
    if (typeof next !== "string" || next <= cursor) throw Error("Invalid journal pagination");
    cursor = next;
  }
  return labels;
}
