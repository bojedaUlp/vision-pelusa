import { createServer, type Server } from "node:http";

// Minimal stand-in for the Mercado Pago API endpoints the app uses. Test-only.
type Payment = {
  id: number;
  status: string;
  external_reference: string;
  transaction_amount: number;
  currency_id: string;
  date_approved: string | null;
};

export function startMockMercadoPago(port: number, appUrl: string): Promise<Server> {
  const preferences = new Map<string, { external_reference: string; total: number }>();
  const payments = new Map<number, Payment>();
  let nextPayment = 9_000_000_001;
  let nextPreference = 1;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
    const body = await new Promise<string>((resolve) => {
      let data = "";
      req.on("data", (chunk) => (data += chunk));
      req.on("end", () => resolve(data));
    });
    const json = (status: number, payload: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(payload));
    };

    if (req.method === "POST" && url.pathname === "/checkout/preferences") {
      const input = JSON.parse(body || "{}");
      const id = `pref-${nextPreference++}`;
      const total = (input.items ?? []).reduce((sum: number, item: { unit_price: number; quantity: number }) => sum + item.unit_price * item.quantity, 0);
      preferences.set(id, { external_reference: input.external_reference, total });
      return json(201, { id, init_point: `${appUrl}/compras?mock_preference=${id}` });
    }

    const paymentMatch = url.pathname.match(/^\/v1\/payments\/(\d+)$/);
    if (req.method === "GET" && paymentMatch) {
      const payment = payments.get(Number(paymentMatch[1]));
      return payment ? json(200, payment) : json(404, { message: "not found" });
    }

    if (req.method === "GET" && url.pathname === "/v1/payments/search") {
      const reference = url.searchParams.get("external_reference");
      return json(200, { results: [...payments.values()].filter((p) => p.external_reference === reference) });
    }

    // Test hook: the buyer pays (or the payment stays in process) for a purchase.
    if (req.method === "POST" && url.pathname === "/__test/pay") {
      const { external_reference, status } = JSON.parse(body || "{}");
      const preference = [...preferences.values()].find((p) => p.external_reference === external_reference);
      if (!preference) return json(404, { message: "no preference for that purchase" });
      const payment: Payment = {
        id: nextPayment++,
        status,
        external_reference,
        transaction_amount: preference.total,
        currency_id: "ARS",
        date_approved: status === "approved" ? new Date().toISOString() : null,
      };
      payments.set(payment.id, payment);
      return json(201, payment);
    }

    json(404, { message: "mock: unknown route" });
  });

  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}
