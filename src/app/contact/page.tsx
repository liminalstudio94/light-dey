import type { Metadata } from "next";
import { Prose } from "@/components/Prose";

export const metadata: Metadata = { title: "Contact" };

export default function Contact() {
  const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
  return (
    <Prose title="Contact">
      {email ? (
        <p>Questions, a missing area, or spotted false reports? Email <a className="font-semibold text-brand" href={`mailto:${email}`}>{email}</a>.</p>
      ) : (
        <p>A contact channel is being set up. Check back soon.</p>
      )}
    </Prose>
  );
}
