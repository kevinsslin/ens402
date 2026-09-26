/** Unsigned native ENS management. JSON input contains public addresses and acceptance signature only. */
import { readFile } from "node:fs/promises";
import {
  prepareDelegateRotation,
  verifyDelegateRotation,
  prepareAdminHandover,
  adminAcceptanceMessage,
  type AdminHandover,
} from "../../packages/sdk/src/ens/management";
import { setupClient, savePlan, wallet } from "./shared";
async function main() {
  const [action, path] = process.argv.slice(2);
  if (
    !path ||
    !["rotate", "verify-rotation", "acceptance", "handover"].includes(
      action ?? "",
    )
  )
    throw Error(
      "Usage: tsx scripts/ens/manage.ts rotate|verify-rotation|acceptance|handover <public-input.json>",
    );
  const input = JSON.parse(await readFile(path, "utf8"));
  if (action === "acceptance") {
    await savePlan("admin-acceptance.json", {
      message: adminAcceptanceMessage(input as AdminHandover),
      instruction:
        "Incoming wallet signs this exact message. Add acceptance signature to input; never include a private key.",
    });
  } else {
    const { client } = await setupClient();
    const plan =
      action === "rotate"
        ? await prepareDelegateRotation(client, input)
        : action === "verify-rotation"
          ? await verifyDelegateRotation(client, input)
          : await prepareAdminHandover(
              client,
              input,
              input.acceptance,
              input.registry || process.env.PROVIDER_REGISTRY_ADDRESS || process.env.PROVIDER_RESOLVER_ADDRESS
                ? {
                    providerRegistry: wallet("PROVIDER_REGISTRY_ADDRESS"),
                    resolver: wallet("PROVIDER_RESOLVER_ADDRESS"),
                  }
                : undefined,
              process.env.ENS_MANAGEMENT_RESOLVER_POLICY === "dedicated",
            );
    await savePlan("management-transactions.json", plan);
  }
}
main().catch(() => {
  console.error(
    "Management plan failed. Check public scope, native permissions and acceptance; no transaction was sent.",
  );
  process.exitCode = 1;
});
