import { beforeEach, expect, it, vi } from 'vitest';

const { browserTabsGetMock, browserTabsQueryMock } = vi.hoisted(() => ({
  browserTabsGetMock: vi.fn(),
  browserTabsQueryMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: {
    get: browserTabsGetMock,
    query: browserTabsQueryMock,
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

it('creates stable origin patterns and site script ids', async () => {
  const { createOriginPattern, createSiteScriptId } = await import('./target');
  const url = new URL('https://sub.example.test:8443/path');

  expect(createOriginPattern(url)).toBe('https://sub.example.test:8443/*');
  expect(createSiteScriptId(url)).toBe(
    'sniptale-page-access-site-aHR0cHM6Ly9zdWIuZXhhbXBsZS50ZXN0Ojg0NDM'
  );
});

it('creates collision-resistant script ids for similar origins', async () => {
  const { createSiteScriptId } = await import('./target');

  expect(createSiteScriptId(new URL('https://a-b.example/path'))).not.toBe(
    createSiteScriptId(new URL('https://a.b.example/path'))
  );
});

it('resolves explicit, active, missing, and unsupported page targets', async () => {
  const { resolveStatusContext } = await import('./target');
  browserTabsGetMock.mockResolvedValueOnce({ id: 7, url: 'https://example.test/path' });
  browserTabsQueryMock
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([{ id: 8, url: 'about:blank' }]);

  await expect(resolveStatusContext(7)).resolves.toEqual(
    expect.objectContaining({ kind: 'supported' })
  );
  await expect(resolveStatusContext()).resolves.toEqual({ kind: 'missing-tab' });
  await expect(resolveStatusContext()).resolves.toEqual({
    kind: 'unsupported-url',
    tabId: 8,
  });
});
