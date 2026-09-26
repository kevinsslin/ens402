import { ConsoleLoader } from "@/components/console-loader";
export const dynamic = "force-dynamic";
export default function RegisterPage() {
  const appId = process.env.PRIVY_APP_ID;
  const registrar = process.env.SERVICE_REGISTRAR_ADDRESS;
  const parent = process.env.ENS_PARENT_NAME;
  if (!registrar || !parent)
    return (
      <section className="section-shell py-20">
        <p className="eyebrow">ENS service registration / Sepolia</p>
        <h1 className="mt-4 text-4xl font-medium">
          Our namespace is being configured.
        </h1>
        <p className="mt-6 max-w-2xl leading-7 text-muted-foreground">
          Once the parent name and registrar are connected, you can register a
          service subdomain, publish its API and payment settings, and delegate
          endpoint and Treasury permissions to separate wallets.
        </p>
        <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">
          Registration is not available yet. The demo uses testnet names and
          test tokens.
        </p>
        <a
          className="mt-7 inline-block text-primary underline"
          href="/register/example"
        >
          View the complete example form
        </a>
        <br />
        <a className="mt-7 inline-block text-primary underline" href="/docs">
          Read how service registration works
        </a>
      </section>
    );
  if (!appId)
    return <p className="section-shell py-20">Sign-in is being configured.</p>;
  return <ConsoleLoader appId={appId} registration={{ registrar, parent }} />;
}
