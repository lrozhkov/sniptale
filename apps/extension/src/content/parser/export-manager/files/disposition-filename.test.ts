// @vitest-environment jsdom

import { expect, it } from 'vitest';

import { decodeContentDispositionFilenameValue } from './disposition-filename';

it('returns null for empty content-disposition filename values', () => {
  expect(decodeContentDispositionFilenameValue('""')).toBe(null);
  expect(decodeContentDispositionFilenameValue('   ')).toBe(null);
});

it('decodes RFC5987 filename values', () => {
  expect(decodeContentDispositionFilenameValue("UTF-8''report%20final.pdf")).toBe(
    'report final.pdf'
  );
});

it('keeps malformed RFC5987 payloads when percent-decoding fails', () => {
  expect(decodeContentDispositionFilenameValue("UTF-8''report%ZZfinal.pdf")).toBe(
    'report%ZZfinal.pdf'
  );
});

it('decodes RFC2047 quoted-printable encoded words', () => {
  expect(decodeContentDispositionFilenameValue('=?UTF-8?Q?report=5Ffinal.pdf?=')).toBe(
    'report_final.pdf'
  );
});

it('decodes RFC2047 base64 encoded words', () => {
  expect(decodeContentDispositionFilenameValue('=?UTF-8?B?cmVwb3J0LnBkZg==?=')).toBe('report.pdf');
});

it('falls back to the raw encoded-word payload when charset decoding fails', () => {
  expect(decodeContentDispositionFilenameValue('=?X-UNKNOWN?Q?report.pdf?=')).toBe(
    '=?X-UNKNOWN?Q?report.pdf?='
  );
});
