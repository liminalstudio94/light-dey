import Link from "next/link";
import { Logo } from "./Logo";

export function SiteFooter() {
  return (
    <footer className="mt-20 bg-night text-white/70">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-[1.5fr_1fr]">
        <div>
          <Logo dark />
          <p className="mt-3 max-w-sm text-sm leading-relaxed">
            No light? Know light. Community-reported electricity status for Lagos. Reports come from people like you — not from the
            distribution companies — so always check the confidence and time.
          </p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-2 text-sm">
          <Link href="/about" className="hover:text-white">About</Link>
          <Link href="/contact" className="hover:text-white">Contact</Link>
          <Link href="/privacy" className="hover:text-white">Privacy</Link>
          <Link href="/terms" className="hover:text-white">Terms</Link>
          <Link href="/map" className="hover:text-white">Live map</Link>
          <Link href="/report" className="hover:text-white">Report status</Link>
        </nav>
      </div>
      <div className="border-t border-white/10 py-4 text-center text-xs text-white/50">
        © {new Date().getFullYear()} Light Dey?. Map data © OpenStreetMap contributors.
      </div>
    </footer>
  );
}
