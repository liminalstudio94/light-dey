import Link from "next/link";
import { MapPinned, ShieldCheck, Users, Zap } from "lucide-react";
import { HeroSearch, HomeLive } from "@/components/HomeLive";
import { STATUS_CONFIG } from "@/lib/config";
import { getOverview } from "@/lib/server/data";

export const dynamic = "force-dynamic";

export default async function Home() {
  const overview = await getOverview();
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-night text-white">
        <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,200,61,0.35),rgba(255,200,61,0)_65%)]" />
        <div className="relative mx-auto max-w-3xl px-4 pb-16 pt-14 text-center sm:pb-24 sm:pt-20">
          <p className="rise mx-auto inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1 text-xs font-medium text-white/75">
            <Users className="h-3.5 w-3.5" aria-hidden /> Community reports + official grid data · Lagos
          </p>
          <h1 className="rise mt-5 font-display text-[2.6rem] font-extrabold leading-[1.02] tracking-tight sm:text-6xl">
            Before you go, check if <span className="text-[#ffc83d]">light dey.</span>
          </h1>
          <p className="rise mx-auto mt-5 max-w-xl text-base leading-relaxed text-white/70 sm:text-lg">
            Neighbours report when electricity comes on or goes off. We combine those reports into a live status for each area — so you know before you travel,
            open shop, or plan your charging.
          </p>
          <div className="rise mx-auto mt-8 max-w-xl text-left text-ink">
            <HeroSearch initial={overview} />
          </div>
          <p className="mt-4 text-sm text-white/60">
            Got light (or not) right now?{" "}
            <Link href="/report" className="font-semibold text-white underline decoration-[#ffc83d] decoration-2 underline-offset-4">Report in 5 seconds</Link>
          </p>
        </div>
      </section>

      <div className="mt-12">
        <HomeLive initial={overview} />
      </div>

      {/* How it works */}
      <section aria-labelledby="how-h" className="mx-auto mt-20 max-w-6xl px-4">
        <h2 id="how-h" className="font-display text-3xl font-bold tracking-tight">How Light Dey? works</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            { icon: Zap, t: "1. Neighbours report", d: "Tap LIGHT DEY or NO LIGHT for your area. No account needed. Location is optional." },
            { icon: ShieldCheck, t: "2. Evidence, not guesses", d: `Opt-in sensors measure grid power, official grid data confirms outages, and ${STATUS_CONFIG.confirmationThreshold}+ neighbours (or a verified reporter) can report. Every status says which.` },
            { icon: MapPinned, t: "3. You check before you go", d: "Every status shows its source, time and confidence. Old reports fade to grey — we never show stale data or estimates as live." },
          ].map(({ icon: Icon, t, d }) => (
            <div key={t} className="rounded-2xl border border-line bg-surface p-6">
              <Icon className="h-6 w-6 text-brand" aria-hidden />
              <h3 className="mt-4 font-display text-lg font-bold">{t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto mt-16 max-w-6xl px-4">
        <div className="relative overflow-hidden rounded-3xl bg-ink px-6 py-12 text-center text-white sm:px-12">
          <div aria-hidden className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(47,91,255,0.5),transparent_65%)]" />
          <h2 className="relative font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Your one tap helps your whole street.</h2>
          <p className="relative mx-auto mt-3 max-w-lg text-white/70">Every report makes the map more accurate for everyone. It takes less time than flipping a switch.</p>
          <Link href="/report" className="relative mt-7 inline-flex items-center gap-2 rounded-full bg-[#ffc83d] px-7 py-3.5 font-semibold text-ink hover:bg-[#ffd466]">
            <Zap className="h-5 w-5" aria-hidden /> Report light status
          </Link>
        </div>
      </section>
    </>
  );
}
