// api/src/services/iptv/parser.ts
export interface ParsedChannel {
  name: string;
  url: string;
  tvgId: string | null;
  groupTitle: string | null;
  logo: string | null;
  language: string | null;
  country: string | null;
  headers: Record<string, string>;
}

export interface ParsedPlaylist {
  channels: ParsedChannel[];
}

function attr(line: string, name: string): string | null {
  const match = new RegExp(`${name}="([^"]*)"`, 'i').exec(line);
  if (match) return match[1] ?? null;
  const match2 = new RegExp(`${name}=([^\\s,]+)`, 'i').exec(line);
  return match2 ? match2[1] ?? null : null;
}

export function parseM3u(text: string): ParsedPlaylist {
  const channels: ParsedChannel[] = [];
  const lines = text.split(/\r?\n/);
  let pending: Partial<ParsedChannel> | null = null;
  let headers: Record<string, string> = {};

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('#EXTM3U')) continue;

    if (line.startsWith('#EXTINF')) {
      pending = {
        name: line.split(',').slice(1).join(',').trim() || 'Unknown',
        tvgId: attr(line, 'tvg-id'),
        groupTitle: attr(line, 'group-title'),
        logo: attr(line, 'tvg-logo'),
        language: attr(line, 'tvg-language'),
        country: attr(line, 'tvg-country'),
        headers: { ...headers },
      };
      headers = {};
      continue;
    }

    if (line.startsWith('#EXTVLCOPT:')) {
      const opt = line.slice('#EXTVLCOPT:'.length);
      const eq = opt.indexOf('=');
      if (eq > 0) {
        const key = opt.slice(0, eq).trim().toLowerCase();
        const value = opt.slice(eq + 1).trim();
        if (key === 'http-user-agent') headers['User-Agent'] = value;
        else if (key === 'http-referrer' || key === 'http-referer') headers.Referer = value;
        else if (key === 'http-origin') headers.Origin = value;
      }
      continue;
    }

    if (line.startsWith('#')) continue;

    // URL line
    if (pending) {
      pending.url = line;
      pending.headers = { ...headers, ...(pending.headers ?? {}) };
      channels.push(pending as ParsedChannel);
      pending = null;
      headers = {};
    } else {
      // bare URL without EXTINF
      channels.push({
        name: line.split('/').pop() || 'Unknown',
        url: line,
        tvgId: null,
        groupTitle: null,
        logo: null,
        language: null,
        country: null,
        headers: { ...headers },
      });
      headers = {};
    }
  }

  return { channels };
}
