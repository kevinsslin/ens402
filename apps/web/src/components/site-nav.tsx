"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const workspacePaths = [
  "/console",
  "/discover",
  "/merchant",
  "/provider",
  "/register",
  "/operator",
];
const inWorkspace = (path: string) =>
  workspacePaths.some(
    (route) => path === route || path.startsWith(`${route}/`),
  );

export function SiteNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main navigation"
      className="flex items-center gap-2 sm:gap-4"
    >
      <Link
        href="/docs"
        aria-current={pathname === "/docs" ? "page" : undefined}
        className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        Docs
      </Link>
      <Link
        href="/console"
        aria-current={pathname === "/console" ? "page" : undefined}
        className={`inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-medium ${inWorkspace(pathname) ? "bg-primary/10 text-primary" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
      >
        Console
      </Link>
    </nav>
  );
}

/** Task navigation belongs inside the workspace, separate from the public site header. */
export function ConsoleNav() {
  const pathname = usePathname();
  if (!inWorkspace(pathname)) return null;
  const selected =
    pathname === "/discover"
      ? "find"
      : ["/merchant", "/provider", "/register"].some(
            (route) => pathname === route || pathname.startsWith(`${route}/`),
          )
        ? "manage"
        : "payments";
  return (
    <div className="border-b bg-card/60">
      <nav
        aria-label="Console sections"
        className="section-shell flex items-center gap-1 py-2 sm:gap-4"
      >
        {(
          [
            ["find", "/discover", "Find services"],
            ["payments", "/console", "Payments"],
            ["manage", "/merchant", "My services"],
          ] as const
        ).map(([key, href, label]) => (
          <Link
            key={key}
            href={href}
            aria-current={selected === key ? "location" : undefined}
            className={`inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium ${selected === key ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
