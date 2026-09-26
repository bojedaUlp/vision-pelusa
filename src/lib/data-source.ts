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

const resolveMatchSlug = (slug: string) => legacySlugMap[slug] ?? slug;

const formatMatchCard = (match: any) => ({
  slug: match.slug,
  tag: match.tag ?? match.slug?.replace(/-/g, " ") ?? "Partido",
  title: match.title,
  subtitle: match.subtitle ?? `${match.venue ?? "Cancha"} · ${match.played_at ? new Date(match.played_at).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }) : "Fecha"}`,
  price: match.price ?? "$6.000",
  imageUrl: match.cover_url ?? match.image_url ?? undefined,
});

const formatPhoto = (photo: any): ProductPhoto => {
  const safeId = Number(photo.id ?? photo.number ?? 1);
  const safeNumber = Number(photo.number ?? photo.id ?? 1);
  const safePrice = Number(photo.price ?? 1500);
  const imageUrl = String(photo.image_url ?? photo.imageUrl ?? "") || "";
  const watermarkUrl = String(photo.watermark_url ?? photo.watermarkUrl ?? imageUrl) || imageUrl;

  return {
    id: Number.isFinite(safeId) ? safeId : 1,
    title: photo.title ?? `Foto ${safeNumber || 1}`,
    price: Number.isFinite(safePrice) ? safePrice : 1500,
    number: Number.isFinite(safeNumber) ? safeNumber : 1,
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
    const { data, error } = await supabase
      .from("matches")
      .select("*")
      .order("played_at", { ascending: false })
      .limit(3);

    if (error || !data || data.length === 0) {
      return fallback;
    }

    return {
      ...fallback,
      galleryCards: data.map((match) => formatMatchCard(match)),
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
    const { data, error } = await supabase
      .from("matches")
      .select("*")
      .eq("slug", normalizedSlug)
      .maybeSingle();

    if (error || !data) {
      return fallbackMatch;
    }

    return {
      slug: data.slug,
      tag: data.tag ?? "Partido",
      title: data.title,
      subtitle: data.subtitle ?? `${data.venue ?? "Cancha"} · ${new Date(data.played_at).toLocaleDateString("es-AR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })}`,
      price: data.price ?? "$6.000",
      venue: data.venue ?? "Cancha Norte",
      date: new Date(data.played_at).toLocaleDateString("es-AR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
      photoCount: Number(data.photo_count ?? 0),
      status: data.status === "published" ? "Publicada" : "Borrador",
    };
  } catch {
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
    const { data: matchData, error: matchError } = await supabase
      .from("matches")
      .select("id")
      .eq("slug", normalizedSlug)
      .maybeSingle();

    if (matchError || !matchData) {
      return fallbackMatch ? fallbackPhotos : [];
    }

    const { data, error } = await supabase
      .from("photos")
      .select("*")
      .eq("match_id", matchData.id)
      .order("sort_order", { ascending: true });

    if (error || !data || data.length === 0) {
      return fallbackMatch ? fallbackPhotos : [];
    }

    return data.map((photo) => formatPhoto(photo));
  } catch {
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
        .select("quantity, photo_id"),
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
