import { ExternalLink } from "lucide-react";
import { EVIDENCE_COUNT_NOUN, EVIDENCE_TYPE_LABEL, FRESHNESS_LABEL, lagosTime, timeAgo } from "@/lib/format";
import { isTrustedSourceUrl } from "@/lib/sources/registry";
import type { EvidenceItem } from "@/lib/types";

const ROLE_LABEL: Record<EvidenceItem["role"], string> = {
  decisive: "Deciding evidence",
  supporting: "Supporting",
  conflicting: "Disagrees",
  context: "Context only",
  estimate: "Estimate — not live",
};
const TYPE_CLASS: Record<EvidenceItem["evidenceType"], string> = {
  measured: "bg-ink text-white",
  official: "bg-ink text-white",
  reported: "bg-bg text-ink-2 border border-line",
  estimated: "border border-dashed border-ink-3 text-ink-2",
  proxy: "border border-dashed border-ink-3 text-ink-3",
};

/** Transparent attribution: who said what, when, how fresh, how trusted. */
export function EvidenceList({ items, now }: { items: EvidenceItem[]; now: number }) {
  if (!items.length) return null;
  return (
    <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
      {items.map((e, i) => (
        <li key={`${e.sourceId}-${i}`} className="p-4">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wide">
            <span className={`rounded-full px-2 py-0.5 ${TYPE_CLASS[e.evidenceType]}`}>{EVIDENCE_TYPE_LABEL[e.evidenceType]}</span>
            <span className="text-ink-2">{e.sourceName}</span>
            <span className={e.role === "conflicting" ? "text-off" : e.role === "decisive" ? "text-on" : "text-ink-3"}>· {ROLE_LABEL[e.role]}</span>
          </div>
          <p className="mt-1.5 text-sm text-ink">{e.summary}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-ink-3">
            {e.observedAt ? (
              <span>
                {lagosTime(e.observedAt)} · {timeAgo(e.observedAt, now)} · {FRESHNESS_LABEL[e.freshness]}
              </span>
            ) : (
              <span>Historical pattern</span>
            )}
            {e.count > 1 && <span>· {e.count} {EVIDENCE_COUNT_NOUN[e.evidenceType]}</span>}
            {isTrustedSourceUrl(e.url) && (
              <a href={e.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-medium text-brand">
                Source <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            )}
          </p>
        </li>
      ))}
    </ul>
  );
}
