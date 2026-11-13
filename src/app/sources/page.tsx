import type { Metadata } from "next";
import { Prose } from "@/components/Prose";
import { getArea } from "@/lib/areas";
import { EVIDENCE_CONFIG, STATUS_CONFIG } from "@/lib/config";
import { DISCO_AREAS, DISCOS } from "@/lib/sources/discos";
import { SOURCES, type Integration } from "@/lib/sources/registry";

export const metadata: Metadata = { title: "Data sources", description: "Every source Light Dey? uses, how much we trust it, and what it is allowed to say." };

const STATUS: Record<Integration, { label: string; cls: string }> = {
  live: { label: "Live", cls: "bg-on-soft text-on" },
  derived: { label: "Live (derived)", cls: "bg-on-soft text-on" },
  awaiting_credentials: { label: "Needs API credentials", cls: "bg-unsure-soft text-unsure" },
  awaiting_partner: { label: "Awaiting approved partners", cls: "bg-unsure-soft text-unsure" },
  unavailable: { label: "No accessible feed", cls: "bg-unknown-soft text-ink-2" },
};

export default function SourcesPage() {
  const e = EVIDENCE_CONFIG;
  return (
    <Prose title="Where our data comes from">
      <p>
        Light Dey? combines independent evidence and always shows which source each status comes from. We never present an estimate, a stale report or a single
        unverified report as confirmed live electricity. When trustworthy data is missing, the area shows <strong>Unknown</strong>.
      </p>
      <h2>How evidence is ranked</h2>
      <ol className="ml-5 list-decimal space-y-1">
        <li><strong>Official</strong> (grid operator, DisCos, approved operator partners) → “Confirmed”. Grid figures expire after {e.officialMaxAgeMinutes} minutes.</li>
        <li><strong>Verified reporters</strong> → “Confirmed” when {e.verifiedConfirmCount} independent ones agree (or one plus neighbours).</li>
        <li><strong>Community</strong> → “Reported” when {STATUS_CONFIG.confirmationThreshold}+ independent people agree within {STATUS_CONFIG.reportingWindowMinutes} minutes.</li>
        <li><strong>Estimate</strong> → only with no live evidence, from ≥{e.estimate.minSamples} past confirmed hours at least {Math.round(e.estimate.minProbability * 100)}% one way.</li>
      </ol>
      <p>
        Official grid data can prove an <em>outage</em> (a national grid collapse, or a DisCo receiving ~0 MW) but not that your street has light, because DisCos load-shed. So
        positive grid figures are shown as context only.
      </p>
      <h2>Sources</h2>
      <div className="space-y-3">
        {SOURCES.map((s) => (
          <section key={s.id} className="rounded-2xl border border-line bg-surface p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-base font-bold text-ink">{s.name}</h3>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS[s.integration].cls}`}>{STATUS[s.integration].label}</span>
            </div>
            <dl className="mt-2 grid gap-x-4 gap-y-1 text-ink-2 sm:grid-cols-[9rem_1fr]">
              <dt className="text-ink-3">Trust tier</dt>
              <dd>{s.tier} — {s.kind.replace(/_/g, " ")}</dd>
              <dt className="text-ink-3">Coverage</dt>
              <dd>{s.coverage}</dd>
              <dt className="text-ink-3">Used for</dt>
              <dd>{s.usage}</dd>
              <dt className="text-ink-3">Refresh</dt>
              <dd>{s.refreshMinutes ? `every ${s.refreshMinutes} min` : "—"}</dd>
              <dt className="text-ink-3">Reliability</dt>
              <dd>{s.reliability}</dd>
              {s.credentials && (
                <>
                  <dt className="text-ink-3">Needs</dt>
                  <dd>{s.credentials}</dd>
                </>
              )}
              {s.url && (
                <>
                  <dt className="text-ink-3">Link</dt>
                  <dd className="break-all"><a className="text-brand" href={s.url} target="_blank" rel="noopener noreferrer">{s.url}</a></dd>
                </>
              )}
            </dl>
          </section>
        ))}
      </div>
      <h2>Which DisCo serves each area</h2>
      <p>
        DisCo-wide outages only apply to areas an official source names: an Eko DisCo district or an Ikeja Electric business unit with the same name. Other areas aren&rsquo;t
        mapped yet, so only national grid collapses and local reports apply to them.
      </p>
      <ul>
        {DISCO_AREAS.map((d) => (
          <li key={d.areaId}>
            {getArea(d.areaId)?.name} → {DISCOS[d.disco].name} ({d.basis}, <a className="text-brand" href={d.sourceUrl} target="_blank" rel="noopener noreferrer">source</a>)
          </li>
        ))}
      </ul>
    </Prose>
  );
}
