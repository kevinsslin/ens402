import { AnalyticsStore } from "./analytics";
export function analyticsDatabaseUrl(
  env: Record<string, string | undefined> = process.env,
): string {
  const value = env.ANALYTICS_DATABASE_URL?.trim();
  if (!value) throw new Error("Configure ANALYTICS_DATABASE_URL");
  const target = new URL(value);
  if (!["postgres:", "postgresql:"].includes(target.protocol))
    throw new Error("Invalid analytics database URL");
  if (env.DATABASE_URL) {
    const privateDb = new URL(env.DATABASE_URL);
    if (
      privateDb.hostname.replace(/-pooler(?=\.)/, "") ===
        target.hostname.replace(/-pooler(?=\.)/, "") &&
      (privateDb.port || "5432") === (target.port || "5432") &&
      privateDb.pathname === target.pathname
    )
      throw new Error(
        "Analytics must use a separate database from private accounts",
      );
  }
  return value;
}
let store: AnalyticsStore | undefined;
export async function analyticsReport(input: {
  providerName: string;
  since?: number;
  until?: number;
}) {
  store ??= new AnalyticsStore(analyticsDatabaseUrl());
  return store.report(input.providerName, input.since, input.until);
}
export async function closeAnalytics() {
  const current = store;
  store = undefined;
  await current?.close();
}
