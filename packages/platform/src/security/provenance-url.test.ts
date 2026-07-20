import { describe, expect, it } from 'vitest';
import { sanitizeProvenanceUrl } from './provenance-url';

describe('sanitizeProvenanceUrl', () => {
  it.each([
    [
      'https://user:pass@example.com/account?token=secret#access_token=abc',
      'https://example.com/account',
    ],
    ['https://example.com/reset/password/abc?code=secret', 'https://example.com/'],
    ['https://example.com/reset-password/abc123?code=secret', 'https://example.com/'],
    ['https://example.com/password-reset/abc123?code=secret', 'https://example.com/'],
    ['https://example.com/invite/abc', 'https://example.com/'],
    ['https://example.com/invite-user/abc123', 'https://example.com/'],
    ['https://example.com/invitation/abc123', 'https://example.com/'],
    ['https://example.com/docs/0123456789abcdef0123456789abcdef', 'https://example.com/'],
    ['https://example.com/docs/readme?session=abc', 'https://example.com/docs/readme'],
    ['http://example.com/path#access_token=abc', 'http://example.com/path'],
  ])('sanitizes sensitive provenance URL %s', (input, expected) => {
    expect(sanitizeProvenanceUrl(input)).toBe(expected);
  });

  it.each(['javascript:alert(1)', 'data:text/html,hello', 'chrome://extensions', 'not a url'])(
    'rejects unsupported provenance URL %s',
    (input) => {
      expect(sanitizeProvenanceUrl(input)).toBeNull();
    }
  );

  it('keeps benign http and https paths without query or hash', () => {
    expect(sanitizeProvenanceUrl('https://example.com/docs/readme')).toBe(
      'https://example.com/docs/readme'
    );
  });
});
