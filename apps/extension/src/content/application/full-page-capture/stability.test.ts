// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const writePageScroll = vi.hoisted(() => vi.fn());
const measureCaptureGeometry = vi.hoisted(() => vi.fn());

vi.mock('../../platform/page-scroll', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/page-scroll')>()),
  writePageScroll,
}));
vi.mock('./geometry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./geometry')>()),
  measureCaptureGeometry,
}));

import { warmUpLazyContent } from './stability';

beforeEach(() => {
  vi.clearAllMocks();
});

it('visits the full lazy-loading route twice before tile capture', async () => {
  const root = { element: document.documentElement, kind: 'document' as const };
  const heartbeat = vi.fn();
  measureCaptureGeometry.mockReturnValue({
    devicePixelRatio: 1,
    extentHeight: 1_000,
    extentWidth: 800,
    outputHeight: 1_000,
    outputWidth: 800,
    rootKind: 'document',
    rootViewport: { height: 600, width: 800, x: 0, y: 0 },
    viewportHeight: 600,
    viewportWidth: 800,
  });

  await warmUpLazyContent(
    root,
    {
      devicePixelRatio: 1,
      extentHeight: 1_000,
      extentWidth: 800,
      outputHeight: 1_000,
      outputWidth: 800,
      rootKind: 'document',
      rootViewport: { height: 600, width: 800, x: 0, y: 0 },
      viewportHeight: 600,
      viewportWidth: 800,
    },
    heartbeat
  );

  expect(writePageScroll.mock.calls).toEqual([
    [root, 0, 0],
    [root, 0, 400],
    [root, 0, 0],
    [root, 0, 400],
  ]);
  expect(heartbeat).toHaveBeenCalledTimes(8);
});

it('remeasures a lazy-grown page before the second warm-up pass', async () => {
  const root = { element: document.documentElement, kind: 'document' as const };
  measureCaptureGeometry.mockReturnValue({
    devicePixelRatio: 1,
    extentHeight: 1_500,
    extentWidth: 800,
    outputHeight: 1_500,
    outputWidth: 800,
    rootKind: 'document',
    rootViewport: { height: 600, width: 800, x: 0, y: 0 },
    viewportHeight: 600,
    viewportWidth: 800,
  });

  await warmUpLazyContent(root, {
    devicePixelRatio: 1,
    extentHeight: 1_000,
    extentWidth: 800,
    outputHeight: 1_000,
    outputWidth: 800,
    rootKind: 'document',
    rootViewport: { height: 600, width: 800, x: 0, y: 0 },
    viewportHeight: 600,
    viewportWidth: 800,
  });

  expect(writePageScroll.mock.calls).toEqual([
    [root, 0, 0],
    [root, 0, 400],
    [root, 0, 0],
    [root, 0, 536],
    [root, 0, 900],
  ]);
});
