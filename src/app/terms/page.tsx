import type { Metadata } from "next";
import { Prose } from "@/components/Prose";

export const metadata: Metadata = { title: "Terms" };

export default function Terms() {
  return (
    <Prose title="Terms of use">
      <p>Light Dey? shows electricity status reported by members of the public. It is not official information from any distribution company or government agency.</p>
      <ul>
        <li>Statuses can be wrong, incomplete or out of date. Check the time and confidence before relying on them.</li>
        <li>Only report what you can see where you are. Deliberately false or automated reports are not allowed and may be removed.</li>
        <li>Notes must not contain links, personal information, or abuse.</li>
        <li>We may change confirmation rules, remove reports, or limit access to protect the accuracy of the service.</li>
      </ul>
    </Prose>
  );
}
