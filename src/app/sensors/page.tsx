import type { Metadata } from "next";
import { Prose } from "@/components/Prose";
import { SENSOR_CONFIG } from "@/lib/config";

export const metadata: Metadata = { title: "Light Dey sensors", description: "How opt-in power sensors let an area show measured electricity status without anyone reporting." };

export default function SensorsPage() {
  const c = SENSOR_CONFIG;
  return (
    <Prose title="Light Dey sensors">
      <p>
        Waiting for neighbours to report means an area can look empty exactly when you need it. A <strong>Light Dey sensor</strong> is a small opt-in device — for example a
        Raspberry Pi with a safe mains-detection module — that checks whether <strong>grid power</strong> is present and sends a signed heartbeat every minute. One healthy sensor
        can mark its neighbourhood <strong>Confirmed</strong> with nobody tapping anything.
      </p>
      <h2>What counts as a measurement</h2>
      <ul>
        <li>A <strong>healthy</strong> sensor that reported in the last {c.freshMinutes} minutes and is wired to grid power <strong>before</strong> any generator changeover → Confirmed.</li>
        <li>A sensor that is late, low on battery, has a wrong clock, or sits <strong>after</strong> a changeover → at most Likely (a generator can look like grid power).</li>
        <li>A sensor running on its UPS and reporting “no mains” is a measured outage — the device having power doesn&rsquo;t mean the grid does.</li>
        <li>A sensor that goes quiet for {c.offlineMinutes} minutes is shown as <strong>offline</strong>. Silence is never treated as an outage — Wi-Fi and batteries fail too.</li>
        <li>Two sensors count as independent only if they&rsquo;re on different networks. A sensor only speaks for its own neighbourhood.</li>
      </ul>
      <h2>Privacy</h2>
      <p>
        Each device gets a random ID and is registered to a neighbourhood only — no name, address or coordinates. Network addresses are stored only as one-way hashes. Raw
        heartbeats are deleted after {c.heartbeatRetentionDays} days, and the public site shows only how many sensors are online in each area.
      </p>
      <h2>Status today</h2>
      <p>
        The sensor system is built and tested, but <strong>no sensors are deployed yet</strong>, so no area is currently measured. We&rsquo;re looking for pilot hosts — shops,
        security desks, schools and estates with a grid-only socket. See the <a className="text-brand" href="/contact">contact page</a>.
      </p>
    </Prose>
  );
}
