'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const links = [
  { href: '/discover', label: 'Discover' },
  { href: '/lookup', label: 'Verify' },
  { href: '/enroll', label: 'Enroll' },
];

export function SiteNav() {
  const pathname = usePathname();
  return <nav aria-label="Main navigation" className="ml-auto flex h-full items-center gap-3 text-xs sm:gap-5 sm:text-sm">{links.map(link => {
    const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
    return <Link key={link.href} href={link.href} aria-current={active ? 'page' : undefined}
      className={cn('flex h-full items-center border-b-2 transition-colors hover:text-foreground focus-visible:text-foreground',
        active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground',
        link.href === '/enroll' && 'max-[359px]:hidden')}>{link.label}</Link>;
  })}</nav>;
}
