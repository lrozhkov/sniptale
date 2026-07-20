import { afterEach, describe, expect, it, vi } from 'vitest';
import { readPageStyleRuntimePageIdentity } from './identity';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('page style runtime page identity', () => {
  it('reads exact URL and domain from the current location', () => {
    expect(
      readPageStyleRuntimePageIdentity({
        hostname: 'example.test',
        href: 'https://example.test/path?x=1',
      })
    ).toEqual({
      pageDomain: 'example.test',
      pageUrl: 'https://example.test/path?x=1',
    });
  });

  it('uses null domain when the location has no hostname', () => {
    expect(readPageStyleRuntimePageIdentity({ hostname: '', href: 'about:blank' })).toEqual({
      pageDomain: null,
      pageUrl: 'about:blank',
    });
  });

  it('falls back to an empty identity outside browser windows', () => {
    vi.stubGlobal('window', undefined);

    expect(readPageStyleRuntimePageIdentity()).toEqual({
      pageDomain: null,
      pageUrl: '',
    });
  });

  it('reads the current browser window location by default', () => {
    vi.stubGlobal('window', {
      location: {
        hostname: 'current.example',
        href: 'https://current.example/path',
      },
    });

    expect(readPageStyleRuntimePageIdentity()).toEqual({
      pageDomain: 'current.example',
      pageUrl: 'https://current.example/path',
    });
  });
});
