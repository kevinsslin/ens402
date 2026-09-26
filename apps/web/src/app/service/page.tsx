import { ConsoleLoader } from '@/components/console-loader';
export const dynamic='force-dynamic';
export default function ServicePage(){const appId=process.env.PRIVY_APP_ID;if(!appId)return <p>Wallet sign-in is not configured.</p>;return <ConsoleLoader appId={appId} workspace="service"/>;}
