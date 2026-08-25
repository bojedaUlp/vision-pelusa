export type StorePurchase = {
  id: string;
  email: string;
  title: string;
  meta: string;
  badge: string;
  total: number;
  count: number;
  status: "paid" | "pending";
  createdAt: string;
};

export function hasPaidPurchaseForEmail(email: string): boolean {
  const normalized = (email ?? "").trim().toLowerCase();
  if (!normalized) return false;

  return store.some(
    (purchase) =>
      purchase.email.toLowerCase() === normalized && purchase.status === "paid",
  );
}

const seedPurchases: StorePurchase[] = [
  {
    id: "p-1001",
    email: "juan.perez@gmail.com",
    title: "Pelusa vs Lanús · 14 fotos",
    meta: "Pago confirmado · 14 fotos descargables",
    badge: "Pagado",
    total: 18900,
    count: 14,
    status: "paid",
    createdAt: "2026-08-18T19:40:00.000Z",
  },
  {
    id: "p-1002",
    email: "sofi.martinez@hotmail.com",
    title: "Pelusa vs Aldosivi · 8 fotos",
    meta: "Pago confirmado · 8 fotos descargables",
    badge: "Pagado",
    total: 11200,
    count: 8,
    status: "paid",
    createdAt: "2026-08-14T18:15:00.000Z",
  },
];

const store = [...seedPurchases];

export function listPurchasesByEmail(email: string): StorePurchase[] {
  const normalized = (email ?? "").trim().toLowerCase();
  if (!normalized) return store;

  return store.filter((purchase) => purchase.email.toLowerCase().includes(normalized));
}

export function createPurchaseForEmail(input: {
  email: string;
  title: string;
  total: number;
  count: number;
}): StorePurchase {
  const email = (input.email ?? "").trim();
  const title = input.title || "Compra Pelusa";
  const total = Number(input.total ?? 0);
  const count = Number(input.count ?? 1);

  const existing = store.find(
    (purchase) =>
      purchase.email.toLowerCase() === email.toLowerCase() &&
      purchase.title === title &&
      purchase.total === total &&
      purchase.count === count,
  );

  if (existing) {
    return existing;
  }

  const record: StorePurchase = {
    id: `p-${Date.now()}`,
    email,
    title,
    meta: "Pago confirmado · acceso inmediato",
    badge: "Pagado",
    total,
    count,
    status: "paid",
    createdAt: new Date().toISOString(),
  };

  store.unshift(record);
  return record;
}
