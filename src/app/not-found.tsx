import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <p className="font-display text-6xl font-extrabold">No light here.</p>
      <p className="mt-3 text-ink-2">We couldn&rsquo;t find that page or area.</p>
      <Link href="/" className="mt-6 inline-block rounded-full bg-ink px-5 py-2.5 font-semibold text-white">Back home</Link>
    </div>
  );
}
