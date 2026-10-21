# PeakMovies Backend + Embeddable Player Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship API-first self-hosted streaming backend with provider aggregation, full-rewrite proxy, and thin player/admin shells via one `docker compose up -d`.

**Architecture:** Fastify API owns scraping, proxy, cache, tracking, SQLite; Redis caches streams; player/admin are thin Next.js clients doing direct fetch to API.

**Tech Stack:** TypeScript + Fastify 5, better-sqlite3, ioredis, hls.js, Next.js App Router + Tailwind, redis:7-alpine, Vitest.

**Spec:** Brainstorming agreement 2026-10-16 (in-chat): API-first, Fastify (A), both VidApi+VidSrc as examples, graceful TMDB degrade, full-rewrite proxy, direct player fetch. No separate spec file (Plan-mode constraint at design time).

## Global Constraints

- TypeScript everywhere, no ORM (raw SQL via better-sqlite3).
- No Postgres/Mongo; SQLite file at `$DB_PATH` (default `/data/peakmovies.db`), Redis only cache.
- All config via env vars or `config/branding.json` — zero extra steps on fresh machine.
- Total RAM <200MB across containers; API handles 50 concurrent requests.
- Do NOT commit secrets (`.env`, `data/`, real `TMDB_API_KEY`, `ADMIN_PASSWORD`, `PROXY_SECRET`).
- v2 out of scope: downloads/ffmpeg, notifications, viewer logins, OMSS compat, multi-admin, rate limiting.

## Review Focus

- Dead upstream m3u8 (403/404 mid-playlist) should surface `?invalidate=` re-scrape path, not hang player.
- VidSrc domain returns HTML without playable URL — must not poison aggregate, must appear in diagnostics.
- Proxy `data` token tampered/expired — must 400/403, never fetch arbitrary URL.
- Missing `TMDB_API_KEY` — streams still work, search/recommendations 503 with clear message.
- Fingerprint-less / bot requests — tracking must not crash stream route.

---

## File Structure

```
peakmovies/ (repo root = /home/pansilu/dev/stream-backend)
├── docker-compose.yml
├── .env.example
├── config/branding.json
├── plan.md (this file)
├── api/
│   ├── Dockerfile, package.json, tsconfig.json, vitest.config.ts
│   └── src/
│       ├── index.ts              ← Fastify entry, plugin wiring
│       ├── routes/{stream,search,recommendations,proxy,health,admin,branding}.ts
│       ├── providers/{types,index,vidsrc/index,vidapi/index}.ts
│       ├── services/{cache,tmdb,geo,db}.ts
│       └── middleware/{tracker,auth}.ts
├── player/ (thin shell) ── Next.js, app/movie/[id], app/tv/[id]/[season]/[episode], components/Player
└── admin/ (thin shell) ── Next.js, app/{page,providers,test,users,settings,login}
```

### Task 1: Repo scaffolding + compose + config

**Files:**
- Create: `docker-compose.yml`, `.env.example`, `config/branding.json`, `api/Dockerfile`, `api/package.json`, `api/tsconfig.json`
- Test: `api/src/index.test.ts` (placeholder — replaced in Task 2)

**Interfaces:**
- Consumes: none
- Produces: `API_URL=http://api:3000` contract; `config/branding.json` shape `{name,logoUrl,accentColor,tagline}`

- [ ] **Step 1: Write compose + Dockerfiles + .env.example + branding.json**
  `docker-compose.yml` services: `api` (build ./api, env TMDB_API_KEY/REDIS_HOST/DB_PATH/ADMIN_PASSWORD/PUBLIC_URL/PROXY_SECRET, volume ./data:/data), `redis` (redis:7-alpine --appendonly yes), `player`/`admin` (build ./player,./admin, env API_URL/BRANDING_FILE). `.env.example` lists all keys with empty values.
- [ ] **Step 2: Verify compose config parses**
  Run: `docker compose config`
  Expected: PASS, 4 services listed
- [ ] **Step 3: Commit**
  ```bash
  git add docker-compose.yml .env.example config/branding.json api/Dockerfile api/package.json api/tsconfig.json
  git commit -m "chore: scaffold repo + compose + config"
  ```

### Task 2: API skeleton + health + branding + TMDB client

**Files:**
- Create: `api/src/index.ts`, `api/src/routes/health.ts`, `api/src/routes/branding.ts`, `api/src/services/tmdb.ts`
- Test: `api/tests/health.test.ts`, `api/tests/tmdb.test.ts`

**Interfaces:**
- Consumes: env
- Produces: `GET /api/v1/health -> {ok,uptime,redis,db}`; `GET /api/v1/branding -> branding.json`; `tmdbSearch(q,type)`, `tmdbRecommendations(tmdbId,type)`, `tmdbTitle(tmdbId,type)`

- [ ] **Step 1: Write failing health + TMDB tests**
  ```ts
  // health returns {ok:true}; tmdbSearch('') throws or returns []; missing key -> graceful 503 path
  ```
- [ ] **Step 2: Run to verify fail**
  Run: `cd api && npm test -- tests/health.test.ts`
  Expected: FAIL (not implemented)
- [ ] **Step 3: Implement Fastify entry + routes + TMDB fetch with 12h Redis stub (in-memory fallback if no Redis)**
  Signature: `buildServer(): FastifyInstance`; `tmdbSearch(q: string, type: 'movie'|'tv'): Promise<TmdbResult[]>`
- [ ] **Step 4: Run tests**
  Run: `cd api && npm test`
  Expected: PASS
- [ ] **Step 5: Commit**
  ```bash
  git add api/src/index.ts api/src/routes/health.ts api/src/routes/branding.ts api/src/services/tmdb.ts api/tests/
  git commit -m "feat(api): skeleton + health + branding + tmdb client"
  ```

### Task 3: Provider interface + registry + manager

**Files:**
- Create: `api/src/providers/types.ts`, `api/src/providers/index.ts`
- Test: `api/tests/providers.test.ts`

**Interfaces:**
- Consumes: `db` (provider flags)
- Produces: `Provider {id,name,enabled,getSources(media: MediaRef): Promise<ProviderResult>}`, `ProviderManager.getSources(media) -> Aggregated {sources,subtitles,diagnostics[] {provider,ok,latencyMs,error}}`

- [ ] **Step 1: Write failing registry test (register 2 fake providers, one throws, manager still aggregates + diagnostics)**
- [ ] **Step 2: Run, expect FAIL**
  Run: `cd api && npm test -- tests/providers.test.ts`
- [ ] **Step 3: Implement `types.ts` + `index.ts` with dynamic import registry, SQLite `providers` enabled flag, `Promise.allSettled`, 12s overall timeout**
  ```ts
  type MediaRef = {tmdbId:string; type:'movie'|'tv'; season?:number; episode?:number; title?:string}
  type RawSource = {rawUrl:string; quality:string; codec:string; headers:Record<string,string>}
  ```
- [ ] **Step 4: Run tests, expect PASS**
- [ ] **Step 5: Commit** `feat(api): provider interface + registry + manager`

### Task 4: VidSrc provider (multi-domain aggregate)

**Files:**
- Create: `api/src/providers/vidsrc/index.ts`
- Test: `api/tests/vidsrc.test.ts` (mock fetch, no live hit)

**Interfaces:**
- Consumes: `Provider` from Task 3
- Produces: `vidsrcProvider: Provider` (id=`vidsrc`)

- [ ] **Step 1: Write failing test — 6 domains mocked (2 ok with distinct rawUrls, 1 HTML-no-URL, 3 timeout) -> aggregates 2, dedupes, diagnostics per domain**
- [ ] **Step 2: Run, expect FAIL**
- [ ] **Step 3: Implement parallel fetch across `vidsrc.sh,vidsrc2.ru,vidsrc.ir,vidsrc.io,vidsrc.tw,vsembed.ru`, 8s per-domain timeout, HTML scrape for m3u8/mp4, dedupe by rawUrl**
- [ ] **Step 4: Run, expect PASS**
- [ ] **Step 5: Commit** `feat(api): vidsrc aggregate provider`

### Task 5: VidApi provider

**Files:**
- Create: `api/src/providers/vidapi/index.ts`
- Test: `api/tests/vidapi.test.ts`

**Interfaces:**
- Consumes: `Provider`
- Produces: `vidapiProvider: Provider` (id=`vidapi`)

- [ ] **Step 1: Write failing test — mocked JSON API returns 1 source + 1 subtitle; error path returns diagnostics**
- [ ] **Step 2: Run, expect FAIL**
- [ ] **Step 3: Implement simple HTTP JSON call + normalize to RawSource**
- [ ] **Step 4: Run, expect PASS**
- [ ] **Step 5: Commit** `feat(api): vidapi provider`

### Task 6: Stream + search + recommendations routes + tracking

**Files:**
- Create: `api/src/routes/stream.ts`, `api/src/routes/search.ts`, `api/src/routes/recommendations.ts`, `api/src/middleware/tracker.ts`, `api/src/services/geo.ts`, `api/src/services/db.ts`
- Test: `api/tests/stream.test.ts`, `api/tests/tracker.test.ts`

**Interfaces:**
- Consumes: manager (T3), tmdb (T2), cache (T7 stub ok), db
- Produces: `GET /api/v1/stream/movie/:id`, `GET /api/v1/stream/tv/:id/:s/:e -> {id,type,title,year,sources[] {url,quality,codec,provider,expiresIn}, subtitles[], meta{cacheHit,latencyMs}, diagnostics[]}`; tracker logs `{ts,tmdbId,title,provider,quality,ip,country,city,device,browser,fpHash}`

- [ ] **Step 1: Write failing stream test (mocked providers+tmdb -> envelope shape, proxy URLs, diagnostics present; fingerprint query accepted)**
- [ ] **Step 2: Run, expect FAIL**
- [ ] **Step 3: Implement routes + `tracker` (UA parse for device/browser, fp fields `fpHash,ua,res,tz,lang` from query) + `geo` via ip-api.com with timeout+fallback `unknown` + `db.ts` SQLite schema `providers,sessions,settings`**
- [ ] **Step 4: Run, expect PASS (search without TMDB key -> 503 clear message)**
- [ ] **Step 5: Commit** `feat(api): stream/search/recs + tracking`

### Task 7: Proxy (full rewrite) + Redis cache

**Files:**
- Create: `api/src/routes/proxy.ts`, `api/src/services/cache.ts`
- Test: `api/tests/proxy.test.ts`, `api/tests/cache.test.ts`

**Interfaces:**
- Consumes: Redis
- Produces: `GET /api/v1/proxy?data= -> m3u8 rewrite or segment bytes`; `cache key stream:{type}:{id}:{s}:{e} TTL 1h; search 24h; tmdb 12h`; `?invalidate=provider` busts

- [ ] **Step 1: Write failing proxy tests (valid token m3u8 rewrites nested URIs; tampered token 403; segment passthrough; cache hit sets meta.cacheHit)**
- [ ] **Step 2: Run, expect FAIL**
- [ ] **Step 3: Implement `data=base64url(JSON{url,headers,exp})+HMAC(PROXY_SECRET)`; fetch upstream with Referer/Origin/UA injection; rewrite m3u8; stream segments; ioredis with in-memory fallback**
- [ ] **Step 4: Run, expect PASS**
- [ ] **Step 5: Commit** `feat(api): proxy rewrite + redis cache`

### Task 8: Admin API + auth

**Files:**
- Create: `api/src/routes/admin.ts`, `api/src/middleware/auth.ts`
- Test: `api/tests/admin.test.ts`

**Interfaces:**
- Consumes: db, manager
- Produces: `POST /api/v1/admin/login (ADMIN_PASSWORD -> JWT httpOnly 24h)`, `GET/PATCH /api/v1/admin/providers`, `POST /api/v1/admin/test {tmdbId,type,...} -> per-provider latency+raw`, `GET /api/v1/admin/stats,sessions`, `POST /api/v1/admin/cache/clear,db/vacuum`

- [ ] **Step 1: Write failing admin tests (wrong password 401; toggle persists; test returns diagnostics)**
- [ ] **Step 2: Run, expect FAIL**
- [ ] **Step 3: Implement JWT auth + admin routes**
- [ ] **Step 4: Run, expect PASS**
- [ ] **Step 5: Commit** `feat(api): admin api + auth`

### Task 9: Player thin shell

**Files:**
- Create: `player/Dockerfile,package.json,next.config.js`, `player/src/app/movie/[id]/page.tsx`, `player/src/app/tv/[id]/[season]/[episode]/page.tsx`, `player/src/components/Player.tsx`
- Test: manual `?invalidate` + source cycling (no unit; `npm run build` must pass)

**Interfaces:**
- Consumes: API envelope + branding (direct fetch)
- Produces: iframe page with hls.js, quality/subtitle/speed/PiP, autoplay-next, skeleton, error+“Try another source”

- [ ] **Step 1: Scaffold Next.js + Player direct-fetching API_URL, cycling sources on 403/404 via `?invalidate=`**
- [ ] **Step 2: Verify build**
  Run: `cd player && npm run build`
  Expected: PASS
- [ ] **Step 3: Commit** `feat(player): thin iframe shell`

### Task 10: Admin thin shell + nginx + acceptance

**Files:**
- Create: `admin/... (login,page,providers,test,users,settings)`, `nginx.conf` (optional), `data/.gitkeep`
- Test: acceptance script

**Interfaces:**
- Consumes: admin API (T8)
- Produces: provider grid/toggle/test, dashboard charts, users table/filters, settings (branding edit, password change, cache/DB stats)

- [ ] **Step 1: Scaffold admin pages calling API with JWT cookie**
- [ ] **Step 2: Run acceptance**
  Run: `docker compose up -d --build && curl -f http://localhost:3000/api/v1/health && cd api && npm run test:load # 50 conc smoke`
  Expected: health ok, <200MB (`docker stats`), 50 conc no 5xx
- [ ] **Step 3: Commit** `feat(admin): thin shell + acceptance`
