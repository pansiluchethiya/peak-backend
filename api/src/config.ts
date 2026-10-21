const PLACEHOLDERS = new Set([
  'changeme',
  'change-me',
  'change-me-please',
  'dev-only-secret-change-me',
  'password',
]);

function requiredSecret(env: NodeJS.ProcessEnv, name: 'ADMIN_PASSWORD' | 'PROXY_SECRET'): void {
  const value = env[name];
  if (!value || value.length < 12 || PLACEHOLDERS.has(value.toLowerCase())) {
    throw new Error(`${name} must be set to a strong, non-default value (at least 12 characters)`);
  }
}

/** Fail closed before the API accepts traffic in production. */
export function assertProductionConfig(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== 'production') return;
  requiredSecret(env, 'ADMIN_PASSWORD');
  requiredSecret(env, 'PROXY_SECRET');
}
