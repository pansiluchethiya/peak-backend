import { describe, it, expect } from 'vitest';
import { assertProductionConfig } from '../src/config.js';

const base = { NODE_ENV: 'production', ADMIN_PASSWORD: 'a-strong-admin-pass', PROXY_SECRET: 'a-strong-proxy-secret' };

describe('production config', () => {
  it('accepts strong secrets', () => {
    expect(() => assertProductionConfig(base)).not.toThrow();
  });

  it('refuses to start without an admin password', () => {
    expect(() => assertProductionConfig({ ...base, ADMIN_PASSWORD: '' })).toThrow(/ADMIN_PASSWORD/);
  });

  it('refuses shipped placeholder secrets', () => {
    expect(() => assertProductionConfig({ ...base, PROXY_SECRET: 'dev-only-secret-change-me' })).toThrow(
      /PROXY_SECRET/,
    );
    expect(() => assertProductionConfig({ ...base, ADMIN_PASSWORD: 'changeme' })).toThrow(/ADMIN_PASSWORD/);
  });

  it('does not constrain development and test runs', () => {
    expect(() => assertProductionConfig({ NODE_ENV: 'test' })).not.toThrow();
  });
});
