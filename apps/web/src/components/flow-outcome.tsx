import Link from 'next/link';
import { ArrowRight, CircleAlert, CircleCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeading } from '@/components/page-heading';

export function FlowOutcome({ label, title, description, success, actionHref, actionLabel }: {
  label: string; title: string; description: string; success: boolean; actionHref: string; actionLabel: string;
}) {
  return <div className="mx-auto max-w-4xl px-6 py-16 sm:py-24"><Card className="border-border/70 bg-card/80"><CardContent className="grid gap-6 pt-5 sm:p-10"><span className={`flex size-14 items-center justify-center rounded-xl ${success ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive'}`}>{success ? <CircleCheck className="size-7"/> : <CircleAlert className="size-7"/>}</span><PageHeading label={label} title={title} description={description} className="mb-0"/><Button asChild variant={success ? 'default' : 'outline'} className="w-fit"><Link href={actionHref}>{actionLabel}<ArrowRight/></Link></Button></CardContent></Card></div>;
}
