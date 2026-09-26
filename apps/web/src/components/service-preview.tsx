"use client";

import { useState } from "react";
import { NETWORK, USDC, verifyRequest } from "@ens402/sdk";
import { ArrowRight, Check, FileCheck2, Globe2, Layers3, ScanLine, ShieldCheck, Wallet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import styles from "./service-preview.module.css";

const scenarios = [
  { id: "normal", label: "Successful purchase" },
  { id: "moved", label: "API URL changes" },
  { id: "mismatch", label: "Wrong recipient" },
] as const;
type Scenario = (typeof scenarios)[number]["id"];
const name = "search.kevin.ens402.eth";
const payTo = "0x2222222222222222222222222222222222222222";
const unexpectedPayTo = "0x3333333333333333333333333333333333333333";

export function ServicePreview() {
  const [scenario, setScenario] = useState<Scenario>("normal");
  const endpoint = `https://api.kevin.example/${scenario === "moved" ? "v2" : "v1"}/search`;
  // Only pure verification runs here. ENS, HTTP and screening inputs are fixtures.
  const decision = verifyRequest(
    {
      name,
      endpoint,
      status: "active",
      authority: "demo",
      block: "demo",
      observedAt: 1000,
      payment: { version: 1, scheme: "exact", network: NETWORK, asset: USDC, payTo },
    },
    endpoint,
    {
      scheme: "exact",
      network: NETWORK,
      asset: USDC,
      payTo: scenario === "mismatch" ? unexpectedPayTo : payTo,
      amount: "10000",
      maxTimeoutSeconds: 60,
      extra: { name: "USDC", version: "2" },
    },
    {
      name,
      authority: "demo",
      endpoints: ["https://api.kevin.example/v1/search", "https://api.kevin.example/v2/search"],
      payTo,
      maxAmount: "50000",
      expiresAt: 1600,
    },
    1000,
  );
  const blocked = decision.outcome !== "continue";
  const steps = [
    {
      title: "Resolve the name",
      owner: "ENS · Sepolia",
      Icon: Layers3,
      body: scenario === "moved"
        ? "Read the new API URL from ENS. The service name stays the same."
        : "Read the service’s API URL, payment settings and status from its resolver.",
      detail: scenario === "moved" ? "Endpoint: /v2/search" : "Endpoint: /v1/search",
    },
    {
      title: "Request the service",
      owner: "Merchant API",
      Icon: Globe2,
      body: "Call the HTTPS endpoint. Its HTTP 402 response describes the requested payment.",
      detail: "Request: 0.01 USDC on Base Sepolia",
    },
    {
      title: "Verify the request",
      owner: "ENS402 client",
      Icon: ShieldCheck,
      body: blocked
        ? "The requested recipient differs from ENS. Stop before asking the wallet to sign."
        : "Compare the recipient, token and network with ENS, then check the buyer’s approved scope.",
      detail: blocked ? "Recipient mismatch: payment blocked" : "Recipient matches · within 0.05 USDC cap",
    },
    {
      title: "Screen the recipient",
      owner: "Intercepta adapter",
      Icon: ScanLine,
      body: "Apply the configured risk policy to current address-risk evidence. This does not rate API quality.",
      detail: "Example evidence: no blocking traits",
    },
    {
      title: "Ask the wallet to sign",
      owner: "Integrator’s signer",
      Icon: Wallet,
      body: "Create a bounded USDC authorization with a recipient, amount, expiry and unique nonce.",
      detail: "Signed authorization, not settlement",
    },
    {
      title: "Settle and get the result",
      owner: "Facilitator · Base Sepolia",
      Icon: FileCheck2,
      body: "Submit the authorization through the merchant. The client verifies settlement and receives the API response.",
      detail: "Onchain payment · offchain API result",
    },
  ];

  return (
    <section className={styles.preview} aria-label="An example agent payment">
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>One request, six steps</p>
          <h3>From a service name to a checked payment.</h3>
        </div>
        <span className={styles.fixture}>Illustrative example</span>
      </div>
      <div className={styles.context}>
        <span>Your agent chooses</span>
        <code>{name}</code>
      </div>
      <div className={styles.scenarios} role="group" aria-label="Choose a payment example">
        {scenarios.map(({ id, label }) => (
          <Button
            key={id}
            variant="outline"
            size="sm"
            className={styles.scenario}
            aria-pressed={scenario === id}
            aria-controls="payment-example-flow"
            onClick={() => setScenario(id)}
          >
            {label}
          </Button>
        ))}
      </div>
      <ol id="payment-example-flow" className={styles.steps}>
        {steps.map(({ title, owner, Icon, body, detail }, index) => {
          const skipped = blocked && index > 2;
          const rejected = blocked && index === 2;
          return (
            <li key={title} className={`${styles.step} ${rejected ? styles.rejected : ""} ${skipped ? styles.skipped : ""}`}>
              <div className={styles.stepTop}>
                <span className={styles.number}>{String(index + 1).padStart(2, "0")}</span>
                <Icon size={20} aria-hidden="true" />
              </div>
              <p className={styles.owner}>{owner}</p>
              <h4>{title}</h4>
              <p className={styles.body}>{body}</p>
              <p className={styles.detail}>
                {skipped ? "Not reached in this scenario" : detail}
              </p>
            </li>
          );
        })}
      </ol>
      <div className={`${styles.outcome} ${blocked ? styles.blockedOutcome : ""}`} role="status" aria-live="polite" aria-atomic="true">
        {blocked ? <X size={20} aria-hidden="true" /> : <Check size={20} aria-hidden="true" />}
        <div>
          <strong>{blocked ? "Stopped at verification. No signature, no payment." : scenario === "moved" ? "New endpoint. Same verified payment destination." : "Checks pass. The payment path can continue."}</strong>
          <p>{blocked
            ? "Changing the API’s payment response cannot change the recipient published in ENS."
            : scenario === "moved"
              ? "This example buyer approved both URLs. An endpoint change outside that scope needs new approval."
              : "The steps show the intended flow. No live scan, signature or transaction occurs here."}</p>
        </div>
        <ArrowRight className={styles.outcomeArrow} size={20} aria-hidden="true" />
      </div>
      <p className={styles.disclosure}>
        Example names and responses; recipient comparison uses the SDK’s real verification rules.
        ENS publishes configuration. The client performs checks, and the connected wallet integration controls signing.
      </p>
    </section>
  );
}
