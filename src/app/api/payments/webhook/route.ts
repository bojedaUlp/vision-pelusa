import { NextResponse } from "next/server";
import { confirmPayment } from "@/lib/purchases-server";

// Mercado Pago notifications only carry the payment id. Nothing else in the body is trusted:
// confirmPayment() re-reads the payment from the Mercado Pago API.
type Notification = { type?: unknown; topic?: unknown; data?: { id?: unknown }; resource?: unknown } | null;

function extractNotification(url: URL, body: Notification) {
  const type = String(body?.type ?? body?.topic ?? url.searchParams.get("type") ?? url.searchParams.get("topic") ?? "");
  const rawId =
    body?.data?.id ??
    url.searchParams.get("data.id") ??
    url.searchParams.get("id") ??
    (typeof body?.resource === "string" ? body.resource.split("/").pop() : null);

  return { type, paymentId: rawId == null ? "" : String(rawId) };
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const body = (await request.json().catch(() => null)) as Notification;
  const { type, paymentId } = extractNotification(url, body);

  if (type && type !== "payment") {
    // merchant_order and other topics are not needed for the flow.
    return NextResponse.json({ ok: true, ignored: type });
  }

  try {
    const result = await confirmPayment(paymentId);
    console.log("[webhook] payment processed", { paymentId, result });
    // 200 for every handled outcome so Mercado Pago stops retrying.
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    // 500 makes Mercado Pago retry; confirmPayment is idempotent.
    console.error("[webhook] payment processing failed", { paymentId, error });
    return NextResponse.json({ ok: false, message: "Error procesando el pago" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, message: "Webhook listo" });
}
