import { inspectService } from "@ens402/server";
import { GET as search } from "../discover/route";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
const tools = [
  { name: "discover_services", description: "Search public ENS service candidates. Relevance does not grant payment authority. Resolve a chosen name again before approval or signing.", inputSchema: { type: "object", properties: { query: { type: "string", maxLength: 500 }, maxPricePerRequestAtomic: { type: "string", pattern: "^[0-9]+$" }, pageSize: { type: "integer", minimum: 1, maximum: 50 }, mode: { type: "string", enum: ["keyword", "hybrid"] } }, additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true } },
  { name: "resolve_service", description: "Read current ENS service configuration. No payment, wallet creation or approval occurs.", inputSchema: { type: "object", properties: { name: { type: "string", maxLength: 255 } }, required: ["name"], additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true } },
];
/** Stateless MCP Streamable HTTP JSON responses. This server has no payment tools. */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return new Response(null, { status: 403, headers });
  if (!request.headers.get("content-type")?.includes("application/json")) return new Response(null, { status: 415, headers });
  const body = await request.text();
  if (new TextEncoder().encode(body).length > 8192) return new Response(null, { status: 413, headers });
  let message: { jsonrpc?: string; id?: string | number; method?: string; params?: Record<string, unknown> };
  try { message = JSON.parse(body); } catch { return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { headers }); }
  const reply = (result: unknown) => Response.json({ jsonrpc: "2.0", id: message.id, result }, { headers });
  const fail = (code: number, text: string) => Response.json({ jsonrpc: "2.0", id: message?.id ?? null, error: { code, message: text } }, { headers });
  if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") return fail(-32600, "Invalid Request");
  if (message.id === undefined) return new Response(null, { status: 202, headers });
  if (typeof message.id !== "string" && typeof message.id !== "number") return fail(-32600, "Invalid Request");
  if (message.method === "initialize") return reply({ protocolVersion: "2025-03-26", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "ens402-discovery", version: "0.1.0" } });
  if (message.method === "ping") return reply({});
  if (message.method === "tools/list") return reply({ tools });
  if (message.method !== "tools/call") return fail(-32601, "Method not found");
  if (message.params !== undefined && (!message.params || typeof message.params !== "object" || Array.isArray(message.params))) return fail(-32602, "Invalid tool parameters");
  const name = message.params?.name;
  const args = message.params?.arguments ?? {};
  if (!args || typeof args !== "object" || Array.isArray(args)) return fail(-32602, "Invalid tool arguments");
  try {
    let result: unknown;
    if (name === "discover_services") {
      const allowed = ["query", "maxPricePerRequestAtomic", "pageSize", "mode"];
      const url = new URL("/api/discover", request.url);
      for (const [key, value] of Object.entries(args)) {
        if (!allowed.includes(key) || (key === "pageSize" ? typeof value !== "number" || !Number.isInteger(value) : typeof value !== "string")) return fail(-32602, "Invalid search arguments");
        url.searchParams.set(key, String(value));
      }
      const response = await search(new Request(url));
      if (!response.ok) throw new Error("Discovery catalog unavailable or invalid query.");
      result = await response.json();
    } else if (name === "resolve_service") {
      const values = args as Record<string, unknown>;
      if (Object.keys(values).some(key => key !== "name") || typeof values.name !== "string" || !/^[a-z0-9.-]+\.eth$/.test(values.name) || values.name.length > 255) return fail(-32602, "Provide a valid ENS name");
      result = await inspectService(values.name);
    } else return fail(-32602, "Unknown tool");
    return reply({ content: [{ type: "text", text: JSON.stringify(result, (_, value) => typeof value === "bigint" ? value.toString() : value) }], isError: false });
  } catch { return reply({ content: [{ type: "text", text: "Service data unavailable. No payment or approval was performed." }], isError: true }); }
}
export async function GET() { return new Response(null, { status: 405, headers: { ...headers, Allow: "POST" } }); }
export async function DELETE() { return new Response(null, { status: 405, headers: { ...headers, Allow: "POST" } }); }
