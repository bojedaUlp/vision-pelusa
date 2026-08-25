"use client";

import { useEffect, useState } from "react";
import { getAdminData } from "@/lib/data-source";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";

type UploadItem = {
  name: string;
  url: string;
  uploaded: boolean;
  note: string;
};

export default function AdminPage() {
  const [stats, setStats] = useState<Array<{ value: string; label: string }>>([]);
  const [matches, setMatches] = useState<Array<{ title: string; subtitle: string; photos: number; status: string; vendas: number }>>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Listo para subir fotos del próximo partido.");
  const [form, setForm] = useState({
    title: "Pelusa vs Lanús",
    subtitle: "Cancha Norte · 16 ago 2026",
    slug: "pelusa-vs-lanus",
    price: "$6.000",
    status: "Publicada",
  });

  useEffect(() => {
    void getAdminData().then((data) => {
      setStats(data.stats);
      setMatches(data.matches);
    });
  }, []);

  const handleFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    setSelectedFiles(files);
  };

  const handleUpload = async () => {
    if (!selectedFiles.length) {
      setStatusMessage("Debés seleccionar al menos una foto primero.");
      return;
    }

    setIsUploading(true);
    setStatusMessage("Subiendo imágenes y creando la vista previa...");

    const supabase = isSupabaseConfigured() ? getSupabaseClient() : null;
    const nextUploads: UploadItem[] = [];

    for (const file of selectedFiles) {
      const fileName = `${Date.now()}-${file.name.replace(/\s+/g, "-")}`;
      const storagePath = form.slug ? `${form.slug}/${fileName}` : `uploads/${fileName}`;

      if (supabase) {
        try {
          const { data, error } = await supabase.storage.from("photos").upload(storagePath, file, { upsert: true });

          if (!error && data) {
            const { data: publicData } = supabase.storage.from("photos").getPublicUrl(data.path);
            nextUploads.push({
              name: file.name,
              url: publicData.publicUrl || URL.createObjectURL(file),
              uploaded: true,
              note: "Subida a Supabase",
            });
            continue;
          }
        } catch {
          // fallback to local preview below
        }
      }

      nextUploads.push({
        name: file.name,
        url: URL.createObjectURL(file),
        uploaded: false,
        note: "Vista previa local",
      });
    }

    setUploads((prev) => [...nextUploads, ...prev]);
    setSelectedFiles([]);
    setStatusMessage(`Se cargaron ${nextUploads.length} imagen${nextUploads.length > 1 ? "es" : ""}.`);
    setIsUploading(false);
  };

  return (
    <div className="min-h-screen bg-[#0B0F14] text-[#F4F1E8]">
      <header className="border-b border-white/10 bg-[#0B0F14]/90 backdrop-blur-md">
        <div className="section-shell flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <img src="/logo-vision-pelusa.svg" alt="Visión Pelusa" className="logo-mark" />
            <span className="rounded-full border border-[#FFC94A]/60 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.08em] text-[#FFC94A]">
              ADMIN
            </span>
          </div>

          <div className="flex items-center gap-6 text-[13px] text-[#8A9A93]">
            <a href="/" className="transition-colors hover:text-[#F4F1E8]">Ver sitio público ↗</a>
            <a href="/admin" className="transition-colors hover:text-[#F4F1E8]">Actualizar</a>
          </div>
        </div>
      </header>

      <div className="section-shell pb-12 pt-9">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-semibold text-[#F4F1E8]">Mis galerías</h1>
            <p className="mt-2 text-[13.5px] text-[#8A9A93]">Subí, organizá y publicá cada partido de la temporada.</p>
          </div>
          <button type="button" className="bg-[#FFC94A] px-5 py-3 text-[13px] font-semibold uppercase tracking-[0.04em] text-[#0B0F14]">
            + Nuevo partido
          </button>
        </div>

        <div className="mb-8 grid gap-2 border border-white/10 bg-white/5 md:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="bg-[#111820] p-5">
              <b className="block font-display text-[26px] text-[#FFC94A]">{stat.value}</b>
              <span className="text-[11.5px] uppercase tracking-[0.08em] text-[#8A9A93]">{stat.label}</span>
            </div>
          ))}
        </div>

        <div className="mb-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[5px] border border-white/10 bg-[#111820] p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <h2 className="text-[16px] font-semibold text-[#F4F1E8]">Crear nueva galería</h2>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-[12px] uppercase tracking-[0.08em] text-[#8A9A93]">
                Título del partido
                <input
                  value={form.title}
                  onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                  className="mt-2 w-full border border-white/10 bg-[#0B0F14] px-3 py-2 text-[14px] text-[#F4F1E8] outline-none focus:border-[#FFC94A]"
                />
              </label>

              <label className="text-[12px] uppercase tracking-[0.08em] text-[#8A9A93]">
                Slug
                <input
                  value={form.slug}
                  onChange={(event) => setForm((prev) => ({ ...prev, slug: event.target.value }))}
                  className="mt-2 w-full border border-white/10 bg-[#0B0F14] px-3 py-2 text-[14px] text-[#F4F1E8] outline-none focus:border-[#FFC94A]"
                />
              </label>

              <label className="text-[12px] uppercase tracking-[0.08em] text-[#8A9A93] md:col-span-2">
                Subtítulo
                <input
                  value={form.subtitle}
                  onChange={(event) => setForm((prev) => ({ ...prev, subtitle: event.target.value }))}
                  className="mt-2 w-full border border-white/10 bg-[#0B0F14] px-3 py-2 text-[14px] text-[#F4F1E8] outline-none focus:border-[#FFC94A]"
                />
              </label>

              <label className="text-[12px] uppercase tracking-[0.08em] text-[#8A9A93]">
                Precio base
                <input
                  value={form.price}
                  onChange={(event) => setForm((prev) => ({ ...prev, price: event.target.value }))}
                  className="mt-2 w-full border border-white/10 bg-[#0B0F14] px-3 py-2 text-[14px] text-[#F4F1E8] outline-none focus:border-[#FFC94A]"
                />
              </label>

              <label className="text-[12px] uppercase tracking-[0.08em] text-[#8A9A93]">
                Estado
                <select
                  value={form.status}
                  onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
                  className="mt-2 w-full border border-white/10 bg-[#0B0F14] px-3 py-2 text-[14px] text-[#F4F1E8] outline-none focus:border-[#FFC94A]"
                >
                  <option value="Publicada">Publicada</option>
                  <option value="Borrador">Borrador</option>
                </select>
              </label>
            </div>
          </div>

          <div className="rounded-[5px] border border-white/10 bg-[#111820] p-6">
            <h2 className="mb-4 text-[16px] font-semibold text-[#F4F1E8]">Subir fotos</h2>

            <label className="block cursor-pointer border border-dashed border-[#FFC94A]/60 bg-[#0B0F14] p-4 text-center text-[12px] uppercase tracking-[0.08em] text-[#FFC94A]">
              <input type="file" multiple accept="image/*" className="hidden" onChange={handleFiles} />
              Elegir imágenes
            </label>

            <div className="mt-4 flex flex-wrap gap-2">
              {selectedFiles.length ? (
                selectedFiles.map((file) => (
                  <span key={file.name} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-[#F4F1E8]">
                    {file.name}
                  </span>
                ))
              ) : (
                <span className="text-[12px] text-[#8A9A93]">Todavía no seleccionaste ninguna imagen.</span>
              )}
            </div>

            <button
              type="button"
              disabled={isUploading}
              onClick={handleUpload}
              className="mt-5 w-full bg-[#FFC94A] px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-[#0B0F14] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isUploading ? "Subiendo..." : "Subir fotos"}
            </button>

            <p className="mt-4 text-[12px] text-[#8A9A93]">{statusMessage}</p>
          </div>
        </div>

        <div className="rounded-[5px] border border-white/10 bg-[#111820] p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <h2 className="text-[16px] font-semibold text-[#F4F1E8]">Últimas galerías</h2>
          </div>

          <div className="overflow-hidden rounded-[3px] border border-white/10">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="border-b border-white/10 px-4 py-3 text-left font-mono text-[10.5px] uppercase tracking-[0.08em] text-[#8A9A93]">Partido</th>
                  <th className="border-b border-white/10 px-4 py-3 text-left font-mono text-[10.5px] uppercase tracking-[0.08em] text-[#8A9A93]">Fotos</th>
                  <th className="border-b border-white/10 px-4 py-3 text-left font-mono text-[10.5px] uppercase tracking-[0.08em] text-[#8A9A93]">Estado</th>
                  <th className="border-b border-white/10 px-4 py-3 text-left font-mono text-[10.5px] uppercase tracking-[0.08em] text-[#8A9A93]">Ventas</th>
                  <th className="border-b border-white/10 px-4 py-3 text-left font-mono text-[10.5px] uppercase tracking-[0.08em] text-[#8A9A93]">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((match) => (
                  <tr key={match.title} className="border-b border-white/10 last:border-b-0">
                    <td className="px-4 py-5">
                      <div className="font-semibold text-[#F4F1E8]">{match.title}</div>
                      <div className="mt-1 text-[12px] text-[#8A9A93]">{match.subtitle}</div>
                    </td>
                    <td className="px-4 py-5 text-[#F4F1E8]">{match.photos}</td>
                    <td className="px-4 py-5">
                      <span className={`rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.05em] ${match.status === "Publicada" ? "border-[#6FCF97]/35 bg-[#6FCF97]/10 text-[#6FCF97]" : "border-white/10 bg-white/5 text-[#8A9A93]"}`}>
                        {match.status}
                      </span>
                    </td>
                    <td className="px-4 py-5 text-[#F4F1E8]">{match.vendas}</td>
                    <td className="px-4 py-5">
                      <div className="flex gap-4 text-[12.5px] text-[#8A9A93]">
                        <a href="/galeria/pelusa-vs-lanus" className="hover:text-[#FFC94A]">Ver</a>
                        <a href="/admin" className="hover:text-[#FFC94A]">Editar</a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {uploads.length > 0 && (
          <div className="mt-8 rounded-[5px] border border-white/10 bg-[#111820] p-6">
            <h2 className="mb-5 text-[16px] font-semibold text-[#F4F1E8]">Vista previa de fotos</h2>
            <div className="grid gap-4 md:grid-cols-3">
              {uploads.map((upload) => (
                <div key={`${upload.name}-${upload.url}`} className="overflow-hidden border border-white/10 bg-[#0B0F14]">
                  <img src={upload.url} alt={upload.name} className="h-36 w-full object-cover" />
                  <div className="space-y-1 p-3">
                    <div className="text-[12px] font-medium text-[#F4F1E8]">{upload.name}</div>
                    <div className="text-[11px] text-[#8A9A93]">{upload.note}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
