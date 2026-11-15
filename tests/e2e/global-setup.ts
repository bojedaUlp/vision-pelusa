import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { startMockMercadoPago } from "./mock-mercadopago";

// Creates throwaway users in the LOCAL Supabase and starts the Mercado Pago mock.
export default async function globalSetup() {
  const supabaseUrl = process.env.E2E_SUPABASE_URL!;
  if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(supabaseUrl)) throw new Error("E2E must target a local Supabase.");
  const admin = createClient(supabaseUrl, process.env.E2E_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

  const suffix = Date.now();
  const users = {
    admin: { email: `e2e-admin-${suffix}@test.local`, password: randomBytes(12).toString("hex") },
    buyer: { email: `e2e-user-${suffix}@test.local`, password: randomBytes(12).toString("hex") },
  };
  for (const user of Object.values(users)) {
    const { error } = await admin.auth.admin.createUser({ email: user.email, password: user.password, email_confirm: true });
    if (error) throw new Error(`createUser failed: ${error.message}`);
  }
  // Same procedure as production (supabase/README.md): promote by email with the service role.
  const { error: promoteError } = await admin.from("profiles").update({ is_admin: true }).eq("email", users.admin.email);
  if (promoteError) throw new Error(`promote admin failed: ${promoteError.message}`);

  process.env.E2E_ADMIN_EMAIL = users.admin.email;
  process.env.E2E_ADMIN_PASSWORD = users.admin.password;
  process.env.E2E_USER_EMAIL = users.buyer.email;
  process.env.E2E_USER_PASSWORD = users.buyer.password;

  const server = await startMockMercadoPago(Number(process.env.E2E_MP_PORT), process.env.E2E_APP_URL!);
  return async () => {
    await new Promise((resolve) => server.close(resolve));
  };
}
