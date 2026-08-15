// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';
import { createResourceTimingSnapshot } from './page-snapshot';

function createResourceEntry(overrides: Partial<PerformanceResourceTiming>) {
  return {
    decodedBodySize: 30,
    duration: 10,
    encodedBodySize: 31,
    initiatorType: 'img',
    name: 'https://iframe.example/image.png?token=secret#fragment',
    nextHopProtocol: 'h2',
    startTime: 25,
    transferSize: 33,
    ...overrides,
  } as PerformanceResourceTiming;
}

it('creates a Resource Timing snapshot from the provided source view', () => {
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

  const snapshot = createResourceTimingSnapshot(undefined, {
    document: iframe.contentDocument!,
    pageUrl: 'https://iframe.example/source?token=secret#fragment',
    view: sourceView,
  });

  expect(snapshot.pageUrl).toBe('https://iframe.example/source');
  expect(snapshot.timeOrigin).toBe(1000);
  expect(snapshot.entries[0]).toMatchObject({
    duration: 9,
    initiatorType: 'img',
    name: 'https://iframe.example/image.png',
    startTime: 25,
    transferSize: 33,
  });
});
