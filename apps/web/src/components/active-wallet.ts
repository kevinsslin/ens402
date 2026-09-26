/** Never silently substitute another signer when Privy's selected wallet is reconnecting. */
export function activeEthereumWallet<T extends { address: string }>(
  wallets: readonly T[],
  activeAddress?: string,
): T | undefined {
  return activeAddress
    ? wallets.find(
        (wallet) =>
          wallet.address.toLowerCase() === activeAddress.toLowerCase(),
      )
    : wallets[0];
}
