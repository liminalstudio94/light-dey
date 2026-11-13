import Link from "next/link";
import { Zap } from "lucide-react";
import { Logo } from "./Logo";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-[1000] border-b border-line/70 bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
        <Link href="/" aria-label="Light Dey? home">
          <Logo />
        </Link>
        <nav className="flex items-center gap-1 text-sm font-medium text-ink-2">
          <Link href="/map" className="rounded-lg px-3 py-2 hover:bg-surface hover:text-ink">Map</Link>
          <Link href="/about" className="hidden rounded-lg px-3 py-2 hover:bg-surface hover:text-ink sm:block">How it works</Link>
          <Link href="/report" className="ml-1 inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-white hover:bg-ink/85">
            <Zap className="h-4 w-4" aria-hidden /> Report
          </Link>
        </nav>
      </div>
    </header>
  );
}
