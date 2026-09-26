/** Shell quoting keeps user queries literal, including quotes and command substitutions. */
export function cliSearchCommand(query: string, maxPricePerRequestAtomic?: string, limit = 3): string {
  const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
  if (maxPricePerRequestAtomic !== undefined && !/^\d+$/.test(maxPricePerRequestAtomic)) throw new Error("Invalid atomic price");
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error("Invalid limit");
  return `curl -fSLo ens402.mjs https://ens402.vercel.app/downloads/ens402.mjs\nnode ens402.mjs search --limit ${limit}${maxPricePerRequestAtomic === undefined ? "" : ` --max-price-atomic ${maxPricePerRequestAtomic}`} -- ${quote(query)}`;
}
