import {
  ArrowDown,
  Database,
  FileText,
  Globe,
  KeyRound,
  Layers3,
  Wallet,
} from "lucide-react";
import type { ReactNode } from "react";
import styles from "./namespace-architecture.module.css";

function WalletGrant({
  name,
  children,
}: {
  name: string;
  children: ReactNode;
}) {
  return (
    <aside className={styles.wallet} aria-label={`${name} permissions`}>
      <div className={styles.walletName}>
        <Wallet size={15} aria-hidden="true" />
        <strong>{name}</strong>
      </div>
      {children}
    </aside>
  );
}

function Roles({ scope, roles }: { scope: string; roles: string[] }) {
  return (
    <div className={styles.grant}>
      <p className={styles.scope}>{scope}</p>
      {roles.map((role) => (
        <code key={role}>{role}</code>
      ))}
    </div>
  );
}

function Pointer({ children }: { children: ReactNode }) {
  return (
    <div className={styles.pointer}>
      <span />
      <ArrowDown size={14} aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}

export function NamespaceArchitecture() {
  return (
    <figure
      className={styles.figure}
      aria-label="ENS registry tree, service resolvers and wallet roles"
    >
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>The public configuration layer</p>
          <h3>
            Every service has a home.
            <br />
            Every wallet has a defined job.
          </h3>
        </div>
        <span className={styles.status}>Planned provider layer</span>
      </header>
      <div className={styles.canvas}>
        <p className={styles.namespaceNote}>
          <strong>Choose your namespace.</strong> This example uses
          provider.ens402.eth. The discovery design also supports provider-owned
          names such as service1.provider.eth, without requiring our parent
          domain. Multi-namespace indexing is planned.
        </p>
        <div className={styles.laneLabels}>
          <span>Names, contracts & records</span>
          <span>Wallets & native EAC roles</span>
        </div>
        <div className={styles.row}>
          <div className={styles.contract}>
            <div className={styles.nodeHeading}>
              <span className={styles.icon}>
                <Layers3 size={18} aria-hidden="true" />
              </span>
              <div>
                <p className={styles.kind}>Platform Registry</p>
                <h4>ens402.eth</h4>
              </div>
              <span className={styles.nodeId}>A</span>
            </div>
            <div className={styles.nameEntry}>
              <span>Name entry</span>
              <code>provider</code>
              <span className={styles.entryNote}>→ Provider registry</span>
            </div>
          </div>
          <WalletGrant name="Platform owner">
            <Roles
              scope="A · Registry root"
              roles={["ROLE_REGISTRAR", "ROLE_REGISTRAR_ADMIN"]}
            />
            <p className={styles.job}>
              Register providers and manage registrar grants.
            </p>
          </WalletGrant>
        </div>
        <Pointer>Subregistry pointer</Pointer>
        <div className={styles.row}>
          <div className={styles.contract}>
            <div className={styles.nodeHeading}>
              <span className={styles.icon}>
                <Layers3 size={18} aria-hidden="true" />
              </span>
              <div>
                <p className={styles.kind}>Provider Registry</p>
                <h4>provider.ens402.eth</h4>
              </div>
              <span className={styles.nodeId}>B</span>
            </div>
            <p className={styles.nodeDescription}>
              Three service names. Three independent resolvers.
            </p>
            <div className={styles.services}>
              {[1, 2, 3].map((number) => (
                <div
                  key={number}
                  className={
                    number === 1 ? styles.selectedService : styles.service
                  }
                >
                  <code>service{number}</code>
                  <div className={styles.servicePointer}>
                    <ArrowDown size={13} aria-hidden="true" />
                    <span>resolver</span>
                  </div>
                  <div className={styles.miniResolver}>
                    <Database size={13} aria-hidden="true" />
                    <span>Resolver {number}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <WalletGrant name="Provider Admin">
            <Roles scope="A · provider name" roles={["ROLE_SET_SUBREGISTRY"]} />
            <Roles
              scope="B · Registry root"
              roles={["ROLE_REGISTRAR", "ROLE_REGISTRAR_ADMIN"]}
            />
            <p className={styles.job}>
              Choose the provider registry and create services.
            </p>
          </WalletGrant>
        </div>
        <div className={styles.focusLink}>
          <span />
          <p>
            <Database size={13} aria-hidden="true" /> Inside Resolver 1
          </p>
        </div>
        <section
          className={styles.resolver}
          aria-label="Resolver 1 records and their writers"
        >
          <div className={`${styles.row} ${styles.resolverHeader}`}>
            <div>
              <div className={styles.nodeHeading}>
                <span className={styles.resolverIcon}>
                  <Database size={18} aria-hidden="true" />
                </span>
                <div>
                  <p className={styles.kind}>PermissionedResolver</p>
                  <h4>Resolver 1</h4>
                </div>
                <span className={styles.nodeId}>C1</span>
              </div>
              <code className={styles.fullName}>
                service1.provider.ens402.eth
              </code>
              <p className={styles.nodeDescription}>
                Public service configuration, with native EAC enforcing each
                writer’s scope.
              </p>
              <span className={styles.rootNote}>
                <KeyRound size={13} aria-hidden="true" /> Admin retains full
                text control
              </span>
            </div>
            <WalletGrant name="Service Admin">
              <Roles
                scope="B · service1 name"
                roles={[
                  "ROLE_SET_RESOLVER",
                  "ROLE_SET_RESOLVER_ADMIN",
                  "ROLE_CAN_TRANSFER_ADMIN",
                ]}
              />
              <Roles
                scope="C1 · Resolver root"
                roles={["ROLE_SET_TEXT", "ROLE_SET_TEXT_ADMIN"]}
              />
            </WalletGrant>
          </div>
          <div className={`${styles.row} ${styles.recordRow}`}>
            <div className={styles.record}>
              <div className={styles.recordTitle}>
                <FileText size={16} aria-hidden="true" />
                <h5>Description & picture</h5>
                <span>Text records</span>
              </div>
              <code>description</code>
              <p>Returns structured search results for a supplied query.</p>
              <code>avatar</code>
              <p>Optional HTTPS picture URL.</p>
              <p className={styles.plannedNote}>
                Description and picture publishing are implemented. Rich
                call-format schemas remain planned.
              </p>
            </div>
            <WalletGrant name="Ops wallet">
              <Roles
                scope="C1 · Separate grants for description and avatar"
                roles={["ROLE_SET_TEXT"]}
              />
              <p className={styles.job}>
                Maintain the description and optional picture with separate
                native key grants.
              </p>
            </WalletGrant>
          </div>
          <div className={`${styles.row} ${styles.recordRow}`}>
            <div className={styles.record}>
              <div className={styles.recordTitle}>
                <Globe size={16} aria-hidden="true" />
                <h5>API endpoint</h5>
                <span>Text record</span>
              </div>
              <code>agent-endpoint[x402]</code>
              <p>https://api.example.com/v1/service</p>
            </div>
            <WalletGrant name="Ops wallet">
              <Roles scope="C1 · Endpoint key only" roles={["ROLE_SET_TEXT"]} />
              <p className={styles.job}>
                Update the URL. No payment-record permission.
              </p>
            </WalletGrant>
          </div>
          <div className={`${styles.row} ${styles.recordRow}`}>
            <div className={styles.record}>
              <div className={styles.recordTitle}>
                <Wallet size={16} aria-hidden="true" />
                <h5>Price & payment</h5>
                <span>Fixed price</span>
              </div>
              <code>ens402.payment</code>
              <p className={styles.price}>
                0.01 USDC <span>/ request</span>
              </p>
              <dl className={styles.recordFields}>
                <div>
                  <dt>Network</dt>
                  <dd>Base Sepolia · 84532</dd>
                </div>
                <div>
                  <dt>Asset</dt>
                  <dd>USDC token contract</dd>
                </div>
                <div>
                  <dt>Recipient</dt>
                  <dd>Provider payout address</dd>
                </div>
                <div>
                  <dt>Scheme</dt>
                  <dd>exact</dd>
                </div>
              </dl>
              <p className={styles.plannedNote}>
                Payment schema v2 holds a fixed amount in atomic USDC units
                alongside scheme, network, asset and payTo. SDK checks the
                actual 402 against this amount.
              </p>
            </div>
            <WalletGrant name="Treasury wallet">
              <Roles scope="C1 · Payment key only" roles={["ROLE_SET_TEXT"]} />
              <p className={styles.job}>
                Set the price and payment terms. The Treasury writer can differ
                from the payout recipient.
              </p>
            </WalletGrant>
          </div>
          <p className={styles.statusRecord}>
            <code>ens402.status</code>
            <span>
              Active / suspended · maintained by Service Admin in this example.
            </span>
          </p>
        </section>
        <div className={styles.legend}>
          <span>
            <i /> Name / contract relationship
          </span>
          <span>
            <i /> Scoped write or administration grant
          </span>
        </div>
      </div>
      <figcaption className={styles.caption}>
        <p>
          Platform and Provider Registry represent ENSv2 UserRegistry contracts.
          Roles apply to a contract and resource, not automatically to its
          children. Ops and Treasury grants use the hash of their text key.
          Resolver 2 and 3 need their own grants. Provider Admin and Service
          Admin may share a wallet; Ops and Treasury are separate.
        </p>
        <p>
          Intended grants, not live permissions. The provider hierarchy and
          multi-namespace indexer remain planned. Metadata publishing and
          fixed-price checks are implemented. Admin retains the ability to write
          these records and change grants. Buyer payment signing is separate
          from these configuration wallets.
        </p>
        <a href="/diagrams/ens402-contracts.mmd" download>
          Download the Mermaid structure reference ↓
        </a>
      </figcaption>
    </figure>
  );
}
