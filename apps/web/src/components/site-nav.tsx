"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, PlusCircle, BookOpen } from "lucide-react";

export function SiteNav() {
  const path = usePathname();
  const routes = [
    {
      href: "/console",
      label: "Search services",
      icon: Search,
      active: ["/console", "/discover", "/operator"].includes(path),
    },
    {
      href: "/provider",
      label: "Onboard your service",
      icon: PlusCircle,
      active: ["/merchant", "/provider", "/register"].some(
        (route) => path === route || path.startsWith(`${route}/`),
      ),
    },
    { href: "/docs", label: "Docs", icon: BookOpen, active: path === "/docs" },
  ];
  return (
    <nav
      aria-label="Main navigation"
      className="flex w-full items-center justify-between gap-1 rounded-full border bg-white p-1 shadow-sm sm:w-auto sm:gap-2"
    >
      {routes.map(({ href, label, icon: Icon, active }) => (
        <Link
          key={href}
          href={href}
          aria-current={active ? "page" : undefined}
          className={`inline-flex min-h-10 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-colors sm:px-5 sm:text-sm ${active ? "bg-primary text-white" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
        >
          <Icon className="hidden size-4 sm:block" aria-hidden="true" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
