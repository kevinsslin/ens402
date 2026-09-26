import { ArrowDown, ArrowRight, Database, Wallet } from "lucide-react";

const admin = "0x0D2FDDee5b84540A9766c025ad26dCaFb9FeF380";
const ops = "0x03eEe8Be9682D6DF713563FDf7f8D1eD78d7479D";
const treasury = "0x0Ca23D06479560bb9A916c19Df5a2948a8ed3346";
const grants = [
  {
    wallet: "Platform owner",
    address: admin,
    target: "Platform UserRegistry",
    scope: "Root resource · 0",
    roles: ["ROLE_REGISTRAR", "ROLE_REGISTRAR_ADMIN"],
    action: "Register company names and manage platform registrar grants.",
  },
  {
    wallet: "Company Admin",
    address: admin,
    target: "Platform UserRegistry",
    scope: "kevin name resource",
    roles: ["ROLE_SET_SUBREGISTRY"],
    action: "Choose the registry that manages Kevin’s services.",
  },
  {
    wallet: "Company Admin",
    address: admin,
    target: "Kevin UserRegistry",
    scope: "Root resource · 0",
    roles: ["ROLE_REGISTRAR", "ROLE_REGISTRAR_ADMIN"],
    action: "Register services and manage who may register them.",
  },
  {
    wallet: "Service Admin",
    address: admin,
    target: "Kevin UserRegistry",
    scope: "search name resource",
    roles: [
      "ROLE_SET_RESOLVER",
      "ROLE_SET_RESOLVER_ADMIN",
      "ROLE_CAN_TRANSFER_ADMIN",
    ],
    action: "Manage Search’s resolver pointer and native name transfer.",
  },
  {
    wallet: "Service Admin",
    address: admin,
    target: "Search Resolver",
    scope: "Root resource · 0",
    roles: ["ROLE_SET_TEXT", "ROLE_SET_TEXT_ADMIN"],
    action: "Write all Search text records. Grant and revoke text writers.",
  },
  {
    wallet: "Ops",
    address: ops,
    target: "Search Resolver",
    scope: 'keccak256("agent-endpoint[x402]")',
    roles: ["ROLE_SET_TEXT"],
    action:
      "Update Search’s API URL. No payment or status permission from this grant.",
  },
  {
    wallet: "Treasury",
    address: treasury,
    target: "Search Resolver",
    scope: 'keccak256("ens402.payment")',
    roles: ["ROLE_SET_TEXT"],
    action:
      "Update Search’s payment settings. This grant does not allow endpoint edits.",
  },
];
function Pointer({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
      <ArrowDown className="size-4" aria-hidden="true" />
      {children}
    </div>
  );
}
function Registry({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Database className="size-4 text-primary" aria-hidden="true" />
        {title}
      </p>
      <div className="mt-3 text-sm leading-6 text-muted-foreground">
        {children}
      </div>
    </div>
  );
}

/** Planned company hierarchy; wallet addresses are real, grants are not live attestations. */
export function NamespaceArchitecture() {
  return (
    <figure
      className="mt-9 overflow-hidden rounded-2xl border bg-card"
      aria-label="Company namespace, dedicated service resolvers and exact wallet permission scopes"
    >
      <div className="border-b p-5 sm:p-7">
        <p className="text-base font-semibold">
          Names route to contracts. Contracts enforce permissions.
        </p>
        <p className="mt-3 max-w-4xl text-sm leading-7 text-muted-foreground">
          The parent name is registered. The company hierarchy below is the
          proposed next layer, not a deployed service directory. These are the
          assigned demo wallets and intended grants, not a live role audit.
        </p>
      </div>
      <div className="grid gap-8 p-5 sm:p-7 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <p className="eyebrow mb-5">01 / Registry tree</p>
          <div className="rounded-xl border bg-background p-5">
            <p className="font-mono text-base">ens402.eth</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Parent ownership verified on ENSv2 Sepolia
            </p>
          </div>
          <Pointer>Subregistry pointer</Pointer>
          <Registry title="Platform UserRegistry">
            <p>
              Stores the company name{" "}
              <code className="text-foreground">kevin.ens402.eth</code>.
            </p>
            <p className="mt-2">
              Platform owner manages platform registration. Kevin’s name points
              to a separate company registry.
            </p>
          </Registry>
          <Pointer>kevin name → subregistry pointer</Pointer>
          <Registry title="Kevin UserRegistry">
            <p>
              Stores <code>search</code>, <code>weather</code> and{" "}
              <code>enrich</code>. Company Admin holds registrar permissions
              here.
            </p>
          </Registry>
        </div>
        <div>
          <p className="eyebrow mb-5">02 / One resolver per service</p>
          {["search", "weather", "enrich"].map((name, i) => (
            <div
              key={name}
              className={
                i
                  ? "mt-4 rounded-xl border p-4"
                  : "rounded-xl border border-primary/35 bg-secondary/35 p-5"
              }
            >
              <p className="break-all font-mono text-sm">
                {name}.kevin.ens402.eth
              </p>
              <Pointer>Resolver pointer</Pointer>
              <p className="text-sm font-semibold capitalize">
                {name} Resolver
              </p>
              {i === 0 ? (
                <dl className="mt-4 space-y-3 text-sm">
                  {[
                    ["agent-endpoint[x402]", "API URL · Ops writer"],
                    [
                      "ens402.payment",
                      "Recipient, token, network · Treasury writer",
                    ],
                    ["ens402.status", "Active / suspended · Service Admin"],
                  ].map(([key, value]) => (
                    <div key={key}>
                      <dt className="break-all font-mono text-xs">{key}</dt>
                      <dd className="mt-1 text-muted-foreground">{value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="mt-2 text-xs leading-6 text-muted-foreground">
                  Independent records and grants. Search permissions do not
                  automatically apply here.
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="border-t p-5 sm:p-7">
        <p className="eyebrow">03 / Wallet → native grant → target contract</p>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          Company Admin and Service Admin use the same demo wallet, with
          separate grants on separate contracts. Ops and Treasury use different
          wallets.
        </p>
        <div className="mt-6 divide-y rounded-xl border">
          {grants.map((g, i) => (
            <div
              key={i}
              className="grid gap-4 p-5 lg:grid-cols-[1fr_1.15fr_1fr] lg:gap-7"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Wallet className="size-4" aria-hidden="true" />
                  {g.wallet}
                </p>
                <p className="mt-2 break-all font-mono text-xs leading-6 text-muted-foreground">
                  {g.address}
                </p>
              </div>
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <ArrowRight className="size-4" aria-hidden="true" />
                  Native roles
                </p>
                {g.roles.map((role) => (
                  <p
                    key={role}
                    className="mt-1 break-all font-mono text-xs leading-6"
                  >
                    {role}
                  </p>
                ))}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{g.target}</p>
                <p className="mt-2 break-all font-mono text-xs leading-6 text-primary">
                  Resource: {g.scope}
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {g.action}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <figcaption className="border-t bg-background p-5 text-xs leading-7 text-muted-foreground sm:px-7">
        Root means all resources in that specific contract. Roles are not
        inherited just because names share a suffix. ServiceRegistrar can
        receive ROLE_REGISTRAR on the company registry for onboarding; it
        removes its resolver bootstrap roles after registration. Parent control
        and existing root grants remain trust assumptions. Moving a name does
        not transfer its separate resolver administrator.
      </figcaption>
    </figure>
  );
}
