import {
  adminMatches as fallbackAdminMatches,
  adminStats as fallbackAdminStats,
  emptyHomePageData,
  galleryPhotos as fallbackPhotos,
  homePageData,
  matches as fallbackMatches,
  purchases as fallbackPurchases,
  type HomePageData,
  type MatchSummary,
  type ProductPhoto,
  type PurchaseRecord,
} from "./mock-data";
import { getSupabaseClient, isSupabaseConfigured } from "./supabase";

const legacySlugMap: Record<string, string> = {
  "fecha-14": "pelusa-vs-lanus",
  "fecha-13": "pelusa-vs-aldosivi",
  "fecha-12": "pelusa-vs-boca",
};

const normalizeGallerySlug = (value: string) => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const decoded = (() => {
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  })();

  return decoded
    .toLocaleLowerCase("es-AR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

const resolveMatchSlug = (slug: string) => {
  const key = String(slug ?? "").trim();
  const normalizedKey = normalizeGallerySlug(key);
  const legacyAlias = legacySlugMap[key] ?? legacySlugMap[normalizedKey];
  return legacyAlias ?? (normalizedKey || key);
};

const formatMatchCard = (match: any) => ({
  slug: String(match.id ?? match.slug ?? ""),
  tag: match.tag ?? (match.slug ? match.slug.replace(/-/g, " ") : "Partido"),
  title: match.title,
  subtitle: match.subtitle ?? `${match.venue ?? "Cancha"} · ${match.played_at ? new Date(match.played_at).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }) : "Fecha"}`,
  price: match.price ?? "$6.000",
  imageUrl: match.cover_url ?? match.image_url ?? undefined,
});

const formatPhoto = (photo: any, index = 0): ProductPhoto => {
  // id is the real photos.id UUID (used for selection and checkout);
  // number is only the visual position in the sort_order-ordered result.
  const number = index + 1;
  const safePrice = Number(photo.price ?? 1500);
  const imageUrl = String(photo.image_url ?? photo.imageUrl ?? "") || "";
  const watermarkUrl = String(photo.watermark_url ?? photo.watermarkUrl ?? imageUrl) || imageUrl;

  return {
    id: String(photo.id),
    title: photo.title ?? `Foto ${number}`,
    price: Number.isFinite(safePrice) ? safePrice : 1500,
    number,
    imageUrl: imageUrl || undefined,
    watermarkUrl: watermarkUrl || undefined,
    isPublished: photo.is_published ?? true,
  };
};

const formatCompactNumber = (value: number) => {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1).replace(/\.0$/, "")}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(value);
};

const formatMoney = (value: number) => {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
};

export async function getHomePageData() {
  const fallback = {
    ...emptyHomePageData,
    navItems: ["Inicio", "Galerías", "Cómo funciona", "Contacto"],
    contactRows: [
      { label: "Email", value: "crecermarketingsl@gmail.com" },
      { label: "WhatsApp", value: "+54 9 266 4-001686" },
    ],
    stats: [],
  } satisfies HomePageData;

  if (!isSupabaseConfigured()) {
    return fallback;
  }

  const supabase = getSupabaseClient();

  if (!supabase) {
    return fallback;
  }

  try {
    const { data: matchesData, error: matchesError } = await supabase
      .from("matches")
      .select("*")
      .order("played_at", { ascending: false })
      .limit(3);

    if (matchesError || !matchesData || matchesData.length === 0) {
      return fallback;
    }

    const { data: photosData, error: photosError } = await supabase
      .from("photos")
      .select("*")
      .order("sort_order", { ascending: true });

    const coverByMatch = new Map<string, string>();
    if (!photosError && photosData) {
      for (const photo of photosData) {
        const matchId = String(photo.match_id ?? "");
        if (!matchId || coverByMatch.has(matchId)) continue;

        const coverUrl = String((photo as any).cover_image ?? photo.image_url ?? "").trim();
        if (coverUrl) {
          coverByMatch.set(matchId, coverUrl);
        }
      }
    }

    return {
      ...fallback,
      galleryCards: matchesData.map((match) => formatMatchCard({
        ...match,
        cover_url: coverByMatch.get(String(match.id)) ?? match.cover_url ?? undefined,
      })),
    };
  } catch {
    return fallback;
  }
}

export async function getMatches(): Promise<MatchSummary[]> {
  if (!isSupabaseConfigured()) {
    return fallbackMatches;
  }

  const supabase = getSupabaseClient();

  if (!supabase) {
    return fallbackMatches;
  }

  try {
    const { data, error } = await supabase
      .from("matches")
      .select("*")
      .order("played_at", { ascending: false });

    if (error || !data || data.length === 0) {
      return fallbackMatches;
    }

    return data.map((match) => ({
      slug: match.slug,
      tag: match.tag ?? "Partido",
      title: match.title,
      subtitle: match.subtitle ?? `${match.venue ?? "Cancha"} · ${new Date(match.played_at).toLocaleDateString("es-AR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })}`,
      price: match.price ?? "$6.000",
      venue: match.venue ?? "Cancha Norte",
      date: match.played_at ? new Date(match.played_at).toLocaleDateString("es-AR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }) : "Fecha",
      photoCount: Number(match.photo_count ?? 0),
      status: match.status === "published" ? "Publicada" : "Borrador",
    }));
  } catch {
    return fallbackMatches;
  }
}

export async function getMatchBySlug(slug: string): Promise<MatchSummary | undefined> {
  const normalizedSlug = resolveMatchSlug(slug);
  const fallbackMatch = fallbackMatches.find((match) => match.slug === normalizedSlug) ?? fallbackMatches.find((match) => match.slug === slug);

  if (!isSupabaseConfigured()) {
    return fallbackMatch;
  }

  const supabase = getSupabaseClient();

  if (!supabase) {
    return fallbackMatch;
  }

  try {
    const routeValue = String(slug ?? "").trim();
    const isUuidRoute = /^[0-9a-fA-F-]{36}$/.test(routeValue);

    const { data, error } = isUuidRoute
      ? await supabase.from("matches").select("*").eq("id", routeValue).limit(1)
      : await supabase.from("matches").select("*").eq("slug", routeValue).limit(1);

    if (error) {
      console.error("getMatchBySlug failed", error);
      return fallbackMatch;
    }

    const match = (data ?? [])[0];
    if (!match) {
      return undefined;
    }

    return {
      slug: match.slug,
      tag: match.tag ?? "Partido",
      title: match.title,
      subtitle: match.subtitle ?? `${match.venue ?? "Cancha"} · ${new Date(match.played_at).toLocaleDateString("es-AR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })}`,
      price: match.price ?? "$6.000",
      venue: match.venue ?? "Cancha Norte",
      date: new Date(match.played_at).toLocaleDateString("es-AR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
      photoCount: Number(match.photo_count ?? 0),
      status: match.status === "published" ? "Publicada" : "Borrador",
    };
  } catch (error) {
    console.error("getMatchBySlug unexpected error", error);
    return fallbackMatch;
  }
}

export async function getPhotosByMatchSlug(slug: string): Promise<ProductPhoto[]> {
  const normalizedSlug = resolveMatchSlug(slug);
  const fallbackMatch = fallbackMatches.find((match) => match.slug === normalizedSlug) ?? fallbackMatches.find((match) => match.slug === slug);

  if (!isSupabaseConfigured()) {
    return fallbackMatch ? fallbackPhotos : [];
  }

  const supabase = getSupabaseClient();

  if (!supabase) {
    return fallbackMatch ? fallbackPhotos : [];
  }

  try {
    const routeValue = String(slug ?? "").trim();
    const isUuidRoute = /^[0-9a-fA-F-]{36}$/.test(routeValue);

    const { data: matchData, error: matchError } = isUuidRoute
      ? await supabase.from("matches").select("id, slug").eq("id", routeValue).limit(1)
      : await supabase.from("matches").select("id, slug").eq("slug", routeValue).limit(1);

    if (matchError) {
      console.error("getPhotosByMatchSlug match lookup failed", matchError);
      return fallbackMatch ? fallbackPhotos : [];
    }

    const match = (matchData ?? [])[0];
    if (!match) {
      console.log("Galería no encontrada para el identificador consultado.");
      return [];
    }

    const { data, error } = await supabase
      .from("photos")
      .select("*")
      .eq("match_id", match.id)
      .order("sort_order", { ascending: true });

    if (error) {
      console.error("getPhotosByMatchSlug photos lookup failed", error);
      return [];
    }

    if (!Array.isArray(data)) {
      return [];
    }

    return data.map((photo, index) => formatPhoto(photo, index));
  } catch (error) {
    console.error("getPhotosByMatchSlug unexpected error", error);
    return fallbackMatch ? fallbackPhotos : [];
  }
}

export async function getPurchases(): Promise<PurchaseRecord[]> {
  if (!isSupabaseConfigured()) {
    return fallbackPurchases;
  }

  const supabase = getSupabaseClient();

  if (!supabase) {
    return fallbackPurchases;
  }

  try {
    const { data, error } = await supabase
      .from("purchases")
      .select("*")
      .order("created_at", { ascending: false });

    if (error || !data || data.length === 0) {
      return fallbackPurchases;
    }

    return data.map((purchase) => ({
      title: purchase.title ?? "Compra",
      meta: purchase.meta ?? "Compra registrada",
      badge: purchase.badge ?? `${purchase.count ?? 1} fotos`,
      total: Number(purchase.total_amount ?? purchase.total ?? 0),
      count: Number(purchase.count ?? 1),
    }));
  } catch {
    return fallbackPurchases;
  }
}

export async function getAdminData() {
  if (!isSupabaseConfigured()) {
    return {
      stats: fallbackAdminStats,
      matches: fallbackAdminMatches,
    };
  }

  const supabase = getSupabaseClient();

  if (!supabase) {
    return {
      stats: fallbackAdminStats,
      matches: fallbackAdminMatches,
    };
  }

  try {
    const [matchesResponse, photosResponse, purchasesResponse, purchaseItemsResponse] = await Promise.all([
      supabase
        .from("matches")
        .select("id, slug, title, subtitle, venue, played_at, status")
        .order("played_at", { ascending: false }),
      supabase
        .from("photos")
        .select("id, match_id")
        .eq("is_published", true),
      supabase
        .from("purchases")
        .select("id, total_amount")
        .in("status", ["paid"]),
      supabase
        .from("purchase_items")
        .select("quantity, photo_id, purchases!inner(status)")
        .eq("purchases.status", "paid"),
    ]);

    if (matchesResponse.error) {
      throw matchesResponse.error;
    }

    const matchesData = matchesResponse.data ?? [];
    const photoRows = photosResponse.data ?? [];
    const purchaseRows = purchasesResponse.data ?? [];
    const purchaseItemRows = purchaseItemsResponse.data ?? [];

    const photosByMatch = new Map<string, number>();
    for (const photo of photoRows) {
      const matchId = photo.match_id;
      if (!matchId) continue;
      photosByMatch.set(matchId, (photosByMatch.get(matchId) ?? 0) + 1);
    }

    const photoIdToMatchId = new Map<string, string>();
    for (const photo of photoRows) {
      if (photo.id && photo.match_id) {
        photoIdToMatchId.set(String(photo.id), String(photo.match_id));
      }
    }

    const salesByMatch = new Map<string, number>();
    for (const item of purchaseItemRows) {
      const matchId = photoIdToMatchId.get(String(item.photo_id));
      if (!matchId) continue;
      salesByMatch.set(matchId, (salesByMatch.get(matchId) ?? 0) + Number(item.quantity ?? 0));
    }

    const totalRevenue = purchaseRows.reduce((sum, purchase) => sum + Number(purchase.total_amount ?? 0), 0);
    const totalSoldPhotos = purchaseItemRows.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);
    const publishedMatches = matchesData.filter((match) => match.status === "published").length;
    const totalPhotos = photoRows.length;

    const matchRows = matchesData.map((match) => ({
      slug: match.slug,
      title: match.title,
      subtitle: `${match.venue ?? "Cancha"} · ${new Date(match.played_at).toLocaleDateString("es-AR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })}`,
      photos: Number(photosByMatch.get(String(match.id)) ?? 0),
      status: match.status === "published" ? "Publicada" : "Borrador",
      vendas: Number(salesByMatch.get(String(match.id)) ?? 0),
    }));

    return {
      stats: [
        { value: String(publishedMatches || matchesData.length || 0), label: "Galerías publicadas" },
        { value: formatCompactNumber(totalPhotos), label: "Fotos subidas" },
        { value: formatMoney(totalRevenue), label: "Ingresos del mes" },
        { value: String(totalSoldPhotos), label: "Fotos vendidas" },
      ],
      matches: matchRows,
    };
  } catch {
    return {
      stats: fallbackAdminStats,
      matches: fallbackAdminMatches,
    };
  }
}
