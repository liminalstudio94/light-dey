import type { NewObservation } from "../store/types";

/**
 * IODA (Georgia Tech) Lagos-region internet connectivity — a WEAK proxy, opt-in only
 * (SOURCE_IODA_ENABLED=1, after IODA grants permission). Region 2935 is all of Lagos State,
 * so it can only ever be Lagos-wide context; it never sets or changes a neighbourhood status.
 */
export const IODA_REGION = "2935";
export const iodaEventsUrl = (now: Date) => {
  const until = Math.floor(now.getTime() / 1000);
  return `https://api.ioda.inetintel.cc.gatech.edu/v2/outages/events?entityType=region&entityCode=${IODA_REGION}&from=${until - 6 * 3600}&until=${until}&limit=50`;
};

interface IodaEvent {
  location: string;
  start: number;
  duration: number;
  datasource: string;
  score: number;
}

export function parseIodaEvents(json: string): IodaEvent[] {
  const d = JSON.parse(json) as { type?: string; error?: unknown; data?: unknown };
  if (d.type !== "outages.events" || d.error || !Array.isArray(d.data)) throw new Error("IODA: unexpected response shape");
  return d.data.map((e) => {
    const x = e as Partial<IodaEvent>;
    if (x.location !== `region/${IODA_REGION}` || !Number.isFinite(x.start) || !Number.isFinite(x.duration) || typeof x.datasource !== "string") throw new Error("IODA: malformed event");
    return x as IodaEvent;
  });
}

/** Events still ongoing (ended within the last 20 min) become one Lagos-wide context observation each. */
export function iodaObservations(events: IodaEvent[], now: Date = new Date()): NewObservation[] {
  const t = now.getTime() / 1000;
  return events
    .filter((e) => e.start <= t && e.start + e.duration >= t - 20 * 60)
    .map((e) => ({
      sourceId: "ioda",
      externalId: `${e.datasource}:${e.start}`,
      scope: "national" as const,
      scopeRef: null,
      kind: "connectivity" as const,
      status: null, // never a status claim
      valueNum: Math.round(e.score),
      title: `Lagos-wide internet connectivity drop (IODA, ${e.datasource}) — weak signal: generators and batteries keep networks up, and internet fails for other reasons.`,
      url: "https://ioda.inetintel.cc.gatech.edu/region/2935",
      observedAt: new Date(e.start * 1000).toISOString(),
      validUntil: new Date((Math.max(e.start + e.duration, t) + 20 * 60) * 1000).toISOString(),
      neighbourhoodIds: [],
    }));
}
