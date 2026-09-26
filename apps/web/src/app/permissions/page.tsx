import Link from "next/link";
import { PermissionMap } from "@/components/permission-map";

export default function PermissionsPage() {
  return (
    <article className="section-shell py-14 sm:py-20">
      <p className="eyebrow">Merchant permissions / native ENSv2</p>
      <h1 className="section-title mt-5 max-w-3xl">
        Which wallet can
        <br />
        change what?
      </h1>
      <p className="mt-7 max-w-3xl text-lg leading-8 text-muted-foreground">
        A role describes the action. Its resource describes where the action is
        allowed. Ops and Admin both have ROLE_SET_TEXT, but only Admin has it at
        the resolver root.
      </p>
      <p className="mt-5 max-w-3xl rounded-lg border bg-card p-4 text-sm leading-7">
        This is the permission model assigned by our registration contract and
        setup scripts. It is not a live audit of your wallet. Existing grants
        and parent administrators can add authority.
      </p>
      <PermissionMap />
      <section className="mt-10 rounded-xl border bg-primary/5 p-6">
        <h2 className="text-2xl font-medium">Verify the grants after setup.</h2>
        <p className="mt-3 text-sm leading-7">
          Run <code>pnpm ens:permissions:check</code> with the service name and
          Admin, Ops and Treasury addresses. It resolves the actual native
          resolver and reads effective permissions at one block, including root
          overrides. Missing setup or an RPC error never counts as a pass.
        </p>
        <p className="mt-3 text-sm leading-7">
          The report checks required grants, forbidden text edits and
          text-administration privileges for those wallets. Fork tests also
          exercise allowed writes, rejected writes and revocation. This is a
          snapshot, not proof that grants cannot change later or that no other
          administrators exist.
        </p>
      </section>
      <section className="mt-16">
        <h2 className="text-4xl">Two contracts. Two kinds of control.</h2>
        <div className="mt-7 grid gap-5 md:grid-cols-2">
          <div className="rounded-xl border bg-card p-6">
            <h3 className="text-lg font-semibold">
              Registry: the name and its pointer
            </h3>
            <p className="mt-3 text-sm leading-7">
              The service Admin receives ROLE_SET_RESOLVER,
              ROLE_SET_RESOLVER_ADMIN and ROLE_CAN_TRANSFER_ADMIN on the service
              name. These control its resolver pointer and native transfer.
            </p>
          </div>
          <div className="rounded-xl border bg-card p-6">
            <h3 className="text-lg font-semibold">
              Resolver: the service records
            </h3>
            <p className="mt-3 text-sm leading-7">
              The same Admin receives root text writing and text administration.
              Ops and Treasury receive only their key-scoped setter grants. Each
              service has its own resolver.
            </p>
          </div>
        </div>
        <p className="mt-5 text-sm leading-7 text-muted-foreground">
          Transferring the name does not transfer the separate resolver
          administrator. Parent or root administrators may retain native powers.
          An Ops wallet must be different from Admin and Treasury.
        </p>
      </section>
      <section className="mt-16">
        <h2 className="text-4xl">Platform setup comes first.</h2>
        <ol className="mt-7 grid gap-4 md:grid-cols-3">
          {[
            [
              "1. Parent name",
              "The platform owner controls ens402.eth and points it to a native UserRegistry.",
            ],
            [
              "2. Child registry",
              "The platform owner has ROLE_REGISTRAR and ROLE_REGISTRAR_ADMIN at its root. ServiceRegistrar receives ROLE_REGISTRAR only.",
            ],
            [
              "3. Service registration",
              "ServiceRegistrar creates a resolver, sets records, delegates Ops/Treasury, hands text administration to the registrant and removes its own resolver privileges.",
            ],
          ].map(([title, body]) => (
            <li className="rounded-xl border bg-card p-6" key={title}>
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                {body}
              </p>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-sm leading-7">
          The platform owner and a service Admin are different responsibilities.
          They may be different wallets. The platform is not automatically given
          text permissions on each service resolver.
        </p>
      </section>
      <div className="mt-12 flex flex-wrap gap-6 border-t pt-7 text-sm">
        <Link className="text-primary underline" href="/register">
          Register a service
        </Link>
        <Link className="text-primary underline" href="/docs">
          Agent integration guide
        </Link>
        <Link className="text-primary underline" href="/architecture">
          Full architecture
        </Link>
      </div>
    </article>
  );
}
