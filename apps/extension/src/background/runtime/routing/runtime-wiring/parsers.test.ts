import { describe, expect, it } from 'vitest';

import { parseInstalledDetails, parseTopLevelNavigation } from './parsers';

describe('parseInstalledDetails', () => {
  it('accepts known Chrome install reasons', () => {
    expect(parseInstalledDetails({ reason: 'install' })).toEqual({ reason: 'install' });
    expect(parseInstalledDetails({ reason: 'update' })).toEqual({ reason: 'update' });
  });

  it('rejects invalid install payloads', () => {
    expect(parseInstalledDetails(null)).toBeNull();
    expect(parseInstalledDetails({})).toBeNull();
    expect(parseInstalledDetails({ reason: 'unexpected' })).toBeNull();
  });
});

describe('parseTopLevelNavigation', () => {
  it('accepts only top-level navigation payloads', () => {
    expect(parseTopLevelNavigation({ frameId: 0, tabId: 12 })).toEqual({
      frameId: 0,
      tabId: 12,
    });
    expect(parseTopLevelNavigation({ frameId: 3, tabId: 12 })).toBeNull();
  });

  it('rejects invalid navigation payloads', () => {
    expect(parseTopLevelNavigation(null)).toBeNull();
    expect(parseTopLevelNavigation({ frameId: '0', tabId: 12 })).toBeNull();
    expect(parseTopLevelNavigation({ frameId: 0 })).toBeNull();
  });
});
