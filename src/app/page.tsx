"use client";

import { useEffect, useState } from "react";
import { getHomePageData } from "@/lib/data-source";
import type { HomePageData } from "@/lib/mock-data";

const defaultHomePageData = {
  navItems: ["Inicio", "Galerías", "Cómo funciona", "Contacto"],
  steps: [],
  galleryCards: [],
  stats: [],
  contactRows: [],
} as HomePageData;

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

  const navHrefByItem: Record<string, string> = {
    Inicio: "/",
    Galerías: "#galerias",
    "Cómo funciona": "#como-funciona",
    Contacto: "#contacto",
  };

  return (
    <div className="min-h-screen bg-[#0B0F14] text-[#F4F1E8]">
      <div className="grain" />

      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0B0F14]/80 backdrop-blur-md">
        <div className="section-shell flex items-center justify-between gap-3 py-4">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <img src="/logo-vision-pelusa.svg" alt="Visión Pelusa" className="logo-mark" />
            <span className="truncate text-[12px] font-semibold tracking-[0.08em] text-[#F4F1E8] sm:text-[14px]">Visión Pelusa</span>
          </div>

          <nav className="hidden items-center gap-8 text-sm font-medium text-[#8A9A93] md:flex">
            {navItems.map((item) => (
              <a key={item} href={navHrefByItem[item] ?? "/"} className="transition-colors hover:text-[#F4F1E8]">
                {item}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <a href="/admin" className="inline-flex items-center justify-center rounded-sm border border-white/10 px-2.5 py-2 text-[9px] font-semibold uppercase tracking-[0.06em] text-[#F4F1E8] transition-colors hover:border-[#FFC94A]/60 hover:text-[#FFC94A] sm:px-4 sm:py-2.5 sm:text-[11px]">
              Panel admin
            </a>
            <a href="/compras" className="inline-flex items-center justify-center rounded-sm bg-[#FFC94A] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.04em] text-[#0B0F14] transition-transform hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(255,201,74,0.25)] sm:px-5 sm:py-3 sm:text-[13px]">
              Comprar fotos
            </a>
          </div>
        </div>
      </header>

      <main>
        <section className="hero-glow relative overflow-hidden">
          <div className="hero-orb hero-orb-1" />
          <div className="hero-orb hero-orb-2" />
          <div className="absolute inset-y-0 left-[8%] w-px bg-gradient-to-b from-[#FFC94A]/30 via-[#FFC94A]/10 to-transparent blur-sm" style={{ transform: "rotate(12deg)" }} />
          <div className="absolute inset-y-0 left-[22%] w-px bg-gradient-to-b from-[#FFC94A]/20 via-[#FFC94A]/5 to-transparent blur-sm" style={{ transform: "rotate(6deg)" }} />
          <div className="absolute inset-y-0 right-[12%] w-px bg-gradient-to-b from-[#FFC94A]/30 via-[#FFC94A]/10 to-transparent blur-sm" style={{ transform: "rotate(-14deg)" }} />
          <div className="absolute inset-y-0 right-[26%] w-px bg-gradient-to-b from-[#FFC94A]/20 via-[#FFC94A]/5 to-transparent blur-sm" style={{ transform: "rotate(-7deg)" }} />
          <div className="absolute bottom-0 left-0 right-0 h-[38vh] bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.025)_0_60px,rgba(255,255,255,0.05)_60px_120px)] [mask-image:linear-gradient(180deg,transparent,black_70%)]" />

          <div className="section-shell relative z-10 flex min-h-[78vh] items-center py-16 sm:py-20 md:py-24">
            <div className="w-full hero-float">
              <div className="hero-badge mb-4 flex items-center gap-3 mono text-[10px] uppercase tracking-[0.18em] text-[#FFC94A] sm:mb-6 sm:text-[12px]">
                <span className="block h-px w-6 bg-[#FFC94A] sm:w-7" />
                Fotografía oficial
              </div>

              <h1 className="hero-title max-w-[820px] text-[clamp(38px,9vw,92px)] font-semibold leading-[0.96] text-[#F4F1E8]">
                La emoción del partido,
                <span className="block text-[#FFC94A]">en cada cuadro.</span>
              </h1>

              <p className="hero-copy mt-5 max-w-[480px] text-[14px] leading-6 text-[#8A9A93] sm:mt-7 sm:text-[17px]">
                Galerías de fotos de la Liga Sanluiseña para hinchas, familias y jugadores que quieren volver a vivir cada jugada.
              </p>

              <div className="hero-actions mt-8 inline-block w-full max-w-[420px] p-[6px] sm:mt-10 sm:w-auto">
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <a href="/galeria/fecha-14" className="inline-flex items-center justify-center rounded-sm bg-[#FFC94A] px-5 py-3 text-[12px] font-semibold uppercase tracking-[0.04em] text-[#0B0F14] transition-transform hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(255,201,74,0.25)] sm:px-6 sm:text-[13px]">
                    Ver últimas galerías
                  </a>
                  <a href="#como-funciona" className="inline-flex items-center justify-center rounded-sm border border-white/15 bg-transparent px-5 py-3 text-[12px] font-semibold uppercase tracking-[0.04em] text-[#F4F1E8] transition-colors hover:border-[#F4F1E8] sm:px-6 sm:text-[13px]">
                    Cómo funciona
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="como-funciona" className="py-16 sm:py-20 md:py-[110px]">
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
              <div className="rounded-[4px] border border-dashed border-white/15 bg-[#111820]/60 p-8 text-center text-[#8A9A93] sm:p-12">
                <div className="mono text-[11px] uppercase tracking-[0.2em] text-[#FFC94A]">Próximamente</div>
                <h3 className="mt-4 text-[22px] text-[#F4F1E8]">La experiencia de compra se cargará aquí.</h3>
              </div>
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
                Lo más visto esta semana.
              </h2>
            </div>

            {galleryCards.length > 0 ? (
              <div className="grid-float grid gap-6 md:grid-cols-3">
                {galleryCards.map((card, index) => (
                  <a key={card.title} href={`/galeria/${card.slug}`} className="card-rise group block overflow-hidden border border-white/10 bg-[#111820]">
                    <article className="h-full">
                      <div className="relative aspect-[4/3] overflow-hidden">
                        <div
                          className="absolute inset-0 transition-transform duration-500 group-hover:scale-105"
                          style={{
                            background:
                              index === 0
                                ? "linear-gradient(135deg,#1B4332,#0B0F14 70%)"
                                : index === 1
                                  ? "linear-gradient(135deg,#2b5c46,#0B0F14 70%)"
                                  : "linear-gradient(135deg,#173c2c,#111820 70%)",
                          }}
                        />
                        <div className="absolute inset-[-20%_-50%] flex flex-wrap content-around rotate-[-18deg] opacity-20">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <span key={i} className="mono w-full text-center text-[11px] uppercase tracking-[0.15em] text-[#F4F1E8]">
                              Visión Pelusa
                            </span>
                          ))}
                        </div>
                        <div className="relative z-10 flex h-full items-center justify-center mono text-[12px] uppercase tracking-[0.1em] text-[#8A9A93]">
                          {card.tag}
                        </div>
                        <span className="absolute left-3 top-3 h-4 w-4 border-l-2 border-t-2 border-[#FFC94A] opacity-0 transition-opacity group-hover:opacity-100" />
                        <span className="absolute right-3 top-3 h-4 w-4 border-r-2 border-t-2 border-[#FFC94A] opacity-0 transition-opacity group-hover:opacity-100" />
                        <span className="absolute bottom-3 left-3 h-4 w-4 border-l-2 border-b-2 border-[#FFC94A] opacity-0 transition-opacity group-hover:opacity-100" />
                        <span className="absolute bottom-3 right-3 h-4 w-4 border-r-2 border-b-2 border-[#FFC94A] opacity-0 transition-opacity group-hover:opacity-100" />
                      </div>

                      <div className="p-5">
                        <div className="mono mb-2 text-[10.5px] uppercase tracking-[0.12em] text-[#FFC94A]">
                          {card.tag}
                        </div>
                        <h3 className="mb-2 text-[17px] font-semibold text-[#F4F1E8]">{card.title}</h3>
                        <p className="mb-5 text-[13px] text-[#8A9A93]">{card.subtitle}</p>

                        <div className="flex items-center justify-between border-t border-white/10 pt-4">
                          <div>
                            <div className="mono text-[15px] text-[#F4F1E8]">{card.price}</div>
                            <span className="block text-[11px] text-[#8A9A93]">por paquete</span>
                          </div>
                          <span className="flex items-center gap-2 text-[12px] text-[#8A9A93]">
                            <span>🔒</span> Acceso seguro
                          </span>
                        </div>
                      </div>
                    </article>
                  </a>
                ))}
              </div>
            ) : (
              <div className="rounded-[4px] border border-dashed border-white/15 bg-[#111820]/60 p-8 text-center text-[#8A9A93] sm:p-12">
                <div className="mono text-[11px] uppercase tracking-[0.2em] text-[#FFC94A]">Sin galerías cargadas</div>
                <h3 className="mt-4 text-[22px] text-[#F4F1E8]">Todavía no hay galerías publicadas.</h3>
              </div>
            )}
          </div>
        </section>

        {stats.length > 0 ? (
          <section className="py-16 sm:py-20 md:py-[110px]">
            <div className="section-shell">
              <div className="flex flex-wrap justify-between gap-6 border-y border-white/10 py-8 sm:gap-8 sm:py-12">
                {stats.map((stat) => (
                  <div key={stat.label} className="min-w-[140px] flex-1">
                    <b className="font-display block text-[30px] text-[#FFC94A] sm:text-[38px]">{stat.value}</b>
                    <span className="text-[10px] uppercase tracking-[0.1em] text-[#8A9A93] sm:text-[12.5px]">{stat.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <section id="contacto" className="pb-16 pt-8 sm:pb-[110px]">
          <div className="section-shell grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
            <div>
              <div className="mb-4 flex items-center gap-3 mono text-[10px] uppercase tracking-[0.22em] text-[#FFC94A] sm:text-[12px]">
                <span className="block h-px w-6 bg-[#FFC94A] sm:w-7" />
                Contacto
              </div>
              <h2 className="mb-5 text-[clamp(26px,5vw,40px)] text-[#F4F1E8]">Hablemos del próximo partido.</h2>
              <p className="mb-7 text-[14px] text-[#8A9A93] sm:text-[15px]">
                Si querés una sesión especial, un paquete institucional o un evento puntual, escribinos y te respondemos rápido.
              </p>

              {contactRows.length > 0 ? (
                contactRows.map((row) => (
                  <div key={row.label} className="flex items-center gap-3 border-t border-white/10 py-4 text-[13px] text-[#F4F1E8] sm:gap-4 sm:text-[14.5px]">
                    <b className="mono w-[96px] flex-shrink-0 text-[10px] uppercase tracking-[0.1em] text-[#FFC94A] sm:w-[120px] sm:text-[11px]">{row.label}</b>
                    <a
                      href={row.label === "Email" ? `mailto:${row.value}` : row.label === "WhatsApp" ? `https://wa.me/5492664001686` : undefined}
                      target={row.label === "WhatsApp" ? "_blank" : undefined}
                      rel={row.label === "WhatsApp" ? "noopener noreferrer" : undefined}
                      className={row.label === "Email" || row.label === "WhatsApp" ? "text-[#F4F1E8] transition-colors hover:text-[#FFC94A]" : "text-[#8A9A93]"}
                    >
                      {row.value}
                    </a>
                  </div>
                ))
              ) : (
                <div className="rounded-[4px] border border-dashed border-white/15 bg-[#111820]/60 p-6 text-[14px] text-[#8A9A93]">
                  Contacto pendiente de cargar.
                </div>
              )}
            </div>

            <form onSubmit={handleContactSubmit} className="space-y-5">
              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <label className="mono mb-2 block text-[12px] uppercase tracking-[0.08em] text-[#8A9A93]">Nombre</label>
                  <input name="name" className="field-input" type="text" placeholder="Tu nombre" required />
                </div>
                <div>
                  <label className="mono mb-2 block text-[12px] uppercase tracking-[0.08em] text-[#8A9A93]">Email</label>
                  <input name="email" className="field-input" type="email" placeholder="tu@email.com" required />
                </div>
              </div>

              <div>
                <label className="mono mb-2 block text-[12px] uppercase tracking-[0.08em] text-[#8A9A93]">Motivo</label>
                <select name="reason" className="field-input" defaultValue="" required>
                  <option value="" disabled>Seleccioná una opción</option>
                  <option>Comprar fotos</option>
                  <option>Solicitar un evento</option>
                  <option>Quiero ser colaborador</option>
                </select>
              </div>

              <div>
                <label className="mono mb-2 block text-[12px] uppercase tracking-[0.08em] text-[#8A9A93]">Mensaje</label>
                <textarea name="message" className="field-input min-h-[100px] resize-y" placeholder="Contanos qué necesitás..." required />
              </div>

              {contactStatus ? (
                <div className="rounded-[4px] border border-[#6FCF97]/25 bg-[#6FCF97]/10 px-3 py-2 text-[12px] text-[#8FE3B1]">
                  {contactStatus}
                </div>
              ) : null}

              <button type="submit" className="inline-flex w-full items-center justify-center rounded-sm bg-[#FFC94A] px-6 py-3 text-[13px] font-semibold uppercase tracking-[0.04em] text-[#0B0F14] transition-transform hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(255,201,74,0.25)] sm:w-auto">
                Enviar consulta
              </button>
            </form>
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
              {navItems.map((item) => (
                <a key={item} href="#" className="transition-colors hover:text-[#F4F1E8]">
                  {item}
                </a>
              ))}
            </nav>
          </div>
          <p className="mt-6 text-[12px] text-[#8A9A93]">© 2026 Visión Pelusa. Fotografía de la Liga Sanluiseña.</p>
        </div>
      </footer>
    </div>
  );
}
