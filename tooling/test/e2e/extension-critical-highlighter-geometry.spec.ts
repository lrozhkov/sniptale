import { expect, test } from './support/extension-fixture';
import type { Locator, Page } from '@playwright/test';

const HARNESS_PATH = '/tooling/test/harness/highlighter-geometry.html';
const ZOOM_LEVELS = [80, 100, 125, 200] as const;

type Rect = { x: number; y: number; width: number; height: number };

type DynamicScenario = 'carousel' | 'iframe' | 'nested';
type DynamicAction =
  | 'ambiguous'
  | 'detach'
  | 'moveIn'
  | 'moveOut'
  | 'recycle'
  | 'reinsert'
  | 'reloadIframe'
  | 'replace'
  | 'settleReplacement'
  | 'scrollNestedIn'
  | 'scrollNestedOut'
  | 'unloadIframe';

type DynamicFrameState = {
  borderSettings: {
    color: string;
    id: string;
    padding: { bottom: number; left: number; right: number; top: number };
    radius: number;
    width: number;
  };
  effectMode: string;
  height: number;
  id: string;
  linkedElementSelector: string;
  offset: { height: number; width: number; x: number; y: number };
  pagePlacement: { iframePath: string[]; pageX: number; pageY: number };
  width: number;
  x: number;
  y: number;
};

type DynamicHarnessSnapshot = {
  frame: DynamicFrameState;
  frameCount: number;
  frameId: string;
  presentation: string;
  scenario: string;
};

type DynamicHarnessStatus = {
  connected: boolean;
  context: DynamicScenario;
  iframeRevision: string | null;
  instance: string | null;
  sameAsOriginal: boolean;
};

type OpenedDynamicHarness = {
  frameRect: Rect;
  harness: Locator;
  snapshot: DynamicHarnessSnapshot;
};

function expectRectClose(actual: Rect, expected: Rect, tolerance: number): void {
  expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(actual.y - expected.y)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(actual.width - expected.width)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(actual.height - expected.height)).toBeLessThanOrEqual(tolerance);
}

async function runDynamicAnchorAction(page: Page, action: DynamicAction, fixtureEvent: string) {
  await page.evaluate(
    ({ actionName, eventName }) =>
      new Promise<void>((resolve) => {
        window.addEventListener(`sniptale-fixture:${eventName}`, () => resolve(), { once: true });
        const harness = (
          window as Window & {
            __sniptaleDynamicAnchorHarness?: Record<string, () => void>;
          }
        ).__sniptaleDynamicAnchorHarness;
        if (!harness?.[actionName]) {
          throw new Error(`Dynamic anchor fixture action is unavailable: ${actionName}`);
        }
        harness[actionName]();
      }),
    { actionName: action, eventName: fixtureEvent }
  );
}

async function readDynamicHarnessSnapshot(harness: Locator): Promise<DynamicHarnessSnapshot> {
  return harness.evaluate((element) => {
    const frameState = element.getAttribute('data-frame-state');
    if (!frameState) throw new Error('Dynamic frame state is unavailable.');
    return {
      frame: JSON.parse(frameState) as DynamicFrameState,
      frameCount: Number(element.getAttribute('data-frame-count')),
      frameId: element.getAttribute('data-frame-id') ?? '',
      presentation: element.getAttribute('data-presentation') ?? '',
      scenario: element.getAttribute('data-scenario') ?? '',
    };
  });
}

async function readDynamicHarnessStatus(page: Page): Promise<DynamicHarnessStatus> {
  return page.evaluate(() => {
    const harness = (
      window as Window & {
        __sniptaleDynamicAnchorHarness?: { status(): DynamicHarnessStatus };
      }
    ).__sniptaleDynamicAnchorHarness;
    if (!harness) throw new Error('Dynamic anchor fixture API is unavailable.');
    return harness.status();
  });
}

function expectFrameIntentPreserved(
  actual: DynamicHarnessSnapshot,
  initial: DynamicHarnessSnapshot
): void {
  expect(actual.frameCount).toBe(1);
  expect(actual.frameId).toBe(initial.frameId);
  expect(actual.frame.id).toBe(initial.frame.id);
  expect(actual.frame.width).toBe(initial.frame.width);
  expect(actual.frame.height).toBe(initial.frame.height);
  expect(actual.frame.offset).toEqual(initial.frame.offset);
  expect(actual.frame.borderSettings).toEqual(initial.frame.borderSettings);
  expect(actual.frame.effectMode).toBe(initial.frame.effectMode);
  expect(actual.frame.linkedElementSelector).toBe(initial.frame.linkedElementSelector);
}

function expectLastGoodGeometryPreserved(
  actual: DynamicHarnessSnapshot,
  initial: DynamicHarnessSnapshot
): void {
  expect(actual.frame.x).toBe(initial.frame.x);
  expect(actual.frame.y).toBe(initial.frame.y);
  expect(actual.frame.pagePlacement).toEqual(initial.frame.pagePlacement);
}

async function expectNoGhostOverlays(page: Page): Promise<void> {
  await expect(page.locator('[data-ui="dynamic-frame"]')).toHaveCount(0);
  await expect(page.locator('[data-ui="dynamic-toolbar"]')).toHaveCount(0);
  await expect(page.locator('[data-ui="dynamic-focus"]')).toHaveCount(0);
}

async function expectRecovery(page: Page, status: 'ambiguous' | 'missing' | null): Promise<void> {
  const recovery = page.locator('[data-ui="dynamic-recovery"]');
  if (status === null) {
    await expect(recovery).toHaveCount(0);
    return;
  }
  await expect.poll(() => recovery.count()).toBe(1);
  await expect(recovery).toHaveAttribute('data-status', status);
}

async function expectHiddenLifecyclePhase(
  page: Page,
  opened: OpenedDynamicHarness,
  presentation: 'ambiguous' | 'missing' | 'offscreen' | 'suspended',
  recovery: 'ambiguous' | 'missing' | null
): Promise<DynamicHarnessSnapshot> {
  await expect.poll(() => opened.harness.getAttribute('data-presentation')).toBe(presentation);
  const current = await readDynamicHarnessSnapshot(opened.harness);
  expectFrameIntentPreserved(current, opened.snapshot);
  expectLastGoodGeometryPreserved(current, opened.snapshot);
  await expectNoGhostOverlays(page);
  await expectRecovery(page, recovery);
  return current;
}

async function detachAndExpectMissing(page: Page, opened: OpenedDynamicHarness): Promise<void> {
  await runDynamicAnchorAction(page, 'detach', 'detached');
  await expectHiddenLifecyclePhase(page, opened, 'missing', 'missing');
  expect(await readDynamicHarnessStatus(page)).toMatchObject({
    connected: false,
    instance: 'original',
    sameAsOriginal: true,
  });
}

async function expectToolbarInsideViewport(page: Page): Promise<void> {
  const toolbar = page.locator('[data-ui="dynamic-toolbar"]');
  await expect(toolbar).toBeVisible();
  const box = await toolbar.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.x).toBeGreaterThan(0);
  expect(box!.x + box!.width).toBeLessThan(viewport!.width);
  expect(box!.y).toBeGreaterThan(0);
  expect(box!.y + box!.height).toBeLessThan(viewport!.height);
}

async function openDynamicHarness(
  page: Page,
  hostOrigin: string,
  scenario: DynamicScenario
): Promise<OpenedDynamicHarness> {
  await page.setViewportSize({ width: 1040, height: 900 });
  await page.goto(`${hostOrigin}${HARNESS_PATH}?dynamic=${scenario}`, {
    waitUntil: 'domcontentloaded',
  });
  const harness = page.locator('[data-ui="dynamic-anchor-lifecycle"]');
  await expect(harness).toHaveAttribute('data-scenario', scenario);
  await expect.poll(() => harness.getAttribute('data-presentation')).toBe('visible');
  await expect.poll(() => harness.getAttribute('data-frame-count')).toBe('1');
  const frame = page.locator('[data-ui="dynamic-frame"]');
  await expect(frame).toHaveAttribute('data-frame-id', 'dynamic-frame');
  const frameRect = await frame.boundingBox();
  expect(frameRect).not.toBeNull();
  const snapshot = await readDynamicHarnessSnapshot(harness);
  expect(snapshot.frame.id).toBe('dynamic-frame');
  expect(snapshot.frame.offset).not.toEqual({ height: 0, width: 0, x: 0, y: 0 });
  expect(snapshot.frame.borderSettings.id).toBe('dynamic-anchor-border');
  const status = await readDynamicHarnessStatus(page);
  expect(status).toMatchObject({ connected: true, context: scenario });
  await expectRecovery(page, null);
  await expectToolbarInsideViewport(page);
  return { frameRect: frameRect!, harness, snapshot };
}

async function expectRestoredLifecyclePhase(
  page: Page,
  opened: OpenedDynamicHarness,
  expected: { instance: string; sameAsOriginal: boolean }
): Promise<void> {
  await expect.poll(() => opened.harness.getAttribute('data-presentation')).toBe('visible');
  const restored = await readDynamicHarnessSnapshot(opened.harness);
  expectFrameIntentPreserved(restored, opened.snapshot);
  expect(Math.abs(restored.frame.x - opened.snapshot.frame.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(restored.frame.y - opened.snapshot.frame.y)).toBeLessThanOrEqual(2);
  expect(restored.frame.pagePlacement.iframePath).toEqual(
    opened.snapshot.frame.pagePlacement.iframePath
  );
  expect(
    Math.abs(restored.frame.pagePlacement.pageX - opened.snapshot.frame.pagePlacement.pageX)
  ).toBeLessThanOrEqual(2);
  expect(
    Math.abs(restored.frame.pagePlacement.pageY - opened.snapshot.frame.pagePlacement.pageY)
  ).toBeLessThanOrEqual(2);
  const restoredFrame = page.locator('[data-ui="dynamic-frame"]');
  await expect(restoredFrame).toHaveAttribute('data-frame-id', opened.snapshot.frame.id);
  const restoredRect = await restoredFrame.boundingBox();
  expect(restoredRect).not.toBeNull();
  expectRectClose(restoredRect!, opened.frameRect, 2);
  await expectRecovery(page, null);
  await expectToolbarInsideViewport(page);
  await expect
    .poll(async () => (await readDynamicHarnessStatus(page)).instance)
    .toBe(expected.instance);
  expect((await readDynamicHarnessStatus(page)).sameAsOriginal).toBe(expected.sameAsOriginal);
}

for (const zoomPercent of ZOOM_LEVELS) {
  test(`highlighter layers share canonical geometry at ${zoomPercent}% zoom`, async ({
    page,
    hostOrigin,
  }) => {
    await page.setViewportSize({ width: 1040, height: 900 });
    await page.goto(`${hostOrigin}${HARNESS_PATH}?zoom=${zoomPercent}`, {
      waitUntil: 'domcontentloaded',
    });
    const cases = page.locator('[data-ui="geometry-case"]');
    await expect(cases).toHaveCount(8);
    const scale = zoomPercent / 100;
    const tolerance = Math.max(0.5, 1 / (await page.evaluate(() => window.devicePixelRatio || 1)));

    for (let index = 0; index < 8; index += 1) {
      const testCase = cases.nth(index);
      const frameRect = await testCase.locator('[data-layer="frame"]').boundingBox();
      const fillRect = await testCase.locator('[data-layer="fill"]').boundingBox();
      const strokeRect = await testCase.locator('[data-layer="stroke"]').boundingBox();
      expect(frameRect).not.toBeNull();
      expect(fillRect).not.toBeNull();
      expect(strokeRect).not.toBeNull();
      expectRectClose(fillRect!, frameRect!, tolerance * scale);
      expectRectClose(strokeRect!, frameRect!, tolerance * scale);

      const effect = testCase.locator('[data-layer="effect"]');
      if ((await effect.count()) > 0) {
        const effectRect = await effect.boundingBox();
        expect(effectRect).not.toBeNull();
        expectRectClose(effectRect!, frameRect!, tolerance * scale);
      }

      const northwest = await testCase
        .locator('[data-layer="handle"][data-direction="nw"]')
        .boundingBox();
      const southeast = await testCase
        .locator('[data-layer="handle"][data-direction="se"]')
        .boundingBox();
      expect(northwest).not.toBeNull();
      expect(southeast).not.toBeNull();
      expect(Math.abs(northwest!.x + northwest!.width / 2 - frameRect!.x)).toBeLessThanOrEqual(
        tolerance * scale
      );
      expect(Math.abs(northwest!.y + northwest!.height / 2 - frameRect!.y)).toBeLessThanOrEqual(
        tolerance * scale
      );
      expect(
        Math.abs(southeast!.x + southeast!.width / 2 - (frameRect!.x + frameRect!.width))
      ).toBeLessThanOrEqual(tolerance * scale);
      expect(
        Math.abs(southeast!.y + southeast!.height / 2 - (frameRect!.y + frameRect!.height))
      ).toBeLessThanOrEqual(tolerance * scale);
    }
  });
}

test('viewer capture keeps the thick inward stroke on the canonical surface', async ({
  page,
  hostOrigin,
}) => {
  await page.goto(`${hostOrigin}${HARNESS_PATH}?zoom=100`, { waitUntil: 'domcontentloaded' });
  const capture = page.locator('[data-ui="geometry-viewer-capture"]');
  await expect(capture).toBeVisible();

  const scan = await capture.evaluate((image: HTMLImageElement) => {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Viewer parity scan canvas is unavailable.');
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const offset = (y * canvas.width + x) * 4;
        if (pixels[offset]! > 245 && pixels[offset + 1]! < 10 && pixels[offset + 2]! > 245) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }
    const surface = image.dataset['surface']!.split(',').map(Number);
    return {
      bounds: { minX, minY, maxX, maxY },
      dpr: image.naturalWidth / image.width,
      surface,
    };
  });

  const [x, y, width, height] = scan.surface;
  const tolerance = Math.max(0.5, 1 / scan.dpr);
  expect(Math.abs(scan.bounds.minX / scan.dpr - x!)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(scan.bounds.minY / scan.dpr - y!)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs((scan.bounds.maxX + 1) / scan.dpr - (x! + width!))).toBeLessThanOrEqual(
    tolerance
  );
  expect(Math.abs((scan.bounds.maxY + 1) / scan.dpr - (y! + height!))).toBeLessThanOrEqual(
    tolerance
  );
});

test('thick frame, effect, and fill matrix matches the visual baseline', async ({
  page,
  hostOrigin,
}) => {
  await page.setViewportSize({ width: 520, height: 760 });
  await page.goto(`${hostOrigin}${HARNESS_PATH}?zoom=100`, { waitUntil: 'domcontentloaded' });
  const matrix = page.locator('[data-ui="geometry-matrix"]');
  await expect(matrix).toBeVisible();
  await expect(matrix).toHaveScreenshot('highlighter-geometry-matrix.png', {
    animations: 'disabled',
  });
});

test('dynamic carousel hides transform ghosts and restores the exact linked frame', async ({
  page,
  hostOrigin,
}) => {
  const initial = await openDynamicHarness(page, hostOrigin, 'carousel');

  await runDynamicAnchorAction(page, 'moveOut', 'carousel-out');
  await expectHiddenLifecyclePhase(page, initial, 'suspended', null);

  await page.evaluate(() => window.scrollTo(0, 100));
  await expectHiddenLifecyclePhase(page, initial, 'suspended', null);

  await page.evaluate(() => window.scrollTo(0, 0));
  await runDynamicAnchorAction(page, 'moveIn', 'carousel-in');
  await expectRestoredLifecyclePhase(page, initial, {
    instance: 'original',
    sameAsOriginal: true,
  });
});

const REACQUIRE_CASES = [
  {
    action: 'reinsert',
    event: 'reinserted',
    instance: 'original',
    name: 'detached anchor reinsert restores the same DOM instance without changing intent',
    sameAsOriginal: true,
  },
] as const;

for (const lifecycleCase of REACQUIRE_CASES) {
  test(lifecycleCase.name, async ({ page, hostOrigin }) => {
    const initial = await openDynamicHarness(page, hostOrigin, 'carousel');
    await detachAndExpectMissing(page, initial);
    await runDynamicAnchorAction(page, lifecycleCase.action, lifecycleCase.event);
    await expectRestoredLifecyclePhase(page, initial, lifecycleCase);
  });
}

test('one proven replacement stays hidden until stable samples restore the existing frame', async ({
  page,
  hostOrigin,
}) => {
  const initial = await openDynamicHarness(page, hostOrigin, 'carousel');
  await detachAndExpectMissing(page, initial);

  await runDynamicAnchorAction(page, 'replace', 'replacement-mounted');
  await expectHiddenLifecyclePhase(page, initial, 'suspended', null);
  expect(await readDynamicHarnessStatus(page)).toMatchObject({
    connected: true,
    instance: 'replacement',
    sameAsOriginal: false,
  });

  await runDynamicAnchorAction(page, 'settleReplacement', 'replacement-settled');
  await expectRestoredLifecyclePhase(page, initial, {
    instance: 'replacement',
    sameAsOriginal: false,
  });
});

test('ambiguous replacement clones retain one hidden frame and safe recovery', async ({
  page,
  hostOrigin,
}) => {
  const initial = await openDynamicHarness(page, hostOrigin, 'carousel');
  await detachAndExpectMissing(page, initial);
  await runDynamicAnchorAction(page, 'ambiguous', 'ambiguous');
  await expectHiddenLifecyclePhase(page, initial, 'ambiguous', 'ambiguous');
  await expect(page.locator('#dynamic-anchor')).toHaveCount(2);
  await expect(page.locator('[data-fixture-instance="ambiguous-a"]')).toHaveCount(1);
  await expect(page.locator('[data-fixture-instance="ambiguous-b"]')).toHaveCount(1);
});

test('a connected recycled node with changed identity is rejected', async ({
  page,
  hostOrigin,
}) => {
  const initial = await openDynamicHarness(page, hostOrigin, 'carousel');
  await runDynamicAnchorAction(page, 'recycle', 'recycled');
  await expectHiddenLifecyclePhase(page, initial, 'missing', 'missing');
  expect(await readDynamicHarnessStatus(page)).toMatchObject({
    connected: true,
    instance: 'original',
  });
  const recycled = page.locator('#dynamic-anchor');
  await expect(recycled).toHaveCount(1);
  await expect(recycled).toHaveAttribute('href', '/different-action');
  await expect(recycled).toHaveAttribute('aria-label', 'Different action');
});

test('nested scrolling suspends the genuinely nested anchor and restores it', async ({
  page,
  hostOrigin,
}) => {
  const initial = await openDynamicHarness(page, hostOrigin, 'nested');
  await expect(page.locator('[data-ui="nested-scroll"] #dynamic-anchor')).toHaveCount(1);

  await runDynamicAnchorAction(page, 'scrollNestedOut', 'nested-out');
  await expectHiddenLifecyclePhase(page, initial, 'offscreen', null);

  await runDynamicAnchorAction(page, 'scrollNestedIn', 'nested-in');
  await expectRestoredLifecyclePhase(page, initial, {
    instance: 'original',
    sameAsOriginal: true,
  });
});

test('same-origin iframe document reload loses and safely reacquires its real anchor', async ({
  page,
  hostOrigin,
}) => {
  const initial = await openDynamicHarness(page, hostOrigin, 'iframe');
  expect(await readDynamicHarnessStatus(page)).toMatchObject({
    connected: true,
    context: 'iframe',
    iframeRevision: '0',
    instance: 'iframe-0',
  });
  await expect(
    page.frameLocator('#dynamic-same-origin-iframe').locator('#dynamic-anchor')
  ).toHaveCount(1);

  await runDynamicAnchorAction(page, 'unloadIframe', 'iframe-empty');
  await expectHiddenLifecyclePhase(page, initial, 'missing', 'missing');
  expect(await readDynamicHarnessStatus(page)).toMatchObject({
    connected: false,
    context: 'iframe',
    iframeRevision: null,
    instance: null,
  });
  await expect(
    page.frameLocator('#dynamic-same-origin-iframe').locator('#dynamic-anchor')
  ).toHaveCount(0);

  await runDynamicAnchorAction(page, 'reloadIframe', 'iframe-reloaded');
  await expectRestoredLifecyclePhase(page, initial, {
    instance: 'iframe-2',
    sameAsOriginal: false,
  });
  expect(await readDynamicHarnessStatus(page)).toMatchObject({
    connected: true,
    context: 'iframe',
    iframeRevision: '2',
    instance: 'iframe-2',
  });
});
