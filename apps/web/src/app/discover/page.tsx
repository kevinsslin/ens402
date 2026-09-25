import { PageHeading } from '@/components/page-heading';
import DiscoverClient from './discover-client';
export default function DiscoverPage() {
  return <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20"><PageHeading label="AUTONOMOUS SERVICE DISCOVERY" title="Discover, then verify." description="Search the public CDP Bazaar for a service. A listing is a candidate; ENSv2 is the independent source for the endpoint and payee."/><DiscoverClient/></div>;
}
