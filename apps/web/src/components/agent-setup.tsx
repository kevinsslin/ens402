"use client";

import { useState } from "react";
import { Bot, Copy, Download, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

const skillUrl = "/skills/ens402-discovery/SKILL.md";
const cliCommand = 'curl -fSLo ens402.mjs https://ens402.vercel.app/downloads/ens402.mjs\nnode ens402.mjs search "Tokyo weather"';
const command = "claude mcp add --transport http --scope project ens402 https://ens402.vercel.app/api/mcp";

/** One public skill document serves both clipboard and download paths. */
export function AgentSetup() {
  const [copied, setCopied] = useState<"skill" | "mcp" | "cli" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function copy(kind: "skill" | "mcp" | "cli") {
    if (busy) return;
    setBusy(true);
    setCopied(null);
    setError("");
    try {
      let text = kind === "cli" ? cliCommand : command;
      if (kind === "skill") {
        const response = await fetch(skillUrl);
        if (!response.ok) throw new Error("Skill unavailable");
        text = await response.text();
        if (!text.startsWith("---\nname: ens402-discovery")) throw new Error("Invalid skill");
      }
      await navigator.clipboard.writeText(text);
      setCopied(kind);
    } catch {
      setError("Copy is unavailable. Download the Skill or select the command below.");
    } finally { setBusy(false); }
  }
  return <aside className="mt-6 rounded-2xl border border-primary/15 bg-primary/5 p-5 sm:p-6" aria-label="Connect your agent">
    <div className="flex items-center gap-2.5 font-medium"><Bot className="size-5 text-primary" aria-hidden="true" /> Let your agent find the service.</div>
    <p className="mt-2 text-sm leading-6 text-muted-foreground">Copy the Skill into Claude Code to search now. No wallet or API key needed.</p>
    <div className="mt-4 flex flex-wrap gap-2">
      <Button size="sm" onClick={() => copy("skill")} disabled={busy}>{copied === "skill" ? <Check /> : <Copy />}{copied === "skill" ? "Skill copied" : "Copy Skill"}</Button>
      <Button size="sm" variant="outline" asChild><a href={skillUrl} download="SKILL.md"><Download /> Download Skill</a></Button>
    </div>
    <details className="mt-4 text-sm">
      <summary className="cursor-pointer font-medium text-primary">Use the CLI</summary>
      <p className="mt-3 leading-6 text-muted-foreground">Search from your terminal or agent. Node.js 22+; no install or account required for discovery.</p>
      <pre className="mt-3 overflow-x-auto rounded-lg border bg-white p-3 text-xs leading-6"><code>{cliCommand}</code></pre>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => copy("cli")} disabled={busy}>{copied === "cli" ? <Check /> : <Copy />}{copied === "cli" ? "Command copied" : "Copy CLI command"}</Button>
        <Button size="sm" variant="outline" asChild><a href="/downloads/ens402.mjs" download><Download /> Download CLI</a></Button>
      </div>
      <p className="mt-3 text-xs leading-6 text-muted-foreground">Ready to pay? Export a checkout from Console, then use the CLI with a managed wallet or your own local signer. <a className="underline" href="/skills/ens402-discovery/references/cli.md">Payment setup</a></p>
    </details>
    <details className="mt-4 text-sm">
      <summary className="cursor-pointer font-medium text-primary">Connect the hosted MCP</summary>
      <p className="mt-3 leading-6 text-muted-foreground">Run in your project, then reconnect Claude Code and approve the MCP server when prompted.</p>
      <pre className="mt-3 overflow-x-auto rounded-lg border bg-white p-3 text-xs leading-6"><code>{command}</code></pre>
      <Button size="sm" variant="outline" className="mt-3" onClick={() => copy("mcp")} disabled={busy}>{copied === "mcp" ? <Check /> : <Copy />}{copied === "mcp" ? "Command copied" : "Copy command"}</Button>
      <p className="mt-3 break-words text-xs leading-6 text-muted-foreground">To reuse the Skill across sessions, save it as <code>.claude/skills/ens402-discovery/SKILL.md</code>. MCP provides live search and ENS lookup; payments need a separate approved signer.</p>
    </details>
    <p className="sr-only" role="status">{copied ? `${copied === "skill" ? "Skill" : copied === "cli" ? "CLI command" : "MCP command"} copied to clipboard` : ""}</p>
    {error && <p className="mt-3 text-sm text-destructive" role="alert">{error}</p>}
  </aside>;
}
