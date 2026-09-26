import { ArrowUpRight, Wallet } from "lucide-react";
import styles from "./namespace-architecture.module.css";

const wallets = [
  { name: "Platform owner", target: "A · Root", action: "Register companies", roles: ["ROLE_REGISTRAR", "ROLE_REGISTRAR_ADMIN"] },
  { name: "Company Admin", target: "A · company / B · Root", action: "Choose the company registry; register services", roles: ["A / company: ROLE_SET_SUBREGISTRY", "B / root: ROLE_REGISTRAR + ROLE_REGISTRAR_ADMIN"] },
  { name: "Service Admin", target: "B · service1 / C1 · Root", action: "Choose the resolver; manage its records and writers", roles: ["B / service1: ROLE_SET_RESOLVER + ROLE_SET_RESOLVER_ADMIN", "B / service1: ROLE_CAN_TRANSFER_ADMIN", "C1 / root: ROLE_SET_TEXT + ROLE_SET_TEXT_ADMIN"] },
  { name: "Ops wallet", target: "C1 · Endpoint key", action: "Update the API URL", roles: ["ROLE_SET_TEXT", "Resource: hash of agent-endpoint[x402]"] },
  { name: "Treasury wallet", target: "C1 · Payment key", action: "Update recipient, token and network", roles: ["ROLE_SET_TEXT", "Resource: hash of ens402.payment"] },
];

export function NamespaceArchitecture() {
  return (
    <figure className={styles.figure} aria-label="ENS contract tree and separate wallet permissions">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>01 / Contracts and names</p>
          <h3>One namespace. Separate service resolvers.</h3>
          <p>Registries hold names. Each service name points to its own resolver, which holds its public configuration.</p>
        </div>
        <span className={styles.status}>Proposed company hierarchy</span>
      </header>
      <div className={styles.tree}>
        <div className={styles.legend}><span>Solid arrow: contract pointer</span><span>Dashed arrow: name inside a registry</span></div>
        <a className={styles.diagramLink} href="/diagrams/ens402-contracts.svg" target="_blank" rel="noreferrer" aria-label="Open the full-size contract tree">
          {/* Pre-rendered Mermaid SVG keeps this static diagram free of client JavaScript. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/diagrams/ens402-contracts.svg" width={440} height={558} loading="lazy" alt="ens402.eth points to Platform Registry A. The company name points to Company Registry B. Its service1, service2 and service3 names point to separate resolvers C1, C2 and C3. Each resolver stores an API URL, payment settings and status." />
        </a>
        <div className={styles.treeFooter}>
          <p>Full service name: <code>service1.company.ens402.eth</code><br/>Each service has its own API URL, payment settings and permissions.</p>
          <div className={styles.links}>
            <a href="/diagrams/ens402-contracts.svg" target="_blank" rel="noreferrer">Full-size diagram <ArrowUpRight size={13} aria-hidden="true" /></a>
            <a href="/diagrams/ens402-contracts.mmd" download>Mermaid source ↓</a>
          </div>
        </div>
      </div>
      <section className={styles.permissions} aria-label="Wallet permissions">
        <div className={styles.walletHeading}>
          <div><p className={styles.eyebrow}>02 / Wallet permissions</p><h4>Who can change what?</h4></div>
          <p>Letters refer to the contracts above.<br/>Service-level examples use Service 1.</p>
        </div>
        <div className={styles.wallets}>
          {wallets.map(wallet => (
            <div className={styles.walletRow} key={wallet.name}>
              <p className={styles.walletName}><Wallet size={14} aria-hidden="true" />{wallet.name}</p>
              <span className={styles.target}>{wallet.target}</span>
              <p className={styles.action}>{wallet.action}</p>
            </div>
          ))}
        </div>
        <details className={styles.details}>
          <summary>Native EAC roles and exact scopes</summary>
          <div className={styles.roleList}>
            {wallets.map(wallet => <div key={wallet.name}><strong>{wallet.name}</strong><div>{wallet.roles.map(role => <code key={role}>{role}</code>)}</div></div>)}
          </div>
          <p>Root means all resources in that contract. A role does not automatically carry into a child registry or a separate resolver. Text-key grants apply across records in the same resolver, so independent services use separate resolvers. Admin roles can grant broader authority; a narrow writer grant does not remove an existing root grant.</p>
          <p>Company Admin and Service Admin can be the same wallet. Ops and Treasury use separate wallets. Changing a name owner does not transfer administration of its separate resolver.</p>
        </details>
      </section>
      <figcaption className={styles.caption}>Intended architecture, not a live permissions audit. The company registry layer is planned. These wallets manage public ENS configuration; the buyer’s payment-signing wallet is separate.</figcaption>
    </figure>
  );
}
