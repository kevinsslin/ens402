export type WalletProvider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

/** Reuse the selected connection. A network change is only requested when needed. */
export async function selectedWallet(
  provider: WalletProvider,
  expected?: string,
  chainId?: string,
) {
  if (
    chainId &&
    String(await provider.request({ method: "eth_chainId" })).toLowerCase() !==
      chainId.toLowerCase()
  ) {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId }],
    });
    if (
      String(
        await provider.request({ method: "eth_chainId" }),
      ).toLowerCase() !== chainId.toLowerCase()
    )
      throw new Error("Network switch did not complete. Try the action again.");
  }
  const accounts = (await provider.request({
    method: "eth_accounts",
  })) as string[];
  const address = accounts[0];
  if (!address)
    throw new Error(
      "Connect a wallet using the wallet control at the top of this page.",
    );
  if (expected && address.toLowerCase() !== expected.toLowerCase())
    throw new Error(
      "The wallet account changed. Select the intended wallet at the top of the page and try again.",
    );
  return address;
}
