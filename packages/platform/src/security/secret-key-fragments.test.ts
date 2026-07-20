import { describe, expect, it } from 'vitest';

import { createSecretKeyFragmentList, SECRET_KEY_FRAGMENTS } from './secret-key-fragments';

const EXPECTED_BASE_FRAGMENTS = [
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
];

describe('secret-key-fragments', () => {
  it('keeps canonical auth and cookie-bearing fragments in the shared base list', () => {
    expect(SECRET_KEY_FRAGMENTS).toEqual(EXPECTED_BASE_FRAGMENTS);
  });

  it('builds deduplicated fragment lists with optional owner-specific additions', () => {
    expect(createSecretKeyFragmentList()).toEqual(Array.from(SECRET_KEY_FRAGMENTS));
    expect(createSecretKeyFragmentList(['cookie', 'session', 'html'])).toEqual([
      ...EXPECTED_BASE_FRAGMENTS,
      'session',
      'html',
    ]);
  });

  it('preserves first-seen order when additional fragments repeat canonical entries', () => {
    expect(
      createSecretKeyFragmentList(['authorization', 'cookie', 'session', 'cookie', 'value'])
    ).toEqual([...EXPECTED_BASE_FRAGMENTS, 'session', 'value']);
  });
});
