import { NextResponse } from "next/server";
import { buildCheckoutResponse } from "@/lib/checkout";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const items = Array.isArray(body?.items) ? body.items : [];
    const email = typeof body?.email === "string" ? body.email : "";

    const response = await buildCheckoutResponse(items, email);
    return NextResponse.json(response);
  } catch (error) {
    console.error("checkout route error", error);
    return NextResponse.json(
      {
        ok: false,
        mock: true,
        total: 0,
        items: [],
        message: "No se pudo procesar el checkout.",
      },
      { status: 400 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    mock: true,
    total: 0,
    items: [],
    message: "El checkout está listo para recibir un POST.",
  });
}
