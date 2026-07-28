import { expect, type Page } from '@playwright/test';

import { test } from './support/extension-fixture';

const HARNESS_PATH = '/tooling/test/harness/full-page-capture.html';

type HarnessState = {
  animationPlayState: string;
  lazyLoaded: boolean;
  motionStylePresent: boolean;
  rootStyle: string | null;
  scrollX: number;
  scrollY: number;
  scrollbarClassPresent: boolean;
  scrollerStyle: string | null;
};

type CaptureSummary = {
  dataUrlLength: number;
  metadata: {
    cssHeight: number;
    cssWidth: number;
    downscaled: boolean;
    outputHeight: number;
    outputScale: number;
    outputWidth: number;
  };
};

async function openHarness(page: Page, extensionId: string, query = ''): Promise<void> {
  await page.setViewportSize({ height: 600, width: 800 });
  await page.goto(`chrome-extension://${extensionId}${HARNESS_PATH}${query}`, {
    waitUntil: 'domcontentloaded',
  });
  await expect
    .poll(() => page.evaluate(() => Boolean(window.__sniptaleFullPageCaptureHarness)))
    .toBe(true);
}

async function getState(page: Page): Promise<HarnessState> {
  return page.evaluate(() => {
    const harness = window.__sniptaleFullPageCaptureHarness;
    if (!harness) throw new Error('Full-page capture harness is unavailable');
    return harness.state();
  });
}

async function setScroll(page: Page, x: number, y: number): Promise<void> {
  await page.evaluate(
    ([nextX, nextY]) => {
      const harness = window.__sniptaleFullPageCaptureHarness;
      if (!harness) throw new Error('Full-page capture harness is unavailable');
      harness.setScroll(nextX, nextY);
    },
    [x, y] as const
  );
}

async function capture(page: Page): Promise<CaptureSummary> {
  return page.evaluate(async () => {
    const harness = window.__sniptaleFullPageCaptureHarness;
    if (!harness) throw new Error('Full-page capture harness is unavailable');
    return harness.capture();
  });
}

async function sampleCssPoints(
  page: Page,
  outputScale: number,
  points: Array<{ x: number; y: number }>
): Promise<number[][]> {
  return page.evaluate(
    async ({ points: cssPoints, scale }) => {
      const harness = window.__sniptaleFullPageCaptureHarness;
      if (!harness) throw new Error('Full-page capture harness is unavailable');
      return harness.sample(
        cssPoints.map(({ x, y }) => ({
          x: Math.floor(x * scale),
          y: Math.floor(y * scale),
        }))
      );
    },
    { points, scale: outputScale }
  );
}

function expectRestored(before: HarnessState, after: HarnessState): void {
  expect(after.scrollX).toBe(before.scrollX);
  expect(after.scrollY).toBe(before.scrollY);
  expect(after.rootStyle).toBe(before.rootStyle);
  expect(after.scrollerStyle).toBe(before.scrollerStyle);
  expect(after.motionStylePresent).toBe(false);
  expect(after.scrollbarClassPresent).toBe(false);
}

test('native full-page capture scrolls 2D document pixels and restores page state', async ({
  extensionId,
  page,
}) => {
  test.setTimeout(45_000);
  await openHarness(page, extensionId);
  await setScroll(page, 73, 411);
  const before = await getState(page);
  expect(before.animationPlayState).toBe('running');

  const result = await capture(page);
  const after = await getState(page);

  expect(result.dataUrlLength).toBeGreaterThan(1_000);
  expect(result.metadata).toMatchObject({
    cssHeight: 1800,
    cssWidth: 1400,
    downscaled: false,
  });
  expect(result.metadata.outputHeight).toBe(1800);
  expect(result.metadata.outputWidth).toBe(1400);
  expect(after.lazyLoaded).toBe(true);
  expect(after.animationPlayState).toBe('running');
  expectRestored(before, after);

  await expect(
    sampleCssPoints(page, result.metadata.outputScale, [
      { x: 125, y: 125 },
      { x: 125, y: 875 },
      { x: 125, y: 1625 },
      { x: 1225, y: 925 },
      { x: 1025, y: 1475 },
      { x: 500, y: 32 },
      { x: 500, y: 615 },
    ])
  ).resolves.toEqual([
    [255, 0, 0, 255],
    [0, 255, 0, 255],
    [0, 0, 255, 255],
    [255, 0, 255, 255],
    [0, 255, 255, 255],
    [17, 24, 39, 255],
    [243, 244, 246, 255],
  ]);
});

test('native full-page capture crops the outer browser surface to a custom viewport without seams', async ({
  context,
  extensionId,
  page,
}) => {
  test.setTimeout(60_000);
  await openHarness(page, extensionId);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    deviceScaleFactor: 1,
    height: 300,
    mobile: false,
    screenHeight: 300,
    screenWidth: 400,
    scrollbarType: 'overlay',
    width: 400,
  });
  try {
    await expect
      .poll(() =>
        page.evaluate(() => ({
          devicePixelRatio: window.devicePixelRatio,
          height: window.innerHeight,
          width: window.innerWidth,
        }))
      )
      .toEqual({ devicePixelRatio: 1, height: 300, width: 400 });

    const result = await capture(page);

    expect(result.metadata).toMatchObject({
      cssHeight: 1800,
      cssWidth: 1400,
      outputHeight: 1800,
      outputScale: 1,
      outputWidth: 1400,
    });
    await expect(
      sampleCssPoints(page, result.metadata.outputScale, [
        { x: 125, y: 125 },
        { x: 125, y: 875 },
        { x: 125, y: 1625 },
        { x: 1225, y: 925 },
      ])
    ).resolves.toEqual([
      [255, 0, 0, 255],
      [0, 255, 0, 255],
      [0, 0, 255, 255],
      [255, 0, 255, 255],
    ]);
  } finally {
    await cdp.send('Emulation.clearDeviceMetricsOverride');
    await cdp.detach();
  }
});

test('native full-page capture composes one dominant internal scroller with its shell', async ({
  extensionId,
  page,
}) => {
  test.setTimeout(45_000);
  await openHarness(page, extensionId, '?root=internal');
  await setScroll(page, 57, 311);
  const before = await getState(page);

  const result = await capture(page);
  const after = await getState(page);

  expect(result.metadata).toMatchObject({
    cssHeight: 1580,
    cssWidth: 1290,
    downscaled: false,
  });
  expect(after.lazyLoaded).toBe(true);
  expectRestored(before, after);

  await expect(
    sampleCssPoints(page, result.metadata.outputScale, [
      { x: 20, y: 20 },
      { x: 195, y: 185 },
      { x: 195, y: 785 },
      { x: 1145, y: 1385 },
      { x: 995, y: 1235 },
    ])
  ).resolves.toEqual([
    [17, 24, 39, 255],
    [255, 0, 0, 255],
    [0, 255, 0, 255],
    [0, 0, 255, 255],
    [0, 255, 255, 255],
  ]);
});
