export type CheckoutItem = {
  id: number | string;
  title: string;
  price: number;
  quantity?: number;
};

export type CheckoutResponse = {
  ok: boolean;
  mock: boolean;
  checkoutUrl?: string;
  paymentId?: string;
  total: number;
  items: CheckoutItem[];
  message?: string;
};

export async function buildCheckoutResponse(items: CheckoutItem[], payerEmail?: string): Promise<CheckoutResponse> {
  const normalizedItems = items.map((item) => ({
    id: item.id,
    title: item.title,
    price: Number(item.price ?? 0),
    quantity: Number(item.quantity ?? 1),
  }));

  const total = normalizedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim();
  const sanitizedEmail = (payerEmail ?? "").trim();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const successUrl = sanitizedEmail ? `${appUrl}/compras?email=${encodeURIComponent(sanitizedEmail)}` : `${appUrl}/compras`;

  if (!accessToken) {
    return {
      ok: false,
      mock: false,
      total,
      items: normalizedItems,
      message: "Mercado Pago no está configurado. Agregá MERCADO_PAGO_ACCESS_TOKEN para habilitar el pago real.",
    };
  }

  try {
    const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items: normalizedItems.map((item) => ({
          id: String(item.id),
          title: item.title,
          quantity: item.quantity,
          unit_price: item.price,
        })),
        payer: {
          email: sanitizedEmail || "test_user_123456@testuser.com",
        },
        back_urls: {
          success: successUrl,
          failure: `${appUrl}/`,
          pending: successUrl,
        },
        auto_return: "approved",
      }),
    });

    if (!response.ok) {
      throw new Error(`Mercado Pago API error: ${response.status}`);
    }

    const data = await response.json();

    return {
      ok: true,
      mock: false,
      checkoutUrl: data.init_point ?? data.sandbox_init_point,
      paymentId: data.id,
      total,
      items: normalizedItems,
    };
  } catch (error) {
    console.error("checkout error", error);
    return {
      ok: false,
      mock: false,
      total,
      items: normalizedItems,
      message: "No se pudo iniciar el pago real. Verificá la configuración de Mercado Pago.",
    };
  }
}
