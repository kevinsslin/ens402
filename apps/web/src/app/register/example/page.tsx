"use client";
import { RegistrationConsole } from "@/components/registration-console";
export default function RegistrationExample() {
  return (
    <>
      <RegistrationConsole
        registrar=""
        parent="ens402.eth"
        example
        getProvider={async () => {
          throw new Error("Example only");
        }}
      />
      <section className="section-shell border-t py-10">
        <p className="eyebrow">A different action / buying a name</p>
        <h2 className="mt-3 text-2xl font-medium">
          Publish a service above. Call a service below.
        </h2>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-muted-foreground">
          The form above publishes an API. To call our paid-name API, an agent
          instead provides only a fresh order ID, label and recipient. In the
          current demo, this requests alice.ens402.eth for the recipient. It
          does not buy alice.eth. Public purchases remain unavailable until
          namespace and worker setup is complete.
        </p>
        <pre className="mt-5 overflow-x-auto rounded-xl border bg-card p-5 text-sm leading-7">
          {JSON.stringify(
            {
              orderId: "f1490e8a-5ae6-4e0b-becd-89920b597a88",
              label: "alice",
              recipient: "0x5555555555555555555555555555555555555555",
            },
            null,
            2,
          )}
        </pre>
        <p className="mt-3 text-sm text-muted-foreground">
          Illustrative values only. The SDK obtains HTTP 402, checks ENS terms
          and signs the exact request body before submitting payment.
        </p>
      </section>
    </>
  );
}
