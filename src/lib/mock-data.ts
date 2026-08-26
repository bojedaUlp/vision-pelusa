export type MatchSummary = {
  slug: string;
  tag: string;
  title: string;
  subtitle: string;
  price: string;
  venue: string;
  date: string;
  photoCount: number;
  status: "Publicada" | "Borrador";
};

export type ProductPhoto = {
  id: number;
  title: string;
  price: number;
  number: number;
  imageUrl?: string;
  watermarkUrl?: string;
  isPublished?: boolean;
};

export type PurchaseRecord = {
  title: string;
  meta: string;
  badge: string;
  total: number;
  count: number;
};

export type HomePageData = {
  navItems: string[];
  steps: Array<{ number: string; title: string; text: string }>;
  galleryCards: Array<{ slug: string; tag: string; title: string; subtitle: string; price: string }>;
  stats: Array<{ value: string; label: string }>;
  contactRows: Array<{ label: string; value: string }>;
};

export const emptyHomePageData: HomePageData = {
  navItems: ["Inicio", "Galerías", "Cómo funciona", "Contacto"],
  steps: [],
  galleryCards: [],
  stats: [],
  contactRows: [],
};

export const homePageData: HomePageData = {
  navItems: ["Inicio", "Galerías", "Cómo funciona", "Contacto"],
  steps: [
    {
      number: "01",
      title: "Buscás el partido",
      text: "Explorá la fecha, la cancha y la jornada en una sola vista de galería.",
    },
    {
      number: "02",
      title: "Elegís tus fotos",
      text: "Seleccioná las imágenes que más te gusten y armás tu paquete al instante.",
    },
    {
      number: "03",
      title: "Pagás y descargás",
      text: "Confirmás con Mercado Pago y accedés a tus fotos en alta calidad, listas para guardar.",
    },
  ],
  galleryCards: [
    {
      slug: "fecha-14",
      tag: "Fecha 14",
      title: "Deportivo San Luis vs. Atlético Juana Koslay",
      subtitle: "Cancha Norte · 16 ago 2026",
      price: "$6.000",
    },
    {
      slug: "fecha-13",
      tag: "Fecha 13",
      title: "Juventud Unida vs. Talleres SL",
      subtitle: "Cancha Norte · 9 ago 2026",
      price: "$9.500",
    },
    {
      slug: "fecha-12",
      tag: "Fecha 12",
      title: "Cerro La Cruz vs. Belgrano San Luis",
      subtitle: "Estadio Provincial · 2 ago 2026",
      price: "$8.200",
    },
  ],
  stats: [
    { value: "38", label: "Galerías publicadas" },
    { value: "4.216", label: "Fotos subidas" },
    { value: "$612.400", label: "Ingresos del mes" },
    { value: "212", label: "Fotos vendidas" },
  ],
  contactRows: [
    { label: "Email", value: "crecermarketingsl@gmail.com" },
    { label: "WhatsApp", value: "+54 9 266 4-001686" },
    { label: "Cancha", value: "San Luis, provincia de San Luis" },
  ],
};

export const matches: MatchSummary[] = [
  {
    slug: "fecha-14",
    tag: "Fecha 14",
    title: "Deportivo San Luis vs. Atlético Juana Koslay",
    subtitle: "Cancha Norte · 16 ago 2026",
    price: "$6.000",
    venue: "Cancha Norte",
    date: "16 ago 2026",
    photoCount: 86,
    status: "Publicada",
  },
  {
    slug: "fecha-13",
    tag: "Fecha 13",
    title: "Juventud Unida vs. Talleres SL",
    subtitle: "Cancha Norte · 9 ago 2026",
    price: "$9.500",
    venue: "Cancha Norte",
    date: "9 ago 2026",
    photoCount: 72,
    status: "Borrador",
  },
  {
    slug: "fecha-12",
    tag: "Fecha 12",
    title: "Cerro La Cruz vs. Belgrano San Luis",
    subtitle: "Estadio Provincial · 2 ago 2026",
    price: "$8.200",
    venue: "Estadio Provincial",
    date: "2 ago 2026",
    photoCount: 60,
    status: "Publicada",
  },
];

export const galleryPhotos: ProductPhoto[] = Array.from({ length: 12 }, (_, index) => ({
  id: index + 1,
  number: index + 1,
  title: `Foto ${index + 1}`,
  price: 1500,
}));

export const priceTable = [1500, 2900, 4200, 5400, 6500, 7560, 8580, 9560, 10500, 11400];

export function getPriceForCount(count: number) {
  if (count <= 0) return 0;
  if (count <= 10) return priceTable[count - 1];
  return 11400 + (count - 10) * 900;
}

export const purchases: PurchaseRecord[] = [
  {
    title: "Deportivo San Luis vs. Atlético Juana Koslay",
    meta: "Fecha 14 · Cancha Norte · 16 ago 2026 · Comprado el 17 ago 2026",
    badge: "4 fotos",
    total: 6000,
    count: 4,
  },
  {
    title: "Juventud Unida vs. Talleres SL",
    meta: "Fecha 13 · Cancha Norte · 9 ago 2026 · Comprado el 10 ago 2026",
    badge: "42 fotos",
    total: 63000,
    count: 42,
  },
];

export const adminStats = [
  { value: "38", label: "Galerías publicadas" },
  { value: "4.216", label: "Fotos subidas" },
  { value: "$612.400", label: "Ingresos del mes" },
  { value: "212", label: "Fotos vendidas" },
];

export const adminMatches = [
  {
    title: "Deportivo San Luis vs. Atlético Juana Koslay",
    subtitle: "Fecha 14 · Cancha Norte · 16 ago 2026",
    photos: 86,
    status: "Publicada",
    vendas: 42,
  },
  {
    title: "Juventud Unida vs. Talleres SL",
    subtitle: "Fecha 13 · Cancha Norte · 9 ago 2026",
    photos: 72,
    status: "Borrador",
    vendas: 18,
  },
];

export const matchBySlug = Object.fromEntries(matches.map((match) => [match.slug, match]));
