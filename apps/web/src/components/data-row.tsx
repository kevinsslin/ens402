import { Separator } from '@/components/ui/separator';

export function DataRow({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return <div><Separator className="mb-4"/><div className="grid gap-1.5"><span className="text-xs font-medium tracking-widest text-muted-foreground uppercase">{label}</span><strong className={`break-all text-sm font-medium ${mono ? 'font-mono' : ''}`}>{value}</strong></div></div>;
}
