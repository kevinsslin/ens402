import { ArrowDown, ArrowRight, Database, Wallet } from "lucide-react";
import styles from "./namespace-architecture.module.css";

function Grant({ wallet, roles, scope, action }: { wallet: string; roles: string[]; scope: string; action: string }) {
  return <div className={styles.wallet}>
    <p className={styles.walletTitle}><Wallet size={17} aria-hidden="true"/>{wallet}</p>
    <p className={styles.action}>{action}</p>
    <div className={styles.roles}>{roles.map(role=><code key={role}>{role}</code>)}</div>
    <p className={styles.scope}>Scope: {scope}</p>
  </div>;
}
function Edge() {
  return <div className={styles.grantEdge} aria-label="Permission applies to this target"><span/><ArrowRight size={17} aria-hidden="true"/><ArrowDown size={17} aria-hidden="true"/></div>;
}
function Pointer({children}:{children:React.ReactNode}) {
  return <div className={styles.pointer}><ArrowDown size={17} aria-hidden="true"/><span>{children}</span></div>;
}
function Contract({title,children}:{title:string;children:React.ReactNode}) {
  return <div className={styles.contract}><p className={styles.contractTitle}><Database size={17} aria-hidden="true"/>{title}</p>{children}</div>;
}
export function NamespaceArchitecture() {
  return <figure className={styles.figure} aria-label="ENS namespace and wallet permissions in one connected diagram">
    <header className={styles.header}>
      <h3>Who controls each part of a service?</h3>
      <p>Follow the name down. Read each wallet’s grant across.</p>
      <div className={styles.legend}><span>↓ Name / contract pointer</span><span>→ Scoped wallet permission</span><span>Proposed company hierarchy</span></div>
    </header>
    <div className={styles.diagram}>
      <div className={styles.row}>
        <Grant wallet="Platform owner" roles={['ROLE_REGISTRAR','ROLE_REGISTRAR_ADMIN']} scope="Platform registry · root" action="Register companies and manage registrar grants."/>
        <Edge/>
        <div><p className={styles.name}>ens402.eth</p><Pointer>subregistry pointer</Pointer><Contract title="Platform UserRegistry"><p>Company name: <code>kevin.ens402.eth</code></p></Contract></div>
      </div>
      <div className={styles.row}>
        <Grant wallet="Company Admin" roles={['ROLE_SET_SUBREGISTRY']} scope="Platform registry · kevin name" action="Choose the registry for Kevin’s services."/>
        <Edge/>
        <div className={styles.nameControl}><span className={styles.small}>Inside Platform UserRegistry</span><code>kevin.ens402.eth</code><Pointer>subregistry pointer</Pointer></div>
      </div>
      <div className={styles.row}>
        <Grant wallet="Company Admin" roles={['ROLE_REGISTRAR','ROLE_REGISTRAR_ADMIN']} scope="Kevin registry · root" action="Create services and delegate registration."/>
        <Edge/>
        <Contract title="Kevin UserRegistry"><div className={styles.services}><strong>search</strong><span>weather</span><span>enrich</span></div><p>Each name has its own resolver pointer.</p></Contract>
      </div>
      <div className={styles.row}>
        <Grant wallet="Service Admin" roles={['ROLE_SET_RESOLVER','ROLE_SET_RESOLVER_ADMIN','ROLE_CAN_TRANSFER_ADMIN']} scope="Kevin registry · search name" action="Manage Search’s resolver pointer and name transfer."/>
        <Edge/>
        <div className={styles.nameControl}><span className={styles.small}>Inside Kevin UserRegistry</span><code>search.kevin.ens402.eth</code><Pointer>resolver pointer</Pointer></div>
      </div>
      <div className={styles.resolverGroup}>
        <div className={styles.resolverLabel}><Database size={17} aria-hidden="true"/> Search Resolver <span>One dedicated contract for Search</span></div>
        <div className={styles.row}>
          <Grant wallet="Service Admin" roles={['ROLE_SET_TEXT','ROLE_SET_TEXT_ADMIN']} scope="Search resolver · root" action="Write all text records. Grant and revoke text writers."/>
          <Edge/>
          <div className={styles.record}><span className={styles.small}>All records in this resolver</span><strong>Root text control</strong><p>Includes API URL, payment settings and <code>ens402.status</code>.</p></div>
        </div>
        <div className={styles.row}>
          <Grant wallet="Ops wallet" roles={['ROLE_SET_TEXT']} scope="Endpoint key only" action="Change the API URL."/>
          <Edge/>
          <div className={styles.record}><code>agent-endpoint[x402]</code><strong>API URL</strong><p>Resource = hash of the endpoint key</p></div>
        </div>
        <div className={styles.row}>
          <Grant wallet="Treasury wallet" roles={['ROLE_SET_TEXT']} scope="Payment key only" action="Change where and how the service gets paid."/>
          <Edge/>
          <div className={styles.record}><code>ens402.payment</code><strong>Recipient · token · network</strong><p>Resource = hash of the payment key</p></div>
        </div>
      </div>
      <p className={styles.siblings}>Weather → Weather Resolver · Enrich → Enrich Resolver<br/>Separate contracts and grants. Search permissions do not carry over.</p>
    </div>
    <figcaption className={styles.caption}>Roles belong to a contract and resource, not to the spelling of a name. Root grants cover that contract’s resources; narrow grants do not remove broader authority. Company Admin and Service Admin may be the same wallet. Ops and Treasury are separate wallets. The company layer is planned; this diagram describes intended grants, not live permissions.</figcaption>
  </figure>;
}
