# Providers

Every stream provider lives in `api/src/providers/<id>/index.ts` and exports a
single object with the shape:

```ts
interface Provider {
  id: string;
  name: string;
  description?: string;
  enabled?: boolean;
  getSources(media: MediaRef): Promise<ProviderResult>;
}
```

`api/src/providers/registry.ts` registers them in `defaultProviders()`. The
registry is the single source of truth for:

* `GET /api/v1/admin/providers` – the provider table in the admin dashboard
  (enable/disable toggle, status badge, test link).
* `GET /api/v1/providers` – the public catalogue used by the player to know
  which providers are enabled and in which order they should be tried.

## Provider order

`providersOrder.json` (repository root) holds the order in which the providers
are tried:

```json
["vidapi", "vidsrc", "mapple", "vidlink", "2embed", "rivestream", "vidzee", "vixsrc"]
```

* The API reads the file on startup (`PROVIDERS_ORDER_FILE`, default
  `providersOrder.json` in the working directory) and sorts the registry
  accordingly. Providers that are missing from the file keep their registry
  position and are appended at the end.
* The **Provider Order** page in the admin dashboard writes the same file and
  re-sorts the running provider manager immediately.
* In Docker the file is mounted into the `api` and `admin` containers
  (`/config/providersOrder.json`).

## Environment variables

| Variable | Used by | Description |
| --- | --- | --- |
| `VIDAPI_BASE_URL` | `vidapi` | Base URL of the VidApi instance (e.g. `https://vidapi.example.com`). A missing scheme is treated as `https`. |
| `PROVIDERS_ORDER_FILE` | api + admin | Path of the provider order file. Defaults to `providersOrder.json` in the working directory. |
| `TMDB_API_KEY` | api | Optional, only used for titles/year lookups. |

None of the new providers require an API key or a login.

---

## vidsrc

* **Endpoint pattern** – `https://vidsrc.sh/embed/movie/<tmdbId>`,
  `https://vidsrc.sh/embed/tv/<tmdbId>/<season>/<episode>`
  (the provider tries six mirrors: `vidsrc.sh`, `vidsrc2.ru`, `vidsrc.ir`,
  `vidsrc.io`, `vidsrc.tw`, `vsembed.ru`).
* **Env vars** – none.
* **Notes** – the stream index is encrypted; the provider decrypts it with the
  upstream WebAssembly module, exactly like the upstream player does. Mirrors
  answer with HTTP 403/429 when they rate limit a datacenter IP, the provider
  then reports the failing mirror as a failed diagnostic and keeps the sources
  of the mirrors that worked.

## vidapi

* **Endpoint pattern** – `<VIDAPI_BASE_URL>/sources/?tmdbId=<id>&type=movie|tv`
  (plus `season`/`episode` for series).
* **Env vars** – `VIDAPI_BASE_URL` (required, external service).
* **Notes** – returns JSON with `sources[]` and `subtitles[]`; each source can
  carry its own request headers.

## vidlink

* **Endpoint pattern** – `https://vidlink.pro/movie/<tmdbId>`,
  `https://vidlink.pro/tv/<tmdbId>/<season>/<episode>`;
  the JSON API is `https://vidlink.pro/api/b/<type>/<tmdbId>?multiLang=0`.
* **Env vars** – none.
* **Notes** – the JSON API is protected by a token that is issued to the
  browser (libsodium + `fu.wasm`), so the API cannot request it directly. The
  provider therefore falls back to the public embed page, which the player
  renders in an iframe. When the token API is reachable the provider returns
  the direct MP4 renditions (360p/480p/720p) plus the caption tracks.

## 2embed

* **Endpoint pattern** – `https://www.2embed.cc/embed/<tmdbId>`,
  `https://www.2embed.cc/embedtv/<tmdbId>&s=<season>&e=<episode>`.
  The page points at the `vidsrc.buzz` player, whose API is
  `https://vidsrc.buzz/pl/api.php?a=sources&type=movie&id=<imdbId>&s=0&e=0&t=<token>`
  followed by `.../pl/api.php?a=race&refs=<refs>`.
* **Env vars** – none.
* **Notes** – the player page carries a signed session token, so the provider
  loads the embed page first and reuses that token. The resolved stream is an
  HLS playlist (`https://vidsrc.buzz/_stream?id=…`) and the provider also
  collects the subtitle tracks of the player.

## rivestream

* **Endpoint pattern** – `https://www.rivestream.app/api/backendfetch?requestID=movieVideoProvider&id=<tmdbId>&service=<service>&secretKey=NDQzM2UwYzI=`.
* **Env vars** – none.
* **Notes** – the provider list is read from
  `…/api/backendfetch?requestID=VideoProviderServices&secretKey=rive` and the
  services are tried until one returns sources (`primevids`, `vanguard`,
  `citadel`, `mirage`, …). The returned entries are direct HLS playlists, some
  of them wrapped in the `proxy.valhallastream.com` player proxy. The TV
  variant of the upstream API requires a per request signature that is only
  issued to the browser, so series fall back to the embed page.

## vidzee

* **Endpoint pattern** – `https://core.vidzee.wtf/streams/movie/<tmdbId>?s=dcloud&e=2`,
  `https://core.vidzee.wtf/streams/tv/<tmdbId>/<season>/<episode>?s=dcloud&e=2`.
* **Env vars** – none.
* **Notes** – the stream index is encrypted. The provider loads the player
  bundle (`https://player.vidzee.wtf/assets/streams-*.js`), extracts the
  WebAssembly module from it and decrypts the payload with the same glue the
  player uses (`api/src/providers/vidzee/crypto.ts`). The decrypted payload
  contains the direct HLS playlist and the request headers.

## vixsrc

* **Endpoint pattern** – `https://vixsrc.to/api/movie/<tmdbId>`,
  `https://vixsrc.to/api/tv/<tmdbId>/<season>/<episode>`, the returned `src`
  points at the player (`/embed/<id>?token=…`), the playlist itself is
  `https://vixsrc.to/playlist/<id>?token=…&expires=…&h=1&lang=en`.
* **Env vars** – none.
* **Notes** – the player hands out a signed master playlist. The provider
  follows the player page, rebuilds the signed playlist URL and returns the
  master playlist plus every video rendition (480p/720p/1080p) and the
  subtitle renditions declared in the master playlist.

## mapple

* **Endpoint pattern** – `https://mapple.fun/watch/movie/<tmdbId>`,
  `https://mapple.fun/watch/tv/<tmdbId>/<season>/<episode>`.
* **Env vars** – none.
* **Notes** – the watch page loads the stream through a session token
  (`/api/ui/session`). When the playlist is not part of the server rendered
  markup the provider falls back to the embed page, which the player renders
  in an iframe.

---

## Adding a provider

1. Create `api/src/providers/<id>/index.ts` and export the provider object.
2. Register it in `defaultProviders()` in `api/src/providers/registry.ts`.
3. Add the id to `providersOrder.json`.
4. Run the smoke test:
   `node -r ts-node/register scratch/testProviders.js 550 movie`.
5. Enable/disable it from **Admin → Providers**.
