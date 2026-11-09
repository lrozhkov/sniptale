import { beforeEach, expect, it, vi } from 'vitest';
import { browserTabs } from '@sniptale/platform/browser/tabs';
import { findOpenPageFavicon } from './open-page-icon';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('@sniptale/platform/browser/tabs', () => ({ browserTabs: { query } }));
const signal = () => new AbortController().signal;
beforeEach(() => query.mockReset());

it('queries only the requested HTTPS host and prefers the exact page ignoring its hash', async () => {
  query.mockResolvedValue([
    { url: 'https://example.test/other', favIconUrl: 'https://example.test/other.png' },
    { url: 'https://example.test/page#tab', favIconUrl: 'https://cdn.example.test/exact.svg' },
    { url: 'https://unrelated.test/page', favIconUrl: 'https://unrelated.test/icon.png' },
  ]);
  expect(await findOpenPageFavicon('example.test/page#request', signal())).toBe(
    'https://cdn.example.test/exact.svg'
  );
  expect(browserTabs.query).toHaveBeenCalledExactlyOnceWith({ url: 'https://example.test/*' });
});

it('accepts one unique same-origin icon and filters actual tab origins including ports', async () => {
  query.mockResolvedValue([
    { url: 'https://example.test:8443/one', favIconUrl: 'https://example.test/shared.png' },
    { url: 'https://example.test:8443/two', favIconUrl: 'https://example.test/shared.png' },
    { url: 'https://example.test/three', favIconUrl: 'https://example.test/wrong-port.png' },
    { url: 'https://elsewhere.test/four', favIconUrl: 'https://elsewhere.test/icon.png' },
  ]);
  expect(await findOpenPageFavicon('https://example.test:8443/page', signal())).toBe(
    'https://example.test/shared.png'
  );
  expect(browserTabs.query).toHaveBeenCalledWith({ url: 'https://example.test/*' });
});

it('rejects ambiguous icons and missing metadata', async () => {
  query.mockResolvedValue([
    { url: 'https://example.test/one', favIconUrl: 'https://example.test/one.png' },
    { url: 'https://example.test/two', favIconUrl: 'https://example.test/two.png' },
  ]);
  expect(await findOpenPageFavicon('example.test/page', signal())).toBeNull();
  query.mockResolvedValue([{ url: 'https://example.test/page' }]);
  expect(await findOpenPageFavicon('example.test/page', signal())).toBeNull();
});

it('rejects unsupported input before querying tabs', async () => {
  for (const address of [
    'http://example.test',
    'https://localhost',
    'https://*',
    'https://*.example.test',
    'https://127.0.0.1',
    'https://user:pass@example.test',
    'file:///icon',
    'https://[invalid',
  ])
    expect(await findOpenPageFavicon(address, signal())).toBeNull();
  expect(browserTabs.query).not.toHaveBeenCalled();
});

it('fails softly on query refusal and bounds malformed icon metadata', async () => {
  query.mockRejectedValueOnce(new Error('tabs unavailable'));
  expect(await findOpenPageFavicon('example.test', signal())).toBeNull();
  query.mockResolvedValue([
    { url: 'https://example.test/', favIconUrl: 'https://example.test/' + 'x'.repeat(2048) },
    { url: 'not a URL', favIconUrl: 'https://example.test/icon.png' },
  ]);
  expect(await findOpenPageFavicon('example.test', signal())).toBeNull();
});

it('propagates cancellation after metadata arrives', async () => {
  const controller = new AbortController();
  query.mockImplementationOnce(async () => {
    controller.abort();
    return [{ url: 'https://example.test/', favIconUrl: 'https://example.test/icon.png' }];
  });
  await expect(findOpenPageFavicon('example.test', controller.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
});
