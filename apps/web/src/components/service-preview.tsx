"use client";

import { useEffect, useRef, useState } from "react";
import { NETWORK, USDC, verifyRequest } from "@ens402/sdk";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  ChevronRight,
  Code2,
  Globe2,
  KeyRound,
  Layers3,
  LockKeyhole,
  ScanLine,
  Search,
  ShieldCheck,
  Sparkles,
  Wallet,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import styles from "./service-preview.module.css";

const services = [
  {
    id: "search",
    label: "Web search",
    Icon: Search,
    request: "Find useful sources about Tokyo.",
    result: '{ "results": 8, "query": "Tokyo" }',
  },
  {
    id: "weather",
    label: "Weather",
    Icon: Globe2,
    request: "What is the weather in Tokyo?",
    result: '{ "city": "Tokyo", "temperature": 24 }',
  },
  {
    id: "enrich",
    label: "Enrichment",
    Icon: Sparkles,
    request: "Enrich this company profile.",
    result: '{ "company": "Example", "enriched": true }',
  },
] as const;
const chapters = [
  {
    label: "Discover",
    title: "A service starts with a name.",
    body: "The agent selects a known service from an illustrative directory. Each ENS name is a stable reference to its public configuration.",
  },
  {
    label: "Resolve",
    title: "Read the configuration onchain.",
    body: "Read native ENS records on Sepolia: the current API URL, the expected payment destination and the service status.",
  },
  {
    label: "Request",
    title: "The name points to an ordinary API.",
    body: "The agent calls the HTTPS endpoint. The API returns HTTP 402 with its price, token, network and requested recipient.",
  },
  {
    label: "Verify",
    title: "Compare the bill before paying.",
    body: "Match the actual HTTP 402 against ENS and the buyer’s approved scope. A server cannot silently substitute a new payment destination.",
  },
  {
    label: "Screen",
    title: "Check the recipient’s risk evidence.",
    body: "Intercepta supplies address-risk evidence. This illustrative clean response passes the demo risk policy; it does not certify API quality.",
  },
  {
    label: "Authorize",
    title: "Now ask the wallet to sign.",
    body: "An approved signer creates a bounded USDC payment authorization. A signature is permission to pay, not a settled transaction.",
  },
  {
    label: "Settle",
    title: "A payment onchain. A result offchain.",
    body: "The merchant and facilitator submit the authorization on Base Sepolia. The client verifies settlement and receives the API response.",
  },
] as const;
const scenarios = [
  { id: "normal", label: "Successful purchase" },
  { id: "moved", label: "API URL changes" },
  { id: "mismatch", label: "Wrong recipient" },
] as const;
type Scenario = (typeof scenarios)[number]["id"];
const payTo = "0x2222222222222222222222222222222222222222";
const unexpectedPayTo = "0x3333333333333333333333333333333333333333";

function CodeRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "danger" | "good";
}) {
  return (
    <div className={styles.codeRow}>
      <dt>{label}</dt>
      <dd className={tone ? styles[tone] : undefined}>{value}</dd>
    </div>
  );
}

export function ServicePreview() {
  const [serviceId, setServiceId] =
    useState<(typeof services)[number]["id"]>("search");
  const [scenario, setScenario] = useState<Scenario>("normal");
  const [step, setStep] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(true);
  const frame = useRef<HTMLDivElement>(null);
  const scrollStory = useRef<HTMLDivElement>(null);
  const service = services.find((item) => item.id === serviceId)!;
  const name = `${service.id}.kevin.ens402.eth`;
  const endpoint = `https://api.kevin.example/${scenario === "moved" ? "v2" : "v1"}/${service.id}`;
  const recipient = scenario === "mismatch" ? unexpectedPayTo : payTo;
  const payment = {
    version: 1 as const,
    scheme: "exact" as const,
    network: NETWORK,
    asset: USDC,
    payTo,
  };
  // Only pure verification runs here. Names, API responses and risk data are fixtures.
  const decision = verifyRequest(
    {
      name,
      endpoint,
      status: "active",
      authority: "demo",
      block: "demo",
      observedAt: 1000,
      payment,
    },
    endpoint,
    {
      scheme: "exact",
      network: NETWORK,
      asset: USDC,
      payTo: recipient,
      amount: "10000",
      maxTimeoutSeconds: 60,
      extra: { name: "USDC", version: "2" },
    },
    {
      name,
      authority: "demo",
      endpoints: [
        `https://api.kevin.example/v1/${service.id}`,
        `https://api.kevin.example/v2/${service.id}`,
      ],
      payTo,
      maxAmount: "50000",
      expiresAt: 1600,
    },
    1000,
  );
  const blocked = decision.outcome !== "continue";
  const lastStep = blocked ? 3 : chapters.length - 1;
  const stopped = blocked && step === 3;
  const chapter = chapters[step]!;

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(preference.matches);
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    let tick = 0;
    const update = () => {
      tick = 0;
      const section = scrollStory.current;
      const stage = frame.current;
      if (!section || !stage) return;
      const rect = section.getBoundingClientRect();
      const inset = parseFloat(getComputedStyle(stage).top) || 0;
      const distance = Math.max(1, rect.height - stage.offsetHeight);
      const progress = Math.max(0, Math.min(1, (inset - rect.top) / distance));
      const position = progress * (lastStep + 1);
      stage.style.setProperty("--chapter-progress", String(position >= lastStep + 1 ? 1 : position % 1));
      setStep(Math.min(lastStep, Math.floor(position)));
    };
    const queue = () => {
      if (!tick) tick = requestAnimationFrame(update);
    };
    queue();
    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    return () => {
      cancelAnimationFrame(tick);
      window.removeEventListener("scroll", queue);
      window.removeEventListener("resize", queue);
    };
  }, [lastStep]);

  function seek(index: number) {
    const section = scrollStory.current;
    const stage = frame.current;
    if (!section || !stage) return;
    const inset = parseFloat(getComputedStyle(stage).top) || 0;
    const travel = section.offsetHeight - stage.offsetHeight;
    window.scrollTo({
      top:
        window.scrollY +
        section.getBoundingClientRect().top -
        inset +
        ((index + 0.1) / (lastStep + 1)) * travel,
      behavior: reducedMotion ? "instant" : "smooth",
    });
  }
  function reset() {
    seek(0);
    setStep(0);
  }
  const activeLane =
    step < 2 ? "ens" : step === 2 || step === 6 ? "api" : "agent";

  return (
    <div
      ref={scrollStory}
      className={styles.scrollStory}
      style={{ height: `${(lastStep + 1) * 100}svh` }}
    >
      <div
        ref={frame}
        className={styles.film}
        data-step={step}
        data-reduced={reducedMotion}
      >
        <div className={styles.topbar}>
          <div className={styles.filmLabel}>
            <span className={styles.labelDot} />
            <span>Inside an agent payment</span>
          </div>
          <span className={styles.fixtureBadge}>
            Scroll story · simulated data
          </span>
        </div>
        <div
          className={styles.scenarios}
          role="group"
          aria-label="Demo scenario"
        >
          {scenarios.map((item) => (
            <Button
              key={item.id}
              variant="ghost"
              size="sm"
              aria-pressed={scenario === item.id}
              className={styles.scenario}
              onClick={() => {
                setScenario(item.id);
                reset();
              }}
            >
              {item.label}
            </Button>
          ))}
        </div>

        <div
          className={styles.map}
          aria-label="Agent, ENS service tree and HTTPS API"
        >
          <section
            className={`${styles.agentLane} ${activeLane === "agent" ? styles.activeLane : ""}`}
          >
            <p className={styles.laneLabel}>01 / Agent runtime</p>
            <div
              className={`${styles.agentNode} ${stopped ? styles.blockedNode : ""}`}
            >
              <div className={styles.agentIcon}>
                {stopped ? <ShieldCheck /> : <Bot />}
              </div>
              <h3>Your agent</h3>
              <p>{service.request}</p>
              <span className={styles.nodeStatus}>
                {stopped
                  ? "Payment stopped"
                  : step === 6
                    ? "Result received"
                    : step >= 3
                      ? "Checking before payment"
                      : "Looking for a service"}
              </span>
            </div>
            <div className={styles.agentScope}>
              <LockKeyhole size={14} />
              <span>
                Approved budget
                <br />
                <strong>0.05 USDC / request</strong>
              </span>
            </div>
          </section>

          <div
            className={`${styles.bridge} ${step < 2 ? styles.bridgeActive : ""}`}
            aria-hidden="true"
          >
            <span />
            <i />
            <small>{step === 0 ? "select" : "resolve"}</small>
          </div>

          <section
            className={`${styles.treeLane} ${activeLane === "ens" ? styles.activeLane : ""}`}
          >
            <p className={styles.laneLabel}>02 / ENS · Sepolia</p>
            <div className={styles.tree}>
              <div className={styles.rootNode}>
                <Layers3 size={15} />
                <span>ens402.eth</span>
              </div>
              <div className={styles.stem} aria-hidden="true" />
              <div className={styles.providerNode}>
                <span>Service provider</span>
                <strong>kevin.ens402.eth</strong>
              </div>
              <div className={styles.branches} aria-hidden="true">
                <svg viewBox="0 0 360 36" preserveAspectRatio="none">
                  <path d="M180 0V16H60V36 M180 16V36 M180 16H300V36" />
                </svg>
              </div>
              <div
                className={styles.serviceNodes}
                role="group"
                aria-label="Choose an example service"
              >
                {services.map(({ id, Icon, label }) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={serviceId === id}
                    aria-label={`Select ${label}`}
                    onClick={() => {
                      setServiceId(id);
                      reset();
                    }}
                    className={`${styles.serviceNode} ${serviceId === id ? styles.selectedNode : ""}`}
                  >
                    <Icon size={19} />
                    <strong>{id}</strong>
                    <span>.kevin.ens402.eth</span>
                  </button>
                ))}
              </div>
              <p className={styles.treeNote}>
                Select a name. Resolve its public records.
              </p>
            </div>
          </section>

          <div
            className={`${styles.bridge} ${step >= 2 ? styles.bridgeActive : ""}`}
            aria-hidden="true"
          >
            <span />
            <i />
            <small>HTTPS</small>
          </div>

          <section
            className={`${styles.apiLane} ${activeLane === "api" ? styles.activeLane : ""}`}
          >
            <p className={styles.laneLabel}>03 / Offchain API</p>
            <div
              className={`${styles.apiNode} ${step >= 2 ? styles.readyNode : ""}`}
            >
              <div className={styles.apiHeader}>
                <Code2 size={20} />
                <span>
                  {step === 6
                    ? "200 OK"
                    : step >= 2
                      ? "402 Payment Required"
                      : "HTTPS endpoint"}
                </span>
              </div>
              <p className={styles.apiHost}>api.kevin.example</p>
              <p key={`${serviceId}-${scenario}`} className={styles.apiPath}>
                /{scenario === "moved" ? "v2" : "v1"}/{service.id}
              </p>
              <div className={styles.apiBill}>
                <span>
                  {step === 6 ? "Resource delivered" : "Price per request"}
                </span>
                <strong>{step === 6 ? "JSON response" : "0.01 USDC"}</strong>
              </div>
            </div>
            <p className={styles.apiNote}>
              {scenario === "moved"
                ? "New URL, same name. This demo buyer has approved both URLs."
                : "The server asks for payment. Your agent checks the request."}
            </p>
          </section>
        </div>

        <div className={styles.storyboard}>
          <div className={styles.narrative} aria-live="off" aria-atomic="true">
            <p className={styles.chapterNumber}>
              CHAPTER {String(step + 1).padStart(2, "0")} /{" "}
              {String(chapters.length).padStart(2, "0")}{" "}
              <span>{stopped ? "BLOCKED" : chapter.label}</span>
            </p>
            <div key={`${step}-${scenario}`} className={styles.caption}>
              <h3>
                {stopped
                  ? "A different recipient. A hard stop."
                  : chapter.title}
              </h3>
              <p>
                {stopped
                  ? "The API requests payment to an address that differs from ENS. The SDK rejects the request before screening, signing or submitting a transaction."
                  : chapter.body}
              </p>
            </div>
            <div className={styles.boundaryNote}>
              {step < 3 ? (
                <Globe2 size={15} />
              ) : step === 4 ? (
                <ScanLine size={15} />
              ) : (
                <ShieldCheck size={15} />
              )}
              <span>
                {step === 0
                  ? "Example directory, not automatic ENS enumeration."
                  : step === 1
                    ? "Native EAC controls who can edit these records."
                    : step === 2
                      ? "ENS resolves the URL. It does not proxy the API call."
                      : step === 3
                        ? "Policy checks run in the client / wallet integration."
                        : step === 4
                          ? "Risk evidence is separate from ENS resolution."
                          : step === 5
                            ? "Use Privy or an independently integrated signer."
                            : "ENS: Sepolia. USDC settlement: Base Sepolia."}
              </span>
            </div>
          </div>
          <div
            className={styles.evidence}
            key={`${step}-${serviceId}-${scenario}`}
          >
            <div className={styles.evidenceHeader}>
              <span>
                {
                  [
                    "Service directory",
                    "Resolved ENS records",
                    "HTTP 402 response",
                    "Payment decision",
                    "Intercepta · example response",
                    "USDC authorization",
                    "Settlement + delivery",
                  ][step]
                }
              </span>
              <span className={styles.exampleTag}>EXAMPLE</span>
            </div>
            {step === 0 && (
              <div className={styles.directory}>
                <p>kevin.ens402.eth</p>
                {services.map(({ id, label }) => (
                  <div
                    key={id}
                    className={serviceId === id ? styles.directorySelected : ""}
                  >
                    <span>{id}.kevin.ens402.eth</span>
                    <span>
                      {serviceId === id ? <ChevronRight size={16} /> : label}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {step === 1 && (
              <>
                <dl className={styles.code}>
                  <CodeRow label="agent-endpoint[x402]" value={endpoint} />
                  <CodeRow
                    label="ens402.payment"
                    value={JSON.stringify(
                      {
                        version: 1,
                        scheme: "exact",
                        network: NETWORK,
                        asset: USDC,
                        payTo,
                      },
                      null,
                      2,
                    )}
                  />
                  <CodeRow label="ens402.status" value="active" />
                </dl>
                <div className={styles.delegates}>
                  <span>
                    <KeyRound size={12} /> Ops → endpoint
                  </span>
                  <span>
                    <Wallet size={12} /> Treasury → payment
                  </span>
                </div>
              </>
            )}
            {step === 2 && (
              <dl className={styles.code}>
                <CodeRow label="status" value="402 Payment Required" />
                <CodeRow label="amount" value="10000 (0.01 USDC)" />
                <CodeRow label="network" value="eip155:84532 (Base Sepolia)" />
                <CodeRow
                  label="payTo"
                  value={recipient}
                  tone={scenario === "mismatch" ? "danger" : undefined}
                />
                <CodeRow label="maxTimeoutSeconds" value="60" />
              </dl>
            )}
            {step === 3 && (
              <div className={styles.checks}>
                {[
                  ["Service + approved endpoint", true],
                  ["Token + network", true],
                  ["Recipient matches ENS", !blocked],
                  ["0.01 USDC ≤ 0.05 USDC cap", true],
                ].map(([label, ok]) => (
                  <div
                    key={String(label)}
                    className={!ok ? styles.danger : undefined}
                  >
                    {ok ? <Check size={16} /> : <X size={16} />}
                    <span>{label}</span>
                  </div>
                ))}
                <p
                  className={`${styles.decision} ${stopped ? styles.danger : styles.good}`}
                >
                  {stopped
                    ? "Rejected · no signature, no transaction"
                    : "Matched · continue to screening"}
                </p>
              </div>
            )}
            {step === 4 && (
              <>
                <dl className={styles.code}>
                  <CodeRow
                    label="source"
                    value="Ethereum mainnet address-risk evidence"
                  />
                  <CodeRow label="toxicScore" value="0" />
                  <CodeRow label="traits" value="[]" />
                  <CodeRow
                    label="policy outcome"
                    value="Continue with fresh evidence"
                    tone="good"
                  />
                </dl>
                <p className={styles.evidenceNote}>
                  Fixture only. No live scan is made. Missing, expired or
                  flagged evidence would hold the payment.
                </p>
              </>
            )}
            {step === 5 && (
              <dl className={styles.code}>
                <CodeRow label="type" value="TransferWithAuthorization" />
                <CodeRow label="to" value={payTo} />
                <CodeRow label="value" value="10000 USDC atomic units" />
                <CodeRow label="chainId" value="84532" />
                <CodeRow
                  label="validBefore / nonce"
                  value="Short expiry / unique per payment"
                />
                <CodeRow label="state" value="Signed, not yet settled" />
              </dl>
            )}
            {step === 6 && (
              <div className={styles.settlement}>
                <div className={styles.settlementRow}>
                  <span>
                    <Wallet size={16} /> Signed authorization
                  </span>
                  <ArrowDown size={14} />
                  <span>
                    <Layers3 size={16} /> Facilitator → USDC contract
                  </span>
                  <ArrowDown size={14} />
                  <span className={styles.good}>
                    <Check size={16} /> Transfer + nonce verified
                  </span>
                </div>
                <pre>{service.result}</pre>
                <p className={styles.evidenceNote}>
                  Illustrative receipt and response. No funds moved.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className={styles.controls}>
          <div className={styles.transport}>
            <span className={styles.scrollHint}>
              <ArrowDown size={14} />
              <span>Scroll to explore</span>
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Previous chapter"
              disabled={step === 0}
              onClick={() => seek(step - 1)}
            >
              <ArrowLeft size={17} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Next chapter"
              disabled={step >= lastStep}
              onClick={() => seek(step + 1)}
            >
              <ArrowRight size={17} />
            </Button>
          </div>
          <ol className={styles.timeline} aria-label="Demo chapters">
            {chapters.map(({ label }, index) => (
              <li key={label}>
                <button
                  type="button"
                  disabled={index > lastStep}
                  aria-label={`Chapter ${index + 1}: ${label}`}
                  aria-current={step === index ? "step" : undefined}
                  data-complete={index < step}
                  onClick={() => seek(index)}
                >
                  <span className={styles.timelineTrack} />
                  <span>{label}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <p className={styles.disclosure}>
        A visual walkthrough, not a live transaction. Example subdomains, HTTPS
        endpoints and provider responses; recipient verification uses the SDK’s
        actual rules. ENS publishes configuration, not a guarantee of service
        quality.
      </p>
    </div>
  );
}
