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
        <code key={role} className={role.endsWith("_ADMIN") ? styles.adminRole : styles.actionRole}>
          {role}
        </code>
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
          <p className={styles.eyebrow}>Platform → Provider → Service</p>
          <h3>
            Three levels. Clear ownership.
          </h3>
        </div>
        <span className={styles.status}>Provider setup pending</span>
      </header>
      <div className={styles.canvas}>
        <p className={styles.namespaceNote}>
          <strong>Native ENS registries. Dedicated service resolvers.</strong>{" "}
          Read top to bottom for ownership; left to right for permissions.
        </p>
        <div className={styles.laneLabels}>
          <span>Names, contracts & records</span>
          <span>Who controls it · Native EAC</span>
        </div>
        <div className={styles.roleLegend}>
          <span className={styles.actionRole}>Action permission</span>
          <span className={styles.adminRole}>Grant / revoke permission</span>
          <span>Scope identifies the contract and resource.</span>
        </div>
        <div className={styles.row}>
          <div className={styles.contract}>
            <div className={styles.nodeHeading}>
              <span className={styles.icon}>
                <Layers3 size={18} aria-hidden="true" />
              </span>
              <div>
                <p className={styles.kind}>1 · Platform Registry</p>
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
              Create provider entries. Manage registration authority.
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
                <p className={styles.kind}>2 · Provider Registry</p>
                <h4>provider.ens402.eth</h4>
              </div>
              <span className={styles.nodeId}>B</span>
            </div>
            <p className={styles.nodeDescription}>
              This provider’s service directory. A dedicated resolver per service.
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
              Manage this provider’s directory. Service Admin rights are separate.
            </p>
            <p className={styles.pendingNote}>Provider onboarding and handover grants pending implementation.</p>
          </WalletGrant>
        </div>
        <div className={styles.registrationFlow}>
          <div>
            <strong>Service registration</strong>
            <p>ServiceRegistrar receives <code className={styles.actionRole}>ROLE_REGISTRAR</code> on the selected registry.</p>
          </div>
          <p>Register name → Create resolver → Set records & delegates → Remove bootstrap rights</p>
          <span>Direct-service flow built · Provider integration pending</span>
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
                  <p className={styles.kind}>3 · Service / PermissionedResolver</p>
                  <h4>Service 1 · Resolver 1</h4>
                </div>
                <span className={styles.nodeId}>C1</span>
              </div>
              <code className={styles.fullName}>
                service1.provider.ens402.eth
              </code>
              <p className={styles.nodeDescription}>
                Registrant becomes Service Admin. Supplied Ops and Treasury addresses receive scoped writes.
              </p>
              <span className={styles.rootNote}>
                <KeyRound size={13} aria-hidden="true" /> Admin retains full
                text control
              </span>
            </div>
            <WalletGrant name="Service Admin">
              <p className={styles.job}>Control this name, its settings and its delegates.</p>
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

            </div>
            <WalletGrant name="Ops wallet">
              <Roles
                scope="C1 · Separate grants for description and avatar"
                roles={["ROLE_SET_TEXT"]}
              />
              <p className={styles.job}>
                Edit service details and artwork.
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
                  <dd>payTo · Payment recipient</dd>
                </div>
                <div>
                  <dt>Scheme</dt>
                  <dd>exact</dd>
                </div>
              </dl>
              <p className={styles.plannedNote}>
                0.01 USDC = 10000 atomic units. SDK compares this with HTTP 402.
              </p>
            </div>
            <WalletGrant name="Treasury wallet">
              <Roles scope="C1 · Payment key only" roles={["ROLE_SET_TEXT"]} />
              <p className={styles.job}>
                Edit price and payTo. This wallet need not receive the payment.
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
        <section className={styles.lifecycle} aria-label="Role lifecycle">
          <div className={styles.lifecycleHeading}>
            <h4>Set up once. Keep control as your team changes.</h4>
          </div>
          <div className={styles.lifecycleGrid}>
            <div>
              <span className={styles.step}>01 · Register</span>
              <h5>Assign the first roles</h5>
              <p>Admin is the registrant. Ops and Treasury are supplied during registration.</p>
              <span className={styles.built}>Service flow fork-tested</span>
            </div>
            <div>
              <span className={styles.step}>02 · Replace a delegate</span>
              <h5>Grant new. Revoke old.</h5>
              <p>Verify effective rights after each change. Replacing Treasury does not change payTo.</p>
              <span className={styles.pendingNote}>Complete replacement flow pending</span>
            </div>
            <div>
              <span className={styles.step}>03 · Transfer administration</span>
              <h5>Hand over every control</h5>
              <p>Name ownership and registry/resolver rights need explicit handover. They do not transfer together automatically.</p>
              <span className={styles.pendingNote}>Acceptance and handover flow pending</span>
            </div>
          </div>
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
        <p>Target architecture · Service permissions fork-tested · Public setup pending</p>
        <details>
          <summary className="cursor-pointer py-2 font-medium text-primary">Permission boundaries & implementation status</summary>
          <p>
            Platform and Provider Registry are native ENSv2 UserRegistry instances.
            Grants apply to a contract and resource, not automatically to its children.
            Each resolver needs its own Ops and Treasury grants. Admin retains
            full text control and grant management. Payment signing is separate.
          </p>
          <p>
            Provider onboarding and multi-namespace indexing still need implementation.
            Metadata publishing and fixed-price checks are implemented.
            The roles shown are intended grants, not a live permission audit.
          </p>
        </details>
        <a href="/diagrams/ens402-contracts.mmd" download>Download Mermaid reference ↓</a>
      </figcaption>
    </figure>
  );
}
