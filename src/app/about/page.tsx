import type { Metadata } from "next";
import { Prose } from "@/components/Prose";
import { REPORTING_RULES, STATUS_CONFIG } from "@/lib/config";

export const metadata: Metadata = { title: "How it works" };

export default function About() {
  const c = STATUS_CONFIG;
  return (
    <Prose title="How Light Dey? works">
      <p>
        Light Dey? is a community-powered electricity status platform for Lagos. Most statuses come from people in each area. We also read the official national grid
        figures published by NISO, which can confirm outages. See <a className="text-brand" href="/sources">data sources</a> for every source and how far we trust it.
      </p>
      <h2>What the map shows</h2>
      <ul>
        <li><strong>Confirmed outage / Confirmed power available</strong> (dark ring): measured by a healthy <a className="text-brand" href="/sensors">Light Dey sensor</a>, or official outage data.</li>
        <li><strong>Likely outage / Likely power available</strong> (dashed ring): independent but indirect evidence — e.g. a sensor behind a generator changeover, or two verified reporters agreeing.</li>
        <li><strong className="text-on">Reported: light dey</strong> / <strong className="text-off">Reported: no light</strong>: at least {c.confirmationThreshold} different people agreed in the last {c.reportingWindowMinutes} minutes, or one fresh verified reporter. Not official or measured.</li>
        <li><strong className="text-unsure">Conflicting reports</strong>: sources or neighbours disagree right now.</li>
        <li><strong>Estimate</strong> (dashed): a pattern from past reports at this time of day. Never live.</li>
        <li><strong className="text-unknown">Not enough current evidence</strong>: no sensor, official outage data or recent report. We say why, and ask you to help confirm.</li>
      </ul>
      <h2>Freshness</h2>
      <p>Fresh: up to {c.freshness.freshMaxMinutes} min · Recent: up to {c.freshness.recentMaxMinutes} min · Ageing: up to {c.freshness.ageingMaxMinutes} min · Stale: older. Stale reports never count as live.</p>
      <h2>Keeping reports honest</h2>
      <ul>
        <li>Each person counts once per area — only their latest report.</li>
        <li>The same report from the same person within {REPORTING_RULES.duplicateWindowMinutes} minutes is ignored.</li>
        <li>Reports are rate-limited per person and per network, and only a few people on one network can count toward an area.</li>
        <li>Sharing location is optional. A nearby location marks a report “location-matched”, but GPS can be faked, so it is a signal — not proof.</li>
      </ul>
      <h2>History and best hours</h2>
      <p>History is rebuilt from stored reports only. Hours without confirmed reports are counted as unknown, never guessed. “Best hours” are statistical estimates from past reports, not guarantees.</p>
    </Prose>
  );
}
