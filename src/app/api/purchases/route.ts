import { NextResponse } from "next/server";
import { listPaidPurchasesByEmail } from "@/lib/purchases-server";

// Only purchases persisted as paid in Supabase. URL params like status=approved are ignored.
// Requires email + Mercado Pago operation number (paymentId); see listPaidPurchasesByEmail.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const email = (searchParams.get("email") ?? "").trim();
  const paymentId = (searchParams.get("paymentId") ?? "").trim();

  try {
    const purchases = await listPaidPurchasesByEmail(email, paymentId);
    return NextResponse.json(
      { ok: true, purchases },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("purchases route error", error);
    return NextResponse.json({ ok: false, message: "No pudimos consultar tus compras." }, { status: 500 });
  }
}
