# Peak Movies API v1

Base URL: `/api/v1`

## Request tracing

Every response includes `request_id`. Send `X-Request-ID` (or `X-Client-Request-ID`,
or `?request_id=`) to correlate; otherwise one is generated (`req_<ULID>`).

## Watch

- `GET /api/v1/watch/movies?id={PEAK_ID}` → `{ request_id, status, media, sources[], subtitles[] }`
- `GET /api/v1/watch/tv?id={PEAK_ID}&season=2&episode=7`
- `GET /api/v1/watch/live/tv?id={CHANNEL_ID}`

## Meta

- `GET /api/v1/meta/movie?id={PEAK_ID}`
- `GET /api/v1/meta/tv?id={PEAK_ID}`

## Live TV catalog

- `GET /api/v1/live/tv/channels?q=&group=&limit=`

## Source shape

```json
{ "id": "src_…", "type": "hls|dash|audio|progressive|embed", "url": "…", "quality": "1080p", "language": "en", "headers": {}, "expires_at": "…" }
```

`url` is always our own proxy URL.

## Errors

```json
{ "request_id": "req_…", "status": "error", "error": { "code": "MEDIA_NOT_FOUND", "message": "…" } }
```

Codes: `INVALID_REQUEST`, `INVALID_ID`, `INVALID_SEASON`, `INVALID_EPISODE`,
`MEDIA_NOT_FOUND`, `EPISODE_NOT_FOUND`, `CHANNEL_NOT_FOUND`, `SOURCE_NOT_FOUND`,
`SOURCE_UNAVAILABLE`, `PROVIDER_ERROR`, `PROVIDER_TIMEOUT`, `RATE_LIMITED`,
`INTERNAL_ERROR`, `NOT_IMPLEMENTED`.

## IPTV admin

- `GET/POST /api/v1/admin/iptv/playlists`
- `POST /api/v1/admin/iptv/playlists/:id/sync`
- `DELETE /api/v1/admin/iptv/playlists/:id`
- `POST /api/v1/admin/iptv/playlists/:id/toggle`
- `GET /api/v1/admin/iptv/channels?q=&group=&limit=`
- `POST /api/v1/admin/iptv/channels/:id/toggle`
- `GET /api/v1/admin/iptv/groups`
- `POST /api/v1/admin/iptv/import/zlive` (imports zlive.st channels)
- `POST /api/v1/admin/iptv/import/dlive` (body `{ id, name }`, scrapes dedembed)

## Env vars

- `PEAK_ID_SECRET` (defaults to `PROXY_SECRET`)
- `IPTV_PLAYLIST_URLS` (comma separated bootstrap playlists)
- `IPTV_SYNC_INTERVAL_MINUTES` (default 360)
- `LOG_LEVEL` (default info)
- `PUBLIC_URL` (absolute proxy urls)
EOF
echo done