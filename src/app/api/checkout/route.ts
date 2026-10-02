import { NextResponse } from "next/server";
import { createCheckout, PurchaseFlowError } from "@/lib/purchases-server";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const items: unknown[] = Array.isArray(body?.items) ? body.items : [];

    // Only the photo UUIDs are taken from the browser; prices and titles are read server-side.
    const { purchaseId, total, checkoutUrl } = await createCheckout({
      email: body?.email,
      photoIds: items.map((item) => (item as { id?: unknown })?.id),
    });

    return NextResponse.json({ ok: true, purchaseId, total, checkoutUrl });
  } catch (error) {
    if (error instanceof PurchaseFlowError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: error.status });
    }

    console.error("checkout route error", error);
    return NextResponse.json(
      { ok: false, message: "No se pudo iniciar el pago. Verificá la configuración de Mercado Pago." },
      { status: 500 },
    );
  }
}
