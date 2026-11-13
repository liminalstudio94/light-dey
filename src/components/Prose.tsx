export function Prose({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl px-4 pt-10">
      <h1 className="font-display text-4xl font-extrabold tracking-tight">{title}</h1>
      <div className="mt-6 space-y-4 leading-relaxed text-ink-2 [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc">{children}</div>
    </div>
  );
}
