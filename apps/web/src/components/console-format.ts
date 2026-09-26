/** USDC has six decimals. Keep amounts as integers throughout formatting. */
export function units(value: string) {
  if (!/^\d+(\.\d{1,6})?$/.test(value))
    throw new Error("Enter USDC with at most six decimal places.");
  const [whole, fraction = ""] = value.split(".");
  return String(BigInt(whole!) * 1000000n + BigInt(fraction.padEnd(6, "0")));
}
export function usdc(value: string) {
  if (!/^\d+$/.test(value)) return "Unavailable";
  const n = BigInt(value);
  const fraction = String(n % 1000000n)
    .padStart(6, "0")
    .replace(/0+$/, "");
  return `${n / 1000000n}${fraction ? `.${fraction}` : ""}`;
}
export function approvalStatus(
  row: { state: string; approval: { expiresAt: number } },
  now: number,
) {
  return row.state === "active" && row.approval.expiresAt <= now
    ? "expired"
    : row.state;
}
export function statusLabel(state: string) {
  return (
    (
      {
        active: "Ready",
        expired: "Expired",
        revoked: "Revoked",
        provisioning: "Wallet setup incomplete",
        reserved: "Awaiting signature",
        submitting: "Confirming payment",
        uncertain: "Confirmation needed",
        settled: "Paid",
        paid_delivery_failed: "Paid · delivery unconfirmed",
        held: "Not submitted",
        rejected: "Blocked",
      } as Record<string, string>
    )[state] ?? "Status unavailable"
  );
}
