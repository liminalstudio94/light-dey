import type { Metadata } from "next";
import { Prose } from "@/components/Prose";

export const metadata: Metadata = { title: "Privacy" };

export default function Privacy() {
  return (
    <Prose title="Privacy">
      <p>We collect as little as possible to run a trustworthy community map.</p>
      <h2>What we store with a report</h2>
      <ul>
        <li>The area, light status, time and your optional note.</li>
        <li>A random anonymous ID kept in a cookie on your device, so we can count you once and stop duplicate reports.</li>
        <li>A one-way hash of your network address for spam protection. We do not store your raw IP address.</li>
        <li>Your location only if you choose “Use location”. It is used to mark the report as location-matched and is never shown publicly.</li>
      </ul>
      <h2>What is public</h2>
      <p>Area statuses and anonymous report summaries (area, status, time). Nothing that identifies you.</p>
      <h2>Your choices</h2>
      <p>You can report without sharing location. Clearing your cookies resets your anonymous ID.</p>
    </Prose>
  );
}
