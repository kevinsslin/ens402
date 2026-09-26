import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ENS402Client } from "../../packages/sdk/src/platform";
import { baseUrl, executePayment, parsePaymentConfig, type PaymentConfig } from "./core";
const id = "f836490b-823a-4869-bbd0-17cf53e82efa";
const config: PaymentConfig = {version: 1, baseUrl: "https://ens402.vercel.app", apiKey: `ens402_${"a".repeat(43)}`, approvalId: id, mode: "hosted", payer: `0x${"1".repeat(40)}`, approval: {name: "weather.demo.ens402.eth", authority: "test", endpoints: ["https://example.com/weather"], payTo: `0x${"2".repeat(40)}`, maxAmount: "10000", fixedPrice: "10000", expiresAt: 4_000_000_000}};
const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, {recursive: true, force: true}))); });
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), "ens402-cli-")); directories.push(directory);
  const client = new ENS402Client({baseUrl: config.baseUrl, apiKey: config.apiKey});
  const purchase = vi.spyOn(client, "purchase").mockResolvedValue({id, state: "submitting"} as never);
  const execution = vi.spyOn(client, "execution").mockResolvedValue({id, state: "submitting"} as never);
  return {directory, client, purchase, execution, input: {config, configPath: join(directory, "checkout.json"), id, confirmed: true}};
}
describe("CLI payment boundary", () => {
  it("validates checkout origin and bounded fixed price", () => {
    expect(parsePaymentConfig(config)).toEqual(config);
    for (const url of ["http://example.com", "https://user:pass@example.com", "https://example.com/path"]) expect(() => baseUrl(url)).toThrow();
    expect(() => parsePaymentConfig({...config, approval: {...config.approval, fixedPrice: "20"}})).toThrow();
  });
  it("never sends a payment without confirmation or after expiry", async () => {
    const s = await setup();
    await expect(executePayment({...s.input, confirmed: false}, s.client)).rejects.toThrow("not confirmed");
    await expect(executePayment({...s.input, config: {...config, approval: {...config.approval, expiresAt: 1}}}, s.client)).rejects.toThrow("expired");
    expect(s.purchase).not.toHaveBeenCalled();
  });
  it("persists a private attempt before transmission and never resubmits an uncertain attempt", async () => {
    const s = await setup(); const path = join(s.directory, "ens402-attempts", `${id}.json`);
    s.purchase.mockImplementationOnce(async () => {
      expect(JSON.parse(await readFile(path, "utf8")).approvalId).toBe(id);
      expect((await stat(path)).mode & 0o777).toBe(0o600);
      throw new Error("connection lost");
    });
    await expect(executePayment(s.input, s.client)).rejects.toThrow("connection lost");
    await executePayment(s.input, s.client);
    expect(s.purchase).toHaveBeenCalledTimes(1); expect(s.execution).toHaveBeenCalledWith(id);
    await expect(executePayment({...s.input, config: {...config, baseUrl: "https://other.example"}}, s.client)).rejects.toThrow("different request");
  });
  it("rejects a self signer with a different payer before payment", async () => {
    const s = await setup(); const sign = vi.spyOn(s.client, "purchaseWithSigner");
    await expect(executePayment({...s.input, config: {...config, mode: "self"}, privateKey: `0x${"0".repeat(63)}1`}, s.client)).rejects.toThrow("does not match");
    expect(sign).not.toHaveBeenCalled(); expect(s.purchase).not.toHaveBeenCalled();
  });
  it("delegates hosted payment and binds POST request bytes to the attempt", async () => {
    const s = await setup(); const request = {method: "POST" as const, body: JSON.stringify({orderId: id, city: "Tokyo"})};
    await executePayment({...s.input, request}, s.client);
    expect(s.purchase).toHaveBeenCalledWith({id, approvalId: id, request});
    await expect(executePayment({...s.input, request: {...request, body: JSON.stringify({orderId: id, city: "Osaka"})}}, s.client)).rejects.toThrow("different request");
  });
  it("only sends one purchase when two processes race for the same id", async () => {
    const s = await setup(); await Promise.allSettled([executePayment(s.input,s.client),executePayment(s.input,s.client)]);
    expect(s.purchase).toHaveBeenCalledTimes(1);
  });
});
