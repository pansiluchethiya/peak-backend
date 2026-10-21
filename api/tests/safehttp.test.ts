import { describe, it, expect } from 'vitest';
import { assertSafeTarget, isBlockedAddress, safeLookup, UnsafeTargetError } from '../src/services/safeHttp.js';

describe('safe http target validation', () => {
  it('blocks loopback, private, link-local and mapped addresses', () => {
    for (const address of [
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '::1',
      'fc00::1',
      'fe80::1',
      '::ffff:127.0.0.1',
    ]) {
      expect(isBlockedAddress(address), address).toBe(true);
    }
    expect(isBlockedAddress('8.8.8.8')).toBe(false);
    expect(isBlockedAddress('2606:4700:4700::1111')).toBe(false);
  });

  it('rejects unsafe URLs before making a request', () => {
    expect(() => assertSafeTarget(new URL('http://127.0.0.1:6379/'))).toThrow(UnsafeTargetError);
    expect(() => assertSafeTarget(new URL('http://localhost/'))).toThrow(UnsafeTargetError);
    expect(() => assertSafeTarget(new URL('http://169.254.169.254/latest/meta-data'))).toThrow(
      UnsafeTargetError,
    );
    expect(() => assertSafeTarget(new URL('gopher://example.com/'))).toThrow(UnsafeTargetError);
    expect(() => assertSafeTarget(new URL('https://user:pass@example.com/'))).toThrow(
      UnsafeTargetError,
    );
  });

  it('rejects a hostname that resolves to loopback at connection time', async () => {
    const error = await new Promise<Error | null>((resolve) => {
      safeLookup('localhost', {}, (reason) => resolve(reason as Error | null));
    });
    expect(error).toBeInstanceOf(UnsafeTargetError);
  });
});
