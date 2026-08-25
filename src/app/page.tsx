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

  useEffect(() => {
    void getHomePageData().then(setData);
  }, []);

  const { navItems, steps, galleryCards, stats, contactRows } = data;
  return (
    <div className="min-h-screen bg-[#0B0F14] text-[#F4F1E8]">
      <div className="grain" />

      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0B0F14]/80 backdrop-blur-md">
        <div className="section-shell flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <img src="/logo-vision-pelusa.svg" alt="Visión Pelusa" className="logo-mark" />
          </div>

          <nav className="hidden items-center gap-8 text-sm font-medium text-[#8A9A93] md:flex">
            {navItems.map((item) => (
              <a key={item} href="#" className="transition-colors hover:text-[#F4F1E8]">
                {item}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <a href="/admin" className="inline-flex items-center justify-center rounded-sm border border-white/10 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#F4F1E8] transition-colors hover:border-[#FFC94A]/60 hover:text-[#FFC94A]">
              Panel admin
            </a>
            <button className="inline-flex items-center justify-center rounded-sm bg-[#FFC94A] px-5 py-3 text-[13px] font-semibold uppercase tracking-[0.04em] text-[#0B0F14] transition-transform hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(255,201,74,0.25)]">
              Comprar fotos
            </button>
          </div>
        </div>
      </header>

      <main>
        <section className="hero-glow relative overflow-hidden">
          <div className="absolute inset-y-0 left-[8%] w-px bg-gradient-to-b from-[#FFC94A]/30 via-[#FFC94A]/10 to-transparent blur-sm" style={{ transform: "rotate(12deg)" }} />
          <div className="absolute inset-y-0 left-[22%] w-px bg-gradient-to-b from-[#FFC94A]/20 via-[#FFC94A]/5 to-transparent blur-sm" style={{ transform: "rotate(6deg)" }} />
          <div className="absolute inset-y-0 right-[12%] w-px bg-gradient-to-b from-[#FFC94A]/30 via-[#FFC94A]/10 to-transparent blur-sm" style={{ transform: "rotate(-14deg)" }} />
          <div className="absolute inset-y-0 right-[26%] w-px bg-gradient-to-b from-[#FFC94A]/20 via-[#FFC94A]/5 to-transparent blur-sm" style={{ transform: "rotate(-7deg)" }} />
          <div className="absolute bottom-0 left-0 right-0 h-[38vh] bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.025)_0_60px,rgba(255,255,255,0.05)_60px_120px)] [mask-image:linear-gradient(180deg,transparent,black_70%)]" />

          <div className="section-shell relative z-10 flex min-h-[100vh] items-center py-24">
            <div className="w-full">
              <div className="mb-6 flex items-center gap-3 mono text-[12px] uppercase tracking-[0.22em] text-[#FFC94A]">
                <span className="block h-px w-7 bg-[#FFC94A]" />
                Fotografía oficial
              </div>

              <h1 className="max-w-[820px] text-[clamp(44px,8vw,92px)] font-semibold leading-[1.05] text-[#F4F1E8]">
                La emoción del partido,
                <span className="block text-[#FFC94A]">en cada cuadro.</span>
              </h1>

              <p className="mt-7 max-w-[480px] text-[17px] text-[#8A9A93]">
                Galerías de fotos de la Liga Sanluiseña para hinchas, familias y jugadores que quieren volver a vivir cada jugada.
              </p>

              <div className="mt-10 inline-block p-[6px]">
                <div className="flex flex-wrap gap-4">
                  <button className="inline-flex items-center justify-center rounded-sm bg-[#FFC94A] px-6 py-3 text-[13px] font-semibold uppercase tracking-[0.04em] text-[#0B0F14] transition-transform hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(255,201,74,0.25)]">
                    Ver últimas galerías
                  </button>
                  <button className="inline-flex items-center justify-center rounded-sm border border-white/15 bg-transparent px-6 py-3 text-[13px] font-semibold uppercase tracking-[0.04em] text-[#F4F1E8] transition-colors hover:border-[#F4F1E8]">
                    Cómo funciona
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-[110px]">
          <div className="section-shell">
            <div className="mb-14 max-w-[560px]">
              <div className="mb-4 flex items-center gap-3 mono text-[12px] uppercase tracking-[0.22em] text-[#FFC94A]">
                <span className="block h-px w-7 bg-[#FFC94A]" />
                Cómo funciona
              </div>
              <h2 className="text-[clamp(28px,4vw,42px)] text-[#F4F1E8]">
                Comprás la foto que te importa.
              </h2>
              <p className="mt-4 text-[15.5px] text-[#8A9A93]">
                Un proceso simple para acceder a fotos del partido sin filas ni dudas.
              </p>
            </div>

            <div className="grid gap-2 border border-white/10 bg-white/5 md:grid-cols-3">
              {steps.map((step) => (
                <div key={step.number} className="bg-[#0B0F14] p-8 md:p-10">
                  <span className="mono mb-5 block text-[13px] text-[#FFC94A]">{step.number}</span>
                  <h3 className="mb-3 text-[19px] text-[#F4F1E8]">{step.title}</h3>
                  <p className="text-[14.5px] text-[#8A9A93]">{step.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-[110px]">
          <div className="section-shell">
            <div className="mb-14 max-w-[560px]">
              <div className="mb-4 flex items-center gap-3 mono text-[12px] uppercase tracking-[0.22em] text-[#FFC94A]">
                <span className="block h-px w-7 bg-[#FFC94A]" />
                Galerías recientes
              </div>
              <h2 className="text-[clamp(28px,4vw,42px)] text-[#F4F1E8]">
                Lo más visto esta semana.
              </h2>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              {galleryCards.map((card, index) => (
                <article key={card.title} className="group overflow-hidden border border-white/10 bg-[#111820] transition-colors hover:border-[#FFC94A]/40">
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
              ))}
            </div>
          </div>
        </section>

        <section className="py-[110px]">
          <div className="section-shell">
            <div className="flex flex-wrap justify-between gap-8 border-y border-white/10 py-12">
              {stats.map((stat) => (
                <div key={stat.label}>
                  <b className="font-display block text-[38px] text-[#FFC94A]">{stat.value}</b>
                  <span className="text-[12.5px] uppercase tracking-[0.1em] text-[#8A9A93]">{stat.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="contacto" className="pb-[110px] pt-8">
          <div className="section-shell grid gap-16 lg:grid-cols-[1fr_1.1fr]">
            <div>
              <div className="mb-4 flex items-center gap-3 mono text-[12px] uppercase tracking-[0.22em] text-[#FFC94A]">
                <span className="block h-px w-7 bg-[#FFC94A]" />
                Contacto
              </div>
              <h2 className="mb-5 text-[clamp(28px,4vw,40px)] text-[#F4F1E8]">Hablemos del próximo partido.</h2>
              <p className="mb-7 text-[15px] text-[#8A9A93]">
                Si querés una sesión especial, un paquete institucional o un evento puntual, escribinos y te respondemos rápido.
              </p>

              {contactRows.map((row) => (
                <div key={row.label} className="flex items-center gap-4 border-t border-white/10 py-4 text-[14.5px] text-[#F4F1E8]">
                  <b className="mono w-[120px] flex-shrink-0 text-[11px] uppercase tracking-[0.1em] text-[#FFC94A]">{row.label}</b>
                  <span className="text-[#8A9A93]">{row.value}</span>
                </div>
              ))}
            </div>

            <form className="space-y-5">
              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <label className="mono mb-2 block text-[12px] uppercase tracking-[0.08em] text-[#8A9A93]">Nombre</label>
                  <input className="field-input" type="text" placeholder="Tu nombre" />
                </div>
                <div>
                  <label className="mono mb-2 block text-[12px] uppercase tracking-[0.08em] text-[#8A9A93]">Email</label>
                  <input className="field-input" type="email" placeholder="tu@email.com" />
                </div>
              </div>

              <div>
                <label className="mono mb-2 block text-[12px] uppercase tracking-[0.08em] text-[#8A9A93]">Motivo</label>
                <select className="field-input" defaultValue="">
                  <option value="" disabled>Seleccioná una opción</option>
                  <option>Comprar fotos</option>
                  <option>Solicitar un evento</option>
                  <option>Quiero ser colaborador</option>
                </select>
              </div>

              <div>
                <label className="mono mb-2 block text-[12px] uppercase tracking-[0.08em] text-[#8A9A93]">Mensaje</label>
                <textarea className="field-input min-h-[100px] resize-y" placeholder="Contanos qué necesitás..." />
              </div>

              <button className="inline-flex items-center justify-center rounded-sm bg-[#FFC94A] px-6 py-3 text-[13px] font-semibold uppercase tracking-[0.04em] text-[#0B0F14] transition-transform hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(255,201,74,0.25)]">
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
