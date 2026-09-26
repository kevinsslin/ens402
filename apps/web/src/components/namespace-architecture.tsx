import { ArrowDown, ArrowRight, Database, KeyRound, Layers3, ShieldCheck, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import styles from "./namespace-architecture.module.css";

function Role({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  return <code className={admin ? styles.adminRole : styles.actionRole}>{children}</code>;
}

/** Names live in registries; records and key-scoped EAC live in a separate resolver. */
export function NamespaceArchitecture() {
  return (
    <figure className={styles.figure} aria-label="Platform, provider and service namespace with shared resolver and native EAC wallet roles">
      <header className={styles.header}>
        <div><p className={styles.eyebrow}>The ENS402 blueprint</p><h3>One provider. One resolver. Clear permissions.</h3></div>
        <p>Three name levels.<br />Separate service records.</p>
      </header>
      <div className={styles.blueprint}>
        <div className={styles.platformRow}>
          <section className={styles.contract} aria-label="Platform registry">
            <span className={styles.contractLabel}><Layers3 size={15} /> Platform Registry · UserRegistry</span>
            <div className={styles.level}><span>01 / PLATFORM</span><strong>ens402.eth</strong></div>
            <div className={styles.platformEntry}><div className={styles.nameToken}>provider<span>Provider Admin owns this name</span></div><span className={styles.otherProviders}>Other providers have their own registries.</span></div>
          </section>
          <aside className={styles.platformWallet}>
            <h4><Wallet size={17} /> Platform Owner</h4>
            <p>Register providers. Manage who can register.</p>
            <div className={styles.roles}><Role>ROLE_REGISTRAR</Role><Role admin>ROLE_REGISTRAR_ADMIN</Role></div>
            <small>Scope: Platform Registry</small>
          </aside>
        </div>
        <div className={styles.subregistryLink}><ArrowDown size={17} /><span>subregistry pointer</span></div>
        <div className={styles.registryResolver}>
          <section className={styles.contract} aria-label="Provider registry and service name entries">
            <span className={styles.contractLabel}><Layers3 size={15} /> Provider Registry · UserRegistry</span>
            <div className={styles.level}><span>02 / PROVIDER</span><strong>provider.ens402.eth</strong></div>
            <p className={styles.sectionNote}>Names, ownership and pointers.</p>
            <div className={styles.serviceTree}>
              <p className={styles.smallLabel}>03 / SERVICES</p>
              {[1, 2, 3].map(n => <div className={styles.serviceBranch} key={n}><div className={styles.nameToken}>service{n}<span>service{n}.provider.ens402.eth</span></div><ArrowRight size={17} aria-hidden="true" /></div>)}
            </div>
            <p className={styles.bottomNote}>Each name has its own owner and expiry.</p>
          </section>
          <div className={styles.resolverLink} aria-hidden="true"><span>resolver</span><ArrowRight size={24} /><small>All three names</small></div>
          <section className={`${styles.contract} ${styles.resolver}`} aria-label="Shared PermissionedResolver">
            <span className={styles.contractLabel}><Database size={15} /> Shared PermissionedResolver</span>
            <div className={styles.resolverTitle}><strong>One record bundle per service</strong><p>Same keys. Independent values.</p></div>
            <div className={styles.bundles}>
              {[1, 2, 3].map(n => <div key={n}><strong>service{n}</strong><span>/api/service{n}</span><span>0.0{n} USDC</span><span>Recipient {n}</span></div>)}
            </div>
            <div className={styles.fieldGroup}><span className={styles.writerLabel}>OPS WRITES</span><div><code>agent-endpoint[x402]</code><code>description</code><code>avatar</code><code>ens402.call</code></div></div>
            <div className={`${styles.fieldGroup} ${styles.paymentGroup}`}><span className={styles.writerLabel}>TREASURY SAFE WRITES</span><code>ens402.payment</code><p>Price · Network · Asset · payTo · Scheme</p></div>
            <p className={styles.bottomNote}><code>ens402.status</code> is maintained by Provider Admin.</p>
          </section>
        </div>
        <div className={styles.grantsHeading}><KeyRound size={17} /><span>Native EAC checks the wallet, role and resource on every write.</span></div>
        <div className={styles.wallets}>
          <aside className={styles.walletCard}>
            <span className={styles.walletType}>GOVERNANCE</span><h4><Wallet size={18} /> Provider Admin</h4>
            <p>Manage service registration and delegate record writers.</p>
            <div className={styles.permission}><span>Provider Registry</span><div className={styles.roles}><Role>ROLE_REGISTRAR</Role><Role admin>ROLE_REGISTRAR_ADMIN</Role></div></div>
            <div className={styles.permission}><span>Shared Resolver · root</span><div className={styles.roles}><Role>ROLE_SET_TEXT</Role><Role admin>ROLE_SET_TEXT_ADMIN</Role></div></div>
            <small>Retains the ability to edit every record. Name-pointer rights are separate.</small>
          </aside>
          <aside className={styles.walletCard}>
            <span className={styles.walletType}>DELEGATED WRITER</span><h4><Wallet size={18} /> Ops</h4>
            <p>Move an API. Update service details and call instructions.</p>
            <div className={styles.permission}><span>Shared Resolver · four text keys</span><div className={styles.roles}><Role>ROLE_SET_TEXT</Role></div></div>
            <ul><li><code>agent-endpoint[x402]</code></li><li><code>description</code></li><li><code>avatar</code></li><li><code>ens402.call</code></li></ul>
            <small>No payment-key or role-administration grant.</small>
          </aside>
          <aside className={`${styles.walletCard} ${styles.safeCard}`}>
            <span className={styles.walletType}>DELEGATED WRITER · MULTISIG</span><h4><ShieldCheck size={18} /> Treasury Admin <span>Safe</span></h4>
            <p>Approve changes to the payment terms for any service.</p>
            <div className={styles.permission}><span>Shared Resolver · payment key</span><div className={styles.roles}><Role>ROLE_SET_TEXT</Role></div></div>
            <ul><li><code>ens402.payment</code></li></ul>
            <small>Safe controls approvals. Each service’s payTo can be a different wallet.</small>
          </aside>
        </div>
        <p className={styles.scopeNote}><strong>A key grant covers every service in this resolver.</strong> Different teams can use separate resolver instances.</p>
        <div className={styles.legend}><span><i className={styles.dashedSample} /> Contract boundary</span><span><i className={styles.tokenSample} /> Name token</span><span><i className={styles.actionSample} /> Write / action</span><span><i className={styles.adminSample} /> Grant / revoke</span></div>
      </div>
      <figcaption className={styles.caption}>Illustrative records and intended grants. The Console checks configured onchain permissions. “Treasury Admin” is a team title, not a grant of <code>ROLE_SET_TEXT_ADMIN</code>.</figcaption>
    </figure>
  );
}
