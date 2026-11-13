/**
 * Neighbourhood → DisCo, ONLY where an official source names the area.
 * Rule used (conservative): the area's name exactly matches an Eko DisCo
 * district or an Ikeja Electric business unit. Everything else is unmapped
 * and never inherits DisCo-level evidence (e.g. a DisCo at 0 MW).
 * Seeded into lightdey.disco_service_areas.
 */
export type DiscoId = "eko" | "ikeja";

export const DISCOS: Record<DiscoId, { name: string; niggridName: string }> = {
  eko: { name: "Eko DisCo (EKEDP)", niggridName: "Eko Disco" },
  ikeja: { name: "Ikeja Electric", niggridName: "Ikeja Disco" },
};

const EKO_DISTRICTS = "https://ekedp.com/our-operations";
const IE_UNITS = "https://www.ikejaelectric.com/technical-hub-operations-commence-in-shomolu-business-unit/";
const IE_UNITS_LIST = "https://theenergyyear.com/?p=32961";

export interface DiscoArea {
  areaId: string;
  disco: DiscoId;
  basis: string;
  sourceUrl: string;
}

export const DISCO_AREAS: DiscoArea[] = [
  { areaId: "lekki-phase-1", disco: "eko", basis: "Eko DisCo 'Lekki' district", sourceUrl: EKO_DISTRICTS },
  { areaId: "ajah", disco: "eko", basis: "Eko DisCo 'Ajah' district", sourceUrl: EKO_DISTRICTS },
  { areaId: "lagos-island", disco: "eko", basis: "Eko DisCo 'Islands' / 'Ajele' districts", sourceUrl: EKO_DISTRICTS },
  { areaId: "apapa", disco: "eko", basis: "Eko DisCo 'Apapa' district", sourceUrl: EKO_DISTRICTS },
  { areaId: "festac", disco: "eko", basis: "Eko DisCo 'Festac' district", sourceUrl: EKO_DISTRICTS },
  { areaId: "ojo", disco: "eko", basis: "Eko DisCo 'Ojo' district", sourceUrl: EKO_DISTRICTS },
  { areaId: "mushin", disco: "eko", basis: "Eko DisCo 'Mushin' district", sourceUrl: EKO_DISTRICTS },
  { areaId: "ikeja", disco: "ikeja", basis: "Ikeja Electric 'Ikeja' business unit", sourceUrl: IE_UNITS_LIST },
  { areaId: "ikorodu", disco: "ikeja", basis: "Ikeja Electric 'Ikorodu' business unit", sourceUrl: IE_UNITS_LIST },
  { areaId: "oshodi", disco: "ikeja", basis: "Ikeja Electric 'Oshodi' business unit", sourceUrl: IE_UNITS_LIST },
  { areaId: "shomolu", disco: "ikeja", basis: "Ikeja Electric 'Shomolu' business unit", sourceUrl: IE_UNITS },
];

const map = new Map(DISCO_AREAS.map((d) => [d.areaId, d]));
export function discoOf(areaId: string): DiscoArea | null {
  return map.get(areaId) ?? null;
}
