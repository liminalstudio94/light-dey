import { EVIDENCE_CONFIG, LAGOS_UTC_OFFSET_MINUTES } from "../config";
import { DISCOS, type DiscoId } from "../sources/discos";
import type { NewObservation } from "../store/types";
import { stripTags } from "./http";

export const NIGGRID_DISCO_URL = "https://www.niggrid.org/DisCoLoadProfile";

export interface DiscoLoadProfile {
  asOf: string; // ISO (UTC)
  rows: { name: string; mw: number }[];
  totalMw: number;
}

/** "13/11/2026 20:07:00" in Lagos time -> ISO UTC. */
export function parseLagosDateTime(s: string): string | null {
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const [d, mo, y, h, mi, sec] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? "0"].map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || sec > 59) return null;
  const local = Date.UTC(y, mo - 1, d, h, mi, sec);
  // Round-trip: Date.UTC silently rolls 31/02 into March; reject anything that doesn't map back exactly.
  const back = new Date(local);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return new Date(local - LAGOS_UTC_OFFSET_MINUTES * 60_000).toISOString();
}

/**
 * Parses the public NISO "DisCos Load Profile" page. Throws on anything
 * unexpected so a layout change produces a failed run, never bad data.
 */
export function parseDiscoLoadProfile(html: string, now: Date = new Date()): DiscoLoadProfile {
  const asAt = stripTags(html).match(/Data as at\s+(\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}(?::\d{2})?)/);
  if (!asAt) throw new Error("NIGGRID: 'Data as at' timestamp not found");
  const asOf = parseLagosDateTime(asAt[1]);
  if (!asOf) throw new Error(`NIGGRID: unparseable timestamp '${asAt[1]}'`);
  if (Date.parse(asOf) > now.getTime() + 10 * 60_000) throw new Error(`NIGGRID: timestamp ${asOf} is in the future`);

  const table = html.match(/<table[^>]*id="MainContent_gvDiscoLoadProfiles"[\s\S]*?<\/table>/i)?.[0];
  if (!table) throw new Error("NIGGRID: DisCo table not found");
  const rows: { name: string; mw: number }[] = [];
  let pageTotal: number | null = null;
  for (const tr of table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => stripTags(c[1]));
    if (cells.length < 2) continue;
    const mw = Number(cells[1].replace(/,/g, ""));
    if (!cells[0] || !Number.isFinite(mw) || mw < 0 || mw > 50_000) throw new Error(`NIGGRID: bad row '${cells.join(" | ")}'`);
    if (/^total/i.test(cells[0])) {
      if (pageTotal !== null) throw new Error("NIGGRID: more than one Total row");
      pageTotal = mw; // footer row, not a DisCo
      continue;
    }
    if (mw > 20_000) throw new Error(`NIGGRID: implausible DisCo value '${cells.join(" | ")}'`);
    rows.push({ name: cells[0], mw });
  }
  for (const d of Object.values(DISCOS)) if (!rows.some((r) => r.name === d.niggridName)) throw new Error(`NIGGRID: '${d.niggridName}' row missing`);
  if (rows.length < 8) throw new Error(`NIGGRID: only ${rows.length} DisCo rows`);
  // The page's own Total is our integrity check: without it a truncated table can't be detected.
  if (pageTotal === null) throw new Error("NIGGRID: Total row missing");
  const sum = Math.round(rows.reduce((a, r) => a + r.mw, 0) * 100) / 100;
  if (Math.abs(pageTotal - sum) > 1) throw new Error(`NIGGRID: rows sum to ${sum} MW but page total is ${pageTotal} MW`);
  const names = rows.map((r) => r.name.toLowerCase());
  if (new Set(names).size !== names.length) throw new Error("NIGGRID: duplicate DisCo rows");
  return { asOf, rows, totalMw: pageTotal };
}

export function niggridObservations(p: DiscoLoadProfile, cfg = EVIDENCE_CONFIG): NewObservation[] {
  const validUntil = new Date(Date.parse(p.asOf) + cfg.officialMaxAgeMinutes * 60_000).toISOString();
  const base = { sourceId: "niso_niggrid", url: NIGGRID_DISCO_URL, observedAt: p.asOf, validUntil, title: null, neighbourhoodIds: [] as string[] };
  const out: NewObservation[] = [
    {
      ...base,
      externalId: `total:${p.asOf}`,
      scope: "national",
      scopeRef: null,
      kind: "grid_total",
      valueNum: p.totalMw,
      status: p.totalMw <= cfg.gridCollapseMaxMw ? "off" : null,
      payload: { rows: p.rows },
    },
  ];
  for (const [id, d] of Object.entries(DISCOS) as [DiscoId, (typeof DISCOS)[DiscoId]][]) {
    const mw = p.rows.find((r) => r.name === d.niggridName)!.mw;
    out.push({ ...base, externalId: `disco:${id}:${p.asOf}`, scope: "disco", scopeRef: id, kind: "disco_allocation", valueNum: mw, status: mw <= cfg.discoOutageMaxMw ? "off" : null });
  }
  return out;
}
