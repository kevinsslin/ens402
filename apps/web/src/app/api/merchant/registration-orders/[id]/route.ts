import { getStore } from "@ens402/server";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id,
    )
  )
    return Response.json({ error: "Invalid order ID" }, { status: 400 });
  try {
    const row = await getStore().registrationOrder(id);
    if (!row)
      return Response.json(
        { error: "Order not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    return Response.json(
      {
        id: row.id,
        state: row.state,
        name: `${row.label}.${row.parent}`,
        recipient: row.recipient,
        paymentTransaction: row.settlement?.transaction,
        registrationTransaction: row.transaction_hash,
        result: row.result,
        note: "Payment and registration are separate. Do not pay again for a pending order.",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Order lookup unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
