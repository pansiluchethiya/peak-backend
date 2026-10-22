# Peak Movies — API v1 restructure + IPTV live channels

Two connected pieces of work:

1. **Restructure the public API** to the "PEAK MOVIES — API STRUCTURE" contract
   (`/api/v1/watch/*`, `/api/v1/meta/*`, `request_id` everywhere, one error
   format, resolver/adapter architecture, normalized sources).
2. **Add IPTV live TV** to that API: ingest M3U playlists, expose a channel
   catalog, and resolve live HLS channels through
   `GET /api/v1/watch/live/tv?id=channel_<id>`.

Music (`/api/v1/stream/music`, `/api/v1/meta/music`) is **deferred**: only the
interfaces/resolver slot are reserved so it can be added later without breaking
`/api/v1`.

---

## 1. Current state (what we are changing)

| Area | Today | Target |
| --- | --- | --- |
| Movie stream | `GET /api/v1/stream/movie/:tmdbId` | `GET /api/v1/watch/movies?id=<peakId>` |
| TV stream | `GET /api/v1/stream/tv/:tmdbId/:s/:e` | `GET /api/v1/watch/tv?id=<peakId>&season=&episode=` |
| Live TV | – | `GET /api/v1/watch/live/tv?id=<channelId>` |
| Metadata | none (title only, inline in stream response) | `GET /api/v1/meta/movie`, `GET /api/v1/meta/tv` |
| Request id | Fastify internal `req-1` (never exposed) | `req_<ULID>` in every response + `X-Request-ID` support |
| Errors | ad-hoc `{ error: '...' }` per route | one envelope + error-code catalogue |
| Source shape | `{url, quality, codec, provider, adaptive, expiresIn}` | `{id, type, url, quality, language, headers, expires_at}` |
| IDs | raw TMDB id in the URL | opaque `Peak ID` (`pm_…`) / `channel_…` |
| Architecture | routes call `ProviderManager` directly | controller → resolver → provider manager → adapter |
| Live/TV | – | M3U ingestion, channel catalog, live-aware proxy |

Existing building blocks we keep: `ProviderManager` (selection, priority,
health, timeout, fallback), `providers/*` adapters, `safeHttp` (SSRF guard),
`proxy` + `proxyToken` (media proxying), `cache` (Redis + memory), `db`
(SQLite), `tmdb` service, admin dashboard, player app, vitest suite in
`api/tests`.

---

## 2. Target API surface

Base URL `/api/v1`. Every JSON response carries `request_id` and `status`.

### 2.1 Watch

```
GET /api/v1/watch/movies?id={PEAK_ID}[&request_id=…]
200 → { request_id, status:"success",
        media:{ id, type:"movie", title?, year? },
        sources:[ PublicSource ], subtitles:[ PublicSubtitle ] }

GET /api/v1/watch/tv?id={PEAK_ID}&season=2&episode=7
200 → { request_id, status:"success",
        media:{ id, type:"tv", season, episode, title?, year? },
        sources:[…], subtitles:[…] }

GET /api/v1/watch/live/tv?id={CHANNEL_ID}
200 → { request_id, status:"success",
        media:{ id, type:"live_tv", title, group? },
        sources:[…] }          // hls, no subtitles
```

Query parameters (all optional, all non-breaking):

* `request_id` – client supplied trace id (headers win over query).
* `invalidate=1` – bypass the resolution cache (already used by the player).
* `fpHash`, `ua`, `res`, `tz`, `lang` – existing analytics fingerprint, kept as
  optional parameters (analytics + geo, not required for playback).

### 2.2 Meta

```
GET /api/v1/meta/movie?id={PEAK_ID}
200 → { request_id, status:"success",
        media:{ id, type:"movie", title, year, poster, backdrop, genres[], runtime, rating, original_title, tagline } }

GET /api/v1/meta/tv?id={PEAK_ID}
200 → { request_id, status:"success",
        media:{ id, type:"tv", title, year, poster, backdrop, genres[], seasons[], original_title, tagline } }
```

Metadata is normalized (Peak's own schema), never the raw TMDB payload.

### 2.3 Live catalog (proposed addition — not in the original spec)

The frontend needs a channel list; the spec has no endpoint for it.

```
GET /api/v1/live/tv/channels?q=&group=&limit=100&cursor=…
200 → { request_id, status:"success",
        groups:[ { id, title, count } ],
        channels:[ { id:"channel_espn", name, group, logo, language, country } ] }
```

### 2.4 Error format (all endpoints)

```
{ "request_id": "req_01K…", "status": "error",
  "error": { "code": "MEDIA_NOT_FOUND", "message": "The requested media could not be found." } }
```

Codes: `INVALID_REQUEST`, `INVALID_ID`, `INVALID_SEASON`, `INVALID_EPISODE`,
`MEDIA_NOT_FOUND`, `EPISODE_NOT_FOUND`, `CHANNEL_NOT_FOUND`, `SOURCE_NOT_FOUND`,
`SOURCE_UNAVAILABLE`, `PROVIDER_ERROR`, `PROVIDER_TIMEOUT`, `RATE_LIMITED`,
`INTERNAL_ERROR` (+ `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND` for the rest of
the API).

HTTP mapping: `INVALID_*`→400, `MEDIA/EPISODE/CHANNEL_NOT_FOUND`→404,
`SOURCE_NOT_FOUND`→404, `SOURCE_UNAVAILABLE`→503, `PROVIDER_ERROR`→502,
`PROVIDER_TIMEOUT`→504, `RATE_LIMITED`→429, `INTERNAL_ERROR`→500.

> Decision to confirm: the spec lists `408 → timeout`; a *provider* timeout is
> an upstream failure, so we use `504`. `408` stays reserved for the client's
> own request timing out.

### 2.5 Source normalization

```jsonc
{
  "id": "src_01K8X2J5WQ7Z3N4M6P8R",   // stable id (hash of provider+url)
  "type": "hls",                        // hls | dash | audio | progressive | embed
  "url": "https://api.example/api/v1/proxy?data=…",  // our proxy, never the provider url
  "quality": "1080p",
  "language": "en",                     // "und" when unknown
  "headers": {},                        // reserved; provider headers stay server side
  "expires_at": "2026-10-22T14:00:00.000Z"
}
```

* `type` is derived from the codec/url (`hls`, `dash`, `progressive`, `embed`
  for iframe pages — the spec's list is "may include", so `embed` is an
  extension).
* `url` is always our own proxy URL (absolute, built from `PUBLIC_URL`).
* Provider request headers stay inside the proxy token — never exposed.

---

## 3. Backend architecture

```
api/src/
  index.ts                     fastify bootstrap (genReqId, logger, error handler)
  core/
    ulid.ts                    ULID generator (26 char Crockford base32)
    requestId.ts               resolve + validate request ids
    errors.ts                  ApiError, error codes, status mapping
    response.ts                success()/failure() envelope helpers
    peakId.ts                  Peak ID encode/decode (+ channel id codec)
    sources.ts                 RawSource → PublicSource normalization
  middleware/
    requestContext.ts          request id, logging, request_id injection
    errorHandler.ts            global error + not-found handlers
  resolvers/
    types.ts                   Resolver interface, ResolvedMedia
    movieResolver.ts
    tvResolver.ts
    liveTvResolver.ts
    musicResolver.ts           stub (deferred)
    index.ts                   resolver factory (wired to the provider manager)
  routes/
    watch.ts                   /api/v1/watch/movies, /watch/tv, /watch/live/tv
    meta.ts                    /api/v1/meta/movie, /meta/tv
    live.ts                    /api/v1/live/tv/channels
    stream.ts                  legacy routes (deprecated, delegate to resolvers)
    search.ts, recommendations.ts, branding.ts, health.ts, providers.ts,
    proxy.ts, admin.ts
  providers/                   unchanged adapters + manager
    types.ts                   + RawSource.language / expiresAt
    index.ts                   ProviderManager: selection, priority, health,
                               timeout, retry, fallback
  services/
    db.ts                      + iptv tables & accessors
    proxyToken.ts              + payload.live flag
    iptv/
      parser.ts                M3U/M3U8 parser
      store.ts                 playlist/channel persistence
      sync.ts                  fetch + parse + upsert + scheduled sync
```

Request lifecycle (per the spec):

```
Client → requestContext (request_id, logging) → auth/rate-limit
       → watch controller → Peak ID decoder/validator → resolver
       → ProviderManager → provider adapters → normalization → envelope
```

### 3.1 Request id

* `X-Request-ID` → `X-Client-Request-ID` → `?request_id=` → generated.
* Client ids are preserved when they match `/^[A-Za-z0-9._:-]{1,128}$/`,
  otherwise a fresh `req_<ULID>` is generated (never echo a hostile value).
* Implemented as Fastify `genReqId` (so `request.id` is the peak id and every
  log line carries it) + an `onSend` hook that injects `request_id` into every
  JSON response (legacy routes included).
* `req_<ULID>`: 48-bit ms timestamp + 80-bit randomness, Crockford base32,
  monotonic within the same millisecond.

### 3.2 Peak ID (obfuscation, not security)

* Format `pm_<base64url>`; plaintext `movie:550` / `tv:1396`.
* Keystream = repeated `SHA-256(PEAK_ID_SECRET ?? PROXY_SECRET)`, XOR + base64url.
* `encodePeakId(kind, tmdbId)` / `decodePeakId(id)` → throws
  `ApiError('INVALID_ID')` for anything malformed.
* Search / recommendations / meta responses return the **Peak ID**; the raw
  TMDB id stays server side (it is still stored in `sessions.tmdb_id` for
  analytics).
* `PEAK_ID_SECRET` env (optional, falls back to `PROXY_SECRET`).

### 3.3 Resolvers

```ts
interface Resolver {
  resolve(input: ResolverInput): Promise<ResolvedMedia>;
}
// ResolvedMedia = { media: PublicMedia; sources: PublicSource[];
//                    subtitles: PublicSubtitle[]; diagnostics: ProviderDiagnostic[] }
```

* `MovieResolver` – decode Peak ID → TMDB id → optional title (TMDB service,
  cached) → `ProviderManager.getSources()` → normalize.
* `TvResolver` – same, plus season/episode validation (`INVALID_SEASON` /
  `INVALID_EPISODE` for non-positive integers).
* `LiveTvResolver` – decode `channel_…` id → channel row → one HLS source.
  Does **not** use the provider manager.
* `MusicResolver` – interface only, throws `NOT_IMPLEMENTED` until the music
  work lands.

### 3.4 Provider manager (adapters)

`providers/*` stay the adapters. The manager gains:

* explicit **priority** (the persisted `providersOrder.json` order, already
  implemented) and **health** (SQLite `providers` table, already implemented);
* a **retry** policy: one extra attempt when a provider failed in < 500 ms
  (fast failures only — avoids doubling the latency of slow scrapers);
* **normalization** delegated to `core/sources.ts` (the manager keeps returning
  raw sources internally; the resolver normalizes).

### 3.5 Legacy routes

`/api/v1/stream/movie/:id` and `/api/v1/stream/tv/:id/:s/:e` stay for one
release, now implemented on top of the resolvers but still returning the legacy
body (so the current player keeps working). They are marked deprecated in the
docs and can be deleted after the player migration.

---

## 4. IPTV live TV

### 4.1 Ingestion

* **Parser** (`services/iptv/parser.ts`): standard M3U
  (`#EXTINF:-1 tvg-id=… tvg-name=… tvg-logo=… group-title=…,NAME` +
  URL line). Also honours `#EXTVLCOPT:http-user-agent=…` /
  `#EXTVLCOPT:http-referrer=…` per channel (many IPTV hosts require a
  Referer/UA) and `#EXTGRP:`.
* **Sources**: playlists are added by an admin (URL + name) or bootstrapped
  from `IPTV_PLAYLIST_URLS` (comma separated) on first start. Only
  operator-configured playlists are used — the operator is responsible for
  holding the rights to redistribute/relink them.
* **Sync**: `services/iptv/sync.ts` fetches a playlist through `safeHttp`
  (SSRF guard, no private targets), parses it and upserts channels. Runs
  manually (`POST /api/v1/admin/iptv/playlists/:id/sync`) and on a timer
  (`IPTV_SYNC_INTERVAL_MINUTES`, default 360).

### 4.2 Storage (SQLite, `services/db.ts`)

```sql
CREATE TABLE IF NOT EXISTS iptv_playlists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 1,
  channel_count INTEGER NOT NULL DEFAULT 0,
  last_sync_at TEXT,
  last_error TEXT
);

CREATE TABLE IF NOT EXISTS iptv_channels (
  id TEXT PRIMARY KEY,            -- channel_<slug>_<hash6>
  playlist_id INTEGER NOT NULL REFERENCES iptv_playlists(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  tvg_id TEXT,
  group_title TEXT,
  logo TEXT,
  url TEXT NOT NULL,
  headers TEXT,                   -- JSON: {Referer, User-Agent, …}
  language TEXT,
  country TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_iptv_channels_group ON iptv_channels(group_title);
CREATE INDEX IF NOT EXISTS idx_iptv_channels_tvg ON iptv_channels(tvg_id);
```

Channel id: `channel_<slug(name)>_<hash6(url)>` — opaque, stable, collision
free.

### 4.3 Live resolution

`GET /api/v1/watch/live/tv?id=channel_espn` → `LiveTvResolver` → channel row →
`PublicSource { type:'hls', url: proxy(channel.url, channel.headers) }`.
Unknown/disabled channel → `CHANNEL_NOT_FOUND` (404).

### 4.4 Live aware proxy

The existing proxy already rewrites playlists and proxies segments. Live needs
three changes:

* `ProxyPayload` gains `live?: boolean`; the proxy then answers with
  `cache-control: no-store` (instead of `public, max-age=3600`) and uses a
  longer open timeout (30 s) — live segments are unique, caching them is wrong.
* Playlists are already `no-store`; add a `live` detection (no `#EXT-X-ENDLIST`)
  so a live *media* playlist is not treated as VOD.
* The channel's stored headers (Referer/UA) are sent upstream by the proxy
  (they travel inside the signed proxy token, never to the client).

### 4.5 Admin

New dashboard page **Live TV**:

* Playlists: add / remove / enable / disable, "Sync now", last sync, channel
  count, last error.
* Channels: search, filter by group, enable/disable, copy the channel id.
* Admin API (the admin app already proxies `/api/v1/admin/*`):
  * `GET/POST /api/v1/admin/iptv/playlists`
  * `POST /api/v1/admin/iptv/playlists/:id/sync`
  * `DELETE /api/v1/admin/iptv/playlists/:id`
  * `GET /api/v1/admin/iptv/channels?q=&group=&limit=`
  * `POST /api/v1/admin/iptv/channels/:id/toggle`
  * `GET /api/v1/admin/iptv/groups`

### 4.6 Player

* `player/src/app/live/page.tsx` – group sidebar + channel grid (logo, name).
* `player/src/app/live/[channelId]/page.tsx` – the existing player component fed
  by `/api/v1/watch/live/tv`.
* Navigation entry "Live TV" in the player header.

---

## 5. Frontend migration (player)

* `player/src/lib/api.ts`: add `fetchWatch()`, `fetchMeta()`,
  `fetchLiveChannels()`; keep `fetchStream()` (legacy) until the migration
  lands.
* `player/src/lib/types.ts`: add `WatchResponse`, `PublicSource`,
  `PublicSubtitle`, `MediaMeta`, `LiveChannel`, `LiveGroup`.
* Player routes switch from the raw TMDB id to the **Peak ID**
  (`/movie/{peakId}`, `/tv/{peakId}/{s}/{e}`); the search/recommendation
  responses now carry the Peak ID.
* `player/src/components/Player.tsx`: consume the new envelope
  (`media`, `sources[]`, `subtitles[]`); keep the `html5` → iframe handling
  and the provider-chain fallback.

## 6. Admin changes (besides Live TV)

* `admin/src/lib/types.ts`: add `LivePlaylist`, `LiveChannel`, `LiveGroup`.
* The providers table and the provider order page are unchanged (they already
  work off the provider manager).

## 7. Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PEAK_ID_SECRET` | `PROXY_SECRET` | Peak ID obfuscation key |
| `IPTV_PLAYLIST_URLS` | – | bootstrap playlist URLs (comma separated) |
| `IPTV_SYNC_INTERVAL_MINUTES` | `360` | playlist sync interval |
| `LOG_LEVEL` | `info` | pino log level |
| `PUBLIC_URL` | existing | absolute proxy urls in responses |

`docker-compose.yml` and `.env.example` get the new variables; the API image
already copies the whole `src` directory, so no Dockerfile change is needed.

## 8. Work breakdown (implementation order)

**Phase A — core (no behaviour change for clients)**

1. `core/ulid.ts`, `core/requestId.ts`, `core/errors.ts`, `core/response.ts`.
2. `middleware/requestContext.ts` (genReqId, onSend `request_id` injection,
   pino logger), `middleware/errorHandler.ts` (global handler + not-found).
3. Wire into `index.ts`; enable the logger (redacting `authorization`/`cookie`).
4. Tests: `api/tests/requestId.test.ts`, `api/tests/errors.test.ts`.

**Phase B — ids, resolvers, new routes**

5. `core/peakId.ts` + tests.
6. `core/sources.ts` (normalization) + `providers/types.ts` (`language`,
   `expiresAt`).
7. `resolvers/*` (movie, tv, live stub, music stub).
8. `routes/watch.ts`, `routes/meta.ts` + tests.
9. `routes/stream.ts` refactored onto the resolvers (legacy shape preserved).
10. `routes/search.ts` / `routes/recommendations.ts` return Peak IDs.

**Phase C — IPTV backend**

11. `services/iptv/parser.ts` + tests (fixtures for the M3U variants).
12. `services/db.ts`: tables + accessors.
13. `services/iptv/sync.ts` (fetch/parse/upsert, scheduled sync) + tests.
14. `services/proxyToken.ts` + `routes/proxy.ts`: live support.
15. `resolvers/liveTvResolver.ts` + `routes/live.ts` (channel catalog) + tests.

**Phase D — admin + player**

16. Admin **Live TV** page + admin API endpoints in `routes/admin.ts`.
17. Player: new API client methods, Peak ID routes, Live TV pages.
18. Docs: `docs/API.md` (the v1 contract), README updates, IPTV setup +
    licensing note.

**Phase E — cleanup (optional, after the player migration)**

19. Remove the legacy `/api/v1/stream/*` routes (or keep them behind a
    `LEGACY_STREAM_ROUTES` flag).

## 9. Test plan (vitest, `api/tests`)

* `requestId.test.ts` – header precedence, client id preserved, invalid client
  id replaced, `request_id` present on success **and** error responses.
* `errors.test.ts` – every error code maps to the right HTTP status and
  envelope.
* `peakId.test.ts` – round trip, wrong secret, malformed id → `INVALID_ID`.
* `watch.test.ts` – movie/tv happy path with a fake provider, invalid
  season/episode, unknown media, source normalization (proxy url, stable
  `src_` id, type mapping), diagnostics not leaked publicly.
* `meta.test.ts` – normalized metadata, `TMDB_API_KEY` missing → 503.
* `iptv-parser.test.ts` – attributes, groups, logos, per-channel headers.
* `iptv-sync.test.ts` – upsert, disable, re-sync, unknown playlist.
* `live.test.ts` – channel resolution, disabled channel → `CHANNEL_NOT_FOUND`,
  live proxy headers (`no-store`).
* Existing suite must stay green (`npm test` in `api/`).

Manual verification: `docker compose build --no-cache && docker compose up -d`,
then the player and admin pages for movies, series and live channels.

## 10. Open decisions (please confirm)

1. **Legacy routes** – keep `/api/v1/stream/*` for one release (recommended) or
   remove them in the same change?
2. **Peak ID format** – opaque `pm_<base64url>` (recommended, matches
   "obfuscation, not security") or readable `movie_550`?
3. **Channel catalog endpoint** – `GET /api/v1/live/tv/channels` is not in the
   spec but the frontend needs it. Add it?
4. **IPTV playlists** – admin-entered URLs only (recommended, keeps licensing
   with the operator) or should a public default list be seeded?
5. **Diagnostics** – keep provider diagnostics out of the public `/watch`
   responses (recommended, no provider internals leak) and only show them in
   the admin test bench?
6. **Provider timeout status** – `504` (recommended) instead of the spec's
   `408`?
7. **Music** – confirm the resolver slot stays an empty stub until the music
   work is scheduled.
