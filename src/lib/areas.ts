/**
 * Supported neighbourhoods (reference data, not electricity data).
 *
 * Coordinates are APPROXIMATE centre points, not boundaries. The UI must label
 * them as approximate. The same rows are seeded into the `neighbourhoods` table
 * by supabase/migrations; keep both in sync (see AGENTS.md).
 */
export interface Area {
  id: string; // slug, stable
  name: string;
  lga: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  aliases?: string[];
  popular?: boolean;
}

const LAGOS = { city: "Lagos", state: "Lagos" } as const;

const raw: Omit<Area, "city" | "state">[] = [
  { id: "ikeja", name: "Ikeja", lga: "Ikeja", lat: 6.6018, lng: 3.3515, popular: true, aliases: ["allen", "alausa"] },
  { id: "ikeja-gra", name: "Ikeja GRA", lga: "Ikeja", lat: 6.5833, lng: 3.35 },
  { id: "opebi", name: "Opebi", lga: "Ikeja", lat: 6.596, lng: 3.36 },
  { id: "maryland", name: "Maryland", lga: "Kosofe", lat: 6.572, lng: 3.366 },
  { id: "ojota", name: "Ojota", lga: "Kosofe", lat: 6.587, lng: 3.379 },
  { id: "ketu", name: "Ketu", lga: "Kosofe", lat: 6.596, lng: 3.392 },
  { id: "magodo", name: "Magodo", lga: "Kosofe", lat: 6.617, lng: 3.385 },
  { id: "ogudu", name: "Ogudu", lga: "Kosofe", lat: 6.58, lng: 3.395 },
  { id: "ojodu-berger", name: "Ojodu Berger", lga: "Ikeja", lat: 6.64, lng: 3.37, aliases: ["berger", "ojodu"] },
  { id: "ogba", name: "Ogba", lga: "Ikeja", lat: 6.628, lng: 3.342 },
  { id: "agege", name: "Agege", lga: "Agege", lat: 6.618, lng: 3.326, popular: true },
  { id: "oshodi", name: "Oshodi", lga: "Oshodi-Isolo", lat: 6.555, lng: 3.343 },
  { id: "isolo", name: "Isolo", lga: "Oshodi-Isolo", lat: 6.537, lng: 3.32 },
  { id: "ilupeju", name: "Ilupeju", lga: "Mushin", lat: 6.555, lng: 3.358 },
  { id: "mushin", name: "Mushin", lga: "Mushin", lat: 6.527, lng: 3.35 },
  { id: "gbagada", name: "Gbagada", lga: "Kosofe", lat: 6.555, lng: 3.387 },
  { id: "shomolu", name: "Shomolu", lga: "Shomolu", lat: 6.539, lng: 3.384 },
  { id: "akoka", name: "Akoka", lga: "Shomolu", lat: 6.524, lng: 3.388 },
  { id: "yaba", name: "Yaba", lga: "Lagos Mainland", lat: 6.5095, lng: 3.3711, popular: true },
  { id: "ebute-metta", name: "Ebute Metta", lga: "Lagos Mainland", lat: 6.485, lng: 3.38 },
  { id: "surulere", name: "Surulere", lga: "Surulere", lat: 6.5, lng: 3.35, popular: true },
  { id: "lagos-island", name: "Lagos Island", lga: "Lagos Island", lat: 6.4541, lng: 3.3947, popular: true, aliases: ["isale eko", "marina", "idumota"] },
  { id: "ikoyi", name: "Ikoyi", lga: "Eti-Osa", lat: 6.45, lng: 3.435, popular: true },
  { id: "victoria-island", name: "Victoria Island", lga: "Eti-Osa", lat: 6.4281, lng: 3.4219, popular: true, aliases: ["vi", "v.i"] },
  { id: "oniru", name: "Oniru", lga: "Eti-Osa", lat: 6.437, lng: 3.46 },
  { id: "lekki-phase-1", name: "Lekki Phase 1", lga: "Eti-Osa", lat: 6.4474, lng: 3.472, popular: true, aliases: ["lekki"] },
  { id: "chevron", name: "Chevron", lga: "Eti-Osa", lat: 6.443, lng: 3.528, aliases: ["lekki", "chevy"] },
  { id: "ajah", name: "Ajah", lga: "Eti-Osa", lat: 6.467, lng: 3.57, popular: true },
  { id: "sangotedo", name: "Sangotedo", lga: "Eti-Osa", lat: 6.475, lng: 3.63 },
  { id: "apapa", name: "Apapa", lga: "Apapa", lat: 6.4489, lng: 3.359 },
  { id: "festac", name: "Festac Town", lga: "Amuwo-Odofin", lat: 6.466, lng: 3.283, popular: true, aliases: ["festac"] },
  { id: "amuwo-odofin", name: "Amuwo Odofin", lga: "Amuwo-Odofin", lat: 6.46, lng: 3.3 },
  { id: "satellite-town", name: "Satellite Town", lga: "Amuwo-Odofin", lat: 6.451, lng: 3.256 },
  { id: "ojo", name: "Ojo", lga: "Ojo", lat: 6.463, lng: 3.18 },
  { id: "ikotun", name: "Ikotun", lga: "Alimosho", lat: 6.55, lng: 3.265 },
  { id: "igando", name: "Igando", lga: "Alimosho", lat: 6.553, lng: 3.238 },
  { id: "egbeda", name: "Egbeda", lga: "Alimosho", lat: 6.592, lng: 3.29 },
  { id: "ipaja", name: "Ipaja", lga: "Alimosho", lat: 6.612, lng: 3.265 },
  { id: "ikorodu", name: "Ikorodu", lga: "Ikorodu", lat: 6.6194, lng: 3.5105 },
  { id: "epe", name: "Epe", lga: "Epe", lat: 6.584, lng: 3.983 },
  { id: "badagry", name: "Badagry", lga: "Badagry", lat: 6.415, lng: 2.881 },
];

export const AREAS: Area[] = raw.map((a) => ({ ...a, ...LAGOS }));

const byId = new Map(AREAS.map((a) => [a.id, a]));
export function getArea(id: string): Area | undefined {
  return byId.get(id);
}

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

/** Ranked neighbourhood search: prefix on name > word prefix > alias > LGA > substring. */
export function searchAreas(query: string, limit = 8): Area[] {
  const q = norm(query);
  if (!q) return [];
  const scored: { a: Area; s: number }[] = [];
  for (const a of AREAS) {
    const name = norm(a.name);
    let s = 0;
    if (name === q) s = 100;
    else if (name.startsWith(q)) s = 80;
    else if (name.split(" ").some((w) => w.startsWith(q))) s = 60;
    else if (a.aliases?.some((al) => norm(al).startsWith(q))) s = 50;
    else if (norm(a.lga).startsWith(q)) s = 30;
    else if (name.includes(q)) s = 20;
    if (s) scored.push({ a, s: s + (a.popular ? 1 : 0) });
  }
  return scored.sort((x, y) => y.s - x.s || x.a.name.localeCompare(y.a.name)).slice(0, limit).map((x) => x.a);
}

/** Great-circle distance in km. */
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function nearestAreas(lat: number, lng: number, limit = 3): { area: Area; km: number }[] {
  return AREAS.map((area) => ({ area, km: distanceKm(lat, lng, area.lat, area.lng) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, limit);
}
