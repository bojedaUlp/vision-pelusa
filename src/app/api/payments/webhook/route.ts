import { NextResponse } from "next/server";
import { createPurchaseForEmail } from "@/lib/purchase-store";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";

function extractPaymentId(body: any) {
  if (!body) return null;

  if (typeof body.payment_id === "string") return body.payment_id;
  if (typeof body.paymentId === "string") return body.paymentId;
  if (typeof body.data?.id === "number" || typeof body.data?.id === "string") return String(body.data.id);
  if (typeof body.resource === "string") return body.resource.split("/").pop() ?? null;
  if (typeof body?.resource?.id === "number" || typeof body?.resource?.id === "string") return String(body.resource.id);
  return null;
}

function extractEmail(body: any) {
  if (!body) return "";

  const raw = body.email ?? body.buyer_email ?? body.payer?.email ?? body?.payer_email ?? body?.data?.payer?.email ?? body?.data?.attributes?.payer_email ?? "";
  return typeof raw === "string" ? raw.trim() : "";
}

function extractStatus(body: any) {
  if (!body) return "approved";

  const status = String(body.status ?? body.payment_status ?? body.data?.status ?? body?.resource?.status ?? "approved");
  return status.toLowerCase();
}

function extractTotal(body: any, fallback = 0) {
  const raw = body.total ?? body.total_amount ?? body.transaction_amount ?? body?.data?.transaction_amount ?? body?.resource?.transaction_amount ?? fallback;
  const numeric = Number(raw ?? fallback);
  return Number.isFinite(numeric) ? numeric : Number(fallback ?? 0);
}

function extractCount(body: any, fallback = 1) {
  const raw = body.count ?? body.quantity ?? body?.data?.quantity ?? body?.resource?.quantity ?? fallback;
  const numeric = Number(raw ?? fallback);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : Number(fallback ?? 1);
}

async function verifyPaymentWithMercadoPago(paymentId: string | null) {
  
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  console.log("=== MP DEBUG ===");
  console.log("Payment ID:", paymentId);
  console.log("MP token exists:", Boolean(accessToken));
  console.log("MP token length:", accessToken?.length ?? 0);
  if (!paymentId || !accessToken) {
    return null;
  }

  try {
    const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      return null;
    }

    return response.json();
  } catch (error) {
    console.error("MP verification failed", error);
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const paymentId = extractPaymentId(body);
    const currentStatus = extractStatus(body);
    const baseEmail = extractEmail(body);
    const fallbackTitle = String(body?.title ?? "Compra Pelusa");
    const fallbackTotal = extractTotal(body);
    const fallbackCount = extractCount(body);

    const mpPayment = paymentId ? await verifyPaymentWithMercadoPago(paymentId) : null;
    const status = mpPayment?.status ?? currentStatus;
    const email = mpPayment?.payer?.email ?? baseEmail;
    const title = String(body?.title ?? mpPayment?.description ?? fallbackTitle);
    const total = Number(mpPayment?.transaction_details?.total_paid_amount ?? mpPayment?.transaction_amount ?? fallbackTotal);
    const count = Number(body?.count ?? mpPayment?.additional_info?.items?.length ?? fallbackCount);

    if (!email) {
      return NextResponse.json({ ok: false, message: "Falta email del comprador" }, { status: 400 });
    }

    if (status !== "approved") {
      return NextResponse.json({ ok: true, message: `Pago no confirmado (${status})`, status }, { status: 202 });
    }

    const created = createPurchaseForEmail({ email, title, total, count });

    if (isSupabaseConfigured()) {
      const supabase = getSupabaseClient();
      if (supabase) {
        const { data: purchaseData, error: purchaseError } = await supabase
          .from("purchases")
          .insert([
            {
              buyer_email: email,
              status: "paid",
              total_amount: total,
              paid_at: new Date().toISOString(),
            },
          ])
          .select()
          .single();

        if (!purchaseError && purchaseData) {
          await supabase.from("purchase_items").insert([
            {
              purchase_id: purchaseData.id,
              quantity: count,
              unit_price: total,
              photo_id: null,
            },
          ]);

          await supabase.from("download_access").insert([
            {
              purchase_id: purchaseData.id,
              photo_id: null,
              download_url: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/compras?email=${encodeURIComponent(email)}`,
              expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
            },
          ]);
        }
      }
    }

    return NextResponse.json({ ok: true, purchase: created, status: "approved", message: "Pago confirmado" });
  } catch (error) {
    console.error("webhook error", error);
    return NextResponse.json({ ok: false, message: "Webhook inválido" }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, message: "Webhook listo" });
}
