import { NextResponse } from "next/server";
import { listPurchasesByEmail } from "@/lib/purchase-store";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email") ?? "";
  const status = (searchParams.get("status") ?? searchParams.get("collection_status") ?? "").toLowerCase();
  const fallbackTotal = Number(searchParams.get("total") ?? "1500");
  const fallbackCount = Number(searchParams.get("count") ?? "1");

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    if (supabase && email) {
      const { data, error } = await supabase
        .from("purchases")
        .select("id, buyer_email, status, total_amount, created_at, paid_at, purchase_items(quantity)")
        .ilike("buyer_email", `%${email}%`)
        .order("created_at", { ascending: false });

      if (!error && data && data.length > 0) {
        return NextResponse.json({
          ok: true,
          email,
          purchases: data.map((purchase) => {
            const items = Array.isArray((purchase as any).purchase_items) ? (purchase as any).purchase_items : [];
            const quantity = items.reduce((sum: number, item: any) => sum + Number(item.quantity ?? 0), 0) || 1;

            return {
              title: `Compra Pelusa · ${new Date(purchase.created_at).toLocaleDateString("es-AR", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}`,
              meta: "Pago confirmado · acceso inmediato",
              badge: purchase.status === "paid" ? "Pagado" : purchase.status,
              total: Number(purchase.total_amount ?? 0),
              count: quantity,
              status: purchase.status,
            };
          }),
        });
      }
    }
  }

  const purchases = Array.isArray(listPurchasesByEmail(email)) ? listPurchasesByEmail(email) : [];

  if (status === "approved" || status === "paid") {
    return NextResponse.json({
      ok: true,
      email,
      status,
      purchases: purchases.length > 0 ? purchases.map((purchase) => ({
        title: purchase.title,
        meta: purchase.meta,
        badge: purchase.badge,
        total: purchase.total,
        count: purchase.count,
        status: purchase.status,
      })) : [{
        title: "Compra Pelusa · pago confirmado",
        meta: "Tu pago fue aprobado. Estamos validando tu acceso a las fotos.",
        badge: "Pagado",
        total: Number.isFinite(fallbackTotal) ? fallbackTotal : 1500,
        count: Number.isFinite(fallbackCount) && fallbackCount > 0 ? fallbackCount : 1,
        status: "paid",
      }],
    });
  }

  return NextResponse.json({
    ok: true,
    email,
    purchases: purchases.map((purchase) => ({
      title: purchase.title,
      meta: purchase.meta,
      badge: purchase.badge,
      total: purchase.total,
      count: purchase.count,
      status: purchase.status,
    })),
  });
}
