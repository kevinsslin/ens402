import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function PageHeading({ label, title, description, className }: { label: string; title: string; description: string; className?: string }) {
  return <div className={cn('mb-8', className)}><Badge variant="outline" className="border-primary/35 bg-primary/5 text-primary">{label}</Badge><h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-6xl">{title}</h1><p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">{description}</p></div>;
}
