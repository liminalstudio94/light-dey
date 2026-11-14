# LIGHT DEY?

**No Light? Know Light. Check Before You Go.**

Evidence-based electricity status for Lagos neighbourhoods. Opt-in Light Dey sensors measure grid power, official NISO grid data confirms outages, neighbours report *Light dey* or *No light* (3 independent people within the hour), and every status shows its source, time and confidence. When evidence is missing, we say Unknown.

```bash
npm install
cp .env.example .env.local
npm run dev        # http://localhost:3000
npm run check      # typecheck + lint + tests
npm run db:migrate # apply SQL migrations (needs POSTGRES_URL_NON_POOLING)
```

- How it works & rules: [ARCHITECTURE.md](ARCHITECTURE.md)
- Data sources (live / requires credentials / rejected): [SOURCES.md](SOURCES.md)
- Power sensors (protocol, privacy, setup): [SENSORS.md](SENSORS.md)
- Engineering rules: [AGENTS.md](AGENTS.md)
- Plan: [ROADMAP.md](ROADMAP.md) · [BACKLOG.md](BACKLOG.md)
- Tests: [TESTING.md](TESTING.md) · Security: [SECURITY.md](SECURITY.md)

Light Dey? is not affiliated with any electricity distribution company. Statuses are community reports, not official data.
