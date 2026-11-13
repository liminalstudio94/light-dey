"use client";
import { useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { searchAreas } from "@/lib/areas";
import { STATE_META } from "@/lib/format";
import type { AreaState } from "@/lib/types";
import { StatusDot } from "./StatusBadge";

/** Accessible combobox: type, arrow keys, Enter to open the area's live status. */
export function AreaSearch({ states = {}, size = "lg", autoFocus = false }: { states?: Record<string, AreaState>; size?: "lg" | "md"; autoFocus?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => searchAreas(q, 7), [q]);

  const go = (id: string) => {
    setOpen(false);
    router.push(`/area/${id}`);
  };

  return (
    <div className="relative w-full">
      <label htmlFor={`${listId}-input`} className="sr-only">Which area do you want to check?</label>
      <div className={`flex items-center gap-3 rounded-2xl border border-line bg-surface shadow-[0_10px_40px_-18px_rgba(15,17,21,0.35)] focus-within:border-brand ${size === "lg" ? "px-5 py-4" : "px-4 py-3"}`}>
        <Search className="h-5 w-5 shrink-0 text-ink-3" aria-hidden />
        <input
          ref={inputRef}
          id={`${listId}-input`}
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && results[active] ? `${listId}-${results[active].id}` : undefined}
          autoComplete="off"
          autoFocus={autoFocus}
          value={q}
          placeholder="Which area do you want to check?"
          className={`w-full min-w-0 bg-transparent text-ink outline-none placeholder:text-ink-3 ${size === "lg" ? "text-lg" : "text-base"}`}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && results[active]) {
              e.preventDefault();
              go(results[active].id);
            } else if (e.key === "Escape") setOpen(false);
          }}
        />
      </div>
      {open && q && (
        <ul id={listId} role="listbox" className="absolute inset-x-0 top-full z-[1100] mt-2 overflow-hidden rounded-2xl border border-line bg-surface py-1 shadow-xl">
          {results.length === 0 && <li className="px-5 py-3 text-sm text-ink-3">No supported area matches “{q}” yet.</li>}
          {results.map((a, i) => {
            const st = states[a.id] ?? "UNKNOWN";
            return (
              <li
                key={a.id}
                id={`${listId}-${a.id}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  go(a.id);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-center justify-between gap-3 px-5 py-3 ${i === active ? "bg-bg" : ""}`}
              >
                <span>
                  <span className="font-medium text-ink">{a.name}</span>
                  <span className="ml-2 text-xs text-ink-3">{a.lga}</span>
                </span>
                <span className={`flex items-center gap-1.5 text-xs font-medium ${STATE_META[st].text}`}>
                  <StatusDot state={st} /> {STATE_META[st].short}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
