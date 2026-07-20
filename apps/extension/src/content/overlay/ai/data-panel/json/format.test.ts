import { describe, expect, it } from 'vitest';

import { formatSelectedDataJson } from './format';

describe('formatSelectedDataJson', () => {
  it('pretty-prints valid JSON payloads', () => {
    expect(formatSelectedDataJson('{"n":"Status","v":"Open"}')).toContain('"n": "Status"');
  });

  it('returns the original payload when parsing fails', () => {
    expect(formatSelectedDataJson('{not-json')).toBe('{not-json');
  });

  it('returns an empty string for empty payloads', () => {
    expect(formatSelectedDataJson('')).toBe('');
  });
});
