import type { Metadata } from "next";
import { Prose } from "@/components/Prose";
import { REPORTING_RULES, STATUS_CONFIG } from "@/lib/config";

export const metadata: Metadata = { title: "How it works" };

export default function About() {
  const c = STATUS_CONFIG;
  return (
    <Prose title="How Light Dey? works">
      <p>Light Dey? is a community-powered electricity status platform for Lagos. It does not receive data from any electricity distribution company. Every status comes from reports by people in that area.</p>
      <h2>What the colours mean</h2>
      <ul>
        <li><strong className="text-on">Green — Light dey:</strong> at least {c.confirmationThreshold} different people reported electricity in the last {c.reportingWindowMinutes} minutes.</li>
        <li><strong className="text-off">Red — No light:</strong> at least {c.confirmationThreshold} different people reported an outage in the last {c.reportingWindowMinutes} minutes.</li>
        <li><strong className="text-unsure">Yellow — Uncertain:</strong> recent reports disagree and neither side has {c.confirmationThreshold} confirmations.</li>
        <li><strong className="text-unknown">Grey — Unknown:</strong> not enough recent reports.</li>
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
