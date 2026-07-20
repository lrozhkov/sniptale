import { expect, it } from 'vitest';

import { redactSensitiveString, sanitizeSensitiveError } from './secret-redaction';

it('redacts common secret-bearing raw string patterns before truncation', () => {
  const redacted = redactSensitiveString(
    [
      'Authorization: Bearer sk-live-secret',
      'Authorization: Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ==',
      'Authorization: Digest username="u", response="digest-secret"',
      'Authorization: AWS4-HMAC-SHA256 Credential=aws-example, Signature=signature-example',
      'Proxy-Authorization: ApiKey proxy-secret',
      'Proxy-Authorization: Custom part1 part2 part3',
      'authorization=Custom opaque-secret',
      'apiKey=sk-api-secret',
      'https://example.test/path?token=abc123&safe=1#secret=hidden',
      'cookie=session=abc',
    ].join('\n'),
    1000
  );

  expect(redacted).not.toContain('sk-live-secret');
  expect(redacted).not.toContain('QWxhZGRpbjpvcGVuIHNlc2FtZQ');
  expect(redacted).not.toContain('digest-secret');
  expect(redacted).not.toContain('aws-example');
  expect(redacted).not.toContain('signature-example');
  expect(redacted).not.toContain('proxy-secret');
  expect(redacted).not.toContain('part1');
  expect(redacted).not.toContain('part2');
  expect(redacted).not.toContain('part3');
  expect(redacted).not.toContain('opaque-secret');
  expect(redacted).not.toContain('sk-api-secret');
  expect(redacted).not.toContain('abc123');
  expect(redacted).not.toContain('session=abc');
  expect(redacted).toContain('Authorization: ***');
  expect(redacted).toContain('Proxy-Authorization: ***');
  expect(redacted).toContain('authorization: ***');
  expect(redacted).toContain('apiKey=***');
  expect(redacted).toContain('token=***');
  expect(redacted).toContain('cookie=***');
});

it('redacts authorization values without swallowing following lines', () => {
  const redacted = redactSensitiveString(
    [
      'Authorization: Digest username="u", response="digest-secret"',
      'visible non-auth line',
      'Proxy-Authorization: Custom part1 part2 part3',
      'another visible line',
    ].join('\n'),
    1000
  );

  expect(redacted).toContain('Authorization: ***');
  expect(redacted).toContain('Proxy-Authorization: ***');
  expect(redacted).toContain('visible non-auth line');
  expect(redacted).toContain('another visible line');
  expect(redacted).not.toContain('digest-secret');
  expect(redacted).not.toContain('part1');
  expect(redacted).not.toContain('part2');
  expect(redacted).not.toContain('part3');
});

it('sanitizes Error message and stack fields', () => {
  const error = new Error('refreshToken=secret-token');
  error.stack = 'Error: refreshToken=secret-token\n    at Authorization: Bearer sk-secret';

  expect(sanitizeSensitiveError(error, 1000)).toEqual(
    expect.objectContaining({
      _error: true,
      message: 'refreshToken=***',
      stack: expect.not.stringContaining('secret-token'),
    })
  );
});

it('summarizes oversized data URLs and truncates long safe text', () => {
  expect(redactSensitiveString(`data:image/png;base64,${'a'.repeat(120)}`, 1000)).toBe(
    '[data URL: 142 chars]'
  );
  expect(redactSensitiveString('safe '.repeat(100), 20)).toBe(
    'safe safe safe safe ... [truncated]'
  );
});
