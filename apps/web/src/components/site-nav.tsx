"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  ["/architecture", "Architecture"],
  ["/console", "Console"],
  ["/register", "Publish"],
  ["/docs", "Docs"],
] as const;

export function SiteNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main navigation" className="flex w-full items-center justify-between gap-1 sm:w-auto sm:gap-2">
      {links.map(([href, label]) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium transition-colors ${active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
