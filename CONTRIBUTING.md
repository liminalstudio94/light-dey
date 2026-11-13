# Contributing

1. Pick a task from BACKLOG.md (or add one using the template in AGENTS.md).
2. Branch: `git checkout -b ld-<id>-<slug>`.
3. Implement with tests. Follow AGENTS.md.
4. `npm run check` and `npm run build` must pass. UI change ⇒ check at 390px and desktop.
5. Open a PR using the template. Keep it small. Request review (Qodo + a human). Never self-merge.

## Local setup
```bash
npm install
cp .env.example .env.local   # leave Supabase empty to use the in-memory store
npm run dev
```
Without Supabase, reports live in memory and reset on restart.
