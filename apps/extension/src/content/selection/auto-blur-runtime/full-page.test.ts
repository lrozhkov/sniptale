// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const pageScrollMocks = vi.hoisted(() => ({
  current: { x: 25, y: 500 },
  measurePageScrollGeometry: vi.fn(() => ({
    extentHeight: 1_600,
    extentWidth: 800,
    viewportHeight: 600,
    viewportWidth: 800,
  })),
  root: { element: document.documentElement, kind: 'document' as const },
  writePageScroll: vi.fn((_: unknown, x: number, y: number) => {
    pageScrollMocks.current = { x, y };
  }),
}));

vi.mock('../../platform/page-scroll', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/page-scroll')>()),
  measurePageScrollGeometry: pageScrollMocks.measurePageScrollGeometry,
  readPageScroll: () => ({ ...pageScrollMocks.current }),
  resolvePageScrollRoot: () => pageScrollMocks.root,
  writePageScroll: pageScrollMocks.writePageScroll,
}));

import { visitAutoBlurPageViewports } from './full-page';

beforeEach(() => {
  pageScrollMocks.current = { x: 25, y: 500 };
  pageScrollMocks.writePageScroll.mockClear();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
});

it('visits the complete page and restores the original scroll position', async () => {
  const visits: Array<{ x: number; y: number }> = [];

  await visitAutoBlurPageViewports((delta) => visits.push(delta));

  expect(visits).toEqual([
    { x: -25, y: 0 },
    { x: -25, y: -500 },
    { x: -25, y: 36 },
    { x: -25, y: 500 },
  ]);
  expect(pageScrollMocks.writePageScroll).toHaveBeenLastCalledWith(pageScrollMocks.root, 25, 500);
  expect(pageScrollMocks.current).toEqual({ x: 25, y: 500 });
});

it('rejects oversized page geometry before allocation and restores scroll', async () => {
  pageScrollMocks.measurePageScrollGeometry.mockReturnValueOnce({
    extentHeight: 1_000_000,
    extentWidth: 1_000_000,
    viewportHeight: 600,
    viewportWidth: 800,
  });
  const visit = vi.fn();

  await expect(visitAutoBlurPageViewports(visit)).rejects.toThrow(
    'unsupported-layout: auto-blur page exceeds safe viewport budget'
  );

  expect(visit).not.toHaveBeenCalled();
  expect(pageScrollMocks.writePageScroll).toHaveBeenCalledOnce();
  expect(pageScrollMocks.writePageScroll).toHaveBeenLastCalledWith(pageScrollMocks.root, 25, 500);
  expect(pageScrollMocks.current).toEqual({ x: 25, y: 500 });
});

it('restores the original scroll position when scanning fails', async () => {
  const error = new Error('detector failed');

  await expect(
    visitAutoBlurPageViewports(() => {
      throw error;
    })
  ).rejects.toBe(error);

  expect(pageScrollMocks.writePageScroll).toHaveBeenLastCalledWith(pageScrollMocks.root, 25, 500);
  expect(pageScrollMocks.current).toEqual({ x: 25, y: 500 });
});

it('stops between viewports and restores the original scroll position when cancelled', async () => {
  const controller = new AbortController();
  const visit = vi.fn(() => controller.abort());

  await expect(visitAutoBlurPageViewports(visit, controller.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });

  expect(visit).toHaveBeenCalledOnce();
  expect(pageScrollMocks.writePageScroll).toHaveBeenLastCalledWith(pageScrollMocks.root, 25, 500);
  expect(pageScrollMocks.current).toEqual({ x: 25, y: 500 });
});
