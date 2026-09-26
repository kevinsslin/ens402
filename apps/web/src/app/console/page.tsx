import { redirect } from "next/navigation";
import { ConsoleLoader } from '@/components/console-loader';
export const dynamic = 'force-dynamic';
export default async function ConsolePage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const query=await searchParams;
  if(query.manage === "1" && typeof query.service === "string") redirect(`/service?name=${encodeURIComponent(query.service)}`);
  const appId = process.env.PRIVY_APP_ID;
  if (!appId) return <section className="section-shell py-20"><h1 className="text-3xl">Sign-in is being configured</h1><p className="mt-4 text-muted-foreground">The platform needs its Privy application ID before accepting users.</p><a className="mt-6 inline-block text-primary underline" href="/docs">Read the integration guide</a></section>;
  return <ConsoleLoader appId={appId}/>;
}
