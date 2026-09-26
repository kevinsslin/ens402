const permissions = [
  {
    wallet: "Ops wallet",
    scope: "Three separate text-key grants",
    resource: "keccak256(key): agent-endpoint[x402], description, avatar",
    role: "ROLE_SET_TEXT",
    can: "Update the API URL, description and optional picture with their respective grants.",
    cannot:
      "Cannot change payment settings, service status or delegate permissions with this grant.",
  },
  {
    wallet: "Treasury wallet",
    scope: "Payment key",
    resource: 'keccak256("ens402.payment")',
    role: "ROLE_SET_TEXT",
    can: "Update fixed price, recipient, network and token configuration.",
    cannot:
      "Cannot change the API URL with this grant. The receiving wallet is a separate setting.",
  },
  {
    wallet: "Service Admin",
    scope: "Resolver root",
    resource: "0",
    role: "ROLE_SET_TEXT + ROLE_SET_TEXT_ADMIN",
    can: "Write all text records, including service status. Grant and revoke text writers.",
    cannot:
      "This is a trusted administrator. Root permission overrides narrower key restrictions.",
  },
];

export function PermissionMap() {
  return (
    <div className="mt-8 divide-y rounded-xl border bg-card">
      {permissions.map((p) => (
        <section
          key={p.wallet}
          className="grid gap-4 p-6 lg:grid-cols-[180px_1fr_1fr] lg:gap-8"
        >
          <div>
            <h3 className="text-lg font-semibold">{p.wallet}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{p.scope}</p>
          </div>
          <div className="min-w-0">
            <p className="break-words font-mono text-xs leading-6">{p.role}</p>
            <p className="mt-2 break-all font-mono text-xs leading-6 text-muted-foreground">
              Resource: {p.resource}
            </p>
          </div>
          <div>
            <p className="text-sm leading-6">{p.can}</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {p.cannot}
            </p>
          </div>
        </section>
      ))}
    </div>
  );
}
