import { ConsoleLoader } from "@/components/console-loader";
export const dynamic = "force-dynamic";
export default function MerchantPage() {
  const appId = process.env.PRIVY_APP_ID;
  if (!appId)
    return (
      <section className="section-shell py-20">
        <h1 className="text-3xl">Merchant workspace</h1>
        <p className="mt-4">
          Connect the wallet that controls your ENS services after platform
          sign-in is configured.
        </p>
      </section>
    );
  return <ConsoleLoader appId={appId} workspace="merchant" />;
}
