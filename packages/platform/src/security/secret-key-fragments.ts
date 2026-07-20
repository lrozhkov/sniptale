/**
 * Canonical secret-bearing key fragments that must be redacted in generic logs,
 * runtime tracing payloads, and similar cross-cutting diagnostics surfaces.
 */
export const SECRET_KEY_FRAGMENTS = [
  'apiKey',
  'password',
  'passphrase',
  'token',
  'secret',
  'authorization',
  'bearer',
  'clientSecret',
  'cookie',
  'privateKey',
  'refreshToken',
  'set-cookie',
  'sessionId',
  'proxy-authorization',
] as const;

export function createSecretKeyFragmentList(additionalFragments: readonly string[] = []): string[] {
  return Array.from(new Set([...SECRET_KEY_FRAGMENTS, ...additionalFragments]));
}
