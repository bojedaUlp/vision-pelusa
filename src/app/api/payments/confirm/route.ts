import { NextResponse } from "next/server";
import { confirmPayment } from "@/lib/purchases-server";

// Called by /compras when the buyer returns from Mercado Pago. Only payment_id is read from the
// request; the status shown to the user comes from the Mercado Pago API, not from the URL.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const paymentId = String(body?.paymentId ?? "");

  try {
    const result = await confirmPayment(paymentId);
    return NextResponse.json({ ok: result.state === "approved", ...result });
  } catch (error) {
    console.error("[payments/confirm] failed", { paymentId, error });
    return NextResponse.json(
      { ok: false, state: "error", message: "No pudimos validar el pago." },
      { status: 500 },
    );
  }
}
