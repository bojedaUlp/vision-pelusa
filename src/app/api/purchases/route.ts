import { NextResponse } from "next/server";
import { listPaidPurchasesByEmail } from "@/lib/purchases-server";

// Only purchases persisted as paid in Supabase. URL params like status=approved are ignored.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const email = (searchParams.get("email") ?? "").trim();

  try {
    const purchases = await listPaidPurchasesByEmail(email);
    return NextResponse.json({ ok: true, email, purchases });
  } catch (error) {
    console.error("purchases route error", error);
    return NextResponse.json({ ok: false, message: "No pudimos consultar tus compras." }, { status: 500 });
  }
}
