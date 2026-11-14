import { AREAS } from "../areas";
import { EVIDENCE_CONFIG } from "../config";
import type { NewObservation } from "../store/types";
import { isTrustedSourceUrl } from "../sources/registry";
import { decodeEntities, stripTags } from "./http";

export const IKEJA_FEED_URL = "https://www.ikejaelectric.com/feed/";

export interface FeedItem {
  guid: string;
  link: string;
  title: string;
  publishedAt: string;
  text: string;
}

const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"))?.[1] ?? "";

export function parseRss(xml: string): FeedItem[] {
  if (!/<rss[\s>]/i.test(xml)) throw new Error("Ikeja Electric: response is not RSS");
  // Structural checks so a truncated response fails instead of looking like "0 items".
  const body = xml.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");
  if (!/<\/rss>\s*$/i.test(body.trim())) throw new Error("Ikeja Electric: RSS is truncated (no closing </rss>)");
  if (!/<channel[\s>][\s\S]*<\/channel>/i.test(body)) throw new Error("Ikeja Electric: RSS has no complete <channel>");
  const opens = (body.match(/<item[\s>]/gi) ?? []).length;
  const closes = (body.match(/<\/item>/gi) ?? []).length;
  if (opens !== closes) throw new Error(`Ikeja Electric: ${opens} <item> openings but ${closes} closings`);
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((m) => {
    const it = m[1];
    const link = decodeEntities(tag(it, "link")).trim();
    const published = new Date(decodeEntities(tag(it, "pubDate")).trim());
    if (!link || Number.isNaN(published.getTime())) throw new Error("Ikeja Electric: item missing link or date");
    const body = tag(it, "content:encoded") || tag(it, "description");
    return {
      guid: decodeEntities(tag(it, "guid")).trim() || link,
      link,
      title: stripTags(decodeEntities(tag(it, "title"))),
      publishedAt: published.toISOString(),
      text: stripTags(decodeEntities(body)).replace(/The post .* appeared first on Ikeja Electric\s*\.?/i, "").trim(),
    };
  });
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// An alias shared by several areas (e.g. "lekki") doesn't identify any one of them, so it's never used.
const aliasCount = new Map<string, number>();
for (const a of AREAS) for (const al of a.aliases ?? []) aliasCount.set(al.toLowerCase(), (aliasCount.get(al.toLowerCase()) ?? 0) + 1);
const matchers = AREAS.map((a) => ({
  id: a.id,
  // Full names, plus long aliases unique to this area; short aliases like "vi" would cause false matches.
  re: new RegExp(`\\b(${[a.name, ...(a.aliases ?? []).filter((x) => x.length >= 4 && aliasCount.get(x.toLowerCase()) === 1)].map(escape).join("|")})\\b`, "i"),
}));

/** Supported areas named in the text. Name matching only — never inferred. */
export function areasMentioned(text: string): string[] {
  return matchers.filter((m) => m.re.test(text)).map((m) => m.id);
}

export function noticeObservations(items: FeedItem[], now: Date = new Date(), cfg = EVIDENCE_CONFIG): NewObservation[] {
  const maxAgeMs = cfg.noticeMaxAgeDays * 86_400_000;
  return items
    .filter((i) => now.getTime() - Date.parse(i.publishedAt) <= maxAgeMs)
    .map((i) => ({ i, areas: areasMentioned(`${i.title} ${i.text}`) }))
    .filter(({ areas }) => areas.length > 0)
    // A link that isn't on Ikeja Electric's own https site is never stored as attribution.
    .filter(({ i }) => isTrustedSourceUrl(i.link) && /(^|\.)ikejaelectric\.com$/.test(new URL(i.link).hostname))
    .map(({ i, areas }) => ({
      sourceId: "ikeja_electric_notices",
      externalId: i.guid,
      scope: "disco" as const,
      scopeRef: "ikeja",
      kind: "notice" as const,
      status: null,
      valueNum: null,
      title: (i.title.length > 12 ? i.title : i.text).slice(0, 160),
      url: i.link,
      observedAt: i.publishedAt,
      validUntil: new Date(Date.parse(i.publishedAt) + maxAgeMs).toISOString(),
      neighbourhoodIds: areas,
      payload: { excerpt: i.text.slice(0, 600) },
    }));
}
