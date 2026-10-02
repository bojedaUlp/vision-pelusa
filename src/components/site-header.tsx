import Link from "next/link";

// Public navigation, shared by the Home and /galerias.
// "Comprar fotos" starts a purchase (find your match); "Mis fotos" (/compras) is for past buyers.
const navLinks = [
  { label: "Inicio", href: "/" },
  { label: "Galerías", href: "/galerias" },
  { label: "Cómo funciona", href: "/#como-funciona" },
  { label: "Contacto", href: "/#contacto" },
  { label: "Mis fotos", href: "/compras" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0B0F14]/80 backdrop-blur-md">
      <div className="section-shell flex items-center justify-between gap-3 py-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <img src="/logo-vision-pelusa.svg" alt="Visión Pelusa" className="logo-mark" />
          <span className="hidden truncate whitespace-nowrap text-[12px] font-semibold tracking-[0.08em] text-[#F4F1E8] sm:block sm:text-[14px] md:max-lg:hidden">Visión Pelusa</span>
        </div>

        <nav className="hidden items-center gap-4 whitespace-nowrap text-[13px] font-medium text-[#8A9A93] md:flex lg:gap-8 lg:text-sm">
          {navLinks.map((item) => (
            <Link key={item.href} href={item.href} className="transition-colors hover:text-[#F4F1E8]">
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2 whitespace-nowrap sm:gap-3">
          <Link href="/compras" className="px-1 py-2 text-[10px] font-medium uppercase tracking-[0.06em] text-[#8A9A93] transition-colors hover:text-[#F4F1E8] sm:text-[12px] md:hidden">
            Mis fotos
          </Link>
          <Link href="/admin" className="inline-flex items-center justify-center rounded-sm border border-white/10 px-2.5 py-2 text-[9px] font-semibold uppercase tracking-[0.06em] text-[#F4F1E8] transition-colors hover:border-[#FFC94A]/60 hover:text-[#FFC94A] sm:px-4 sm:py-2.5 sm:text-[11px] md:max-lg:px-3 md:max-lg:text-[10px]">
            Panel admin
          </Link>
          <Link href="/galerias" className="inline-flex items-center justify-center rounded-sm bg-[#FFC94A] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.04em] text-[#0B0F14] transition-transform hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(255,201,74,0.25)] sm:px-5 sm:py-3 sm:text-[13px] md:max-lg:px-4 md:max-lg:text-[12px]">
            Comprar fotos
          </Link>
        </div>
      </div>
    </header>
  );
}
