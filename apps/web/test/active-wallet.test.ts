import { expect, it } from "vitest";
import { activeEthereumWallet } from "../src/components/active-wallet";
const wallets = [
  { address: "0xAAAA", id: "ops" },
  { address: "0xBBBB", id: "treasury" },
];
it("uses Privy selection consistently and case-insensitively", () => {
  expect(activeEthereumWallet(wallets, "0xbbbb")?.id).toBe("treasury");
});
it("never falls back to another signer when the selected wallet is missing", () => {
  expect(activeEthereumWallet(wallets, "0xCCCC")).toBeUndefined();
});
it("uses the first connected wallet only before an active selection exists", () => {
  expect(activeEthereumWallet(wallets)?.id).toBe("ops");
  expect(activeEthereumWallet([])).toBeUndefined();
});
