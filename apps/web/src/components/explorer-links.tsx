"use client";
import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
export function EnsNameLink({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) {
  return (
    <a
      href={`https://app.ens.dev/${encodeURIComponent(name)}`}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex max-w-full items-center gap-1 text-primary underline decoration-primary/30 underline-offset-4 hover:decoration-primary ${className}`}
      title="View registered name on the ENSv2 Sepolia explorer"
    >
      <span className="min-w-0 break-all">{name}</span>
      <ArrowUpRight className="size-3.5 shrink-0" aria-hidden="true" />
    </a>
  );
}
export function rememberRegistration(name: string, hash: string) {
  try {
    localStorage.setItem(`ens402-registration-receipt:${name}`, hash);
    window.dispatchEvent(new Event("ens402-registration-receipt"));
  } catch {
    /* Receipt links are optional; storage failure must not hide a confirmed registration. */
  }
}
export function RegistrationTransactionLink({
  name,
  hash,
}: {
  name: string;
  hash?: string;
}) {
  const [saved, setSaved] = useState<string | null>(null);
  useEffect(() => {
    const read = () => {
      try {
        setSaved(localStorage.getItem(`ens402-registration-receipt:${name}`));
      } catch {}
    };
    read();
    window.addEventListener("ens402-registration-receipt", read);
    return () =>
      window.removeEventListener("ens402-registration-receipt", read);
  }, [name]);
  const tx = hash || saved;
  if (!tx || !/^0x[0-9a-fA-F]{64}$/.test(tx)) return null;
  return (
    <a
      href={`https://sepolia.etherscan.io/tx/${tx}`}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 inline-flex items-center gap-1 text-xs text-primary underline underline-offset-4"
    >
      Registration transaction
      <ArrowUpRight className="size-3" aria-hidden="true" />
    </a>
  );
}
