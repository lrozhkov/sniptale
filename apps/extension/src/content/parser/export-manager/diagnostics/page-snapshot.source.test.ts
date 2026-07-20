// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';
import { PRODUCT_BRAND_NAME } from '@sniptale/ui/branding';
import { createHarLikeSnapshot } from './page-snapshot';

const runtimeMocks = vi.hoisted(() => ({
  getManifest: vi.fn(() => ({ version: '9.9.9-test' })),
}));

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: runtimeMocks,
}));

function createResourceEntry(overrides: Partial<PerformanceResourceTiming>) {
  return {
    duration: 10,
    initiatorType: 'img',
    name: 'https://iframe.example/image.png',
    startTime: 25,
    transferSize: 33,
    ...overrides,
  } as PerformanceResourceTiming;
}

it('creates HAR-like snapshots from the provided source view', () => {
  runtimeMocks.getManifest.mockReturnValue({ version: '1.2.3-test' });
  const iframe = document.createElement('iframe');
  document.body.append(iframe);
  const sourceView = iframe.contentWindow!;
  Object.defineProperty(sourceView, 'performance', {
    configurable: true,
    value: {
      getEntriesByType: vi.fn(() => [createResourceEntry({ duration: 9 })]),
      timeOrigin: 1000,
    },
  });

  const snapshot = createHarLikeSnapshot(undefined, {
    document: iframe.contentDocument!,
    pageUrl: 'https://iframe.example/source',
    view: sourceView,
  });

  expect(snapshot.log.browser.name).toBe(sourceView.navigator.userAgent);
  expect(snapshot.log.creator).toEqual({
    name: `${PRODUCT_BRAND_NAME} resource-timing snapshot`,
    version: '1.2.3-test',
  });
  expect(snapshot.log.pages[0]?.title).toBe('https://iframe.example/source');
  expect(snapshot.log.entries[0]?.request.url).toBe('https://iframe.example/image.png');
  expect(snapshot.log.entries[0]?.startedDateTime).toBe(new Date(1025).toISOString());
});
