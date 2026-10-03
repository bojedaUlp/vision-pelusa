"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clearAdminSession, getCurrentAdminProfile, isAdminSessionActive, setAdminSession } from "@/lib/admin-auth";
import { getAdminData } from "@/lib/data-source";
import { ORIGINALS_BUCKET, PREVIEWS_BUCKET, protectedImageUrl, storagePathInBucket } from "@/lib/protected-images";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";
import { createHeroVariant, createProtectedVariants } from "@/lib/watermark";

type UploadItem = {
  name: string;
  url: string;
  uploaded: boolean;
  note: string;
};

const MAX_UPLOAD_BATCH = 100;

type SupabaseClient = ReturnType<typeof getSupabaseClient>;

// Uploads the watermarked PREVIEW + THUMBNAIL to the public "previews" bucket.
// If anything fails, removes what it uploaded and throws.
async function uploadProtectedVariants(supabase: SupabaseClient, source: Blob, keyBase: string) {
  const { preview, thumbnail } = await createProtectedVariants(source);
  const bucket = supabase.storage.from(PREVIEWS_BUCKET);
  const uploaded: string[] = [];
  try {
    const urls: string[] = [];
    for (const [suffix, blob] of [["preview", preview], ["thumb", thumbnail]] as const) {
      const path = `${keyBase}-${suffix}.jpg`;
      const { data, error } = await bucket.upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
      if (error || !data) throw new Error(error?.message ?? "No se pudo subir la imagen protegida.");
      uploaded.push(data.path);
      urls.push(bucket.getPublicUrl(data.path).data.publicUrl);
    }
    return { previewUrl: urls[0], thumbnailUrl: urls[1], paths: uploaded };
  } catch (error) {
    if (uploaded.length) await bucket.remove(uploaded).catch(() => undefined);
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
  // Photos without a protected thumbnail (uploaded before the watermark pipeline). null = unknown.
  const [pendingPreviews, setPendingPreviews] = useState<number | null>(null);
  const [isGeneratingPreviews, setIsGeneratingPreviews] = useState(false);
  // Home hero of the selected gallery: the admin picks one photo explicitly.
  const [heroPhotos, setHeroPhotos] = useState<Array<{ id: string; title: string; thumbnail_url: string | null }>>([]);
  const [heroPhotoId, setHeroPhotoId] = useState<string | null>(null);
  const [currentHeroUrl, setCurrentHeroUrl] = useState<string | null>(null);
  const [heroUnavailable, setHeroUnavailable] = useState(false);
  const [isGeneratingHero, setIsGeneratingHero] = useState(false);
  const editRequestRef = useRef(0);

  // Stable (only state setters and module imports), so the mount effect runs once.
  const loadPendingPreviews = useCallback(async () => {
    const { count, error } = await getSupabaseClient()
      .from("photos")
      .select("id", { count: "exact", head: true })
      .is("thumbnail_url", null);
    setPendingPreviews(error ? null : count ?? 0);
  }, []);

  const loadAdminData = useCallback(async () => {
    const data = await getAdminData();
    setStats(data.stats);
    setMatches(data.matches);
    await loadPendingPreviews();
  }, [loadPendingPreviews]);

  // One-time backfill for photos uploaded before the watermark pipeline. The original is read with
  // the admin session (works with the "photos" bucket public or private) and only the watermarked
  // variants are published. Originals are not moved or deleted.
  const handleGenerateMissingPreviews = async () => {
    const supabase = getSupabaseClient();
    setIsGeneratingPreviews(true);
    setStatusMessage("Buscando fotos sin preview protegida...");

    const { data: pending, error } = await supabase
      .from("photos")
      .select("id, match_id, image_url")
      .is("thumbnail_url", null)
      .order("created_at", { ascending: true })
      .limit(1000);

    if (error) {
      setStatusMessage(`No se pudo consultar las fotos: ${error.message}`);
      setIsGeneratingPreviews(false);
      return;
    }

    const rows = (pending ?? []) as Array<{ id: string; match_id: string; image_url: string | null }>;
    const failed: string[] = [];
    let done = 0;

    for (const [index, photo] of rows.entries()) {
      setStatusMessage(`Generando previews protegidas: ${index + 1} de ${rows.length}...`);
      let uploadedPaths: string[] = [];
      try {
        if (!photo.image_url) throw new Error("sin image_url");

        let source: Blob | null = null;
        const originalPath = storagePathInBucket(photo.image_url, ORIGINALS_BUCKET);
        if (originalPath) {
          const { data } = await supabase.storage.from(ORIGINALS_BUCKET).download(originalPath);
          source = data ?? null;
        }
        if (!source) {
          const response = await fetch(photo.image_url);
          if (!response.ok) throw new Error(`no se pudo leer el original (${response.status})`);
          source = await response.blob();
        }

        const variants = await uploadProtectedVariants(supabase, source, `${photo.match_id}/${photo.id}-${Date.now()}`);
        uploadedPaths = variants.paths;

        const { data: updated, error: updateError } = await supabase
          .from("photos")
          .update({ watermark_url: variants.previewUrl, thumbnail_url: variants.thumbnailUrl })
          .eq("id", photo.id)
          .select("id");

        if (updateError || !updated?.length) {
          throw new Error(updateError?.message ?? "la base no permitió actualizar la foto");
        }
        done += 1;
      } catch (error) {
        if (uploadedPaths.length) {
          await supabase.storage.from(PREVIEWS_BUCKET).remove(uploadedPaths).catch(() => undefined);
        }
        failed.push(`${photo.id} (${error instanceof Error ? error.message : "error"})`);
      }
    }

    setStatusMessage(
      failed.length
        ? `Previews generadas: ${done} de ${rows.length}. Fallaron: ${failed.join(", ")}.`
        : `Previews protegidas generadas para ${done} foto${done === 1 ? "" : "s"}.`,
    );
    setIsGeneratingPreviews(false);
    await loadPendingPreviews();
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
      status: data.status === "published" ? "Publicada" : "Borrador",
    }));
    setStatusMessage(`Editando "${data.title}". Las fotos se subirán a esta galería.`);

    // Hero picker data: the gallery's watermarked thumbnails and its current hero.
    const supabase = getSupabaseClient();
    const [photosResult, heroResult] = await Promise.all([
      supabase
        .from("photos")
        .select("id, title, thumbnail_url")
        .eq("match_id", galleryId)
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

  // HERO for the Home: generated from the original of the photo the admin picked, uploaded to
  // "previews", saved in matches.hero_url. The previous hero file of this gallery is removed only
  // after the new one is saved.
  const handleGenerateHero = async () => {
    const galleryId = selectedGalleryId;
    const photoId = heroPhotoId;
    if (!galleryId || !photoId) {
      setStatusMessage("Elegí la foto que querés usar en la Home.");
      return;
    }

    const supabase = getSupabaseClient();
    const previews = supabase.storage.from(PREVIEWS_BUCKET);
    setIsGeneratingHero(true);
    setStatusMessage("Generando imagen para la Home...");
    let newPath: string | null = null;

    try {
      const [{ data: photo, error: photoError }, { data: gallery, error: galleryError }] = await Promise.all([
        supabase.from("photos").select("id, match_id, image_url").eq("id", photoId).eq("match_id", galleryId).single(),
        supabase.from("matches").select("hero_url").eq("id", galleryId).single(),
      ]);
      if (photoError || !photo?.image_url) throw new Error(photoError?.message ?? "la foto no pertenece a esta galería");
      if (galleryError) throw new Error(galleryError.message);
      const previousHeroUrl: string | null = gallery?.hero_url ?? null;

      // Original read with the admin session (bucket "photos" is private).
      const originalPath = storagePathInBucket(photo.image_url, ORIGINALS_BUCKET);
      if (!originalPath) throw new Error("la foto no tiene un original en el bucket privado");
      const { data: original, error: downloadError } = await supabase.storage.from(ORIGINALS_BUCKET).download(originalPath);
      if (downloadError || !original) throw new Error(downloadError?.message ?? "no se pudo leer el original");

      const hero = await createHeroVariant(original);
      const { data: uploaded, error: uploadError } = await previews.upload(`${galleryId}/hero-${Date.now()}.jpg`, hero, {
        contentType: "image/jpeg",
        cacheControl: "31536000",
        upsert: false,
      });
      if (uploadError || !uploaded) throw new Error(uploadError?.message ?? "no se pudo subir la imagen");
      newPath = uploaded.path;
      const heroUrl = previews.getPublicUrl(uploaded.path).data.publicUrl;

      const { data: updated, error: updateError } = await supabase
        .from("matches")
        .update({ hero_url: heroUrl })
        .eq("id", galleryId)
        .select("id");
      if (updateError || !updated?.length) throw new Error(updateError?.message ?? "la base no permitió guardar el hero");
      newPath = null; // saved: keep it

      setCurrentHeroUrl(heroUrl);
      let cleanupNote = "";
      // Remove the previous hero only if it is this gallery's hero file in "previews".
      const previousPath = previousHeroUrl ? storagePathInBucket(previousHeroUrl, PREVIEWS_BUCKET) : null;
      if (previousPath && previousPath !== uploaded.path && previousPath.startsWith(`${galleryId}/hero-`)) {
        const { error: removeError } = await previews.remove([previousPath]);
        if (removeError) cleanupNote = ` (no se pudo borrar el hero anterior: ${removeError.message})`;
      }
      setStatusMessage(`Imagen para la Home actualizada${cleanupNote}.`);
    } catch (error) {
      if (newPath) await previews.remove([newPath]).catch(() => undefined);
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
    const status = form.status === "Publicada" ? "published" : "draft";
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
    setIsUploading(true);
    setStatusMessage(`Subiendo ${filesToUpload.length} imagen${filesToUpload.length > 1 ? "es" : ""}...`);

    const supabase = isSupabaseConfigured() ? getSupabaseClient() : null;
    const nextUploads: UploadItem[] = [];
    const failedFiles: string[] = [];
    let successfulCount = 0;

    try {
      if (supabase) {
        for (const [index, file] of filesToUpload.entries()) {
          const fileName = `${Date.now()}-${index}-${file.name.replace(/\s+/g, "-")}`;
          const storagePath = `${galleryId}/${fileName}`;
          let originalPath: string | null = null;
          let previewPaths: string[] = [];

          try {
            // ORIGINAL → private "photos" bucket.
            const { data, error } = await supabase.storage.from(ORIGINALS_BUCKET).upload(storagePath, file, { upsert: false });

            if (error || !data) {
              throw new Error(error?.message ?? "No se pudo subir el archivo al storage.");
            }
            originalPath = data.path;

            // PREVIEW + THUMBNAIL with the watermark in the pixels → public "previews" bucket.
            const variants = await uploadProtectedVariants(supabase, file, storagePath.replace(/\.[^./]+$/, ""));
            previewPaths = variants.paths;

            // image_url only records where the original lives (used by /api/download, which signs
            // it after validating a purchase). It is not publicly readable once "photos" is private.
            const imageUrl = supabase.storage.from(ORIGINALS_BUCKET).getPublicUrl(data.path).data.publicUrl;

            const { error: insertError } = await supabase.from("photos").insert([
              {
                match_id: galleryId,
                title: file.name,
                sort_order: index,
                price: parsePriceValue(form.price),
                image_url: imageUrl,
                watermark_url: variants.previewUrl,
                thumbnail_url: variants.thumbnailUrl,
                is_published: true,
              },
            ]);

            if (insertError) {
              throw new Error(insertError.message ?? "No se pudo registrar la foto en la base de datos.");
            }

            nextUploads.push({
              name: file.name,
              url: variants.thumbnailUrl,
              uploaded: true,
              note: "Subida con preview protegida",
            });
            successfulCount += 1;
          } catch (error) {
            if (previewPaths.length) {
              await supabase.storage.from(PREVIEWS_BUCKET).remove(previewPaths).catch(() => undefined);
            }
            if (originalPath) {
              await supabase.storage.from(ORIGINALS_BUCKET).remove([originalPath]).catch(() => undefined);
            }
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
    if (successfulCount > 0) {
      void loadAdminData();
    }
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
          <button type="button" onClick={handleNewGallery} disabled={isUploading || isSavingGallery || isGeneratingHero} className="bg-[#FFC94A] px-5 py-3 text-[13px] font-semibold uppercase tracking-[0.04em] text-[#0B0F14] disabled:cursor-not-allowed disabled:opacity-60">
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
              disabled={isUploading || isGeneratingPreviews || !selectedGalleryId}
              onClick={handleUpload}
              className="mt-5 w-full bg-[#FFC94A] px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-[#0B0F14] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isUploading ? "Subiendo..." : "Subir fotos"}
            </button>

            <p className="mt-4 text-[12px] text-[#8A9A93]">{statusMessage}</p>

            {pendingPreviews === null ? (
              <p className="mt-4 border-t border-white/10 pt-4 text-[12px] text-[#fca5a5]">
                No se pudo verificar la protección de imágenes. Aplicá la migración 20261003_protected_previews.sql.
              </p>
            ) : pendingPreviews > 0 ? (
              <div className="mt-4 border-t border-white/10 pt-4">
                <p className="text-[12px] text-[#F6D36F]">
                  {pendingPreviews} foto{pendingPreviews === 1 ? "" : "s"} sin preview protegida.
                </p>
                <button
                  type="button"
                  disabled={isGeneratingPreviews || isUploading}
                  onClick={() => void handleGenerateMissingPreviews()}
                  className="mt-3 w-full border border-[#FFC94A]/60 px-4 py-2.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-[#FFC94A] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isGeneratingPreviews ? "Generando..." : "Generar previews protegidas"}
                </button>
              </div>
            ) : null}
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
                  <tr key={match.id ?? match.slug} className="border-b border-white/10 last:border-b-0">
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
                        <button
                          type="button"
                          disabled={!match.id || isUploading || isSavingGallery || isGeneratingHero}
                          onClick={() => match.id && void handleEditGallery(match.id)}
                          className="hover:text-[#FFC94A] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Editar
                        </button>
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
