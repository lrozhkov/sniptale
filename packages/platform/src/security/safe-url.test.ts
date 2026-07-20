import { describe, expect, it } from 'vitest';

import { createSafeExternalHref } from './safe-url';

describe('safe url display helper', () => {
  it('allows only http and https hrefs for external display links', () => {
    expect(createSafeExternalHref('https://example.test/source')).toBe(
      'https://example.test/source'
    );
    expect(createSafeExternalHref('http://example.test/source')).toBe('http://example.test/source');
    expect(createSafeExternalHref('javascript:alert(1)')).toBeNull();
    expect(createSafeExternalHref('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(createSafeExternalHref('chrome://extensions')).toBeNull();
    expect(createSafeExternalHref('/relative')).toBeNull();
    expect(createSafeExternalHref(null)).toBeNull();
  });
});
