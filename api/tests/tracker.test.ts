import { describe, it, expect, afterEach, vi } from 'vitest';
import { geolocate } from '../src/services/geo.js';
import { parseUserAgent } from '../src/middleware/tracker.js';

afterEach(() => vi.unstubAllGlobals());

describe('user agent parsing', () => {
  it('detects desktop chrome', () => {
    expect(
      parseUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36'),
    ).toEqual({ device: 'desktop', browser: 'Chrome' });
  });

  it('detects mobile safari', () => {
    expect(
      parseUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'),
    ).toEqual({ device: 'mobile', browser: 'Safari' });
  });

  it('detects tablets and falls back for unknown agents', () => {
    expect(parseUserAgent('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) Mobile/15E148')).toMatchObject({
      device: 'tablet',
    });
    expect(parseUserAgent('')).toEqual({ device: 'desktop', browser: 'Unknown' });
  });
});

describe('geolocation', () => {
  it('short-circuits private addresses without a network call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(geolocate('127.0.0.1')).resolves.toEqual({ country: 'local', city: 'local' });
    await expect(geolocate('::ffff:192.168.1.5')).resolves.toEqual({ country: 'local', city: 'local' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns country and city from ip-api', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ status: 'success', country: 'United States', city: 'Mountain View' }), {
        status: 200,
      }),
    ));

    await expect(geolocate('8.8.8.8')).resolves.toEqual({ country: 'United States', city: 'Mountain View' });
  });

  it('falls back to unknown when the lookup fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('offline');
    }));

    await expect(geolocate('9.9.9.9')).resolves.toEqual({ country: 'unknown', city: 'unknown' });
  });
});
