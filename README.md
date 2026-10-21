# PeakMovies

Self-hosted streaming backend with a branded iframe player and an admin dashboard.
One compose stack: Fastify + SQLite + Redis API, Next.js player, Next.js admin, optional nginx.

## Quick start

```bash
cp .env.example .env
# Set ADMIN_PASSWORD, PROXY_SECRET, and optionally TMDB_API_KEY.
docker compose up -d --build
```

| Service | URL |
| --- | --- |
| API | `http://localhost:3000/api/v1/health` |
| Player | `http://localhost:3001/movie/27205` |
| Admin | `http://localhost:3002/admin` |

The player proxies `/api` to the API container internally, so the default setup works
without CORS or a public API hostname.

### Single port with nginx

```bash
docker compose --profile proxy up -d
```

Then use `http://localhost/` for the player, `http://localhost/admin` for the dashboard,
and embed `http://localhost/player/movie/27205`. Change `PROXY_PORT` if port 80 is taken.

Set `PUBLIC_URL` to the public site origin (for example `https://movies.example.com`) so
admin cookies are marked `Secure` when HTTPS is used.

## Embed

```html
<iframe
  src="http://localhost/player/movie/27205"
  style="width:100%;aspect-ratio:16/9;border:none"
  allow="autoplay; fullscreen; picture-in-picture"
  allowfullscreen
></iframe>
```

TV episodes: `/player/tv/{tmdbId}/{season}/{episode}`.

## API

```
GET /api/v1/stream/movie/:tmdbId
GET /api/v1/stream/tv/:tmdbId/:season/:episode
GET /api/v1/search?q=&type=movie|tv
GET /api/v1/recommendations/:tmdbId?type=movie|tv
GET /api/v1/branding
GET /api/v1/health
GET /api/v1/proxy?data=...
```

Stream responses return signed proxy URLs, quality/codec/provider metadata, subtitles,
cache metadata, and per-provider diagnostics. Stream URLs are cached in Redis for one
hour; pass `invalidate=1` to force a fresh scrape.

Search and recommendations require `TMDB_API_KEY`. Streaming does not; without the key,
titles fall back to `TMDB {id}` until the player's own metadata is wired in.

## Providers

- `vidsrc` — tries all configured domains and aggregates every source found.
- `vidapi` — set `VIDAPI_BASE_URL` to the API root; returns a clear diagnostic when unset.

Providers can be enabled or disabled live from **Admin → Providers**. Provider state,
sessions, and settings live in `data/peakmovies.db`; Redis persistence lives in
`data/redis/`. Branding is read from `config/branding.json` and can be edited in
**Admin → Settings**.

## Development

```bash
cd api && npm install && npm test && npm run dev
cd player && npm install && npm run dev
cd admin && npm install && npm run dev
```

Tests: `cd api && npx vitest run`. Typecheck: `npx tsc --noEmit`.
