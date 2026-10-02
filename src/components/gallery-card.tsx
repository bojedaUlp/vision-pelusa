import Link from "next/link";
import type { GalleryCardData } from "@/lib/data-source";

// Same card markup the Home used inline; shared by the Home and /galerias.
export function GalleryCard({ card, index }: { card: GalleryCardData; index: number }) {
  return (
    <Link href={`/galeria/${card.slug}`} className="card-rise group block overflow-hidden border border-white/10 bg-[#111820]">
      <article className="h-full">
        <div className="relative aspect-[4/3] overflow-hidden">
          <div
            className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-transform duration-500 group-hover:scale-105"
            style={{
              backgroundImage: card.imageUrl ? `url(${card.imageUrl})` : undefined,
              backgroundColor:
                index === 0
                  ? "#1B4332"
                  : index === 1
                    ? "#2b5c46"
                    : "#173c2c",
            }}
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.06),rgba(0,0,0,0.28))]" />
          <div className="absolute inset-[-20%_-50%] flex flex-wrap content-around rotate-[-18deg] opacity-20">
            {Array.from({ length: 5 }).map((_, i) => (
              <span key={i} className="mono w-full text-center text-[11px] uppercase tracking-[0.15em] text-[#F4F1E8]">
                Visión Pelusa
              </span>
            ))}
          </div>
          <div className="relative z-10 flex h-full items-center justify-center mono text-[12px] uppercase tracking-[0.1em] text-white/80">
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
            <span className="mono text-[13px] uppercase tracking-[0.1em] text-[#F4F1E8] transition-colors group-hover:text-[#FFC94A]">
              Ver fotos <span aria-hidden="true">→</span>
            </span>
            <span className="flex items-center gap-2 text-[12px] text-[#8A9A93]">
              <span>🔒</span> Acceso seguro
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}
