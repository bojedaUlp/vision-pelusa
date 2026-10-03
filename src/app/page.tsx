"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GalleryCard } from "@/components/gallery-card";
import { SiteHeader } from "@/components/site-header";
import { getHomePageData } from "@/lib/data-source";
import { emptyHomePageData, type HomePageData } from "@/lib/mock-data";

// Footer destinations for the existing nav items; anything without a real destination keeps "#".
const footerHrefByItem: Record<string, string> = {
  Inicio: "/",
  Galerías: "/galerias",
  "Cómo funciona": "/#como-funciona",
  Contacto: "/#contacto",
  "Mis fotos": "/compras",
  "Comprar fotos": "/galerias",
};

const defaultHomePageData = {
  ...emptyHomePageData,
  contactRows: [
    { label: "Email", value: "crecermarketingsl@gmail.com" },
    { label: "WhatsApp", value: "+54 9 266 4-001686" },
  ],
} as HomePageData;

const stepIconProps = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

// Dividers per step: stacked on mobile, 2x2 on tablet (sm), single row on desktop (lg).
const purchaseSteps = [
  {
    number: "01",
    title: "Elegí tu partido",
    text: "Entrá a la galería del encuentro que querés ver.",
    dividerClass: "",
    icon: (
      <svg {...stepIconProps}>
        <rect x="3" y="5" width="18" height="14" rx="1" />
        <path d="M12 5v14" />
        <circle cx="12" cy="12" r="2.5" />
      </svg>
    ),
  },
  {
    number: "02",
    title: "Seleccioná tus fotos",
    text: "Marcá una o varias fotos. Cuantas más elegís, mejor es el precio.",
    dividerClass: "border-t sm:border-t-0 sm:border-l",
    icon: (
      <svg {...stepIconProps}>
        <rect x="3" y="3" width="8" height="8" rx="1" />
        <rect x="13" y="3" width="8" height="8" rx="1" />
        <rect x="3" y="13" width="8" height="8" rx="1" />
        <path d="m14.5 17 2 2 3.5-4" />
      </svg>
    ),
  },
  {
    number: "03",
    title: "Pagá con Mercado Pago",
    text: "Ingresá tu email y completá el pago de forma segura.",
    dividerClass: "border-t lg:border-t-0 lg:border-l",
    icon: (
      <svg {...stepIconProps}>
        <rect x="3" y="11" width="18" height="10" rx="1" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
  },
  {
    number: "04",
    title: "Descargá en alta calidad",
    text: "Una vez aprobado el pago, tus originales quedan disponibles en “Mis Fotos”.",
    dividerClass: "border-t sm:border-l lg:border-t-0",
    icon: (
      <svg {...stepIconProps}>
        <path d="M12 3v12" />
        <path d="m7 10 5 5 5-5" />
        <path d="M5 21h14" />
      </svg>
    ),
  },
];

export default function Home() {
  const [data, setData] = useState<HomePageData>(defaultHomePageData);
  const [contactStatus, setContactStatus] = useState<string | null>(null);

  useEffect(() => {
    void getHomePageData().then(setData);
  }, []);

  const handleContactSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const reason = String(formData.get("reason") ?? "").trim();
    const message = String(formData.get("message") ?? "").trim();
    const recipient = "crecermarketingsl@gmail.com";
    const subject = encodeURIComponent(reason || "Consulta desde Visión Pelusa");
    const body = encodeURIComponent(
      [
        `Nombre: ${name}`,
        `Email: ${email}`,
        `Motivo: ${reason}`,
        "",
        "Mensaje:",
        message,
      ].join("\n"),
    );

    window.location.href = `mailto:${recipient}?subject=${subject}&body=${body}`;
    setContactStatus("Se abrió tu cliente de correo para enviar el mensaje.");
    form.reset();
  };

  const { navItems, steps, galleryCards, stats, contactRows } = data;
  // Hero photo: cover of the most recent gallery, already loaded for "Galerías recientes".
  const heroCard = galleryCards.find((card) => card.previewUrl || card.imageUrl);
  const heroImageUrl = heroCard?.previewUrl ?? heroCard?.imageUrl;

  return (
    <div className="min-h-screen bg-[#0B0F14] text-[#F4F1E8]">
      <div className="grain" />

      <SiteHeader />

      <main>
        <section className="hero-glow group relative overflow-hidden">
          <div className="hero-orb hero-orb-1" />
          <div className="hero-orb hero-orb-2" />
          <div className="absolute inset-y-0 left-[8%] w-px bg-gradient-to-b from-[#FFC94A]/30 via-[#FFC94A]/10 to-transparent blur-sm" style={{ transform: "rotate(12deg)" }} />
          <div className="absolute inset-y-0 left-[22%] w-px bg-gradient-to-b from-[#FFC94A]/20 via-[#FFC94A]/5 to-transparent blur-sm" style={{ transform: "rotate(6deg)" }} />
          <div className="absolute inset-y-0 right-[12%] w-px bg-gradient-to-b from-[#FFC94A]/30 via-[#FFC94A]/10 to-transparent blur-sm" style={{ transform: "rotate(-14deg)" }} />
          <div className="absolute inset-y-0 right-[26%] w-px bg-gradient-to-b from-[#FFC94A]/20 via-[#FFC94A]/5 to-transparent blur-sm" style={{ transform: "rotate(-7deg)" }} />
          <div className="absolute bottom-0 left-0 right-0 h-[38vh] bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.025)_0_60px,rgba(255,255,255,0.05)_60px_120px)] [mask-image:linear-gradient(180deg,transparent,black_70%)]" />

          {heroImageUrl ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 opacity-[0.14] [mask-image:linear-gradient(to_bottom,#000_35%,transparent)] md:left-auto md:w-[52%] md:opacity-40 md:[mask-composite:intersect] md:[mask-image:linear-gradient(to_right,transparent_10%,#000_70%),linear-gradient(to_bottom,#000_55%,transparent)] lg:w-[52%] lg:opacity-60"
            >
              <img
                src={heroImageUrl}
                alt=""
                className="h-full w-full object-cover object-center transition-transform duration-[1600ms] ease-out group-hover:scale-[1.03]"
              />
            </div>
          ) : null}

          <div className="section-shell relative z-10 flex min-h-[68vh] items-center py-14 sm:py-16 md:py-16">
            <div className="w-full hero-float">
              <div className="hero-badge mb-4 flex items-center gap-3 mono text-[10px] uppercase tracking-[0.18em] text-[#FFC94A] sm:mb-6 sm:text-[12px]">
                <span className="block h-px w-6 bg-[#FFC94A] sm:w-7" />
                Fotografía oficial
              </div>

              <h1 className="hero-title max-w-[820px] [text-shadow:0_2px_24px_rgba(11,15,20,0.55)] text-[clamp(38px,9vw,92px)] font-semibold leading-[0.96] text-[#F4F1E8]">
                La emoción del partido,
                <span className="block text-[#FFC94A]">en cada cuadro.</span>
              </h1>

              <p className="hero-copy mt-5 max-w-[480px] text-[14px] leading-6 text-[#8A9A93] sm:mt-7 sm:text-[17px]">
                Encontrá tu partido, elegí tus fotos y descargalas en alta calidad.
              </p>

              <div className="hero-actions mt-8 inline-block w-full max-w-[420px] p-[6px] sm:mt-10 sm:w-auto">
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <Link href="/galerias" className="inline-flex items-center justify-center rounded-sm bg-[#FFC94A] px-5 py-3 text-[12px] font-semibold uppercase tracking-[0.04em] text-[#0B0F14] transition-transform hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(255,201,74,0.25)] sm:px-6 sm:text-[13px]">
                    Buscar mi partido
                  </Link>
                  <a href="#como-funciona" className="inline-flex items-center justify-center rounded-sm border border-white/15 bg-transparent px-5 py-3 text-[12px] font-semibold uppercase tracking-[0.04em] text-[#F4F1E8] transition-colors hover:border-[#F4F1E8] sm:px-6 sm:text-[13px]">
                    Cómo funciona
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="como-funciona" className="pt-12 pb-16 sm:pt-16 sm:pb-20 md:pt-[84px] md:pb-[110px]">
          <div className="section-shell">
            <div className="mb-8 max-w-[560px] sm:mb-14">
              <div className="mb-4 flex items-center gap-3 mono text-[10px] uppercase tracking-[0.22em] text-[#FFC94A] sm:text-[12px]">
                <span className="block h-px w-6 bg-[#FFC94A] sm:w-7" />
                Cómo funciona
              </div>
              <h2 className="text-[clamp(26px,5vw,42px)] text-[#F4F1E8]">
                Comprás la foto que te importa.
              </h2>
              <p className="mt-4 text-[14px] text-[#8A9A93] sm:text-[15.5px]">
                Un proceso simple para acceder a fotos del partido sin filas ni dudas.
              </p>
            </div>

            {steps.length > 0 ? (
              <div className="grid gap-2 border border-white/10 bg-white/5 md:grid-cols-3">
                {steps.map((step) => (
                  <div key={step.number} className="bg-[#0B0F14] p-6 sm:p-8 md:p-10">
                    <span className="mono mb-5 block text-[13px] text-[#FFC94A]">{step.number}</span>
                    <h3 className="mb-3 text-[18px] text-[#F4F1E8] sm:text-[19px]">{step.title}</h3>
                    <p className="text-[13px] text-[#8A9A93] sm:text-[14.5px]">{step.text}</p>
                  </div>
                ))}
              </div>
            ) : (
              <ol className="grid border-y border-white/10 sm:grid-cols-2 lg:grid-cols-4">
                {purchaseSteps.map((step) => (
                  <li
                    key={step.number}
                    className={`group border-white/10 px-1 py-6 transition-colors duration-300 hover:bg-white/[0.02] sm:px-6 sm:py-7 lg:py-8 ${step.dividerClass}`}
                  >
                    <div className="mb-4 flex items-center justify-between">
                      <span className="mono text-[clamp(34px,4vw,44px)] font-semibold leading-none text-[#FFC94A]/90 transition-colors duration-300 group-hover:text-[#FFC94A]">
                        {step.number}
                      </span>
                      <span className="text-[#8A9A93] transition-colors duration-300 group-hover:text-[#FFC94A]">
                        {step.icon}
                      </span>
                    </div>
                    <span className="mb-4 block h-px w-8 bg-[#FFC94A]/60" />
                    <h3 className="mono mb-2 text-[12.5px] font-semibold uppercase tracking-[0.12em] text-[#F4F1E8] sm:text-[13px]">
                      {step.title}
                    </h3>
                    <p className="text-[13px] leading-[1.6] text-[#8A9A93] sm:text-[14px]">{step.text}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>

        <section id="galerias" className="py-16 sm:py-20 md:py-[110px]">
          <div className="section-shell">
            <div className="mb-8 max-w-[560px] sm:mb-14">
              <div className="mb-4 flex items-center gap-3 mono text-[10px] uppercase tracking-[0.22em] text-[#FFC94A] sm:text-[12px]">
                <span className="block h-px w-6 bg-[#FFC94A] sm:w-7" />
                Galerías recientes
              </div>
              <h2 className="text-[clamp(26px,5vw,42px)] text-[#F4F1E8]">
                Últimos partidos.
              </h2>
            </div>

            {galleryCards.length > 0 ? (
              <div className="grid-float grid gap-6 md:grid-cols-3">
                {galleryCards.map((card, index) => (
                  <GalleryCard key={card.slug} card={card} index={index} />
                ))}
              </div>
            ) : (
              <div className="rounded-[4px] border border-dashed border-white/15 bg-[#111820]/60 p-8 text-center text-[#8A9A93] sm:p-12">
                <div className="mono text-[11px] uppercase tracking-[0.2em] text-[#FFC94A]">Sin galerías cargadas</div>
                <h3 className="mt-4 text-[22px] text-[#F4F1E8]">Todavía no hay galerías publicadas.</h3>
              </div>
            )}

            {galleryCards.length > 0 ? (
              <div className="mt-10 flex justify-center">
                <Link
                  href="/galerias"
                  className="inline-flex items-center justify-center gap-2 rounded-sm border border-white/15 px-6 py-3 text-[12px] font-semibold uppercase tracking-[0.06em] text-[#F4F1E8] transition-colors hover:border-[#FFC94A]/70 hover:text-[#FFC94A] sm:text-[13px]"
                >
                  Ver todas las galerías <span aria-hidden="true">→</span>
                </Link>
              </div>
            ) : null}
          </div>
        </section>


        <section id="contacto" className="pb-16 pt-8 sm:pb-[110px]">
          <div className="section-shell max-w-[1200px]">
            <div className="mx-auto max-w-[1100px]">
              <div className="mb-4 flex items-center gap-3 mono text-[10px] uppercase tracking-[0.18em] text-[#FFC94A] sm:text-[12px]">
                <span className="block h-px w-8 bg-[#FFC94A] sm:w-10" />
                CONTACTO
              </div>

              <h2 className="max-w-[820px] text-[clamp(38px,6vw,96px)] leading-[0.96] tracking-[-0.04em] text-[#F4F1E8]">
                HABLAMOS DEL PRÓXIMO
                <span className="block">PARTIDO.</span>
              </h2>

              <p className="mt-6 max-w-[760px] text-[clamp(16px,2vw,28px)] leading-[1.3] text-[#b9c2bd]">
                Si querés una sesión especial, un paquete institucional o un evento puntual, escribinos y te respondemos rápido.
              </p>

              <div className="mt-8 rounded-[4px] border border-white/15 bg-[#0F1720]/60 p-5 sm:p-7">
                {contactRows.length > 0 ? (
                  <div className="space-y-3 text-[17px] text-[#F4F1E8] sm:text-[18px]">
                    {contactRows.map((row) => (
                      <div key={row.label} className="flex flex-col gap-1 border-b border-white/10 pb-3 last:border-b-0 last:pb-0 sm:flex-row sm:items-center sm:gap-4">
                        <span className="mono text-[10px] uppercase tracking-[0.18em] text-[#FFC94A] sm:min-w-[130px] sm:text-[12px]">
                          {row.label}
                        </span>
                        {row.label === "Email" ? (
                          <a href={`mailto:${row.value}`} className="text-[#F4F1E8] transition-colors hover:text-[#FFC94A]">
                            {row.value}
                          </a>
                        ) : row.label === "WhatsApp" ? (
                          <a href="https://wa.me/5492664001686" target="_blank" rel="noreferrer" className="text-[#F4F1E8] transition-colors hover:text-[#FFC94A]">
                            {row.value}
                          </a>
                        ) : (
                          <span className="text-[#dfe8e2]">{row.value}</span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[4px] border border-dashed border-white/15 bg-[#111820]/60 p-6 text-[18px] text-[#8A9A93]">
                    Contacto pendiente de cargar.
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 py-12">
        <div className="section-shell">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <svg className="logo-mark" viewBox="0 0 40 40" fill="none" aria-hidden="true">
                <circle cx="20" cy="20" r="18" stroke="#FFC94A" strokeWidth="2" />
                <path d="M20 8 L26 12 L24 19 L16 19 L14 12 Z" fill="#F4F1E8" />
                <circle cx="20" cy="20" r="2.4" fill="#1B4332" />
              </svg>
              <div className="font-display text-[18px] text-[#F4F1E8]">
                <span>Visión</span> <span className="text-[#FFC94A]">Pelusa</span>
              </div>
            </div>

            <nav className="flex flex-wrap gap-6 text-[13px] text-[#8A9A93]">
              {navItems.map((item) =>
                footerHrefByItem[item] ? (
                  <Link key={item} href={footerHrefByItem[item]} className="transition-colors hover:text-[#F4F1E8]">
                    {item}
                  </Link>
                ) : (
                  <a key={item} href="#" className="transition-colors hover:text-[#F4F1E8]">
                    {item}
                  </a>
                ),
              )}
            </nav>
          </div>
          <p className="mt-6 text-[12px] text-[#8A9A93]">© 2026 Visión Pelusa. Fotografía de la Liga Sanluiseña.</p>
        </div>
      </footer>
    </div>
  );
}
