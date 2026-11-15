"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clearAdminSession, getCurrentAdminProfile, isAdminSessionActive, setAdminSession } from "@/lib/admin-auth";
import { getAdminData } from "@/lib/data-source";
import { protectedImageUrl } from "@/lib/protected-images";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";
import { createHeroVariant, createProtectedVariants } from "@/lib/watermark";
import { adminApi, adminFetchBlob, adminUpload, AlbumPhotosPanel, DeletionModal, StorageIndicator, type DeletionPlan } from "./photo-cleanup";

type UploadItem = {
  name: string;
  url: string;
  uploaded: boolean;
  note: string;
};

const MAX_UPLOAD_BATCH = 100;

class StorageFullError extends Error {}

// One photo → R2 through the admin API: the watermarked PREVIEW + THUMBNAIL are generated here
// (watermark baked into the pixels), the space is reserved server-side before sending anything,
// and the photo is only published after the server verified the three files. Any failure
// releases the reservation and removes what was already sent.
async function uploadPhoto(file: File, albumId: string, sortOrder: number, price: number) {
  const { preview, thumbnail } = await createProtectedVariants(file);
  let photoId: string;
  try {
    ({ photoId } = await adminApi<{ photoId: string }>("/api/admin/uploads", {
      albumId,
      title: file.name,
      sortOrder,
      price,
      originalBytes: file.size,
      previewBytes: preview.size,
      thumbBytes: thumbnail.size,
    }));
  } catch (error) {
    if (error instanceof Error && error.message.includes("límite de almacenamiento")) throw new StorageFullError(error.message);
    throw error;
  }

  try {
    await adminUpload(`/api/admin/uploads/${photoId}/original`, file, file.type || "image/jpeg");
    await adminUpload(`/api/admin/uploads/${photoId}/preview`, preview, "image/jpeg");
    await adminUpload(`/api/admin/uploads/${photoId}/thumb`, thumbnail, "image/jpeg");
    const done = await adminApi<{ thumbnailUrl: string }>(`/api/admin/uploads/${photoId}/complete`, {});
    return done.thumbnailUrl;
  } catch (error) {
    await adminApi(`/api/admin/uploads/${photoId}/abort`, {}).catch(() => undefined);
    throw error;
  }
}

// No default gallery: the form starts empty so nothing can be created or targeted implicitly.
const emptyGalleryForm = {
  title: "",
  subtitle: "",
  slug: "",
  price: "$6.000",
  status: "Publicada",
};

export default function AdminPage() {
  const [stats, setStats] = useState<Array<{ value: string; label: string }>>([]);
  const [matches, setMatches] = useState<Array<{ id?: string; slug: string; title: string; subtitle: string; photos: number; status: string; vendas: number }>>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Listo para subir fotos del próximo partido.");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [form, setForm] = useState(emptyGalleryForm);
  // Single source of truth for the gallery being edited and receiving uploads: matches.id (UUID).
  const [selectedGalleryId, setSelectedGalleryId] = useState<string | null>(null);
  const [isSavingGallery, setIsSavingGallery] = useState(false);
  // Home hero of the selected gallery: the admin picks one photo explicitly.
  const [heroPhotos, setHeroPhotos] = useState<Array<{ id: string; title: string; thumbnail_url: string | null }>>([]);
  const [heroPhotoId, setHeroPhotoId] = useState<string | null>(null);
  const [currentHeroUrl, setCurrentHeroUrl] = useState<string | null>(null);
  const [heroUnavailable, setHeroUnavailable] = useState(false);
  const [isGeneratingHero, setIsGeneratingHero] = useState(false);
  const editRequestRef = useRef(0);
  // Photo management / archive / deletion (see ./photo-cleanup.tsx).
  const [photosPanel, setPhotosPanel] = useState<{ id: string; title: string } | null>(null);
  const [photosReloadKey, setPhotosReloadKey] = useState(0);
  const [deletionPlan, setDeletionPlan] = useState<DeletionPlan | null>(null);
  const [selectedAlbums, setSelectedAlbums] = useState<Set<string>>(new Set());
  const [isAlbumBusy, setIsAlbumBusy] = useState(false);
  const [storageReloadKey, setStorageReloadKey] = useState(0);

  // Stable (only state setters and module imports), so the mount effect runs once.
  const loadAdminData = useCallback(async () => {
    const data = await getAdminData();
    setStats(data.stats);
    setMatches(data.matches);
    setStorageReloadKey((key) => key + 1);
  }, []);

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
  }, [loadAdminData]);

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

  const resetHeroPicker = () => {
    setHeroPhotos([]);
    setHeroPhotoId(null);
    setCurrentHeroUrl(null);
    setHeroUnavailable(false);
  };

  const handleNewGallery = () => {
    editRequestRef.current += 1;
    resetHeroPicker();
    setSelectedGalleryId(null);
    setForm(emptyGalleryForm);
    setSelectedFiles([]);
    setStatusMessage("Completá los datos y creá la galería antes de subir fotos.");
  };

  const handleEditGallery = async (galleryId: string) => {
    const requestId = ++editRequestRef.current;
    // Clear the previous selection first so no stale UUID can receive uploads while loading.
    setSelectedGalleryId(null);
    resetHeroPicker();
    setForm((prev) => ({ ...emptyGalleryForm, price: prev.price }));
    setSelectedFiles([]);
    setStatusMessage("Cargando galería...");

    const { data, error } = await getSupabaseClient()
      .from("matches")
      .select("id, title, slug, subtitle, status")
      .eq("id", galleryId)
      .single();

    if (requestId !== editRequestRef.current) return; // a newer Editar/Nuevo click won

    if (error || !data) {
      setStatusMessage(`No se pudo cargar la galería: ${error?.message ?? "no encontrada"}`);
      return;
    }

    setSelectedGalleryId(String(data.id));
    setForm((prev) => ({
      ...prev,
      title: data.title ?? "",
      slug: data.slug ?? "",
      subtitle: data.subtitle ?? "",
      status: data.status === "published" ? "Publicada" : data.status === "archived" ? "Archivada" : "Borrador",
    }));
    setStatusMessage(`Editando "${data.title}". Las fotos se subirán a esta galería.`);

    // Hero picker data: the gallery's watermarked thumbnails and its current hero.
    const supabase = getSupabaseClient();
    const [photosResult, heroResult] = await Promise.all([
      supabase
        .from("photos")
        .select("id, title, thumbnail_url")
        .eq("match_id", galleryId)
        .eq("is_published", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(500),
      supabase.from("matches").select("hero_url").eq("id", galleryId).single(),
    ]);

    if (requestId !== editRequestRef.current) return;

    setHeroPhotos((photosResult.data ?? []) as Array<{ id: string; title: string; thumbnail_url: string | null }>);
    if (heroResult.error) {
      // hero_url column missing → migration 20261004_gallery_hero.sql not applied yet.
      setHeroUnavailable(true);
    } else {
      setCurrentHeroUrl(protectedImageUrl(heroResult.data?.hero_url) ?? null);
    }
  };

  // HERO for the Home: generated in the browser from the original of the photo the admin picked
  // (read through the admin API), uploaded to the public media bucket by the server, which also
  // removes the previous hero file of this gallery.
  const handleGenerateHero = async () => {
    const galleryId = selectedGalleryId;
    const photoId = heroPhotoId;
    if (!galleryId || !photoId) {
      setStatusMessage("Elegí la foto que querés usar en la Home.");
      return;
    }

    setIsGeneratingHero(true);
    setStatusMessage("Generando imagen para la Home...");
    try {
      const original = await adminFetchBlob(`/api/admin/photos/${photoId}/original`);
      const hero = await createHeroVariant(original);
      const { heroUrl } = await adminUpload<{ heroUrl: string }>(`/api/admin/albums/${galleryId}/hero`, hero, "image/jpeg");
      setCurrentHeroUrl(heroUrl);
      setStatusMessage("Imagen para la Home actualizada.");
      setStorageReloadKey((key) => key + 1);
    } catch (error) {
      setStatusMessage(`No se pudo generar la imagen para la Home: ${error instanceof Error ? error.message : "error desconocido"}`);
    } finally {
      setIsGeneratingHero(false);
    }
  };

  const handleSaveGallery = async () => {
    const title = form.title.trim();
    const slug = form.slug.trim();
    const subtitle = form.subtitle.trim();

    if (!title || !slug) {
      setStatusMessage("Completá el título y el slug de la galería.");
      return;
    }

    const venue = subtitle.includes("·") ? subtitle.split("·")[0].trim() : "Cancha Norte";
    const status = form.status === "Publicada" ? "published" : form.status === "Archivada" ? "archived" : "draft";
    const supabase = getSupabaseClient();
    const editingId = selectedGalleryId;

    setIsSavingGallery(true);
    try {
      // Editar → UPDATE by matches.id. Nueva → INSERT (never upsert by slug, which silently
      // reused whatever gallery already owned that slug).
      const { data, error } = editingId
        ? await supabase
            .from("matches")
            .update({ title, slug, subtitle, venue, status })
            .eq("id", editingId)
            .select("id, title")
            .single()
        : await supabase
            .from("matches")
            .insert({ title, slug, subtitle, venue, status, played_at: new Date().toISOString(), cover_url: "" })
            .select("id, title")
            .single();

      if (error || !data) {
        throw new Error(error?.message ?? "Supabase no devolvió la galería.");
      }

      editRequestRef.current += 1;
      setSelectedGalleryId(String(data.id));
      setStatusMessage(
        editingId
          ? `Cambios guardados en "${data.title}".`
          : `Galería "${data.title}" creada. Ya podés subir fotos.`,
      );
      await loadAdminData();
    } catch (error) {
      setStatusMessage(`No se pudo guardar la galería: ${error instanceof Error ? error.message : "error desconocido"}`);
    } finally {
      setIsSavingGallery(false);
    }
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
    // Captured once: every photo of this batch goes to the gallery selected when the upload started.
    const galleryId = selectedGalleryId;
    if (!galleryId) {
      setStatusMessage("Seleccioná o creá una galería antes de subir fotos.");
      return;
    }

    if (!selectedFiles.length) {
      setStatusMessage("Debés seleccionar al menos una foto primero.");
      return;
    }

    const filesToUpload = selectedFiles.slice(0, MAX_UPLOAD_BATCH);
    const price = parsePriceValue(form.price);
    setIsUploading(true);

    const nextUploads: UploadItem[] = [];
    const failedFiles: string[] = [];
    let successfulCount = 0;
    let stoppedForSpace = false;

    for (const [index, file] of filesToUpload.entries()) {
      setStatusMessage(`Subiendo ${index + 1} de ${filesToUpload.length}: ${file.name}...`);
      try {
        const thumbnailUrl = await uploadPhoto(file, galleryId, index, price);
        nextUploads.push({ name: file.name, url: thumbnailUrl, uploaded: true, note: "Subida con preview protegida" });
        successfulCount += 1;
      } catch (error) {
        const fileError = error instanceof Error ? error.message : "Error desconocido";
        failedFiles.push(`${file.name} (${fileError})`);
        nextUploads.push({ name: file.name, url: URL.createObjectURL(file), uploaded: false, note: fileError });
        if (error instanceof StorageFullError) {
          stoppedForSpace = true;
          break;
        }
      }
    }

    setUploads((prev) => [...nextUploads, ...prev]);
    setSelectedFiles([]);
    void loadAdminData();
    setStatusMessage(
      stoppedForSpace
        ? `Se subieron ${successfulCount} fotos. Se detuvo la carga: no hay espacio disponible. Eliminá un álbum anterior para liberar almacenamiento.`
        : failedFiles.length > 0
          ? `Se subieron ${successfulCount} de ${filesToUpload.length} fotos. Fallaron: ${failedFiles.join(", ")}.`
          : `Se cargaron ${successfulCount} ${successfulCount === 1 ? "imagen" : "imágenes"} correctamente.`,
    );
    setIsUploading(false);
  };

  // Archive / restore one or several albums through the server API (validated there).
  const handleAlbumsArchive = async (albumIds: string[], archived: boolean) => {
    if (!albumIds.length) return;
    setIsAlbumBusy(true);
    const failures: string[] = [];
    for (const albumId of albumIds) {
      try {
        await adminApi(`/api/admin/albums/${albumId}`, { action: archived ? "archive" : "restore" });
      } catch (error) {
        const title = matches.find((match) => match.id === albumId)?.title ?? albumId;
        failures.push(`${title} (${error instanceof Error ? error.message : "error"})`);
      }
    }
    const done = albumIds.length - failures.length;
    setStatusMessage(
      `${archived ? "Archivadas" : "Restauradas como borrador"}: ${done} galería${done === 1 ? "" : "s"}.` +
        (failures.length ? ` Fallaron: ${failures.join(", ")}.` : ""),
    );
    setSelectedAlbums(new Set());
    setIsAlbumBusy(false);
    await loadAdminData();
  };

  const handleDeletionClosed = async (changed: boolean) => {
    const plan = deletionPlan;
    setDeletionPlan(null);
    if (!changed) return;
    setSelectedAlbums(new Set());
    if (plan?.kind === "albums" && photosPanel && plan.albumIds.includes(photosPanel.id)) {
      setPhotosPanel(null);
    } else {
      setPhotosReloadKey((key) => key + 1);
    }
    await loadAdminData();
  };

  const toggleAlbum = (albumId: string) =>
    setSelectedAlbums((current) => {
      const next = new Set(current);
      if (next.has(albumId)) next.delete(albumId);
      else next.add(albumId);
      return next;
    });

  const albumIsBusy = isUploading || isSavingGallery || isGeneratingHero || isAlbumBusy;

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
          <button type="button" onClick={handleNewGallery} disabled={isUploading || isSavingGallery || isGeneratingHero} className="bg-[#FFC94A] px-5 py-3 text-[13px] font-semibold uppercase tracking-[0.04em] text-[#0B0F14] disabled:cursor-not-allowed disabled:opacity-60">
            + Nuevo partido
          </button>
        </div>

        <StorageIndicator reloadKey={storageReloadKey} />

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
              <h2 className="text-[16px] font-semibold text-[#F4F1E8]">{selectedGalleryId ? "Editar galería" : "Crear nueva galería"}</h2>
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
                  {selectedGalleryId ? <option value="Archivada">Archivada</option> : null}
                </select>
              </label>
            </div>

            <button
              type="button"
              disabled={isSavingGallery || isUploading}
              onClick={() => void handleSaveGallery()}
              className="mt-5 border border-[#FFC94A]/60 px-4 py-2.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-[#FFC94A] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSavingGallery ? "Guardando..." : selectedGalleryId ? "Guardar cambios" : "Crear galería"}
            </button>

            {selectedGalleryId ? (
              <div className="mt-6 border-t border-white/10 pt-5">
                <h3 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[#F4F1E8]">Imagen para la Home</h3>
                {heroUnavailable ? (
                  <p className="mt-2 text-[12px] text-[#fca5a5]">Aplicá la migración 20261004_gallery_hero.sql para usar esta opción.</p>
                ) : (
                  <>
                    <p className="mt-2 text-[12px] text-[#8A9A93]">
                      Elegí una foto promocional. Se publica a 1920 px con una marca discreta: no elijas una foto que quieras vender.
                    </p>
                    {currentHeroUrl ? (
                      <div
                        role="img"
                        aria-label="Imagen actual de la Home"
                        className="mt-3 h-24 w-40 border border-white/10 bg-cover bg-center"
                        style={{ backgroundImage: `url(${currentHeroUrl})` }}
                      />
                    ) : (
                      <p className="mt-3 text-[12px] text-[#F6D36F]">Esta galería todavía no tiene imagen para la Home.</p>
                    )}
                    {heroPhotos.length ? (
                      <div className="mt-3 grid max-h-56 grid-cols-4 gap-2 overflow-y-auto pr-1 sm:grid-cols-6">
                        {heroPhotos.map((photo, index) => (
                          <button
                            key={photo.id}
                            type="button"
                            onClick={() => setHeroPhotoId(photo.id)}
                            aria-pressed={heroPhotoId === photo.id}
                            title={`Foto ${index + 1} · ${photo.title}`}
                            className={`relative aspect-[4/3] overflow-hidden border-2 bg-[#0B0F14] ${heroPhotoId === photo.id ? "border-[#FFC94A]" : "border-transparent"}`}
                          >
                            {photo.thumbnail_url ? (
                              <span className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${photo.thumbnail_url})` }} />
                            ) : null}
                            <span className="absolute left-1 top-1 bg-[#0B0F14]/70 px-1 font-mono text-[9px] text-[#F4F1E8]">{index + 1}</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 text-[12px] text-[#8A9A93]">Subí fotos a esta galería para elegir la imagen de la Home.</p>
                    )}
                    <button
                      type="button"
                      disabled={!heroPhotoId || isGeneratingHero || isUploading || isSavingGallery}
                      onClick={() => void handleGenerateHero()}
                      className="mt-4 border border-[#FFC94A]/60 px-4 py-2.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-[#FFC94A] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isGeneratingHero ? "Generando..." : "Generar imagen para la Home"}
                    </button>
                  </>
                )}
              </div>
            ) : null}
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

            <p className="mt-4 text-[12px] text-[#8A9A93]">
              {selectedGalleryId
                ? `Destino: ${form.title || "galería seleccionada"}`
                : "Seleccioná o creá una galería antes de subir fotos."}
            </p>

            <button
              type="button"
              disabled={isUploading || !selectedGalleryId}
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
            {selectedAlbums.size ? (
              <div className="flex flex-wrap items-center gap-4 text-[12.5px] text-[#8A9A93]">
                <span>{selectedAlbums.size} seleccionada{selectedAlbums.size === 1 ? "" : "s"}</span>
                <button
                  type="button"
                  disabled={albumIsBusy}
                  onClick={() => void handleAlbumsArchive(Array.from(selectedAlbums), true)}
                  className="hover:text-[#FFC94A] disabled:opacity-60"
                >
                  Archivar
                </button>
                <button
                  type="button"
                  disabled={albumIsBusy}
                  onClick={() =>
                    setDeletionPlan({
                      kind: "albums",
                      albumIds: Array.from(selectedAlbums),
                      label: `${selectedAlbums.size} galería${selectedAlbums.size === 1 ? "" : "s"}`,
                    })
                  }
                  className="text-[#F2994A] hover:text-[#EB5757] disabled:opacity-60"
                >
                  Eliminar
                </button>
                <button type="button" onClick={() => setSelectedAlbums(new Set())} className="hover:text-[#F4F1E8]">
                  Quitar selección
                </button>
              </div>
            ) : null}
          </div>

          <div className="overflow-x-auto rounded-[3px] border border-white/10">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr>
                  <th className="w-10 border-b border-white/10 px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      aria-label="Seleccionar todas las galerías"
                      checked={matches.length > 0 && matches.every((match) => match.id && selectedAlbums.has(match.id))}
                      onChange={(event) =>
                        setSelectedAlbums(
                          event.target.checked ? new Set(matches.flatMap((match) => (match.id ? [match.id] : []))) : new Set(),
                        )
                      }
                    />
                  </th>
                  <th className="border-b border-white/10 px-4 py-3 text-left font-mono text-[10.5px] uppercase tracking-[0.08em] text-[#8A9A93]">Partido</th>
                  <th className="border-b border-white/10 px-4 py-3 text-left font-mono text-[10.5px] uppercase tracking-[0.08em] text-[#8A9A93]">Fotos</th>
                  <th className="border-b border-white/10 px-4 py-3 text-left font-mono text-[10.5px] uppercase tracking-[0.08em] text-[#8A9A93]">Estado</th>
                  <th className="border-b border-white/10 px-4 py-3 text-left font-mono text-[10.5px] uppercase tracking-[0.08em] text-[#8A9A93]">Ventas</th>
                  <th className="border-b border-white/10 px-4 py-3 text-left font-mono text-[10.5px] uppercase tracking-[0.08em] text-[#8A9A93]">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((match) => (
                  <tr key={match.id ?? match.slug} className="border-b border-white/10 last:border-b-0">
                    <td className="px-4 py-5">
                      {match.id ? (
                        <input
                          type="checkbox"
                          aria-label={`Seleccionar ${match.title}`}
                          checked={selectedAlbums.has(match.id)}
                          onChange={() => toggleAlbum(match.id as string)}
                        />
                      ) : null}
                    </td>
                    <td className="px-4 py-5">
                      <div className="font-semibold text-[#F4F1E8]">{match.title}</div>
                      <div className="mt-1 text-[12px] text-[#8A9A93]">{match.subtitle}</div>
                    </td>
                    <td className="px-4 py-5 text-[#F4F1E8]">{match.photos}</td>
                    <td className="px-4 py-5">
                      <span className={`rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.05em] ${match.status === "Publicada" ? "border-[#6FCF97]/35 bg-[#6FCF97]/10 text-[#6FCF97]" : match.status === "Archivada" ? "border-[#FFC94A]/40 bg-[#FFC94A]/10 text-[#F6D36F]" : "border-white/10 bg-white/5 text-[#8A9A93]"}`}>
                        {match.status}
                      </span>
                    </td>
                    <td className="px-4 py-5 text-[#F4F1E8]">{match.vendas}</td>
                    <td className="px-4 py-5">
                      <div className="flex flex-wrap gap-x-4 gap-y-2 text-[12.5px] text-[#8A9A93]">
                        <a href={match.slug ? `/galeria/${match.slug}` : "/galeria"} className="hover:text-[#FFC94A]">Ver</a>
                        <button
                          type="button"
                          disabled={!match.id || albumIsBusy}
                          onClick={() => match.id && void handleEditGallery(match.id)}
                          className="hover:text-[#FFC94A] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          disabled={!match.id}
                          onClick={() => match.id && setPhotosPanel({ id: match.id, title: match.title })}
                          className="hover:text-[#FFC94A] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Fotos
                        </button>
                        <button
                          type="button"
                          disabled={!match.id || albumIsBusy}
                          onClick={() => match.id && void handleAlbumsArchive([match.id], match.status !== "Archivada")}
                          className="hover:text-[#FFC94A] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {match.status === "Archivada" ? "Restaurar" : "Archivar"}
                        </button>
                        <button
                          type="button"
                          disabled={!match.id || albumIsBusy}
                          onClick={() => match.id && setDeletionPlan({ kind: "albums", albumIds: [match.id], label: `“${match.title}”` })}
                          className="text-[#F2994A] hover:text-[#EB5757] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {photosPanel ? (
          <AlbumPhotosPanel
            key={photosPanel.id}
            albumId={photosPanel.id}
            albumTitle={photosPanel.title}
            reloadKey={photosReloadKey}
            onClose={() => setPhotosPanel(null)}
            onDelete={setDeletionPlan}
          />
        ) : null}

        {deletionPlan ? <DeletionModal plan={deletionPlan} onClose={(changed) => void handleDeletionClosed(changed)} /> : null}

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
