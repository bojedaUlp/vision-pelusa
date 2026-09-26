"use client";

import { useEffect, useState } from "react";
import { clearAdminSession, getCurrentAdminProfile, isAdminSessionActive, setAdminSession } from "@/lib/admin-auth";
import { getAdminData } from "@/lib/data-source";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";

type UploadItem = {
  name: string;
  url: string;
  uploaded: boolean;
  note: string;
};

const MAX_UPLOAD_BATCH = 100;

export default function AdminPage() {
  const [stats, setStats] = useState<Array<{ value: string; label: string }>>([]);
  const [matches, setMatches] = useState<Array<{ slug: string; title: string; subtitle: string; photos: number; status: string; vendas: number }>>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Listo para subir fotos del próximo partido.");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [form, setForm] = useState({
    title: "Pelusa vs Lanús",
    subtitle: "Cancha Norte · 16 ago 2026",
    slug: "pelusa-vs-lanus",
    price: "$6.000",
    status: "Publicada",
  });

  const loadAdminData = async () => {
    const data = await getAdminData();
    setStats(data.stats);
    setMatches(data.matches);
  };

  useEffect(() => {
    const verifySession = async () => {
      setIsCheckingAuth(true);

      if (!isSupabaseConfigured()) {
        clearAdminSession();
        setIsAuthenticated(false);
        setIsCheckingAuth(false);
        setLoginError("Configurá las variables de Supabase para habilitar la auth real del admin.");
        return;
      }

      const supabase = getSupabaseClient();
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session) {
        clearAdminSession();
        setIsAuthenticated(false);
        setIsCheckingAuth(false);
        return;
      }

      const profile = await getCurrentAdminProfile();
      if (!profile) {
        await supabase.auth.signOut();
        clearAdminSession();
        setIsAuthenticated(false);
        setIsCheckingAuth(false);
        setLoginError("La cuenta no tiene permisos de administrador.");
        return;
      }

      setAdminSession(profile.userId);
      setIsAuthenticated(true);
      setLoginError("");
      await loadAdminData();
      setIsCheckingAuth(false);
    };

    void verifySession();
  }, []);

  const handleAdminLogin = async () => {
    setLoginError("");

    if (!loginEmail.trim() || !loginPassword.trim()) {
      setLoginError("Ingresá email y contraseña.");
      return;
    }

    if (!isSupabaseConfigured()) {
      setLoginError("Faltan las variables NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY.");
      return;
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: loginEmail.trim().toLowerCase(),
      password: loginPassword,
    });

    if (error || !data.user) {
      setLoginError("Credenciales inválidas o la cuenta no existe.");
      return;
    }

    const profile = await getCurrentAdminProfile();
    if (!profile) {
      await supabase.auth.signOut();
      clearAdminSession();
      setLoginError("Esta cuenta no tiene permisos de administrador.");
      return;
    }

    setAdminSession(profile.userId);
    setIsAuthenticated(true);
    setLoginEmail("");
    setLoginPassword("");
    await loadAdminData();
  };

  const handleLogout = async () => {
    if (isSupabaseConfigured()) {
      await getSupabaseClient().auth.signOut();
    }

    clearAdminSession();
    setIsAuthenticated(false);
    setLoginEmail("");
    setLoginPassword("");
    setLoginError("");
  };

  const parsePriceValue = (value: string) => {
    const digits = Number(String(value).replace(/[^\d]/g, ""));
    return Number.isFinite(digits) && digits > 0 ? digits : 1500;
  };

  const handleFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length > MAX_UPLOAD_BATCH) {
      setStatusMessage(`Máximo ${MAX_UPLOAD_BATCH} fotos por lote. Se tomaron las primeras ${MAX_UPLOAD_BATCH}.`);
      setSelectedFiles(files.slice(0, MAX_UPLOAD_BATCH));
      return;
    }

    setSelectedFiles(files);
  };

  const handleUpload = async () => {
    if (!selectedFiles.length) {
      setStatusMessage("Debés seleccionar al menos una foto primero.");
      return;
    }

    const filesToUpload = selectedFiles.slice(0, MAX_UPLOAD_BATCH);
    setIsUploading(true);
    setStatusMessage(`Subiendo ${filesToUpload.length} imagen${filesToUpload.length > 1 ? "es" : ""}...`);

    const supabase = isSupabaseConfigured() ? getSupabaseClient() : null;
    const nextUploads: UploadItem[] = [];
    const failedFiles: string[] = [];
    let successfulCount = 0;

    try {
      if (supabase) {
        const slug = (form.slug ?? "").trim() || `album-${Date.now()}`;
        const title = (form.title ?? "").trim() || "Nuevo partido";
        const subtitle = (form.subtitle ?? "").trim() || "Galería nueva";
        const venue = subtitle.includes("·") ? subtitle.split("·")[0].trim() : "Cancha Norte";
        const playedAt = new Date().toISOString();
        const status = form.status === "Publicada" ? "published" : "draft";

        const { data: matchData, error: matchError } = await supabase
          .from("matches")
          .upsert(
            {
              slug,
              title,
              subtitle,
              venue,
              played_at: playedAt,
              status,
              cover_url: "",
            },
            { onConflict: "slug" },
          )
          .select()
          .single();

        if (matchError || !matchData) {
          throw new Error(matchError?.message ?? "No se pudo crear o actualizar la galería.");
        }

        for (const [index, file] of filesToUpload.entries()) {
          const fileName = `${Date.now()}-${index}-${file.name.replace(/\s+/g, "-")}`;
          const storagePath = `${slug}/${fileName}`;

          try {
            const { data, error } = await supabase.storage.from("photos").upload(storagePath, file, { upsert: true });

            if (error || !data) {
              throw new Error(error?.message ?? "No se pudo subir el archivo al storage.");
            }

            const { data: publicData } = supabase.storage.from("photos").getPublicUrl(data.path);
            const imageUrl = publicData.publicUrl || URL.createObjectURL(file);
            const watermarkUrl = `${imageUrl}${imageUrl.includes("?") ? "&" : "?"}watermark=vision-pelusa`;

            const { error: insertError } = await supabase.from("photos").insert([
              {
                match_id: matchData.id,
                title: file.name,
                sort_order: index,
                price: parsePriceValue(form.price),
                image_url: imageUrl,
                watermark_url: watermarkUrl,
                is_published: true,
              },
            ]);

            if (insertError) {
              await supabase.storage.from("photos").remove([data.path]).catch(() => undefined);
              throw new Error(insertError.message ?? "No se pudo registrar la foto en la base de datos.");
            }

            nextUploads.push({
              name: file.name,
              url: imageUrl,
              uploaded: true,
              note: "Subida a Supabase",
            });
            successfulCount += 1;
          } catch (error) {
            const fileError = error instanceof Error ? error.message : "Error desconocido";
            failedFiles.push(`${file.name} (${fileError})`);
            nextUploads.push({
              name: file.name,
              url: URL.createObjectURL(file),
              uploaded: false,
              note: fileError,
            });
          }
        }
      } else {
        for (const file of filesToUpload) {
          failedFiles.push(file.name);
          nextUploads.push({
            name: file.name,
            url: URL.createObjectURL(file),
            uploaded: false,
            note: "Supabase no configurado",
          });
        }
      }
    } catch (error) {
      const fatalMessage = error instanceof Error ? error.message : "Error desconocido";
      console.error("upload failed", error);
      for (const file of filesToUpload) {
        failedFiles.push(`${file.name} (${fatalMessage})`);
        nextUploads.push({
          name: file.name,
          url: URL.createObjectURL(file),
          uploaded: false,
          note: fatalMessage,
        });
      }
    }

    setUploads((prev) => [...nextUploads, ...prev]);
    setSelectedFiles([]);
    setStatusMessage(
      failedFiles.length > 0
        ? `Se subieron ${successfulCount} de ${filesToUpload.length} fotos. Fallaron: ${failedFiles.join(", ")}.`
        : `Se cargaron ${successfulCount} imagen${successfulCount !== 1 ? "es" : ""} correctamente.`,
    );
    setIsUploading(false);
  };

  if (isCheckingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B0F14] px-6 py-12 text-[#F4F1E8]">
        <div className="w-full max-w-[420px] rounded-[8px] border border-white/10 bg-[#111820] p-8 text-center">
          <p className="text-[14px] uppercase tracking-[0.08em] text-[#FFC94A]">Verificando acceso</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B0F14] px-6 py-12 text-[#F4F1E8]">
        <div className="w-full max-w-[420px] rounded-[8px] border border-white/10 bg-[#111820] p-8">
          <div className="mb-6 text-center">
            <div className="mb-3 inline-flex rounded-full border border-[#FFC94A]/60 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.08em] text-[#FFC94A]">
              Área privada
            </div>
            <h1 className="text-[28px] font-semibold text-[#F4F1E8]">Acceso administrador</h1>
          </div>

          <label className="block text-[12px] uppercase tracking-[0.08em] text-[#8A9A93]">
            Email
            <input
              type="email"
              value={loginEmail}
              onChange={(event) => setLoginEmail(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void handleAdminLogin();
                }
              }}
              className="mt-2 w-full border border-white/10 bg-[#0B0F14] px-3 py-2 text-[14px] text-[#F4F1E8] outline-none focus:border-[#FFC94A]"
              placeholder="admin@tu-dominio.com"
            />
          </label>

          <label className="mt-5 block text-[12px] uppercase tracking-[0.08em] text-[#8A9A93]">
            Contraseña
            <input
              type="password"
              value={loginPassword}
              onChange={(event) => setLoginPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void handleAdminLogin();
                }
              }}
              className="mt-2 w-full border border-white/10 bg-[#0B0F14] px-3 py-2 text-[14px] text-[#F4F1E8] outline-none focus:border-[#FFC94A]"
              placeholder="Ingresá tu contraseña"
            />
          </label>

          {loginError ? (
            <p className="mt-4 text-[12px] text-[#fca5a5]">{loginError}</p>
          ) : null}

          <button
            type="button"
            onClick={() => void handleAdminLogin()}
            className="mt-6 w-full bg-[#FFC94A] px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-[#0B0F14]"
          >
            Entrar
          </button>

          <p className="mt-4 text-center text-[11px] text-[#8A9A93]">
            Iniciá sesión con la cuenta de Supabase con perfil de administrador.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0F14] text-[#F4F1E8]">
      <header className="border-b border-white/10 bg-[#0B0F14]/90 backdrop-blur-md">
        <div className="section-shell flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <img src="/logo-vision-pelusa.svg" alt="Visión Pelusa" className="logo-mark" />
            <span className="text-[14px] font-semibold tracking-[0.08em] text-[#F4F1E8]">Visión Pelusa</span>
            <span className="rounded-full border border-[#FFC94A]/60 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.08em] text-[#FFC94A]">
              ADMIN
            </span>
          </div>

          <div className="flex items-center gap-6 text-[13px] text-[#8A9A93]">
            <a href="/" className="transition-colors hover:text-[#F4F1E8]">Ver sitio público ↗</a>
            <button type="button" onClick={() => void handleLogout()} className="transition-colors hover:text-[#F4F1E8]">
              Cerrar sesión
            </button>
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
                        <a href={match.slug ? `/galeria/${match.slug}` : "/galeria"} className="hover:text-[#FFC94A]">Ver</a>
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
