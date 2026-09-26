import { ConsoleLoader } from "@/components/console-loader";
export const dynamic = "force-dynamic";
export default function ProviderPage() {
  const appId = process.env.PRIVY_APP_ID;
  if (!appId)
    return (
      <section className="section-shell py-20">
        <h1 className="text-3xl">Provider setup</h1>
        <p className="mt-4">
          Wallet sign-in needs to be configured by the platform operator.
        </p>
      </section>
    );
  return (
    <ConsoleLoader
      appId={appId}
      workspace="provider"
      parent={process.env.ENS_PARENT_NAME || "ens402.eth"}
    />
  );
}
