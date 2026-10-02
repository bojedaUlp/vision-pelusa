import { NextResponse } from "next/server";
import { getPaidPurchase } from "@/lib/purchases-server";

export async function GET(_request: Request, ctx: RouteContext<"/api/purchases/[purchaseId]">) {
  const { purchaseId } = await ctx.params;

  try {
    const purchase = await getPaidPurchase(purchaseId);
    if (!purchase) {
      return NextResponse.json({ ok: false, message: "No encontramos esa compra." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, purchase });
  } catch (error) {
    console.error("purchase detail route error", error);
    return NextResponse.json({ ok: false, message: "No pudimos consultar la compra." }, { status: 500 });
  }
}
