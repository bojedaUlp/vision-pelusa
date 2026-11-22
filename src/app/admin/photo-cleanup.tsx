"use client";

// Admin: photo management, album archive and safe deletion. Every operation goes through
// /api/admin/* (validated server-side); the browser only drives batches and shows progress.
import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import { MAX_PHOTOS_PER_BATCH, chunk } from "@/lib/photo-deletion-core";

type Outcome = "eligible" | "download_active" | "pending_payment" | "already_deleted";

export type AdminPhoto = {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  createdAt: string;
  status: string;
  bytes: number;
  outcome: Outcome;
  sold: boolean;
};

type Summary = {
  total: number;
  eligible: number;
  eligibleSold: number;
  downloadActive: number;
  pendingPayment: number;
  alreadyDeleted: number;
  eligibleIds: string[];
  estimatedBytes: number;
};

export type DeletionPlan =
  | { kind: "photos"; photoIds: string[]; label: string }
  | { kind: "albums"; albumIds: string[]; label: string };

export async function adminApi<T = Record<string, unknown>>(path: string, body?: unknown): Promise<T> {
  const { data } = await getSupabaseClient().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("La sesión venció. Volvé a iniciar sesión.");

  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) throw new Error(payload?.message ?? `Error ${response.status}`);
  return payload as T;
}

// Raw body upload (files go through the Worker to R2; the server validates admin + reservation).
export async function adminUpload<T = Record<string, unknown>>(path: string, body: Blob, contentType: string): Promise<T> {
  const { data } = await getSupabaseClient().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("La sesión venció. Volvé a iniciar sesión.");
  const response = await fetch(path, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
    body,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) throw new Error(payload?.message ?? `Error ${response.status}`);
  return payload as T;
}

export async function adminFetchBlob(path: string): Promise<Blob> {
  const { data } = await getSupabaseClient().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("La sesión venció. Volvé a iniciar sesión.");
  const response = await fetch(path, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.message ?? `Error ${response.status}`);
  }
  return response.blob();
}

// Decimal units (1 GB = 10^9 bytes), the same Cloudflare R2 uses for billing.
export const formatBytes = (bytes: number | null) => {
  if (bytes === null) return "no disponible";
  if (bytes < 1e6) return `${(bytes / 1e3).toFixed(0)} KB`;
  if (bytes < 1e9) return `${(bytes / 1e6).toFixed(1).replace(".", ",")} MB`;
  return `${(bytes / 1e9).toFixed(2).replace(".", ",")} GB`;
};

const outcomeBadge: Record<Outcome, { text: string; className: string } | null> = {
  eligible: null,
  already_deleted: null,
  download_active: { text: "Descarga vigente", className: "border-[#6FCF97]/35 bg-[#0B0F14]/80 text-[#6FCF97]" },
  pending_payment: { text: "Pago pendiente", className: "border-[#FFC94A]/50 bg-[#0B0F14]/80 text-[#F6D36F]" },
};

const buttonOutline =
  "border border-[#FFC94A]/60 px-4 py-2.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-[#FFC94A] disabled:cursor-not-allowed disabled:opacity-60";
const buttonDanger =
  "border border-[#EB5757]/60 px-4 py-2.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-[#F2994A] disabled:cursor-not-allowed disabled:opacity-60";

/* -------------------------------------------------------------------------- */
/* Photos of one album                                                        */
/* -------------------------------------------------------------------------- */

type Filter = "all" | "sold" | "unsold";

export function AlbumPhotosPanel(props: {
  albumId: string;
  albumTitle: string;
  reloadKey: number;
  onClose: () => void;
  onDelete: (plan: DeletionPlan) => void;
}) {
  const { albumId, albumTitle, reloadKey, onClose, onDelete } = props;
  const [photos, setPhotos] = useState<AdminPhoto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [attempt, setAttempt] = useState(0);

  // State only changes when the request settles (the panel is remounted per album via `key`).
  useEffect(() => {
    let cancelled = false;
    adminApi<{ photos: AdminPhoto[] }>(`/api/admin/albums/${albumId}/photos`)
      .then((payload) => {
        if (cancelled) return;
        setPhotos(payload.photos);
        setSelected(new Set());
        setError(null);
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar las fotos.");
      });
    return () => {
      cancelled = true;
    };
  }, [albumId, reloadKey, attempt]);

  const reload = () => {
    setError(null);
    setPhotos(null);
    setAttempt((value) => value + 1);
  };

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (photos ?? []).filter((photo) => {
      const sold = photo.sold;
      if (filter === "sold" && !sold) return false;
      if (filter === "unsold" && sold) return false;
      return !term || photo.title.toLowerCase().includes(term);
    });
  }, [photos, filter, query]);

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const deletable = visible.filter((photo) => photo.outcome === "eligible");
  const soldCount = (photos ?? []).filter((photo) => photo.sold).length;

  return (
    <div className="mt-8 rounded-[5px] border border-white/10 bg-[#111820] p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-semibold text-[#F4F1E8]">Fotos de “{albumTitle}”</h2>
          {photos ? (
            <p className="mt-1 text-[12px] text-[#8A9A93]">
              {photos.length} fotos · {soldCount} vendidas · {photos.length - soldCount} no vendidas
            </p>
          ) : null}
        </div>
        <button type="button" onClick={onClose} className="text-[12.5px] text-[#8A9A93] hover:text-[#F4F1E8]">
          Cerrar ✕
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={filter}
          onChange={(event) => setFilter(event.target.value as Filter)}
          className="border border-white/10 bg-[#0B0F14] px-3 py-2 text-[13px] text-[#F4F1E8] outline-none focus:border-[#FFC94A]"
        >
          <option value="all">Todas</option>
          <option value="sold">Vendidas</option>
          <option value="unsold">No vendidas</option>
        </select>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por nombre"
          className="min-w-[160px] flex-1 border border-white/10 bg-[#0B0F14] px-3 py-2 text-[13px] text-[#F4F1E8] outline-none focus:border-[#FFC94A]"
        />
        <button
          type="button"
          disabled={!deletable.length}
          onClick={() => setSelected(new Set(deletable.map((photo) => photo.id)))}
          className="text-[12.5px] text-[#8A9A93] hover:text-[#FFC94A] disabled:opacity-50"
        >
          Seleccionar las {deletable.length} eliminables del filtro
        </button>
        {selected.size ? (
          <button type="button" onClick={() => setSelected(new Set())} className="text-[12.5px] text-[#8A9A93] hover:text-[#FFC94A]">
            Quitar selección
          </button>
        ) : null}
        <button
          type="button"
          disabled={!selected.size}
          onClick={() =>
            onDelete({
              kind: "photos",
              photoIds: Array.from(selected),
              label: `${selected.size} foto${selected.size === 1 ? "" : "s"} de “${albumTitle}”`,
            })
          }
          className={buttonDanger}
        >
          Eliminar seleccionadas ({selected.size})
        </button>
      </div>

      {error ? (
        <p className="text-[12px] text-[#fca5a5]">
          {error}{" "}
          <button type="button" onClick={reload} className="underline">
            Reintentar
          </button>
        </p>
      ) : photos === null ? (
        <p className="text-[12px] text-[#8A9A93]">Cargando fotos...</p>
      ) : visible.length === 0 ? (
        <p className="text-[12px] text-[#8A9A93]">No hay fotos para este filtro.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {visible.map((photo) => {
            const badge =
              photo.status === "uploading"
                ? { text: "Carga incompleta", className: "border-[#EB5757]/50 bg-[#0B0F14]/80 text-[#F2994A]" }
                : outcomeBadge[photo.outcome] ??
                  (photo.sold ? { text: "Vendida · descarga vencida", className: "border-white/20 bg-[#0B0F14]/80 text-[#8A9A93]" } : null);
            const canDelete = photo.outcome === "eligible";
            return (
              <div key={photo.id} data-testid="admin-photo" className={`overflow-hidden border bg-[#0B0F14] ${selected.has(photo.id) ? "border-[#FFC94A]" : "border-white/10"}`}>
                <div className="relative aspect-[4/3] bg-[#0B0F14]">
                  {photo.thumbnailUrl ? (
                    <img src={photo.thumbnailUrl} alt={photo.title} loading="lazy" className="h-full w-full object-cover" />
                  ) : null}
                  {canDelete ? (
                    <label className="absolute left-1.5 top-1.5 flex h-6 w-6 cursor-pointer items-center justify-center bg-[#0B0F14]/80">
                      <input
                        type="checkbox"
                        checked={selected.has(photo.id)}
                        onChange={() => toggle(photo.id)}
                        aria-label={`Seleccionar ${photo.title}`}
                      />
                    </label>
                  ) : null}
                  {badge ? (
                    <span className={`absolute right-1.5 top-1.5 rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase ${badge.className}`}>
                      {badge.text}
                    </span>
                  ) : null}
                </div>
                <div className="space-y-1 p-2">
                  <div className="truncate text-[11.5px] text-[#F4F1E8]" title={photo.title}>{photo.title}</div>
                  <div className="flex items-center justify-between gap-2 text-[10.5px] text-[#8A9A93]">
                    <span>{new Date(photo.createdAt).toLocaleDateString("es-AR")}</span>
                    {canDelete ? (
                      <button
                        type="button"
                        onClick={() => onDelete({ kind: "photos", photoIds: [photo.id], label: `“${photo.title}”` })}
                        className="hover:text-[#F2994A]"
                      >
                        Eliminar
                      </button>
                    ) : (
                      <span title="Protegida: tiene una descarga vigente o un pago sin resolver">Protegida</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Confirmation + batched execution                                           */
/* -------------------------------------------------------------------------- */

export function DeletionModal(props: { plan: DeletionPlan; onClose: (changed: boolean) => void }) {
  const { plan, onClose } = props;
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);

  // Strong confirmation for whole albums and bulk deletions.
  const needsWord = plan.kind === "albums" || plan.photoIds.length > 1;

  const [attempt, setAttempt] = useState(0);

  // Preview is recalculated on open and on every retry (eligibility may have changed).
  useEffect(() => {
    let cancelled = false;
    const body = plan.kind === "albums" ? { albumIds: plan.albumIds } : { photoIds: plan.photoIds };
    adminApi<Summary>("/api/admin/deletions/preview", body)
      .then((preview) => {
        if (!cancelled) setSummary(preview);
      })
      .catch((previewError) => {
        if (!cancelled) setError(previewError instanceof Error ? previewError.message : "No se pudo calcular la eliminación.");
      });
    return () => {
      cancelled = true;
    };
  }, [plan, attempt]);

  const run = async () => {
    if (!summary) return;
    setRunning(true);
    setError(null);
    setResult(null);
    setChanged(true);

    let deleted = 0;
    let failed = 0;
    let protectedNow = 0;
    const batches = chunk(summary.eligibleIds, MAX_PHOTOS_PER_BATCH);
    setProgress({ done: 0, total: summary.eligibleIds.length });

    try {
      for (const batch of batches) {
        const out = await adminApi<{ deleted: number; alreadyDeleted: number; failed: number; downloadActive: number; pendingPayment: number }>(
          "/api/admin/deletions/execute",
          { photoIds: batch, confirm: "ELIMINAR" },
        );
        deleted += out.deleted + out.alreadyDeleted;
        failed += out.failed;
        protectedNow += out.downloadActive + out.pendingPayment; // bought between preview and execution
        setProgress((current) => (current ? { ...current, done: current.done + batch.length } : current));
      }

      const albumNotes: string[] = [];
      if (plan.kind === "albums" && failed === 0) {
        for (const albumId of plan.albumIds) {
          const out = await adminApi<{ status: string; remaining: number }>(`/api/admin/albums/${albumId}`, { action: "finalize-delete" });
          if (out.status === "archived") albumNotes.push(`${out.remaining} foto(s) protegida(s): el álbum quedó archivado`);
        }
      }

      const parts = [`Eliminadas: ${deleted}.`];
      if (protectedNow) parts.push(`${protectedNow} se compraron durante la operación y quedaron protegidas.`);
      if (albumNotes.length) parts.push(`${albumNotes.join(". ")}.`);
      if (failed) {
        setError(`${failed} foto(s) no se pudieron eliminar del almacenamiento. Quedaron ocultas y podés reintentar sin riesgo.`);
      }
      setResult(parts.join(" "));
    } catch (runError) {
      setError(
        `${runError instanceof Error ? runError.message : "La eliminación se interrumpió."} Lo ya procesado quedó consistente: reintentá para completar.`,
      );
    } finally {
      setRunning(false);
    }
  };

  const retry = () => {
    setSummary(null);
    setError(null);
    setProgress(null);
    setResult(null);
    setAttempt((value) => value + 1);
  };

  const canConfirm = Boolean(summary) && !running && !result && (summary?.eligible ?? 0) + (plan.kind === "albums" ? 1 : 0) > 0 && (!needsWord || typed === "ELIMINAR");
  const protectedTotal = summary ? summary.downloadActive + summary.pendingPayment : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true">
      <div className="max-h-[92vh] w-full max-w-[520px] overflow-y-auto border border-white/10 bg-[#111820] p-6 text-[#F4F1E8]">
        <h2 className="text-[18px] font-semibold">Eliminar {plan.label}</h2>

        {!summary && !error ? <p className="mt-4 text-[13px] text-[#8A9A93]">Calculando qué se puede eliminar...</p> : null}

        {summary ? (
          <ul className="mt-4 space-y-1.5 text-[13.5px]">
            <li>Fotos totales: <b>{summary.total}</b></li>
            <li>Elegibles para eliminar: <b>{summary.eligible}</b></li>
            <li>Vendidas con descarga vencida (se eliminan): <b>{summary.eligibleSold}</b></li>
            <li>Con descarga vigente (protegidas): <b className="text-[#6FCF97]">{summary.downloadActive}</b></li>
            <li>Con pago sin resolver (protegidas): <b className="text-[#F6D36F]">{summary.pendingPayment}</b></li>
            <li>Espacio estimado a liberar: <b>{formatBytes(summary.estimatedBytes)}</b></li>
          </ul>
        ) : null}

        {summary && protectedTotal > 0 ? (
          <p className="mt-4 border border-[#FFC94A]/20 bg-[#FFC94A]/10 px-3 py-2 text-[12px] text-[#F6D36F]">
            Los compradores con descargas vigentes conservan el acceso: esas fotos no se eliminan.
            {plan.kind === "albums" ? " El álbum quedará archivado (oculto y sin nuevas compras)." : ""}
          </p>
        ) : null}

        {summary && !result ? (
          <p className="mt-4 text-[12px] text-[#fca5a5]">Esta operación no se puede deshacer.</p>
        ) : null}

        {summary && needsWord && !result ? (
          <label className="mt-4 block text-[12px] uppercase tracking-[0.08em] text-[#8A9A93]">
            Escribí ELIMINAR para confirmar
            <input
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              disabled={running}
              className="mt-2 w-full border border-white/10 bg-[#0B0F14] px-3 py-2 text-[14px] text-[#F4F1E8] outline-none focus:border-[#FFC94A]"
              autoComplete="off"
            />
          </label>
        ) : null}

        {progress ? (
          <div className="mt-4">
            <div className="h-1.5 w-full bg-white/10">
              <div
                className="h-full bg-[#FFC94A] transition-all"
                style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 100}%` }}
              />
            </div>
            <p className="mt-1 text-[11.5px] text-[#8A9A93]">
              {running ? "Eliminando" : "Procesadas"} {progress.done} de {progress.total}
            </p>
          </div>
        ) : null}

        {result ? <p className="mt-4 text-[13px] text-[#6FCF97]">{result}</p> : null}
        {error ? <p className="mt-4 text-[12px] text-[#fca5a5]">{error}</p> : null}

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button type="button" disabled={running} onClick={() => onClose(changed)} className={buttonOutline}>
            {result ? "Cerrar" : "Cancelar"}
          </button>
          {error && !running ? (
            <button type="button" onClick={retry} className={buttonOutline}>
              Reintentar
            </button>
          ) : null}
          {!result ? (
            <button type="button" disabled={!canConfirm} onClick={() => void run()} className={buttonDanger}>
              {running ? "Eliminando..." : "Confirmar eliminación"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Storage budget indicator                                                   */
/* -------------------------------------------------------------------------- */

type StorageUsage = {
  usedBytes: number;
  budgetBytes: number;
  availableBytes: number;
  level: "ok" | "warning" | "critical" | "full";
  photos: number;
  albums: number;
  incompleteUploads: number;
};

const levelStyle: Record<StorageUsage["level"], { bar: string; text: string; message: string | null }> = {
  ok: { bar: "bg-[#6FCF97]", text: "text-[#8A9A93]", message: null },
  warning: { bar: "bg-[#FFC94A]", text: "text-[#F6D36F]", message: "El almacenamiento supera el 80%. Planificá eliminar un álbum anterior." },
  critical: {
    bar: "bg-[#F2994A]",
    text: "text-[#F2994A]",
    message: "El almacenamiento supera el 95%. Eliminá un álbum anterior antes de subir más fotos.",
  },
  full: { bar: "bg-[#EB5757]", text: "text-[#fca5a5]", message: "Se alcanzó el límite de almacenamiento: no se aceptan nuevas cargas." },
};

export function StorageIndicator({ reloadKey }: { reloadKey: number }) {
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [releasing, setReleasing] = useState<string | null>(null);

  // Frees the space of failed/abandoned uploads (older than 30 min) and finishes interrupted deletions.
  const release = async () => {
    setReleasing("Liberando...");
    try {
      let cleaned = 0;
      for (let round = 0; round < 20; round += 1) {
        const result = await adminApi<{ cleaned: number; more: boolean }>("/api/admin/uploads/cleanup", {});
        cleaned += result.cleaned;
        if (!result.more) break;
      }
      setReleasing(cleaned ? `Se liberaron ${cleaned} carga(s) incompleta(s).` : "No hay cargas incompletas de más de 30 minutos.");
    } catch (releaseError) {
      setReleasing(releaseError instanceof Error ? releaseError.message : "No se pudo liberar.");
    }
    setRefresh((value) => value + 1);
  };

  useEffect(() => {
    let cancelled = false;
    adminApi<StorageUsage>("/api/admin/storage")
      .then((data) => {
        if (!cancelled) {
          setUsage(data);
          setError(null);
        }
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "No disponible");
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey, refresh]);

  if (error) {
    return <p className="mb-8 text-[12px] text-[#fca5a5]">Almacenamiento: no se pudo consultar ({error}).</p>;
  }
  if (!usage) return <p className="mb-8 text-[12px] text-[#8A9A93]">Consultando almacenamiento...</p>;

  const percent = usage.budgetBytes ? Math.min(100, (usage.usedBytes / usage.budgetBytes) * 100) : 100;
  const style = levelStyle[usage.level];
  return (
    <div className="mb-8 rounded-[5px] border border-white/10 bg-[#111820] p-5" data-testid="storage-indicator">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[#F4F1E8]">Almacenamiento</h2>
        <span className={`text-[12.5px] ${style.text}`}>
          {formatBytes(usage.usedBytes)} de {formatBytes(usage.budgetBytes)} · {percent.toFixed(0)}% · disponible{" "}
          {formatBytes(usage.availableBytes)}
        </span>
      </div>
      <div className="mt-3 h-2 w-full bg-white/10" role="progressbar" aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full ${style.bar}`} style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-2 text-[11.5px] text-[#8A9A93]">
        {usage.photos} fotos · {usage.albums} álbumes
        {usage.incompleteUploads ? ` · ${usage.incompleteUploads} carga(s) incompleta(s) ocupando espacio` : ""}
        {usage.incompleteUploads ? (
          <button
            type="button"
            disabled={releasing === "Liberando..."}
            onClick={() => void release()}
            className="ml-3 text-[#FFC94A] underline disabled:opacity-60"
          >
            Liberar ahora
          </button>
        ) : null}
      </p>
      {releasing ? <p className="mt-1 text-[11.5px] text-[#8A9A93]">{releasing}</p> : null}
      {style.message ? <p className={`mt-2 text-[12px] ${style.text}`}>{style.message}</p> : null}
    </div>
  );
}
