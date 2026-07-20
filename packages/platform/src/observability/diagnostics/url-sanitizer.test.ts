import { describe, expect, it } from 'vitest';

import { redactDiagnosticUrlSecrets, sanitizeDiagnosticUrl } from './url-sanitizer';

describe('diagnostic URL sanitizer malformed URL fallback', () => {
  it('drops query and hash from known URL fields when parsing fails', () => {
    expect(sanitizeDiagnosticUrl('/search results?q=private user text#frag')).toBe(
      '/search results'
    );
    expect(sanitizeDiagnosticUrl('https://example.test/a b?token=known-secret#frag')).toBe(
      'https://example.test/a b'
    );
  });

  it('redacts raw URL secrets and drops hash when parsing fails', () => {
    expect(
      redactDiagnosticUrlSecrets('/search results?token=known-secret&q=public value#frag')
    ).toBe('/search results?token=***&q=public value');
    expect(redactDiagnosticUrlSecrets('https://example.test/a b?signature=known-secret#frag')).toBe(
      'https://example.test/a b?signature=***'
    );
  });
});
