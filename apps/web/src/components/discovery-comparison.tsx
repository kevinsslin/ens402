import Image from "next/image";
import { Check, Layers3, Minus } from "lucide-react";

function Capability({ included }: { included: boolean }) {
  return included ? (
    <span className="inline-flex items-center gap-2 font-medium text-emerald-700">
      <Check size={18} aria-hidden="true" /> Yes
    </span>
  ) : (
    <span className="inline-flex items-center gap-2 text-muted-foreground">
      <Minus size={16} aria-hidden="true" />
      <span className="text-xs">Not specified</span>
    </span>
  );
}

const capabilities = [
  {
    title: "Configuration independent of the API",
    detail: "A separate source to check the server’s payment request against.",
  },
  {
    title: "Separate Ops and Treasury permissions",
    detail: "Enforce who can change endpoints versus payment terms onchain.",
  },
  {
    title: "Public, verifiable configuration history",
    detail: "Trace configuration edits through transactions and events.",
  },
];

/** Compare publication and governance guarantees, not overall search quality or openness. */
export function DiscoveryComparison() {
  return (
    <section aria-labelledby="comparison-title">
      <div className="mb-5">
        <h2 id="comparison-title" className="text-xl font-medium">
          Who controls the service configuration?
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Where it lives. Who can edit it. What agents can verify.
        </p>
      </div>
      <div
        className="relative overflow-x-auto rounded-2xl border bg-white"
        tabIndex={0}
        role="region"
        aria-label="Service discovery and configuration comparison, scroll horizontally on small screens"
      >
        <table className="w-full min-w-[660px] border-collapse text-sm">
          <caption className="sr-only">
            Publication and governance capabilities, checked September 27, 2026
          </caption>
          <thead>
            <tr className="border-b">
              <th scope="col" className="p-5 text-left font-medium">
                What matters
              </th>
              <th
                scope="col"
                className="bg-primary/5 p-5 text-center font-semibold text-primary"
              >
                <span className="inline-flex items-center gap-2">
                  <Layers3 size={21} aria-hidden="true" />
                  ENS402*
                </span>
              </th>
              <th scope="col" className="p-5 text-center font-medium">
                <span className="flex flex-col items-center gap-1">
                  <Image
                    src="/brands/x402.svg"
                    alt="x402"
                    width={52}
                    height={16}
                  />
                  <span>Bazaar</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    CDP hosted catalog
                  </span>
                </span>
              </th>
              <th scope="col" className="p-5 text-center font-medium">
                <span className="inline-flex items-center gap-2">
                  <Image
                    src="/brands/x402scan.svg"
                    alt=""
                    width={20}
                    height={23}
                  />
                  x402scan
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b">
              <th scope="row" className="max-w-sm p-5 text-left font-normal">
                <span className="block font-medium">Directory source</span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                  Where published service configuration comes from.
                </span>
              </th>
              <td className="bg-primary/5 p-5 text-center">
                <span className="font-medium text-primary">
                  Decentralized source
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Public ENS records
                </span>
              </td>
              <td className="p-5 text-center">
                <span className="font-medium">Centralized catalog</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Facilitator indexes API metadata
                </span>
              </td>
              <td className="p-5 text-center">
                <span className="font-medium">Centralized index</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Operator indexes API metadata
                </span>
              </td>
            </tr>
            {capabilities.map(({ title, detail }) => (
              <tr key={title} className="border-b last:border-0">
                <th scope="row" className="max-w-sm p-5 text-left font-normal">
                  <span className="block font-medium">{title}</span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    {detail}
                  </span>
                </th>
                <td className="bg-primary/5 p-5 text-center">
                  <Capability included />
                </td>
                <td className="p-5 text-center">
                  <Capability included={false} />
                </td>
                <td className="p-5 text-center">
                  <Capability included={false} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 grid gap-3 text-xs leading-6 text-muted-foreground sm:grid-cols-2">
        <p>
          Bazaar has an open extension; x402scan is open source. Both support
          custom discovery. “Not specified” means their referenced discovery
          specifications do not define this guarantee; providers can add their
          own controls.
        </p>
        <p>
          * ENS402 decentralizes the configuration source, not every component.
          Hosted search remains operator-run; namespace admission and Admin
          powers remain. Testnet implementation covers configured roots; public
          setup is pending.
        </p>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Bazaar uses the x402 mark. Sources:{" "}
        <a
          className="underline underline-offset-4"
          href="https://docs.cdp.coinbase.com/x402/bazaar"
        >
          CDP Bazaar
        </a>{" "}
        ·{" "}
        <a
          className="underline underline-offset-4"
          href="https://github.com/coinbase/x402/blob/main/specs/extensions/bazaar.md"
        >
          Bazaar specification
        </a>{" "}
        ·{" "}
        <a
          className="underline underline-offset-4"
          href="https://github.com/Merit-Systems/x402scan/blob/main/docs/DISCOVERY.md"
        >
          x402scan discovery
        </a>
      </p>
    </section>
  );
}
