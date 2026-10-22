// api/src/services/iptv/sync.ts
import { readText } from '../safeHttp.js';
import { parseM3u } from './parser.js';
import { getPlaylist, updatePlaylistSync, replaceChannels } from './store.js';

export async function syncPlaylist(playlistId: number): Promise<{ channelCount: number; error: string | null }> {
  const playlist = getPlaylist(playlistId);
  if (!playlist) return { channelCount: 0, error: 'playlist not found' };
  if (!playlist.enabled) return { channelCount: 0, error: 'playlist disabled' };

  try {
    const res = await readText(playlist.url, { timeoutMs: 30000, maxBytes: 50 * 1024 * 1024 });
    const text = res.text;
    const parsed = parseM3u(text);
    replaceChannels(
      playlistId,
      parsed.channels.map((ch, index) => ({
        name: ch.name,
        tvgId: ch.tvgId,
        groupTitle: ch.groupTitle,
        logo: ch.logo,
        url: ch.url,
        headers: ch.headers,
        language: ch.language,
        country: ch.country,
        position: index,
      })),
    );
    updatePlaylistSync(playlistId, parsed.channels.length, null);
    return { channelCount: parsed.channels.length, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    updatePlaylistSync(playlistId, playlist.channelCount, message);
    return { channelCount: 0, error: message };
  }
}

export async function syncAllPlaylists(): Promise<void> {
  const { listPlaylists } = await import('./store.js');
  const playlists = listPlaylists().filter((p) => p.enabled);
  for (const playlist of playlists) {
    await syncPlaylist(playlist.id);
  }
}
