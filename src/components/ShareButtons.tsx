"use client";
import { useState } from "react";
import { Check, Link2, Share2 } from "lucide-react";
import { shareText } from "@/lib/share";
import type { AreaStatus } from "@/lib/types";

export function ShareButtons({ areaName, path, status }: { areaName: string; path: string; status: AreaStatus }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window === "undefined" ? path : `${window.location.origin}${path}`;
  const text = shareText(areaName, status);
  const enc = encodeURIComponent;
  const links = [
    { name: "WhatsApp", href: `https://wa.me/?text=${enc(`${text} ${url}`)}`, cls: "bg-[#25d366] text-white" },
    { name: "X", href: `https://x.com/intent/post?text=${enc(text)}&url=${enc(url)}`, cls: "bg-ink text-white" },
    { name: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`, cls: "bg-[#1877f2] text-white" },
  ];
  return (
    <div>
      <p className="flex items-center gap-2 text-sm font-semibold"><Share2 className="h-4 w-4" aria-hidden /> Share this status</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {links.map((l) => (
          <a key={l.name} href={l.href} target="_blank" rel="noopener noreferrer" className={`rounded-full px-4 py-2 text-sm font-semibold ${l.cls}`}>
            {l.name}
          </a>
        ))}
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(`${text} ${url}`);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              /* clipboard blocked */
            }
          }}
          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold"
        >
          {copied ? <Check className="h-4 w-4 text-on" aria-hidden /> : <Link2 className="h-4 w-4" aria-hidden />}
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </div>
  );
}
